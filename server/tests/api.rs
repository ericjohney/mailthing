mod common;
use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use common::*;
use http_body_util::BodyExt;
use mailthing::{api, db};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn request(app: &Router, method: &str, path: &str, data: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("content-type", "application/json")
                .body(Body::from(data.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn mailbox_search_bulk_actions_labels_and_trash() {
    let (_temp, state) = setup().await;
    let first = deliver(
        &state,
        mail("Weekend plans", "first", "Coffee by the river"),
    )
    .await;
    deliver(&state, mail("Another note", "second", "Bring a camera")).await;
    let app = api::router(state.clone());
    let (status, page) = request(
        &app,
        "GET",
        "/api/threads?folder=inbox&category=primary",
        json!(null),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["total"], 2);
    assert_eq!(page["threads"][0]["unread"], 1);
    let (_, found) = request(&app, "GET", "/api/threads?q=coffee", json!(null)).await;
    assert_eq!(found["total"], 1);
    let (_, found) = request(
        &app,
        "GET",
        "/api/threads?q=from%3Asam%40example.net%20subject%3AWeekend",
        json!(null),
    )
    .await;
    assert_eq!(found["total"], 1);
    let (_, label) = request(
        &app,
        "POST",
        "/api/labels",
        json!({"name":"Personal","color":"#2a6b53"}),
    )
    .await;
    for action in ["read", "star", "label", "archive"] {
        assert_eq!(
            request(
                &app,
                "POST",
                "/api/actions",
                json!({"thread_ids":[first],"action":action,"value":label["id"]})
            )
            .await
            .0,
            StatusCode::OK
        );
    }
    let (_, page) = request(&app, "GET", "/api/threads?folder=inbox", json!(null)).await;
    assert_eq!(page["total"], 1);
    let (_, page) = request(
        &app,
        "GET",
        &format!(
            "/api/threads?folder=label&label={}",
            label["id"].as_str().unwrap()
        ),
        json!(null),
    )
    .await;
    assert_eq!(page["total"], 1);
    assert_eq!(page["threads"][0]["labels"], "Personal");
    let (_, conversation) =
        request(&app, "GET", &format!("/api/threads/{first}"), json!(null)).await;
    assert_eq!(conversation["messages"][0]["is_read"], true);
    assert_eq!(conversation["messages"][0]["starred"], true);
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[first],"action":"trash"}),
    )
    .await;
    let (_, found) = request(&app, "GET", "/api/threads?q=coffee", json!(null)).await;
    assert_eq!(found["total"], 0);
    let (_, found) = request(
        &app,
        "GET",
        "/api/threads?q=coffee%20in%3Aanywhere",
        json!(null),
    )
    .await;
    assert_eq!(found["total"], 1);
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[first],"action":"delete"}),
    )
    .await;
    assert_eq!(
        request(&app, "GET", &format!("/api/threads/{first}"), json!(null))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn draft_failure_retains_content_and_mailbox_identity_is_configurable() {
    let (_temp, state) = setup().await;
    let app = api::router(state.clone());
    let (status, account) = request(
        &app,
        "PUT",
        "/api/settings",
        json!({"name":"Jamie","email":"jamie@example.org"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(account["email"], "jamie@example.org");
    assert_eq!(db::account(&state.pool).await.unwrap().name, "Jamie");
    assert_eq!(
        request(
            &app,
            "PUT",
            "/api/settings",
            json!({"name":"Jamie","email":"bad"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (_, draft) = request(
        &app,
        "POST",
        "/api/drafts",
        json!({"to":"friend@example.net","subject":"Hello","body":"Keep this draft"}),
    )
    .await;
    let id = draft["id"].as_str().unwrap();
    let (status, error) = request(&app, "POST", &format!("/api/drafts/{id}/send"), json!({})).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert!(error["error"].as_str().unwrap().contains("SMTP_RELAY_HOST"));
    let (_, drafts) = request(&app, "GET", "/api/drafts", json!(null)).await;
    assert_eq!(drafts[0]["body"], "Keep this draft");
    let sending: bool = sqlx::query_scalar("SELECT sending FROM drafts WHERE id=?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert!(!sending);
    let sent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages WHERE folder='sent'")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(sent, 0);
}

#[tokio::test]
async fn rejects_cross_site_mutations() {
    let (_temp, state) = setup().await;
    let app = api::router(state);
    let response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/settings")
                .header("sec-fetch-site", "cross-site")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"name":"Intruder","email":"intruder@example.net"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn sent_messages_remain_in_sent_when_archived_or_moved_to_inbox() {
    let (_temp, state) = setup().await;
    let raw = mail("Sent conversation", "sent-archive", "Hello");
    let mut parsed = state.pipeline.run(&raw, &envelope(), &[]).unwrap();
    parsed.folder = "sent".into();
    parsed.is_read = true;
    let thread = mailthing::pipeline::persist(
        &state.pool,
        "sent-message",
        &raw,
        &envelope(),
        &parsed,
        db::now(),
        0,
    )
    .await
    .unwrap();
    let app = api::router(state);
    for action in ["archive", "inbox"] {
        request(
            &app,
            "POST",
            "/api/actions",
            json!({"thread_ids":[thread],"action":action}),
        )
        .await;
        assert_eq!(
            request(&app, "GET", "/api/threads?folder=sent", json!(null))
                .await
                .1["total"],
            1
        );
        assert_eq!(
            request(&app, "GET", "/api/threads?q=in%3Asent", json!(null))
                .await
                .1["total"],
            1
        );
    }
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[thread],"action":"trash"}),
    )
    .await;
    assert_eq!(
        request(&app, "GET", "/api/threads?folder=sent", json!(null))
            .await
            .1["total"],
        0
    );
}

#[tokio::test]
async fn pagination_preserves_total_when_the_last_page_becomes_empty() {
    let (_temp, state) = setup().await;
    for index in 0..51 {
        deliver(
            &state,
            mail(
                &format!("Page {index}"),
                &format!("page-{index}"),
                "A message",
            ),
        )
        .await;
    }
    let app = api::router(state);
    let (_, page) = request(&app, "GET", "/api/threads?folder=inbox&page=2", json!(null)).await;
    assert_eq!(page["total"], 51);
    assert_eq!(page["threads"].as_array().unwrap().len(), 1);
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[page["threads"][0]["id"]],"action":"archive"}),
    )
    .await;
    let (_, page) = request(&app, "GET", "/api/threads?folder=inbox&page=2", json!(null)).await;
    assert_eq!(page["total"], 50);
    assert!(page["threads"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn snoozed_mail_hides_then_returns_and_invalid_filters_are_rejected() {
    let (_temp, state) = setup().await;
    let id = deliver(&state, mail("Later", "later", "Tomorrow")).await;
    let app = api::router(state.clone());
    request(
        &app,
        "POST",
        "/api/actions",
        json!({"thread_ids":[id],"action":"snooze","until":db::now()+86400000}),
    )
    .await;
    assert_eq!(
        request(&app, "GET", "/api/threads?folder=inbox", json!(null))
            .await
            .1["total"],
        0
    );
    assert_eq!(
        request(&app, "GET", "/api/threads?folder=snoozed", json!(null))
            .await
            .1["total"],
        1
    );
    sqlx::query("UPDATE messages SET snoozed_until=?")
        .bind(db::now() - 100)
        .execute(&state.pool)
        .await
        .unwrap();
    assert_eq!(
        request(&app, "GET", "/api/threads?folder=inbox", json!(null))
            .await
            .1["total"],
        1
    );
    assert_eq!(request(&app,"POST","/api/rules",json!({"id":"","name":"Bad","field":"from","contains":"x","action":"category","value":"invalid","enabled":true})).await.0,StatusCode::BAD_REQUEST);
    assert_eq!(
        request(&app, "GET", "/api/threads?q=after%3Abad", json!(null))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/api/labels",
            json!({"name":"Bad","color":"#<img>!"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    // A SQL-looking input is passed as a bound value, never as executable SQL.
    assert_eq!(
        request(
            &app,
            "GET",
            "/api/threads?q=from%3A%27%20OR%201%3D1",
            json!(null)
        )
        .await
        .0,
        StatusCode::OK
    );
}
