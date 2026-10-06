//! Add or reorder stages in Pipeline::default to change incoming mail processing.
//! Stages are pure, synchronous transformations executed on Tokio's blocking pool.
use crate::{
    db, labels,
    models::{Envelope, Rule},
};
use anyhow::{Context, Result};
use mailparse::{MailHeaderMap, ParsedMail};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::{collections::HashSet, sync::Arc};

#[derive(Debug, Default)]
pub struct ProcessedMail {
    pub message_id: String,
    pub references: Vec<String>,
    pub subject: String,
    pub normalized_subject: String,
    pub thread_key: String,
    pub sender: String,
    pub sender_email: String,
    pub recipients: String,
    pub cc: String,
    pub text: String,
    pub html: String,
    pub snippet: String,
    /// System and user label ids; together they describe where the message appears.
    pub labels: Vec<String>,
    pub attachments: Vec<Attachment>,
    pub headers: Vec<(String, String)>,
}

impl ProcessedMail {
    pub fn add_label(&mut self, label: &str) {
        if !self.has_label(label) {
            self.labels.push(label.into());
        }
    }
    pub fn remove_label(&mut self, label: &str) {
        self.labels.retain(|l| l != label);
    }
    pub fn has_label(&self, label: &str) -> bool {
        self.labels.iter().any(|l| l == label)
    }
    pub fn category(&self) -> Option<&str> {
        self.labels
            .iter()
            .map(String::as_str)
            .find(|l| labels::CATEGORIES.contains(l))
    }
    pub fn set_category(&mut self, category: &str) {
        self.labels
            .retain(|l| !labels::CATEGORIES.contains(&l.as_str()));
        self.add_label(category);
    }
}

#[derive(Debug)]
pub struct Attachment {
    pub name: String,
    pub content_type: String,
    pub content: Vec<u8>,
}

pub struct PipelineContext<'a> {
    pub raw: &'a [u8],
    pub envelope: &'a Envelope,
    pub rules: &'a [Rule],
    pub mail: ProcessedMail,
}

pub trait Stage: Send + Sync {
    fn name(&self) -> &'static str;
    fn run(&self, context: &mut PipelineContext<'_>) -> Result<()>;
}

pub struct Pipeline {
    pub stages: Vec<Arc<dyn Stage>>,
}

impl Default for Pipeline {
    fn default() -> Self {
        Self {
            stages: vec![
                Arc::new(ParseStage),
                Arc::new(SanitizeStage),
                Arc::new(CategorizeStage),
                Arc::new(RulesStage),
            ],
        }
    }
}

impl Pipeline {
    pub fn run(&self, raw: &[u8], envelope: &Envelope, rules: &[Rule]) -> Result<ProcessedMail> {
        let mut context = PipelineContext {
            raw,
            envelope,
            rules,
            mail: ProcessedMail::default(),
        };
        for stage in &self.stages {
            stage
                .run(&mut context)
                .with_context(|| format!("Stage {} failed", stage.name()))?;
        }
        Ok(context.mail)
    }
    pub fn names(&self) -> Vec<&'static str> {
        self.stages.iter().map(|stage| stage.name()).collect()
    }
}

pub struct ParseStage;
impl Stage for ParseStage {
    fn name(&self) -> &'static str {
        "Parse MIME"
    }
    fn run(&self, context: &mut PipelineContext<'_>) -> Result<()> {
        let parsed = mailparse::parse_mail(context.raw)?;
        let header = |key: &str| parsed.headers.get_first_value(key).unwrap_or_default();
        let from = header("From");
        let addresses = mailparse::addrparse(&from).ok();
        let sender = addresses.as_ref().and_then(|list| {
            list.iter().find_map(|a| match a {
                mailparse::MailAddr::Single(a) => Some(a),
                _ => None,
            })
        });
        let mail = &mut context.mail;
        mail.subject = header("Subject");
        mail.normalized_subject = normalize_subject(&mail.subject);
        mail.sender_email = sender
            .map(|s| s.addr.clone())
            .unwrap_or_else(|| context.envelope.from.clone());
        mail.sender = sender
            .and_then(|s| s.display_name.clone())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| mail.sender_email.clone());
        mail.recipients = header("To");
        if mail.recipients.is_empty() {
            mail.recipients = context.envelope.to.join(", ");
        }
        mail.cc = header("Cc");
        mail.message_id = header("Message-ID");
        mail.references = format!("{} {}", header("References"), header("In-Reply-To"))
            .split_whitespace()
            .map(str::to_string)
            .collect();
        mail.headers = parsed
            .headers
            .iter()
            .map(|h| (h.get_key().to_lowercase(), h.get_value()))
            .collect();
        mail.add_label(labels::INBOX);
        mail.add_label(labels::UNREAD);
        collect_parts(&parsed, mail)?;
        let mut participants = vec![mail.sender_email.to_lowercase()];
        for value in [&mail.recipients, &mail.cc] {
            if let Ok(addresses) = mailparse::addrparse(value) {
                for addr in addresses.iter() {
                    match addr {
                        mailparse::MailAddr::Single(a) => participants.push(a.addr.to_lowercase()),
                        mailparse::MailAddr::Group(g) => {
                            participants.extend(g.addrs.iter().map(|a| a.addr.to_lowercase()))
                        }
                    }
                }
            }
        }
        participants.sort();
        participants.dedup();
        mail.thread_key = format!(
            "{:x}",
            Sha256::digest(
                format!("{}|{}", mail.normalized_subject, participants.join("|")).as_bytes()
            )
        );
        Ok(())
    }
}

fn collect_parts(parsed: &ParsedMail<'_>, mail: &mut ProcessedMail) -> Result<()> {
    let disposition = parsed.get_content_disposition();
    let filename = disposition
        .params
        .get("filename")
        .or_else(|| parsed.ctype.params.get("name"));
    if disposition.disposition == mailparse::DispositionType::Attachment || filename.is_some() {
        mail.attachments.push(Attachment {
            name: filename.cloned().unwrap_or_else(|| "attachment".into()),
            content_type: parsed.ctype.mimetype.clone(),
            content: parsed.get_body_raw()?,
        });
    } else if !parsed.subparts.is_empty() {
        for part in &parsed.subparts {
            collect_parts(part, mail)?;
        }
    } else if parsed.ctype.mimetype == "text/html" {
        mail.html.push_str(&parsed.get_body()?);
    } else if parsed.ctype.mimetype == "text/plain" {
        if !mail.text.is_empty() {
            mail.text.push('\n');
        }
        mail.text.push_str(&parsed.get_body()?);
    } else {
        mail.attachments.push(Attachment {
            name: "attachment".into(),
            content_type: parsed.ctype.mimetype.clone(),
            content: parsed.get_body_raw()?,
        });
    }
    Ok(())
}

pub fn normalize_subject(subject: &str) -> String {
    let mut value = subject.trim().to_lowercase();
    while let Some(prefix) = ["re:", "fw:", "fwd:"]
        .iter()
        .find(|p| value.starts_with(**p))
    {
        value = value[prefix.len()..].trim().to_string();
    }
    value
}

pub struct SanitizeStage;
impl Stage for SanitizeStage {
    fn name(&self) -> &'static str {
        "Sanitize content"
    }
    fn run(&self, context: &mut PipelineContext<'_>) -> Result<()> {
        let mail = &mut context.mail;
        mail.html = ammonia::Builder::default()
            .rm_tags(&["img"])
            .url_relative(ammonia::UrlRelative::Deny)
            .link_rel(Some("noopener noreferrer"))
            .clean(&mail.html)
            .to_string();
        if mail.text.trim().is_empty() {
            mail.text = ammonia::Builder::default()
                .tags(HashSet::new())
                .clean(&mail.html)
                .to_string();
        }
        mail.snippet = mail
            .text
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(180)
            .collect();
        Ok(())
    }
}

pub struct CategorizeStage;
impl Stage for CategorizeStage {
    fn name(&self) -> &'static str {
        "Categorize"
    }
    fn run(&self, context: &mut PipelineContext<'_>) -> Result<()> {
        let mail = &mut context.mail;
        let subject = mail.subject.to_lowercase();
        let sender = mail.sender_email.to_lowercase();
        let header = |name: &str| {
            mail.headers
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.to_lowercase())
                .unwrap_or_default()
        };
        let category = if ["facebook", "linkedin", "instagram", "twitter", "discord"]
            .iter()
            .any(|s| sender.contains(s))
        {
            labels::CATEGORY_SOCIAL
        } else if !header("list-unsubscribe").is_empty()
            || !header("list-id").is_empty()
            || ["newsletter", "sale", "discount", "offer"]
                .iter()
                .any(|s| subject.contains(s))
        {
            labels::CATEGORY_PROMOTIONS
        } else if [
            "receipt",
            "invoice",
            "order",
            "shipping",
            "delivered",
            "security",
            "verification",
            "notification",
        ]
        .iter()
        .any(|s| subject.contains(s))
            || sender.starts_with("no-reply")
            || sender.starts_with("noreply")
        {
            labels::CATEGORY_UPDATES
        } else {
            labels::CATEGORY_PERSONAL
        };
        let spam = header("x-spam-flag").trim() == "yes";
        mail.set_category(category);
        if spam {
            mail.remove_label(labels::INBOX);
            mail.add_label(labels::SPAM);
        }
        Ok(())
    }
}

pub struct RulesStage;
impl Stage for RulesStage {
    fn name(&self) -> &'static str {
        "Apply mailbox rules"
    }
    fn run(&self, context: &mut PipelineContext<'_>) -> Result<()> {
        for rule in context.rules.iter().filter(|r| r.enabled) {
            let value = match rule.field.as_str() {
                "from" => format!("{} {}", context.mail.sender, context.mail.sender_email),
                "to" => format!(
                    "{} {}",
                    context.mail.recipients,
                    context.envelope.to.join(",")
                ),
                "subject" => context.mail.subject.clone(),
                "body" => context.mail.text.clone(),
                _ => continue,
            };
            if !value.to_lowercase().contains(&rule.contains.to_lowercase()) {
                continue;
            }
            let mail = &mut context.mail;
            match rule.action.as_str() {
                "label" => mail.add_label(&rule.value),
                "category" if labels::CATEGORIES.contains(&rule.value.as_str()) => {
                    mail.set_category(&rule.value)
                }
                "archive" => mail.remove_label(labels::INBOX),
                "spam" => {
                    mail.remove_label(labels::INBOX);
                    mail.add_label(labels::SPAM);
                }
                "star" => mail.add_label(labels::STARRED),
                "important" => mail.add_label(labels::IMPORTANT),
                "read" => mail.remove_label(labels::UNREAD),
                _ => {}
            }
        }
        Ok(())
    }
}

/// Message insertion and job completion are atomic: a retry cannot duplicate a receipt.
pub async fn persist(
    pool: &SqlitePool,
    id: &str,
    raw: &[u8],
    envelope: &Envelope,
    mail: &ProcessedMail,
    received_at: i64,
    duration_ms: i64,
) -> Result<String> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let mut thread_id = None;
    for reference in mail.references.iter().rev() {
        thread_id = sqlx::query_scalar::<_, String>(
            "SELECT thread_id FROM messages WHERE message_id=? LIMIT 1",
        )
        .bind(reference)
        .fetch_optional(&mut *tx)
        .await?;
        if thread_id.is_some() {
            break;
        }
    }
    if thread_id.is_none() && !mail.normalized_subject.is_empty() {
        thread_id = sqlx::query_scalar("SELECT thread_id FROM messages WHERE thread_key=? AND received_at>? ORDER BY received_at DESC LIMIT 1")
            .bind(&mail.thread_key).bind(received_at - 30 * 86_400_000).fetch_optional(&mut *tx).await?;
    }
    let thread_id = thread_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let message_id = if mail.message_id.is_empty() {
        format!("<{id}@mailthing.local>")
    } else {
        mail.message_id.clone()
    };
    sqlx::query("INSERT OR IGNORE INTO messages(id,thread_id,message_id,subject,normalized_subject,thread_key,sender,sender_email,recipients,cc,envelope_to,snippet,text,html,raw,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id).bind(&thread_id).bind(message_id).bind(&mail.subject).bind(&mail.normalized_subject).bind(&mail.thread_key)
        .bind(&mail.sender).bind(&mail.sender_email).bind(&mail.recipients).bind(&mail.cc).bind(serde_json::to_string(&envelope.to)?)
        .bind(&mail.snippet).bind(&mail.text).bind(&mail.html).bind(raw).bind(received_at)
        .execute(&mut *tx).await?;
    for (index, attachment) in mail.attachments.iter().enumerate() {
        sqlx::query("INSERT OR IGNORE INTO attachments(id,message_id,name,content_type,size,content) VALUES(?,?,?,?,?,?)")
            .bind(format!("{id}-{index}")).bind(id).bind(&attachment.name).bind(&attachment.content_type).bind(attachment.content.len() as i64).bind(&attachment.content).execute(&mut *tx).await?;
    }
    for label in &mail.labels {
        sqlx::query("INSERT OR IGNORE INTO message_labels(message_id,label_id) SELECT ?,id FROM labels WHERE id=?")
            .bind(id).bind(label).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE jobs SET status='completed',completed_at=?,duration_ms=?,error=NULL,raw=X'' WHERE id=?")
        .bind(db::now()).bind(duration_ms).bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(thread_id)
}

pub async fn process_next(pool: &SqlitePool, pipeline: Arc<Pipeline>) -> Result<bool> {
    let job = sqlx::query("UPDATE jobs SET status='processing',attempts=attempts+1 WHERE id=(SELECT id FROM jobs WHERE status='pending' ORDER BY received_at LIMIT 1) RETURNING id,raw,envelope,received_at,attempts")
        .fetch_optional(pool).await?;
    let Some(job) = job else {
        return Ok(false);
    };
    let id: String = job.get("id");
    let raw: Vec<u8> = job.get("raw");
    let received_at: i64 = job.get("received_at");
    let started = std::time::Instant::now();
    let result: Result<()> = async {
        let envelope: Envelope = serde_json::from_str(job.get("envelope"))?;
        let rules = db::rules(pool).await?;
        let raw_clone = raw.clone();
        let envelope_clone = envelope.clone();
        let parsed =
            tokio::task::spawn_blocking(move || pipeline.run(&raw_clone, &envelope_clone, &rules))
                .await??;
        persist(
            pool,
            &id,
            &raw,
            &envelope,
            &parsed,
            received_at,
            started.elapsed().as_millis() as i64,
        )
        .await?;
        Ok(())
    }
    .await;
    if let Err(error) = result {
        tracing::error!(job_id=%id, %error, "Mail processing failed");
        let attempts: i64 = job.get("attempts");
        sqlx::query("UPDATE jobs SET status=?,error=? WHERE id=?")
            .bind(if attempts >= 3 { "failed" } else { "pending" })
            .bind(format!("{error:#}"))
            .bind(&id)
            .execute(pool)
            .await?;
    }
    Ok(true)
}
