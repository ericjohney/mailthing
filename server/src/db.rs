use crate::{
    config::Config,
    models::{Account, Envelope, Rule},
};
use anyhow::Result;
use sqlx::{
    Row, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use std::{str::FromStr, time::Duration};
use uuid::Uuid;

pub async fn connect(config: &Config) -> Result<SqlitePool> {
    if let Some(path) = config.database_url.strip_prefix("sqlite://")
        && let Some(parent) = std::path::Path::new(path).parent()
        && !parent.as_os_str().is_empty()
    {
        std::fs::create_dir_all(parent)?;
    }
    let options = SqliteConnectOptions::from_str(&config.database_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Full)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(options)
        .await?;
    migrate(&pool).await?;
    let account = Account {
        name: config.mailbox_name.clone(),
        email: config.mailbox_email.clone(),
    };
    sqlx::query("INSERT OR IGNORE INTO settings(key, value) VALUES('account', ?)")
        .bind(serde_json::to_string(&account)?)
        .execute(&pool)
        .await?;
    // A previous process may have stopped between claiming a job and committing it.
    sqlx::query("UPDATE jobs SET status='pending' WHERE status='processing'")
        .execute(&pool)
        .await?;
    // Retrying a network send after a crash could send the same email twice.
    sqlx::query("UPDATE drafts SET sending=0 WHERE sending=1")
        .execute(&pool)
        .await?;
    Ok(pool)
}

pub async fn migrate(pool: &SqlitePool) -> Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

pub async fn account(pool: &SqlitePool) -> Result<Account> {
    let json: String = sqlx::query_scalar("SELECT value FROM settings WHERE key='account'")
        .fetch_one(pool)
        .await?;
    Ok(serde_json::from_str(&json)?)
}

pub async fn rules(pool: &SqlitePool) -> Result<Vec<Rule>> {
    Ok(
        sqlx::query_as("SELECT * FROM rules WHERE enabled=1 ORDER BY rowid")
            .fetch_all(pool)
            .await?,
    )
}

pub async fn enqueue(pool: &SqlitePool, raw: Vec<u8>, envelope: &Envelope) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO jobs(id,raw,envelope,status,received_at) VALUES(?,?,?,'pending',?)")
        .bind(&id)
        .bind(raw)
        .bind(serde_json::to_string(envelope)?)
        .bind(now())
        .execute(pool)
        .await?;
    Ok(id)
}

pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Conversation totals and unread conversations per label id, plus `DRAFTS`.
/// Spam and trash are only counted under their own labels, as in Gmail.
pub async fn counts(pool: &SqlitePool) -> Result<serde_json::Value> {
    let rows = sqlx::query("SELECT ml.label_id, COUNT(DISTINCT m.thread_id) AS total, COUNT(DISTINCT CASE WHEN EXISTS(SELECT 1 FROM message_labels u WHERE u.message_id=m.id AND u.label_id='UNREAD') THEN m.thread_id END) AS unread FROM message_labels ml JOIN messages m ON m.id=ml.message_id WHERE ml.label_id IN ('SPAM','TRASH') OR NOT EXISTS(SELECT 1 FROM message_labels x WHERE x.message_id=m.id AND x.label_id IN ('SPAM','TRASH')) GROUP BY ml.label_id")
        .fetch_all(pool).await?;
    let mut counts = serde_json::Map::new();
    for row in rows {
        counts.insert(row.get::<String,_>("label_id"), serde_json::json!({"total": row.get::<i64,_>("total"), "unread": row.get::<i64,_>("unread")}));
    }
    let drafts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM drafts")
        .fetch_one(pool)
        .await?;
    counts.insert(
        "DRAFTS".into(),
        serde_json::json!({"total":drafts,"unread":0}),
    );
    Ok(counts.into())
}

/// Returns snoozed messages whose time has come to the inbox. Returns how many woke.
pub async fn wake_snoozed(pool: &SqlitePool) -> Result<u64> {
    let now = now();
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query("INSERT OR IGNORE INTO message_labels(message_id,label_id) SELECT m.id,'INBOX' FROM messages m JOIN message_labels ml ON ml.message_id=m.id AND ml.label_id='SNOOZED' WHERE m.snoozed_until<=?")
        .bind(now).execute(&mut *tx).await?;
    let woke = sqlx::query("DELETE FROM message_labels WHERE label_id='SNOOZED' AND message_id IN(SELECT id FROM messages WHERE snoozed_until<=?)")
        .bind(now).execute(&mut *tx).await?.rows_affected();
    sqlx::query("UPDATE messages SET snoozed_until=NULL WHERE snoozed_until<=?")
        .bind(now)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(woke)
}
