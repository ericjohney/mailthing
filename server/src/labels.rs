//! Mailbox state is stored only as labels, following Gmail's model. These are the
//! system label ids seeded by the initial migration; user labels use UUIDs.
use anyhow::Result;
use sqlx::{Sqlite, Transaction};

pub const INBOX: &str = "INBOX";
pub const SENT: &str = "SENT";
pub const SPAM: &str = "SPAM";
pub const TRASH: &str = "TRASH";
pub const UNREAD: &str = "UNREAD";
pub const STARRED: &str = "STARRED";
pub const IMPORTANT: &str = "IMPORTANT";
pub const SNOOZED: &str = "SNOOZED";
/// Mailbox states that an import may set directly.
pub const STATE: [&str; 7] = [INBOX, SENT, SPAM, TRASH, UNREAD, STARRED, IMPORTANT];

/// SQL condition: message `m` has the system label `id`. Only call with constants.
pub fn has(id: &'static str) -> String {
    format!(
        "EXISTS(SELECT 1 FROM message_labels ml WHERE ml.message_id=m.id AND ml.label_id='{id}')"
    )
}

/// SQL condition: message `m` is neither spam nor trash, so it appears in normal views.
pub fn visible() -> String {
    "NOT EXISTS(SELECT 1 FROM message_labels ml WHERE ml.message_id=m.id AND ml.label_id IN ('SPAM','TRASH'))".into()
}

pub async fn add(tx: &mut Transaction<'_, Sqlite>, thread_id: &str, label: &str) -> Result<()> {
    sqlx::query("INSERT OR IGNORE INTO message_labels(message_id,label_id) SELECT id,? FROM messages WHERE thread_id=?")
        .bind(label)
        .bind(thread_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

pub async fn remove(
    tx: &mut Transaction<'_, Sqlite>,
    thread_id: &str,
    labels: &[&str],
) -> Result<()> {
    for label in labels {
        sqlx::query("DELETE FROM message_labels WHERE label_id=? AND message_id IN(SELECT id FROM messages WHERE thread_id=?)")
            .bind(label)
            .bind(thread_id)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}
