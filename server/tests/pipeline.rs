mod common;
use common::*;
use mailthing::{
    db,
    models::Rule,
    pipeline::{self, Pipeline, PipelineContext, Stage},
    search,
};
use sqlx::Row;
use std::sync::Arc;

#[test]
fn mime_decoding_sanitization_and_attachment_extraction() {
    let raw = b"From: =?UTF-8?B?U2FtIFJpdmVyYQ==?= <sam@example.net>\r\nTo: alex@example.com\r\nSubject: =?UTF-8?B?SGVsbG8g4pyT?=\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=outer\r\n\r\n--outer\r\nContent-Type: multipart/alternative; boundary=inner\r\n\r\n--inner\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHello =E2=9C=93\r\n--inner\r\nContent-Type: text/html\r\n\r\n<p>Hello <strong>world</strong></p><script>alert(1)</script><img src=\"https://tracker.example/pixel\" onerror=\"alert(1)\"><a href=\"javascript:alert(1)\">bad</a>\r\n--inner--\r\n--outer\r\nContent-Type: application/pdf; name=\"invoice.pdf\"\r\nContent-Disposition: attachment; filename=\"invoice.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQ=\r\n--outer--\r\n";
    let mail = Pipeline::default().run(raw, &envelope(), &[]).unwrap();
    assert_eq!(mail.subject, "Hello ✓");
    assert_eq!(mail.sender, "Sam Rivera");
    assert!(mail.text.contains("Hello ✓"));
    assert!(mail.html.contains("<strong>world</strong>"));
    for unsafe_text in [
        "<script",
        "<img",
        "onerror",
        "javascript:",
        "tracker.example",
    ] {
        assert!(!mail.html.contains(unsafe_text));
    }
    assert_eq!(mail.attachments.len(), 1);
    assert_eq!(mail.attachments[0].name, "invoice.pdf");
    assert_eq!(mail.attachments[0].content, b"%PDF-1.4");
}

#[test]
fn rules_override_categories_in_order_and_match_envelope_recipients() {
    let rules = vec![
        Rule {
            id: "1".into(),
            name: "Finance".into(),
            field: "subject".into(),
            contains: "INVOICE".into(),
            action: "label".into(),
            value: "finance".into(),
            enabled: true,
        },
        Rule {
            id: "2".into(),
            name: "Personal".into(),
            field: "to".into(),
            contains: "ALEX@EXAMPLE.COM".into(),
            action: "category".into(),
            value: "primary".into(),
            enabled: true,
        },
        Rule {
            id: "3".into(),
            name: "Archive".into(),
            field: "from".into(),
            contains: "sam@".into(),
            action: "archive".into(),
            value: "".into(),
            enabled: false,
        },
    ];
    let mail = Pipeline::default()
        .run(&mail("Your invoice", "1", "Thanks"), &envelope(), &rules)
        .unwrap();
    assert_eq!(mail.category, "primary");
    assert_eq!(mail.labels, vec!["finance"]);
    assert_eq!(mail.folder, "inbox");
    assert_eq!(pipeline::normalize_subject(" Re: Fwd: RE: Hello "), "hello");
}

#[tokio::test]
async fn durable_queue_atomic_storage_and_recovery() {
    let (_temp, state) = setup().await;
    let raw = mail("A durable message", "durable", "Keep this safe");
    let id = db::enqueue(&state.pool, raw.clone(), &envelope())
        .await
        .unwrap();
    sqlx::query("UPDATE jobs SET status='processing' WHERE id=?")
        .bind(&id)
        .execute(&state.pool)
        .await
        .unwrap();
    state.pool.close().await;
    let pool = db::connect(&state.config).await.unwrap();
    assert!(
        pipeline::process_next(&pool, state.pipeline.clone())
            .await
            .unwrap()
    );
    let stored: Vec<u8> = sqlx::query_scalar("SELECT raw FROM messages WHERE id=?")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stored, raw);
    let parsed = state.pipeline.run(&raw, &envelope(), &[]).unwrap();
    pipeline::persist(&pool, &id, &raw, &envelope(), &parsed, db::now(), 1)
        .await
        .unwrap();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let row = sqlx::query("SELECT status,length(raw) raw_size FROM jobs WHERE id=?")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(row.get::<String, _>("status"), "completed");
    assert_eq!(row.get::<i64, _>("raw_size"), 0);
}

#[tokio::test]
async fn references_thread_replies_even_when_subject_changes() {
    let (_temp, state) = setup().await;
    let original = deliver(&state, mail("Weekend plans", "original", "Saturday?")).await;
    let mut reply = mail("Different subject", "reply", "Sounds good");
    let mut with_reference = b"In-Reply-To: <original@example.net>\r\n".to_vec();
    with_reference.append(&mut reply);
    let reply_thread = deliver(&state, with_reference).await;
    assert_eq!(original, reply_thread);
    let separate = deliver(&state, mail("Unrelated subject", "separate", "Hello")).await;
    assert_ne!(original, separate);
}

struct BrokenStage;
impl Stage for BrokenStage {
    fn name(&self) -> &'static str {
        "Broken stage"
    }
    fn run(&self, _: &mut PipelineContext<'_>) -> anyhow::Result<()> {
        anyhow::bail!("Intentional failure")
    }
}
#[tokio::test]
async fn failed_jobs_retry_three_times_and_preserve_raw_mail() {
    let (_temp, state) = setup().await;
    let raw = mail("Retry me", "retry", "Still here");
    let id = db::enqueue(&state.pool, raw.clone(), &envelope())
        .await
        .unwrap();
    let pipeline = Arc::new(Pipeline {
        stages: vec![Arc::new(BrokenStage)],
    });
    for _ in 0..3 {
        assert!(
            pipeline::process_next(&state.pool, pipeline.clone())
                .await
                .unwrap()
        );
    }
    assert!(
        !pipeline::process_next(&state.pool, pipeline.clone())
            .await
            .unwrap()
    );
    let row = sqlx::query("SELECT raw,status,attempts,error FROM jobs WHERE id=?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(row.get::<String, _>("status"), "failed");
    assert_eq!(row.get::<i64, _>("attempts"), 3);
    assert_eq!(row.get::<Vec<u8>, _>("raw"), raw);
    assert!(row.get::<String, _>("error").contains("Broken stage"));
}

#[tokio::test]
async fn concurrent_workers_process_a_burst_without_duplicate_claims() {
    let (_temp, state) = setup().await;
    for index in 0..40 {
        db::enqueue(
            &state.pool,
            mail(
                &format!("Burst {index}"),
                &format!("burst-{index}"),
                "Hello",
            ),
            &envelope(),
        )
        .await
        .unwrap();
    }
    let (stop, receiver) = tokio::sync::watch::channel(false);
    let workers = state.start_workers(receiver);
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages")
                .fetch_one(&state.pool)
                .await
                .unwrap();
            if count == 40 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    stop.send(true).unwrap();
    for worker in workers {
        worker.await.unwrap();
    }
    let failed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs WHERE status!='completed'")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(failed, 0);
}

#[test]
fn gmail_style_search_parses_quotes_operators_and_dates() {
    let terms=search::parse("from:sam@example.net subject:\"weekend plans\" is:unread has:attachment after:2026-01-01 coffee").unwrap();
    assert_eq!(terms.len(), 6);
    assert_eq!(
        terms[1],
        search::Term::Field("subject".into(), "weekend plans".into())
    );
    assert!(matches!(terms[4], search::Term::After(_)));
    assert!(search::parse("before:not-a-date").is_err());
}
