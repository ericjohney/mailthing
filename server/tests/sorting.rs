mod common;
use axum::{Json, Router, routing::post};
use common::*;
use mailthing::{
    db, pipeline,
    sorting::{Sorter, SortingConfig, parse_decision},
};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

async fn mock(response: Value) -> (Sorter, Arc<Mutex<Vec<Value>>>, tokio::task::JoinHandle<()>) {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let captured = requests.clone();
    let app = Router::new().route(
        "/v1/chat/completions",
        post(move |Json(input): Json<Value>| {
            let requests = captured.clone();
            let response = response.clone();
            async move {
                requests.lock().unwrap().push(input);
                Json(response)
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base_url = format!("http://{}/v1", listener.local_addr().unwrap());
    let task = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (
        Sorter::new(SortingConfig {
            base_url,
            api_key: "test-secret".into(),
            model: "custom-luna-alias".into(),
            timeout_seconds: 1,
            spam_threshold: 0.95,
        }),
        requests,
        task,
    )
}
fn completion(category: &str, labels: Value) -> Value {
    json!({"choices":[{"finish_reason":"stop","message":{"content":json!({"category":category,"label_ids":labels,"spam":{"is_spam":false,"confidence":0.99}}).to_string()}}]})
}

#[tokio::test]
async fn sorter_uses_owner_memory_and_bounds_email_content() {
    let (_temp, state) = setup().await;
    sqlx::query("INSERT INTO labels(id,name,kind) VALUES('finance','Finance','user'),('unused','Unused','user')").execute(&state.pool).await.unwrap();
    sqlx::query("INSERT INTO sorting_memory(label_id,guidance) VALUES('finance','Tax and banking correspondence')").execute(&state.pool).await.unwrap();
    let (sorter, requests, task) = mock(completion("CATEGORY_UPDATES", json!(["finance"]))).await;
    let mut parsed = state
        .pipeline
        .run(
            &mail("Tax notice", "memory", &"x".repeat(9000)),
            &envelope(),
            &[],
        )
        .unwrap();
    sorter.classify(&state.pool, &mut parsed).await.unwrap();
    assert!(parsed.has_label("finance"));
    assert_eq!(parsed.category(), Some("CATEGORY_UPDATES"));
    let request = requests.lock().unwrap()[0].clone();
    assert_eq!(request["model"], "custom-luna-alias");
    assert_eq!(request["stream"], true);
    let label_schema =
        &request["response_format"]["json_schema"]["schema"]["properties"]["label_ids"];
    assert_eq!(label_schema["items"]["enum"], json!(["finance"]));
    assert_eq!(label_schema["maxItems"], 1);
    let input: Value =
        serde_json::from_str(request["messages"][1]["content"].as_str().unwrap()).unwrap();
    assert_eq!(
        input["email"]["body"].as_str().unwrap().chars().count(),
        6000
    );
    assert!(
        input["memories"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["guidance"] == "Tax and banking correspondence")
    );
    assert!(
        !input["memories"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["label_id"] == "unused")
    );
    task.abort();
}

#[tokio::test]
async fn rules_override_llm_and_predictions_do_not_teach_memory() {
    let (_temp, state) = setup().await;
    sqlx::query("INSERT INTO rules(id,name,field,contains,action,value) VALUES('rule','Personal','subject','invoice','category','CATEGORY_PERSONAL')").execute(&state.pool).await.unwrap();
    let (sorter, _, task) = mock(completion("CATEGORY_UPDATES", json!([]))).await;
    let id = db::enqueue(
        &state.pool,
        mail("Invoice", "rules-llm", "A bill"),
        &envelope(),
    )
    .await
    .unwrap();
    pipeline::process_next_with_sorter(&state.pool, state.pipeline.clone(), Some(&sorter))
        .await
        .unwrap();
    let labels: Vec<String> =
        sqlx::query_scalar("SELECT label_id FROM message_labels WHERE message_id=?")
            .bind(&id)
            .fetch_all(&state.pool)
            .await
            .unwrap();
    assert!(labels.iter().any(|l| l == "CATEGORY_PERSONAL"));
    assert!(!labels.iter().any(|l| l == "CATEGORY_UPDATES"));
    let category: String =
        sqlx::query_scalar("SELECT category FROM sorting_results WHERE message_id=?")
            .bind(&id)
            .fetch_one(&state.pool)
            .await
            .unwrap();
    assert_eq!(category, "CATEGORY_UPDATES");
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sorting_examples")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    task.abort();
}

#[tokio::test]
async fn invalid_results_and_provider_errors_keep_mail_deliverable() {
    for response in [
        completion("CATEGORY_UPDATES", json!(["TRASH"])),
        completion("INVALID", json!([])),
        json!({"error":"provider down"}),
    ] {
        let (_temp, state) = setup().await;
        let (sorter, _, task) = mock(response).await;
        let id = db::enqueue(
            &state.pool,
            mail("Weekend plans", "fallback", "Coffee?"),
            &envelope(),
        )
        .await
        .unwrap();
        pipeline::process_next_with_sorter(&state.pool, state.pipeline.clone(), Some(&sorter))
            .await
            .unwrap();
        let status: String = sqlx::query_scalar("SELECT status FROM jobs WHERE id=?")
            .bind(&id)
            .fetch_one(&state.pool)
            .await
            .unwrap();
        assert_eq!(status, "completed");
        let category: String = sqlx::query_scalar(
            "SELECT label_id FROM message_labels WHERE message_id=? AND label_id LIKE 'CATEGORY_%'",
        )
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .unwrap();
        assert_eq!(category, "CATEGORY_PERSONAL");
        task.abort();
    }
}

#[test]
fn streaming_parser_requires_a_complete_valid_response() {
    let content = json!({"category":"CATEGORY_PERSONAL","label_ids":[],"spam":{"is_spam":false,"confidence":0.99}}).to_string();
    let sse = format!(
        "data: {}\r\n\r\ndata: {}\n\ndata: [DONE]\n\n",
        json!({"choices":[{"delta":{"content":content}}]}),
        json!({"choices":[{"delta":{},"finish_reason":"stop"}]})
    );
    assert_eq!(
        parse_decision(sse.as_bytes(), true).unwrap().category,
        "CATEGORY_PERSONAL"
    );
    assert!(parse_decision(sse.split("\r\n").next().unwrap().as_bytes(), true).is_err());
    assert!(parse_decision(b"data: {\"error\":\"bad\"}\n\n", true).is_err());
    assert!(
        parse_decision(
            br#"{"choices":[{"finish_reason":"length","message":{"content":"{}"}}]}"#,
            false
        )
        .is_err()
    );
}

#[tokio::test]
async fn provider_timeout_falls_back_and_spam_skips_the_provider() {
    let (_temp, state) = setup().await;
    let requests = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let captured = requests.clone();
    let app = Router::new().route(
        "/v1/chat/completions",
        post(move || {
            let captured = captured.clone();
            async move {
                captured.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                Json(completion("CATEGORY_UPDATES", json!([])))
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let sorter = Sorter::new(SortingConfig {
        base_url: format!("http://{}/v1", listener.local_addr().unwrap()),
        api_key: "secret".into(),
        model: "luna".into(),
        timeout_seconds: 1,
        spam_threshold: 0.95,
    });
    let task = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let id = db::enqueue(&state.pool, mail("Hello", "timeout", "Hi"), &envelope())
        .await
        .unwrap();
    pipeline::process_next_with_sorter(&state.pool, state.pipeline.clone(), Some(&sorter))
        .await
        .unwrap();
    let status: String = sqlx::query_scalar("SELECT status FROM jobs WHERE id=?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(status, "completed");
    let mut raw = b"X-Spam-Flag: YES\r\n".to_vec();
    raw.extend(mail("Spam", "spam-skip", "Bad"));
    db::enqueue(&state.pool, raw, &envelope()).await.unwrap();
    pipeline::process_next_with_sorter(&state.pool, state.pipeline.clone(), Some(&sorter))
        .await
        .unwrap();
    let imported = mailthing::models::ImportState {
        system_labels: Some(vec!["SENT".into()]),
        ..Default::default()
    };
    db::enqueue_import(
        &state.pool,
        mail("Sent", "sent-skip", "Hi"),
        &envelope(),
        Some(&imported),
    )
    .await
    .unwrap();
    pipeline::process_next_with_sorter(&state.pool, state.pipeline.clone(), Some(&sorter))
        .await
        .unwrap();
    assert_eq!(requests.load(std::sync::atomic::Ordering::SeqCst), 1);
    task.abort();
}

fn spam_completion(is_spam: bool, confidence: f64) -> Value {
    json!({"choices":[{"finish_reason":"stop","message":{"content":json!({"category":"CATEGORY_UPDATES","label_ids":[],"spam":{"is_spam":is_spam,"confidence":confidence}}).to_string()}}]})
}

#[tokio::test]
async fn spam_threshold_is_conservative_and_does_not_teach_itself_or_alert() {
    for (is_spam, confidence, moved) in [
        (true, 0.949, false),
        (true, 0.95, true),
        (true, 1.0, true),
        (false, 1.0, false),
    ] {
        let (_temp, state) = setup().await;
        sqlx::query("INSERT INTO push_devices(token,environment,registered_at) VALUES('test-device','sandbox',1)").execute(&state.pool).await.unwrap();
        let (sorter, requests, task) = mock(spam_completion(is_spam, confidence)).await;
        let id = db::enqueue(
            &state.pool,
            mail("A notice", "spam-verdict", "Message body"),
            &envelope(),
        )
        .await
        .unwrap();
        pipeline::process_next_with_sorter(&state.pool, state.pipeline.clone(), Some(&sorter))
            .await
            .unwrap();
        let labels: Vec<String> =
            sqlx::query_scalar("SELECT label_id FROM message_labels WHERE message_id=?")
                .bind(&id)
                .fetch_all(&state.pool)
                .await
                .unwrap();
        assert_eq!(labels.iter().any(|l| l == "SPAM"), moved);
        assert_eq!(labels.iter().any(|l| l == "INBOX"), !moved);
        assert!(!labels.iter().any(|l| l == "TRASH"));
        let audit: (bool, f64, bool) = sqlx::query_as(
            "SELECT spam,spam_confidence,spam_moved FROM sorting_results WHERE message_id=?",
        )
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .unwrap();
        assert_eq!(audit, (is_spam, confidence, moved));
        let learned: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sorting_examples WHERE label_id='SPAM'")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        assert_eq!(learned, 0);
        let pushes: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM push_deliveries WHERE message_id=?")
                .bind(&id)
                .fetch_one(&state.pool)
                .await
                .unwrap();
        assert_eq!(pushes, if moved { 0 } else { 1 });
        let payload = requests.lock().unwrap()[0].clone();
        let input: Value =
            serde_json::from_str(payload["messages"][1]["content"].as_str().unwrap()).unwrap();
        assert_eq!(input["spam_memory"]["label_id"], "SPAM");
        assert!(
            !input["memories"]
                .as_array()
                .unwrap()
                .iter()
                .any(|m| m["label_id"] == "SPAM")
        );
        task.abort();
    }
}

#[tokio::test]
async fn malformed_spam_verdicts_cannot_partially_change_mail() {
    for response in [
        spam_completion(true, 1.01),
        spam_completion(true, -0.01),
        json!({"choices":[{"finish_reason":"stop","message":{"content":"{\"category\":\"CATEGORY_UPDATES\",\"label_ids\":[]}"}}]}),
    ] {
        let (_temp, state) = setup().await;
        let (sorter, _, task) = mock(response).await;
        let id = db::enqueue(
            &state.pool,
            mail("Hello", "invalid-spam", "Hi"),
            &envelope(),
        )
        .await
        .unwrap();
        pipeline::process_next_with_sorter(&state.pool, state.pipeline.clone(), Some(&sorter))
            .await
            .unwrap();
        let labels: Vec<String> =
            sqlx::query_scalar("SELECT label_id FROM message_labels WHERE message_id=?")
                .bind(&id)
                .fetch_all(&state.pool)
                .await
                .unwrap();
        assert!(labels.iter().any(|l| l == "INBOX"));
        assert!(labels.iter().any(|l| l == "CATEGORY_PERSONAL"));
        assert!(!labels.iter().any(|l| l == "SPAM"));
        task.abort();
    }
}

#[tokio::test]
async fn explicit_allow_rule_overrides_spam_without_training_memory() {
    let (_temp, state) = setup().await;
    sqlx::query("INSERT INTO rules(id,name,field,contains,action,value) VALUES('allow','Trusted sender','from','sam@example.net','not_spam','')").execute(&state.pool).await.unwrap();
    let (sorter, _, task) = mock(spam_completion(true, 1.0)).await;
    let id = db::enqueue(&state.pool, mail("Hello", "allow-spam", "Hi"), &envelope())
        .await
        .unwrap();
    pipeline::process_next_with_sorter(&state.pool, state.pipeline.clone(), Some(&sorter))
        .await
        .unwrap();
    let labels: Vec<String> =
        sqlx::query_scalar("SELECT label_id FROM message_labels WHERE message_id=?")
            .bind(&id)
            .fetch_all(&state.pool)
            .await
            .unwrap();
    assert!(labels.iter().any(|l| l == "INBOX"));
    assert!(!labels.iter().any(|l| l == "SPAM"));
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sorting_examples")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    task.abort();
}
