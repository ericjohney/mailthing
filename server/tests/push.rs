mod common;
use axum::{body::Body, http::Request};
use common::*;
use mailthing::{api, db, pipeline, push};
use tower::ServiceExt;

async fn register(state: &mailthing::AppState) {
    sqlx::query(
        "INSERT INTO push_devices(token,environment,registered_at) VALUES(?,'production',0)",
    )
    .bind("a".repeat(64))
    .execute(&state.pool)
    .await
    .unwrap();
}
async fn queued(state: &mailthing::AppState) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM push_deliveries")
        .fetch_one(&state.pool)
        .await
        .unwrap()
}
#[tokio::test]
async fn arrival_queues_push_atomically_and_does_not_replay() {
    let (_temp, state) = setup().await;
    register(&state).await;
    let raw = mail("New message", "push", "Hello from your mailbox");
    let id = db::enqueue(&state.pool, raw.clone(), &envelope())
        .await
        .unwrap();
    pipeline::process_next(&state.pool, state.pipeline.clone())
        .await
        .unwrap();
    assert_eq!(queued(&state).await, 1);
    let parsed = state.pipeline.run(&raw, &envelope(), &[]).unwrap();
    sqlx::query("DELETE FROM push_deliveries")
        .execute(&state.pool)
        .await
        .unwrap();
    pipeline::persist(&state.pool, &id, &raw, &envelope(), &parsed, db::now(), 0)
        .await
        .unwrap();
    assert_eq!(
        queued(&state).await,
        0,
        "persisting a delivered receipt must never repeat its alert"
    );
}
#[tokio::test]
async fn historical_imports_and_filtered_mail_do_not_alert() {
    let (_temp, state) = setup().await;
    register(&state).await;
    db::enqueue_import(
        &state.pool,
        mail("Imported", "imported-push", "Old mail"),
        &envelope(),
        Some(&mailthing::models::ImportState::default()),
    )
    .await
    .unwrap();
    pipeline::process_next(&state.pool, state.pipeline.clone())
        .await
        .unwrap();
    assert_eq!(queued(&state).await, 0);
    sqlx::query("INSERT INTO rules(id,name,field,contains,action,value) VALUES('push-rule','Archive','subject','Filtered','archive','')")
        .execute(&state.pool).await.unwrap();
    deliver(&state, mail("Filtered", "filtered-push", "No alert")).await;
    assert_eq!(queued(&state).await, 0);
}
#[tokio::test]
async fn token_registration_validates_upserts_and_cascades_removal() {
    let (_temp, state) = setup().await;
    let router = api::router(state.clone());
    let request = |token: &str, environment: &str| {
        Request::builder()
            .method("POST")
            .uri("/api/push/devices")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({"token":token,"environment":environment}).to_string(),
            ))
            .unwrap()
    };
    for (token, env) in [("bad", "production"), (&"b".repeat(64), "wrong")] {
        assert_eq!(
            router
                .clone()
                .oneshot(request(token, env))
                .await
                .unwrap()
                .status(),
            400
        );
    }
    let token = "B".repeat(64);
    assert_eq!(
        router
            .clone()
            .oneshot(request(&token, "sandbox"))
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        router
            .clone()
            .oneshot(request(&token, "production"))
            .await
            .unwrap()
            .status(),
        200
    );
    let environments: Vec<String> = sqlx::query_scalar("SELECT environment FROM push_devices")
        .fetch_all(&state.pool)
        .await
        .unwrap();
    assert_eq!(environments, ["production"]);
    deliver(&state, mail("Test", "push-api", "Hi")).await;
    assert_eq!(queued(&state).await, 1);
    let response = router
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/push/devices/{token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(queued(&state).await, 0);
}
#[test]
fn payload_is_bounded_and_opens_the_right_thread() {
    let payload = push::payload(
        &"💌".repeat(200),
        &"é".repeat(300),
        &"x".repeat(2000),
        "conversation",
        5,
    );
    assert_eq!(payload["aps"]["badge"], 5);
    assert_eq!(payload["thread_id"], "conversation");
    assert_eq!(payload["aps"]["alert"]["body"].as_str().unwrap().len(), 240);
    assert!(serde_json::to_vec(&payload).unwrap().len() < 4096);
}
