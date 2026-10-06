#![allow(dead_code)] // Each integration test binary uses a different subset of helpers.
use mailthing::{AppState, config::Config, db, models::Envelope};
use tempfile::TempDir;

pub async fn setup() -> (TempDir, AppState) {
    let temp = tempfile::tempdir().unwrap();
    let config = Config {
        web_host: "127.0.0.1".parse().unwrap(),
        port: 0,
        smtp_host: "127.0.0.1".parse().unwrap(),
        smtp_port: 0,
        database_url: format!("sqlite://{}", temp.path().join("mail.db").display()),
        mailbox_name: "Alex Morgan".into(),
        mailbox_email: "alex@example.com".into(),
        relay_host: String::new(),
        relay_port: 587,
        relay_user: String::new(),
        relay_password: String::new(),
        relay_security: "starttls".into(),
        tls_cert: None,
        tls_key: None,
        concurrency: 4,
        max_message_bytes: 1024 * 1024,
        assets: temp.path().join("assets"),
    };
    let pool = db::connect(&config).await.unwrap();
    (temp, AppState::new(pool, config))
}

pub fn envelope() -> Envelope {
    Envelope {
        from: "sam@example.net".into(),
        to: vec!["alex@example.com".into()],
    }
}

pub fn mail(subject: &str, id: &str, body: &str) -> Vec<u8> {
    format!("From: Sam Rivera <sam@example.net>\r\nTo: Alex Morgan <alex@example.com>\r\nSubject: {subject}\r\nMessage-ID: <{id}@example.net>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}\r\n").into_bytes()
}

pub async fn deliver(state: &AppState, raw: Vec<u8>) -> String {
    let id = db::enqueue(&state.pool, raw, &envelope()).await.unwrap();
    mailthing::pipeline::process_next(&state.pool, state.pipeline.clone())
        .await
        .unwrap();
    sqlx::query_scalar("SELECT thread_id FROM messages WHERE id=?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap()
}
