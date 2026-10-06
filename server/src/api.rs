use crate::{
    AppState, db,
    models::{Account, AttachmentView, Draft, Envelope, Label, MessageView, Rule, ThreadSummary},
    outgoing, search,
};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::{
        IntoResponse, Response, Sse,
        sse::{Event, KeepAlive},
    },
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{Execute, QueryBuilder, Row, Sqlite};
use std::{convert::Infallible, time::Duration};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

pub struct ApiError(StatusCode, String);
impl ApiError {
    fn bad(message: impl Into<String>) -> Self {
        Self(StatusCode::BAD_REQUEST, message.into())
    }
    fn not_found() -> Self {
        Self(StatusCode::NOT_FOUND, "Not found".into())
    }
}
impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(error: E) -> Self {
        tracing::error!(error=%error.into(), "API request failed");
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "The request could not be completed".into(),
        )
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}
type ApiResult<T> = Result<T, ApiError>;

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/settings", get(settings).put(save_account))
        .route("/threads", get(threads))
        .route("/threads/{id}", get(thread))
        .route("/actions", post(actions))
        .route("/labels", get(labels).post(create_label))
        .route("/labels/{id}", axum::routing::delete(delete_label))
        .route("/rules", get(rules).post(save_rule))
        .route("/rules/{id}", axum::routing::delete(delete_rule))
        .route("/drafts", get(drafts).post(save_draft))
        .route("/drafts/{id}", axum::routing::delete(delete_draft))
        .route("/drafts/{id}/send", post(send_draft))
        .route("/messages/{id}/raw", get(raw_message))
        .route("/attachments/{id}", get(attachment))
        .route("/import", post(import))
        .route("/pipeline", get(pipeline_status))
        .route("/pipeline/{id}/retry", post(retry_job))
        .route("/events", get(events))
        .fallback(|| async {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"error":"Unknown API route"})),
            )
        });
    let assets = ServeDir::new(&state.config.assets)
        .not_found_service(ServeFile::new(state.config.assets.join("index.html")));
    Router::new()
        .nest("/api", api)
        .route("/health", get(|| async { Json(json!({"status":"ok"})) }))
        .fallback_service(assets)
        .layer(DefaultBodyLimit::max(state.config.max_message_bytes * 2))
        .layer(middleware::from_fn(security))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn security(request: Request, next: Next) -> Response {
    if !matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::HEAD | axum::http::Method::OPTIONS
    ) {
        if request
            .headers()
            .get("sec-fetch-site")
            .is_some_and(|v| v == "cross-site")
        {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error":"Cross-site requests are not allowed"})),
            )
                .into_response();
        }
        if let Some(origin) = request
            .headers()
            .get(header::ORIGIN)
            .and_then(|v| v.to_str().ok())
        {
            let host = request
                .headers()
                .get(header::HOST)
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default();
            if origin != format!("http://{host}") && origin != format!("https://{host}") {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({"error":"Origin does not match this mailbox"})),
                )
                    .into_response();
            }
        }
    }
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    headers.insert("content-security-policy", HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}
async fn settings(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let account = db::account(&state.pool).await?;
    let labels: Vec<Label> = sqlx::query_as("SELECT * FROM labels ORDER BY name")
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(
        json!({"account":account,"labels":labels,"counts":db::counts(&state.pool).await?,"outbound_configured":!state.config.relay_host.is_empty(),"smtp_port":state.config.smtp_port,"max_message_bytes":state.config.max_message_bytes}),
    ))
}
async fn save_account(
    State(state): State<AppState>,
    Json(account): Json<Account>,
) -> ApiResult<Json<Account>> {
    if account.name.trim().is_empty()
        || account.name.len() > 100
        || account.email.parse::<lettre::Address>().is_err()
        || account.name.contains(['\r', '\n'])
    {
        return Err(ApiError::bad("Enter a name and valid email address"));
    }
    sqlx::query("UPDATE settings SET value=? WHERE key='account'")
        .bind(serde_json::to_string(&account)?)
        .execute(&state.pool)
        .await?;
    Ok(Json(account))
}

#[derive(Deserialize, Default)]
struct ListQuery {
    folder: Option<String>,
    category: Option<String>,
    label: Option<String>,
    q: Option<String>,
    page: Option<i64>,
}
#[derive(sqlx::FromRow)]
struct ThreadRow {
    #[sqlx(flatten)]
    thread: ThreadSummary,
    total: i64,
}
async fn threads(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> ApiResult<Json<Value>> {
    let terms = search::parse(query.q.as_deref().unwrap_or_default())
        .map_err(|e| ApiError::bad(e.to_string()))?;
    let folder = query.folder.as_deref().unwrap_or("inbox");
    let mut sql =
        QueryBuilder::<Sqlite>::new("WITH filtered AS (SELECT m.* FROM messages m WHERE 1=1");
    if query.q.as_ref().is_some_and(|s| !s.trim().is_empty()) {
        if !terms
            .iter()
            .any(|t| matches!(t,search::Term::Field(field,_) if field=="in"))
        {
            sql.push(" AND m.folder NOT IN ('spam','trash')");
        }
    } else {
        match folder {
            "all" => {
                sql.push(" AND m.folder NOT IN ('spam','trash')");
            }
            "starred" => {
                sql.push(" AND m.starred=1 AND m.folder NOT IN ('spam','trash')");
            }
            "important" => {
                sql.push(" AND m.important=1 AND m.folder NOT IN ('spam','trash')");
            }
            "snoozed" => {
                sql.push(" AND m.snoozed_until > ")
                    .push_bind(db::now())
                    .push(" AND m.folder NOT IN ('spam','trash')");
            }
            "label" => {
                sql.push(" AND m.folder NOT IN ('spam','trash')");
            }
            "sent" => {
                sql.push(" AND m.is_sent=1 AND m.folder NOT IN ('spam','trash')");
            }
            "inbox" | "spam" | "trash" | "archive" => {
                sql.push(" AND m.folder=").push_bind(folder.to_string());
            }
            _ => return Err(ApiError::bad("Unknown mailbox folder")),
        }
        if folder == "inbox" {
            sql.push(" AND (m.snoozed_until IS NULL OR m.snoozed_until <= ")
                .push_bind(db::now())
                .push(")");
            if let Some(category) = query.category {
                sql.push(" AND m.category=").push_bind(category);
            }
        }
        if let Some(label) = query.label {
            sql.push(" AND EXISTS(SELECT 1 FROM message_labels ml WHERE ml.message_id=m.id AND ml.label_id=").push_bind(label).push(")");
        }
    }
    search::append(&mut sql, &terms);
    let filter_sql = sql.sql().to_owned();
    let filter_arguments = sql
        .build()
        .take_arguments()
        .map_err(anyhow::Error::from_boxed)?
        .unwrap_or_default();
    let mut sql =
        QueryBuilder::<Sqlite>::with_arguments(filter_sql.clone(), filter_arguments.clone());
    sql.push("), ranked AS (SELECT m.*,ROW_NUMBER() OVER(PARTITION BY thread_id ORDER BY received_at DESC,id DESC) AS rank, COUNT(*) OVER(PARTITION BY thread_id) AS count, SUM(1-is_read) OVER(PARTITION BY thread_id) AS unread, MAX(starred) OVER(PARTITION BY thread_id) AS thread_starred, MAX(important) OVER(PARTITION BY thread_id) AS thread_important FROM filtered m) SELECT thread_id AS id,subject,sender,sender_email,snippet,received_at,count,unread,thread_starred AS starred,thread_important AS important,category,EXISTS(SELECT 1 FROM attachments a JOIN messages x ON x.id=a.message_id WHERE x.thread_id=m.thread_id) AS has_attachment,COALESCE((SELECT group_concat(DISTINCT l.name) FROM labels l JOIN message_labels ml ON ml.label_id=l.id JOIN messages x ON x.id=ml.message_id WHERE x.thread_id=m.thread_id),'') AS labels,COUNT(*) OVER() AS total FROM ranked m WHERE rank=1 ORDER BY received_at DESC LIMIT 50 OFFSET ")
        .push_bind((query.page.unwrap_or(1).clamp(1,10_000)-1)*50);
    let rows = sql
        .build_query_as::<ThreadRow>()
        .fetch_all(&state.pool)
        .await?;
    let total = if let Some(row) = rows.first() {
        row.total
    } else {
        sqlx::query_scalar_with::<Sqlite, i64, _>(
            &format!("{filter_sql}) SELECT COUNT(DISTINCT thread_id) FROM filtered"),
            filter_arguments,
        )
        .fetch_one(&state.pool)
        .await?
    };
    Ok(Json(
        json!({"threads":rows.into_iter().map(|r| r.thread).collect::<Vec<_>>(),"total":total}),
    ))
}
async fn thread(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let messages: Vec<MessageView> = sqlx::query_as("SELECT id,thread_id,message_id,subject,sender,sender_email,recipients,cc,envelope_to,text,html,received_at,is_read,starred,important,folder,category,snoozed_until FROM messages WHERE thread_id=? ORDER BY received_at,id")
        .bind(&id).fetch_all(&state.pool).await?;
    if messages.is_empty() {
        return Err(ApiError::not_found());
    }
    let attachments: Vec<AttachmentView> = sqlx::query_as("SELECT a.id,a.message_id,a.name,a.content_type,a.size FROM attachments a JOIN messages m ON m.id=a.message_id WHERE m.thread_id=?").bind(&id).fetch_all(&state.pool).await?;
    let labels: Vec<Label> = sqlx::query_as("SELECT DISTINCT l.* FROM labels l JOIN message_labels ml ON ml.label_id=l.id JOIN messages m ON m.id=ml.message_id WHERE m.thread_id=?").bind(&id).fetch_all(&state.pool).await?;
    Ok(Json(
        json!({"messages":messages,"attachments":attachments,"labels":labels}),
    ))
}

#[derive(Deserialize)]
struct Action {
    thread_ids: Vec<String>,
    action: String,
    #[serde(default)]
    value: String,
    until: Option<i64>,
}
async fn actions(
    State(state): State<AppState>,
    Json(action): Json<Action>,
) -> ApiResult<Json<Value>> {
    if action.thread_ids.is_empty() || action.thread_ids.len() > 100 {
        return Err(ApiError::bad("Select between 1 and 100 conversations"));
    }
    let mut tx = state.pool.begin_with("BEGIN IMMEDIATE").await?;
    for id in &action.thread_ids {
        match action.action.as_str() {
            "label" | "unlabel" => {
                if action.action == "label" {
                    let exists: bool =
                        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM labels WHERE id=?)")
                            .bind(&action.value)
                            .fetch_one(&mut *tx)
                            .await?;
                    if !exists {
                        return Err(ApiError::bad("Label does not exist"));
                    }
                    sqlx::query("INSERT OR IGNORE INTO message_labels(message_id,label_id) SELECT id,? FROM messages WHERE thread_id=?").bind(&action.value).bind(id).execute(&mut *tx).await?;
                } else {
                    sqlx::query("DELETE FROM message_labels WHERE label_id=? AND message_id IN(SELECT id FROM messages WHERE thread_id=?)").bind(&action.value).bind(id).execute(&mut *tx).await?;
                }
            }
            "delete" => {
                sqlx::query("DELETE FROM messages WHERE thread_id=? AND folder='trash'")
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
            }
            _ => {
                let mut sql = QueryBuilder::<Sqlite>::new("UPDATE messages SET ");
                match action.action.as_str() {
                    "archive" => {
                        sql.push("folder='archive',snoozed_until=NULL");
                    }
                    "trash" => {
                        sql.push("folder='trash',snoozed_until=NULL");
                    }
                    "spam" => {
                        sql.push("folder='spam',snoozed_until=NULL");
                    }
                    "inbox" => {
                        sql.push("folder='inbox',snoozed_until=NULL");
                    }
                    "read" => {
                        sql.push("is_read=1");
                    }
                    "unread" => {
                        sql.push("is_read=0");
                    }
                    "star" => {
                        sql.push("starred=1");
                    }
                    "unstar" => {
                        sql.push("starred=0");
                    }
                    "important" => {
                        sql.push("important=1");
                    }
                    "unimportant" => {
                        sql.push("important=0");
                    }
                    "snooze" => {
                        let until = action
                            .until
                            .filter(|v| *v > db::now())
                            .ok_or_else(|| ApiError::bad("Choose a future snooze time"))?;
                        sql.push("snoozed_until=").push_bind(until);
                    }
                    _ => return Err(ApiError::bad("Unknown mailbox action")),
                }
                sql.push(" WHERE thread_id=").push_bind(id.clone());
                sql.build().execute(&mut *tx).await?;
            }
        }
    }
    tx.commit().await?;
    let _ = state.events.send(());
    Ok(Json(json!({"ok":true})))
}

async fn labels(State(state): State<AppState>) -> ApiResult<Json<Vec<Label>>> {
    Ok(Json(
        sqlx::query_as("SELECT * FROM labels ORDER BY name")
            .fetch_all(&state.pool)
            .await?,
    ))
}
#[derive(Deserialize)]
struct LabelInput {
    name: String,
    color: String,
}
async fn create_label(
    State(state): State<AppState>,
    Json(input): Json<LabelInput>,
) -> ApiResult<Json<Label>> {
    if input.name.trim().is_empty()
        || input.name.len() > 50
        || !input.color.starts_with('#')
        || input.color.len() != 7
        || !input.color[1..].chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err(ApiError::bad("Enter a label name and hex color"));
    }
    let label = Label {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name.trim().into(),
        color: input.color,
    };
    let result = sqlx::query("INSERT INTO labels(id,name,color) VALUES(?,?,?)")
        .bind(&label.id)
        .bind(&label.name)
        .bind(&label.color)
        .execute(&state.pool)
        .await;
    if let Err(error) = result {
        if error
            .as_database_error()
            .is_some_and(|e| e.is_unique_violation())
        {
            return Err(ApiError::bad("A label with this name already exists"));
        }
        return Err(error.into());
    }
    Ok(Json(label))
}
async fn delete_label(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    sqlx::query("DELETE FROM labels WHERE id=?")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    sqlx::query("DELETE FROM rules WHERE action='label' AND value=?")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({"ok":true})))
}
async fn rules(State(state): State<AppState>) -> ApiResult<Json<Vec<Rule>>> {
    Ok(Json(
        sqlx::query_as("SELECT * FROM rules ORDER BY rowid")
            .fetch_all(&state.pool)
            .await?,
    ))
}
async fn save_rule(
    State(state): State<AppState>,
    Json(mut rule): Json<Rule>,
) -> ApiResult<Json<Rule>> {
    if rule.name.trim().is_empty()
        || rule.name.len() > 100
        || rule.contains.trim().is_empty()
        || rule.contains.len() > 500
        || !["from", "to", "subject", "body"].contains(&rule.field.as_str())
        || ![
            "label",
            "category",
            "archive",
            "spam",
            "star",
            "important",
            "read",
        ]
        .contains(&rule.action.as_str())
    {
        return Err(ApiError::bad(
            "Enter a rule name, condition, and supported action",
        ));
    }
    if rule.action == "category"
        && !["primary", "updates", "promotions", "social"].contains(&rule.value.as_str())
    {
        return Err(ApiError::bad("Choose a valid category"));
    }
    if rule.action == "label" {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM labels WHERE id=?)")
            .bind(&rule.value)
            .fetch_one(&state.pool)
            .await?;
        if !exists {
            return Err(ApiError::bad("Choose an existing label"));
        }
    }
    if rule.id.is_empty() {
        rule.id = uuid::Uuid::new_v4().to_string();
    }
    sqlx::query("INSERT INTO rules(id,name,field,contains,action,value,enabled) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,field=excluded.field,contains=excluded.contains,action=excluded.action,value=excluded.value,enabled=excluded.enabled")
        .bind(&rule.id).bind(&rule.name).bind(&rule.field).bind(&rule.contains).bind(&rule.action).bind(&rule.value).bind(rule.enabled).execute(&state.pool).await?;
    Ok(Json(rule))
}
async fn delete_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    sqlx::query("DELETE FROM rules WHERE id=?")
        .bind(id)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({"ok":true})))
}

async fn drafts(State(state): State<AppState>) -> ApiResult<Json<Vec<Draft>>> {
    let rows: Vec<String> = sqlx::query_scalar("SELECT data FROM drafts ORDER BY updated_at DESC")
        .fetch_all(&state.pool)
        .await?;
    let drafts: Result<Vec<Draft>, _> = rows.iter().map(|s| serde_json::from_str(s)).collect();
    Ok(Json(drafts?))
}
async fn save_draft(
    State(state): State<AppState>,
    Json(mut draft): Json<Draft>,
) -> ApiResult<Json<Draft>> {
    if draft.id.is_empty() {
        draft.id = uuid::Uuid::new_v4().to_string();
    }
    draft.updated_at = db::now();
    let data = serde_json::to_string(&draft)?;
    if data.len() > state.config.max_message_bytes * 3 / 2 {
        return Err(ApiError::bad("Draft exceeds message size limit"));
    }
    for field in [
        &draft.to,
        &draft.cc,
        &draft.bcc,
        &draft.subject,
        &draft.in_reply_to,
    ] {
        if field.contains(['\r', '\n']) {
            return Err(ApiError::bad(
                "Address and subject fields cannot contain newlines",
            ));
        }
    }
    let result=sqlx::query("INSERT INTO drafts(id,data,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE drafts.sending=0")
        .bind(&draft.id).bind(data).bind(draft.updated_at).execute(&state.pool).await?;
    if result.rows_affected() == 0 {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "This draft is currently being sent".into(),
        ));
    }
    Ok(Json(draft))
}
async fn delete_draft(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    sqlx::query("DELETE FROM drafts WHERE id=? AND sending=0")
        .bind(id)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({"ok":true})))
}
async fn send_draft(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let data: Option<String> =
        sqlx::query_scalar("UPDATE drafts SET sending=1 WHERE id=? AND sending=0 RETURNING data")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?;
    let Some(data) = data else {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Draft is missing or is already being sent".into(),
        ));
    };
    let draft: Draft = serde_json::from_str(&data)?;
    let result = outgoing::send(&state, &draft).await;
    if let Err(error) = result {
        sqlx::query("UPDATE drafts SET sending=0 WHERE id=?")
            .bind(id)
            .execute(&state.pool)
            .await?;
        return Err(ApiError(
            StatusCode::BAD_GATEWAY,
            format!("Could not send: {error}"),
        ));
    }
    Ok(Json(json!({"ok":true,"thread_id":result?})))
}
async fn raw_message(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    let raw: Option<Vec<u8>> = sqlx::query_scalar("SELECT raw FROM messages WHERE id=?")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    Ok((
        [
            (header::CONTENT_TYPE, "message/rfc822"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=message.eml",
            ),
        ],
        raw.ok_or_else(ApiError::not_found)?,
    )
        .into_response())
}
async fn attachment(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    let row = sqlx::query("SELECT name,content FROM attachments WHERE id=?")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let name: String = row.get("name");
    let name: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || " ._-".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect();
    Ok((
        [
            (header::CONTENT_TYPE, "application/octet-stream".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{name}\""),
            ),
        ],
        row.get::<Vec<u8>, _>("content"),
    )
        .into_response())
}
#[derive(Deserialize)]
struct Import {
    raw: String,
    #[serde(default)]
    envelope: Envelope,
}
async fn import(
    State(state): State<AppState>,
    Json(input): Json<Import>,
) -> ApiResult<Json<Value>> {
    let raw = STANDARD
        .decode(input.raw)
        .map_err(|_| ApiError::bad("Expected base64-encoded email"))?;
    if raw.is_empty() || raw.len() > state.config.max_message_bytes {
        return Err(ApiError::bad("Email is empty or exceeds size limit"));
    }
    let id = db::enqueue(&state.pool, raw, &input.envelope).await?;
    state.wake.notify_waiters();
    Ok(Json(json!({"id":id})))
}
async fn pipeline_status(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let rows = sqlx::query("SELECT status,COUNT(*) AS count FROM jobs GROUP BY status")
        .fetch_all(&state.pool)
        .await?;
    let mut counts = serde_json::Map::new();
    for row in rows {
        counts.insert(
            row.get::<String, _>("status"),
            json!(row.get::<i64, _>("count")),
        );
    }
    let avg:Option<f64>=sqlx::query_scalar("SELECT AVG(duration_ms) FROM (SELECT duration_ms FROM jobs WHERE status='completed' ORDER BY completed_at DESC LIMIT 100)").fetch_one(&state.pool).await?;
    let failures=sqlx::query("SELECT id,error,received_at,kind FROM jobs WHERE status='failed' ORDER BY received_at DESC LIMIT 20").fetch_all(&state.pool).await?;
    let failures:Vec<Value>=failures.into_iter().map(|row|json!({"id":row.get::<String,_>("id"),"error":row.get::<String,_>("error"),"received_at":row.get::<i64,_>("received_at"),"kind":row.get::<String,_>("kind")})).collect();
    Ok(Json(
        json!({"counts":counts,"average_ms":avg.unwrap_or(0.0),"stages":state.pipeline.names(),"concurrency":state.config.concurrency,"failures":failures}),
    ))
}
async fn retry_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let result=sqlx::query("UPDATE jobs SET status='pending',attempts=0,error=NULL WHERE id=? AND status='failed' AND kind='incoming'").bind(id).execute(&state.pool).await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::bad("Only failed incoming jobs can be retried"));
    }
    state.wake.notify_waiters();
    Ok(Json(json!({"ok":true})))
}
async fn events(State(state): State<AppState>) -> impl IntoResponse {
    let mut receiver = state.events.subscribe();
    let mut shutdown = state.shutdown.subscribe();
    let stream = async_stream::stream! {
        loop { tokio::select! {
            _ = shutdown.changed() => break,
            result = receiver.recv() => match result {
                Ok(()) | Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => yield Ok::<_,Infallible>(Event::default().event("mailbox").data("changed")),
                Err(_) => break,
            }
        } }
    };
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
