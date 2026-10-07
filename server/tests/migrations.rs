//! Upgrades a database created by the original schema, as deployed mailboxes were.
use sqlx::{SqlitePool, migrate::Migrator, sqlite::SqliteConnectOptions};
use std::str::FromStr;

async fn labels_of(pool: &SqlitePool, id: &str) -> Vec<String> {
    sqlx::query_scalar("SELECT label_id FROM message_labels WHERE message_id=? ORDER BY label_id")
        .bind(id)
        .fetch_all(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn folder_columns_become_labels() {
    let temp = tempfile::tempdir().unwrap();
    let original = temp.path().join("original");
    std::fs::create_dir(&original).unwrap();
    let source = concat!(env!("CARGO_MANIFEST_DIR"), "/migrations/0001_initial.sql");
    std::fs::copy(source, original.join("0001_initial.sql")).unwrap();
    let options = SqliteConnectOptions::from_str(&format!(
        "sqlite://{}",
        temp.path().join("mail.db").display()
    ))
    .unwrap()
    .create_if_missing(true)
    .foreign_keys(true);
    let pool = SqlitePool::connect_with(options).await.unwrap();
    Migrator::new(original.as_path())
        .await
        .unwrap()
        .run(&pool)
        .await
        .unwrap();

    let future = chrono::Utc::now().timestamp_millis() + 86_400_000;
    for (id, read, starred, important, sent, folder, category, snoozed) in [
        ("new", 0, 1, 0, 0, "inbox", "promotions", None),
        ("archived", 1, 0, 1, 0, "archive", "primary", None),
        ("sent", 1, 0, 0, 1, "sent", "primary", None),
        ("snoozed", 1, 0, 0, 0, "inbox", "updates", Some(future)),
        ("woken", 1, 0, 0, 0, "inbox", "social", Some(1)),
        ("trashed", 0, 0, 0, 0, "trash", "primary", None),
    ] {
        sqlx::query("INSERT INTO messages(id,thread_id,message_id,subject,normalized_subject,thread_key,sender,sender_email,recipients,cc,envelope_to,snippet,text,html,raw,received_at,is_read,starred,important,is_sent,folder,category,snoozed_until) VALUES(?,?,?,'','','','','','','','[]','','','',X'',1,?,?,?,?,?,?,?)")
            .bind(id).bind(id).bind(format!("<{id}>")).bind(read).bind(starred).bind(important).bind(sent).bind(folder).bind(category).bind(snoozed)
            .execute(&pool).await.unwrap();
    }
    for (id, name) in [("a", "Receipts"), ("b", "receipts"), ("c", "Inbox")] {
        sqlx::query("INSERT INTO labels(id,name) VALUES(?,?)")
            .bind(id)
            .bind(name)
            .execute(&pool)
            .await
            .unwrap();
    }
    sqlx::query("INSERT INTO message_labels VALUES('new','a'),('archived','b'),('sent','c')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO rules(id,name,field,contains,action,value) VALUES('r','Social','from','x','category','social')")
        .execute(&pool)
        .await
        .unwrap();

    mailthing::db::migrate(&pool).await.unwrap();

    assert_eq!(
        labels_of(&pool, "new").await,
        ["CATEGORY_PROMOTIONS", "INBOX", "STARRED", "UNREAD", "a"]
    );
    assert_eq!(
        labels_of(&pool, "archived").await,
        ["CATEGORY_PERSONAL", "IMPORTANT", "b"]
    );
    assert_eq!(labels_of(&pool, "sent").await, ["SENT", "c"]);
    assert_eq!(
        labels_of(&pool, "snoozed").await,
        ["CATEGORY_UPDATES", "SNOOZED"]
    );
    assert_eq!(
        labels_of(&pool, "woken").await,
        ["CATEGORY_SOCIAL", "INBOX"]
    );
    assert_eq!(
        labels_of(&pool, "trashed").await,
        ["CATEGORY_PERSONAL", "TRASH", "UNREAD"]
    );
    let users: Vec<(String, String)> =
        sqlx::query_as("SELECT id,name FROM labels WHERE kind='user' ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        users,
        [
            ("a".into(), "Receipts".into()),
            ("b".into(), "receipts (b)".into()),
            ("c".into(), "Inbox (c)".into())
        ]
    );
    let rule: String = sqlx::query_scalar("SELECT value FROM rules")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rule, "CATEGORY_SOCIAL");
    let violations = sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert!(violations.is_empty());
}
