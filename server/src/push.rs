//! APNs alerts use a transactional outbox. Mail persistence never depends on Apple.
use crate::{AppState, db};
use anyhow::{Context, Result, ensure};
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;
use std::time::Duration;
use tokio::sync::watch;

#[derive(Clone)]
pub struct PushConfig {
    pub key_id: String,
    pub team_id: String,
    pub topic: String,
    pub private_key: String,
}

impl PushConfig {
    pub fn from_env() -> Result<Option<Self>> {
        let get = |name| std::env::var(name).unwrap_or_default();
        let config = Self {
            key_id: get("APNS_KEY_ID"),
            team_id: get("APNS_TEAM_ID"),
            topic: std::env::var("APNS_TOPIC")
                .unwrap_or_else(|_| "com.ericjohney.mailthing".into()),
            private_key: get("APNS_PRIVATE_KEY").replace("\\n", "\n"),
        };
        if config.key_id.is_empty() && config.team_id.is_empty() && config.private_key.is_empty() {
            return Ok(None);
        }
        for value in [&config.key_id, &config.team_id] {
            ensure!(
                value.len() == 10 && value.bytes().all(|b| b.is_ascii_alphanumeric()),
                "APNS_KEY_ID and APNS_TEAM_ID must be 10-character identifiers"
            );
        }
        ensure!(!config.topic.is_empty(), "APNS_TOPIC is required");
        EncodingKey::from_ec_pem(config.private_key.as_bytes())
            .context("Invalid APNS_PRIVATE_KEY")?;
        Ok(Some(config))
    }
}

#[derive(Deserialize)]
pub struct Device {
    pub token: String,
    pub environment: String,
}
impl Device {
    pub fn valid(&self) -> bool {
        // Apple's token is opaque; accept hex lengths without assuming 32 bytes forever.
        (32..=200).contains(&self.token.len())
            && self.token.len().is_multiple_of(2)
            && self.token.bytes().all(|b| b.is_ascii_hexdigit())
            && ["sandbox", "production"].contains(&self.environment.as_str())
    }
}

#[derive(Serialize)]
struct Claims<'a> {
    iss: &'a str,
    iat: i64,
}
struct Provider {
    config: PushConfig,
    key: EncodingKey,
    client: reqwest::Client,
    token: String,
    issued_at: i64,
}
impl Provider {
    fn new(config: PushConfig) -> Result<Self> {
        Ok(Self {
            key: EncodingKey::from_ec_pem(config.private_key.as_bytes())?,
            config,
            client: reqwest::Client::builder()
                .https_only(true)
                .timeout(Duration::from_secs(15))
                .build()?,
            token: String::new(),
            issued_at: 0,
        })
    }
    fn authorization(&mut self) -> Result<String> {
        let now = db::now() / 1000;
        // APNs tokens expire after an hour; reuse for 45 minutes to avoid update throttling.
        if self.token.is_empty() || now - self.issued_at >= 2700 {
            let mut header = Header::new(Algorithm::ES256);
            header.kid = Some(self.config.key_id.clone());
            self.token = jsonwebtoken::encode(
                &header,
                &Claims {
                    iss: &self.config.team_id,
                    iat: now,
                },
                &self.key,
            )?;
            self.issued_at = now;
        }
        Ok(self.token.clone())
    }
    async fn deliver(
        &mut self,
        token: &str,
        environment: &str,
        message_id: &str,
        payload: Value,
    ) -> Result<(u16, String)> {
        let host = if environment == "sandbox" {
            "api.sandbox.push.apple.com"
        } else {
            "api.push.apple.com"
        };
        let authorization = self.authorization()?;
        let response = self
            .client
            .post(format!("https://{host}/3/device/{token}"))
            .version(reqwest::Version::HTTP_2)
            .bearer_auth(authorization)
            .header("apns-topic", &self.config.topic)
            .header("apns-push-type", "alert")
            .header("apns-priority", "10")
            .header("apns-expiration", (db::now() / 1000 + 86400).to_string())
            .header("apns-collapse-id", message_id)
            .json(&payload)
            .send()
            .await
            .map_err(reqwest::Error::without_url)?;
        let status = response.status().as_u16();
        // Do not log responses containing email content or tokens.
        let reason = response
            .json::<Value>()
            .await
            .ok()
            .and_then(|v| v["reason"].as_str().map(str::to_owned))
            .unwrap_or_default();
        Ok((status, reason))
    }
}

pub fn payload(sender: &str, subject: &str, snippet: &str, thread_id: &str, unread: i64) -> Value {
    json!({
        "aps": {
            "alert": {"title":sender.chars().take(100).collect::<String>(), "subtitle":subject.chars().take(150).collect::<String>(), "body":snippet.chars().take(240).collect::<String>()},
            "badge": unread,
            "sound":"default",
            "thread-id":"mailthing.inbox",
            "content-available":1
        },
        "thread_id":thread_id
    })
}

pub fn start(
    state: AppState,
    mut stop: watch::Receiver<bool>,
    config: PushConfig,
) -> Result<tokio::task::JoinHandle<()>> {
    let mut provider = Provider::new(config)?;
    Ok(tokio::spawn(async move {
        loop {
            if *stop.borrow() {
                break;
            }
            let result = deliver_next(&state, &mut provider).await;
            let delay = match result {
                Ok(true) => Duration::from_millis(50),
                Ok(false) => Duration::from_secs(5),
                Err(error) => {
                    tracing::error!(%error, "Push delivery worker failed");
                    Duration::from_secs(5)
                }
            };
            tokio::select! { _ = stop.changed() => break, _ = tokio::time::sleep(delay) => {} }
        }
    }))
}

async fn deliver_next(state: &AppState, provider: &mut Provider) -> Result<bool> {
    let row = sqlx::query("SELECT p.message_id,p.token,p.attempts,d.environment,m.thread_id,m.sender,m.subject,m.snippet,m.received_at FROM push_deliveries p JOIN push_devices d ON d.token=p.token JOIN messages m ON m.id=p.message_id WHERE p.next_attempt_at<=? ORDER BY p.next_attempt_at LIMIT 1")
        .bind(db::now()).fetch_optional(&state.pool).await?;
    let Some(row) = row else {
        return Ok(false);
    };
    let id: String = row.get("message_id");
    let token: String = row.get("token");
    let attempts: i64 = row.get("attempts");
    let environment: String = row.get("environment");
    // Read/archived/trashed messages don't need a late alert after a retry.
    let eligible: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM messages m WHERE id=? AND EXISTS(SELECT 1 FROM message_labels WHERE message_id=m.id AND label_id='INBOX') AND EXISTS(SELECT 1 FROM message_labels WHERE message_id=m.id AND label_id='UNREAD') AND NOT EXISTS(SELECT 1 FROM message_labels WHERE message_id=m.id AND label_id IN ('SPAM','TRASH')))")
        .bind(&id).fetch_one(&state.pool).await?;
    let eligible = eligible && row.get::<i64, _>("received_at") >= db::now() - 86_400_000;
    let mut completed = !eligible;
    if eligible {
        let counts = db::counts(&state.pool).await?;
        let unread = counts["INBOX"]["unread"].as_i64().unwrap_or_default();
        let payload = payload(
            row.get("sender"),
            row.get("subject"),
            row.get("snippet"),
            row.get("thread_id"),
            unread,
        );
        match provider.deliver(&token, &environment, &id, payload).await {
            Ok((200, _)) => completed = true,
            Ok((status, reason)) => {
                if status == 410
                    || ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]
                        .contains(&reason.as_str())
                {
                    sqlx::query("DELETE FROM push_devices WHERE token=? AND environment=?")
                        .bind(&token)
                        .bind(&environment)
                        .execute(&state.pool)
                        .await?;
                    completed = true;
                } else if status == 400 || status == 413 || status == 404 {
                    completed = true;
                }
                if reason == "ExpiredProviderToken" {
                    provider.issued_at = 0;
                }
                tracing::warn!(status, %reason, "APNs rejected a notification");
            }
            Err(error) => tracing::warn!(%error, "APNs temporarily unreachable"),
        }
    }
    if completed || attempts >= 11 {
        if !completed {
            tracing::error!("Push delivery exhausted 12 attempts");
        }
        sqlx::query("DELETE FROM push_deliveries WHERE message_id=? AND token=?")
            .bind(&id)
            .bind(&token)
            .execute(&state.pool)
            .await?;
    } else {
        let delay = (10_i64 * 2_i64.pow(attempts.min(10) as u32)).min(3600);
        sqlx::query("UPDATE push_deliveries SET attempts=attempts+1,next_attempt_at=? WHERE message_id=? AND token=?")
            .bind(db::now() + delay * 1000).bind(&id).bind(&token).execute(&state.pool).await?;
    }
    Ok(true)
}
