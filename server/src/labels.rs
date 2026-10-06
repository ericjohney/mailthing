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
pub const CATEGORY_PERSONAL: &str = "CATEGORY_PERSONAL";
pub const CATEGORY_PROMOTIONS: &str = "CATEGORY_PROMOTIONS";
pub const CATEGORY_SOCIAL: &str = "CATEGORY_SOCIAL";
pub const CATEGORY_UPDATES: &str = "CATEGORY_UPDATES";
pub const CATEGORIES: [&str; 4] = [
    CATEGORY_PERSONAL,
    CATEGORY_PROMOTIONS,
    CATEGORY_SOCIAL,
    CATEGORY_UPDATES,
];

/// Maps a search keyword such as `social` to its category label.
pub fn category(name: &str) -> Option<&'static str> {
    match name.to_ascii_lowercase().as_str() {
        "primary" | "personal" => Some(CATEGORY_PERSONAL),
        "promotions" => Some(CATEGORY_PROMOTIONS),
        "social" => Some(CATEGORY_SOCIAL),
        "updates" => Some(CATEGORY_UPDATES),
        _ => None,
    }
}

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
