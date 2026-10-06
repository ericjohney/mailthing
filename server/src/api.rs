use crate::{
    AppState, db, labels,
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
    let labels = all_labels(&state).await?;
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
    /// A label id, or `ALL` for every conversation outside spam and trash.
    label: Option<String>,
    category: Option<String>,
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
    let label = query.label.as_deref().unwrap_or(labels::INBOX);
    let mut sql =
        QueryBuilder::<Sqlite>::new("WITH filtered AS (SELECT m.* FROM messages m WHERE 1=1");
    if query.q.as_ref().is_some_and(|s| !s.trim().is_empty()) {
        if !search::includes_hidden(&terms) {
            sql.push(" AND ").push(labels::visible());
        }
    } else {
        if label != labels::SPAM && label != labels::TRASH {
            sql.push(" AND ").push(labels::visible());
        }
        if label != "ALL" {
            sql.push(" AND EXISTS(SELECT 1 FROM message_labels ml WHERE ml.message_id=m.id AND ml.label_id=")
                .push_bind(label.to_string())
                .push(")");
        }
        if label == labels::INBOX
            && let Some(category) = query.category
        {
            if !labels::CATEGORIES.contains(&category.as_str()) {
                return Err(ApiError::bad("Unknown inbox category"));
            }
            sql.push(" AND EXISTS(SELECT 1 FROM message_labels ml WHERE ml.message_id=m.id AND ml.label_id=")
                .push_bind(category)
                .push(")");
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
    // The row shows the newest matching message; counts and labels cover the whole conversation.
    sql.push("), ranked AS (SELECT m.*,ROW_NUMBER() OVER(PARTITION BY thread_id ORDER BY received_at DESC,id DESC) AS rank FROM filtered m) SELECT thread_id AS id,subject,sender,sender_email,snippet,received_at,(SELECT COUNT(*) FROM messages x WHERE x.thread_id=m.thread_id) AS count,(SELECT COUNT(*) FROM messages x JOIN message_labels u ON u.message_id=x.id AND u.label_id='UNREAD' WHERE x.thread_id=m.thread_id) AS unread,EXISTS(SELECT 1 FROM attachments a JOIN messages x ON x.id=a.message_id WHERE x.thread_id=m.thread_id) AS has_attachment,(SELECT json_group_array(DISTINCT ml.label_id) FROM message_labels ml JOIN messages x ON x.id=ml.message_id WHERE x.thread_id=m.thread_id) AS label_ids,COUNT(*) OVER() AS total FROM ranked m WHERE rank=1 ORDER BY received_at DESC LIMIT 50 OFFSET ")
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
    let messages: Vec<MessageView> = sqlx::query_as("SELECT id,thread_id,message_id,subject,sender,sender_email,recipients,cc,envelope_to,text,html,received_at,snoozed_until,(SELECT json_group_array(label_id) FROM message_labels WHERE message_id=messages.id) AS labels FROM messages WHERE thread_id=? ORDER BY received_at,id")
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
    use labels::{IMPORTANT, INBOX, SNOOZED, SPAM, STARRED, TRASH, UNREAD};
    let mut tx = state.pool.begin_with("BEGIN IMMEDIATE").await?;
    for id in &action.thread_ids {
        // Moving a conversation anywhere ends its snooze.
        let (add, remove): (Option<&str>, &[&str]) = match action.action.as_str() {
            "label" | "unlabel" => {
                let exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM labels WHERE id=? AND kind='user')",
                )
                .bind(&action.value)
                .fetch_one(&mut *tx)
                .await?;
                if !exists {
                    return Err(ApiError::bad("Label does not exist"));
                }
                if action.action == "label" {
                    labels::add(&mut tx, id, &action.value).await?;
                } else {
                    labels::remove(&mut tx, id, &[&action.value]).await?;
                }
                continue;
            }
            "delete" => {
                sqlx::query("DELETE FROM messages WHERE thread_id=? AND EXISTS(SELECT 1 FROM message_labels ml WHERE ml.message_id=messages.id AND ml.label_id='TRASH')")
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                continue;
            }
            "snooze" => {
                let until = action
                    .until
                    .filter(|v| *v > db::now())
                    .ok_or_else(|| ApiError::bad("Choose a future snooze time"))?;
                sqlx::query("UPDATE messages SET snoozed_until=? WHERE thread_id=?")
                    .bind(until)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                (Some(SNOOZED), &[INBOX])
            }
            "archive" => (None, &[INBOX, SNOOZED]),
            "trash" => (Some(TRASH), &[INBOX, SPAM, SNOOZED]),
            "spam" => (Some(SPAM), &[INBOX, TRASH, SNOOZED]),
            "inbox" => (Some(INBOX), &[SPAM, TRASH, SNOOZED]),
            "read" => (None, &[UNREAD]),
            "unread" => (Some(UNREAD), &[]),
            "star" => (Some(STARRED), &[]),
            "unstar" => (None, &[STARRED]),
            "important" => (Some(IMPORTANT), &[]),
            "unimportant" => (None, &[IMPORTANT]),
            _ => return Err(ApiError::bad("Unknown mailbox action")),
        };
        if remove.contains(&SNOOZED) {
            sqlx::query("UPDATE messages SET snoozed_until=NULL WHERE thread_id=?")
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        labels::remove(&mut tx, id, remove).await?;
        if let Some(label) = add {
            labels::add(&mut tx, id, label).await?;
        }
    }
    tx.commit().await?;
    let _ = state.events.send(());
    Ok(Json(json!({"ok":true})))
}

async fn all_labels(state: &AppState) -> anyhow::Result<Vec<Label>> {
    Ok(
        sqlx::query_as("SELECT id,name,color,kind FROM labels ORDER BY kind,name")
            .fetch_all(&state.pool)
            .await?,
    )
}
async fn labels(State(state): State<AppState>) -> ApiResult<Json<Vec<Label>>> {
    Ok(Json(all_labels(&state).await?))
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
        kind: "user".into(),
    };
    let result = sqlx::query("INSERT INTO labels(id,name,color,kind) VALUES(?,?,?,'user')")
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
            // Names are unique case-insensitively, including system labels such as Inbox.
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
    let deleted = sqlx::query("DELETE FROM labels WHERE id=? AND kind='user'")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    if deleted.rows_affected() == 0 {
        return Err(ApiError::bad("Only your own labels can be deleted"));
    }
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
    if rule.action == "category" && !labels::CATEGORIES.contains(&rule.value.as_str()) {
        return Err(ApiError::bad("Choose a valid category"));
    }
    if rule.action == "label" {
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM labels WHERE id=? AND kind='user')")
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
