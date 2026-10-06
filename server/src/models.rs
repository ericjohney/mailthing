use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Envelope {
    pub from: String,
    pub to: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Account {
    pub name: String,
    pub email: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Label {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub field: String,
    pub contains: String,
    pub action: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Draft {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub to: String,
    #[serde(default)]
    pub cc: String,
    #[serde(default)]
    pub bcc: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub in_reply_to: String,
    #[serde(default)]
    pub attachments: Vec<DraftAttachment>,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DraftAttachment {
    pub name: String,
    pub content_type: String,
    pub data: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ThreadSummary {
    pub id: String,
    pub subject: String,
    pub sender: String,
    pub sender_email: String,
    pub snippet: String,
    pub received_at: i64,
    pub count: i64,
    pub unread: i64,
    pub starred: bool,
    pub important: bool,
    pub has_attachment: bool,
    pub category: String,
    pub labels: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MessageView {
    pub id: String,
    pub thread_id: String,
    pub message_id: String,
    pub subject: String,
    pub sender: String,
    pub sender_email: String,
    pub recipients: String,
    pub cc: String,
    pub envelope_to: String,
    pub text: String,
    pub html: String,
    pub received_at: i64,
    pub is_read: bool,
    pub starred: bool,
    pub important: bool,
    pub folder: String,
    pub category: String,
    pub snoozed_until: Option<i64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AttachmentView {
    pub id: String,
    pub message_id: String,
    pub name: String,
    pub content_type: String,
    pub size: i64,
}
