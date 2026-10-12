mod common;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use common::*;
use http_body_util::BodyExt;
use mailthing::{AppState, api, pipeline};
use serde_json::Value;
use tower::ServiceExt;

const TOKEN: &str = "test-inbound-token-with-32-characters";

async fn submit(app: axum::Router, token: &str, id: &str, raw: Vec<u8>) -> (StatusCode, Vec<u8>) {
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/inbound/{id}"))
                .header("authorization", format!("Bearer {token}"))
                .header("x-envelope-from", "sam@example.net")
                .header("x-envelope-to", "bcc@example.com")
                .body(Body::from(raw))
                .unwrap(),
        )
        .await
        .unwrap();
    (
        response.status(),
        response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
}

#[tokio::test]
async fn authenticates_before_reading_and_only_exposes_receipt() {
    let (_temp, state) = setup().await;
    let id = uuid::Uuid::new_v4().to_string();
    assert_eq!(
        submit(api::inbound_router(state.clone()), "", &id, vec![0])
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let mut config = (*state.config).clone();
    config.inbound_token = TOKEN.into();
    let state = AppState::new(state.pool.clone(), config);
    let app = api::inbound_router(state.clone());
    assert_eq!(
        submit(
            app.clone(),
            "wrong",
            &id,
            vec![0; state.config.max_message_bytes + 1]
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        submit(
            app.clone(),
            TOKEN,
            &id,
            vec![0; state.config.max_message_bytes + 1]
        )
        .await
        .0,
        StatusCode::PAYLOAD_TOO_LARGE
    );
    assert_eq!(
        submit(app.clone(), TOKEN, "invalid-id", vec![1]).await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        submit(app.clone(), TOKEN, &id, vec![]).await.0,
        StatusCode::BAD_REQUEST
    );
    for path in ["/", "/api/settings", "/api/threads", "/api/import"] {
        let r = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header("authorization", format!("Bearer {TOKEN}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), StatusCode::NOT_FOUND);
    }
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn durable_receipt_preserves_envelope_and_deduplicates_concurrent_delivery() {
    let (_temp, state) = setup().await;
    let mut config = (*state.config).clone();
    config.inbound_token = TOKEN.into();
    let state = AppState::new(state.pool.clone(), config);
    let app = api::inbound_router(state.clone());
    let id = uuid::Uuid::new_v4().to_string();
    let raw = mail("Cloudflare delivery", "cloudflare", "Original MIME");
    let (a, b) = tokio::join!(
        submit(app.clone(), TOKEN, &id, raw.clone()),
        submit(app.clone(), TOKEN, &id, raw.clone())
    );
    assert_eq!(a.0, StatusCode::OK);
    assert_eq!(b.0, StatusCode::OK);
    assert_eq!(a.1, b.1);
    let response: Value = serde_json::from_slice(&a.1).unwrap();
    let job_id = response["id"].as_str().unwrap();
    let stored: Vec<u8> = sqlx::query_scalar("SELECT raw FROM jobs WHERE id=?")
        .bind(job_id)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(stored, raw);
    pipeline::process_next(&state.pool, state.pipeline.clone())
        .await
        .unwrap();
    assert_eq!(submit(app, TOKEN, &id, raw).await.0, StatusCode::OK);
    let recipients: String = sqlx::query_scalar("SELECT envelope_to FROM messages WHERE id=?")
        .bind(job_id)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&recipients).unwrap(),
        serde_json::json!(["bcc@example.com"])
    );
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}
