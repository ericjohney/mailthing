use anyhow::{Context, Result, ensure};
use std::{env, net::IpAddr, path::PathBuf};

#[derive(Clone, Debug)]
pub struct Config {
    pub web_host: IpAddr,
    pub port: u16,
    pub smtp_host: IpAddr,
    pub smtp_port: u16,
    pub database_url: String,
    pub mailbox_name: String,
    pub mailbox_email: String,
    pub relay_host: String,
    pub relay_port: u16,
    pub relay_user: String,
    pub relay_password: String,
    pub relay_security: String,
    pub tls_cert: Option<PathBuf>,
    pub tls_key: Option<PathBuf>,
    pub concurrency: usize,
    pub max_message_bytes: usize,
    pub assets: PathBuf,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        fn get(key: &str, default: &str) -> String {
            env::var(key)
                .ok()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| default.into())
        }
        let config = Self {
            web_host: get("WEB_HOST", "127.0.0.1").parse()?,
            port: get("PORT", "9005").parse()?,
            smtp_host: get("SMTP_HOST", "0.0.0.0").parse()?,
            smtp_port: get("SMTP_PORT", "2500").parse()?,
            database_url: get("DATABASE_URL", "sqlite://data/mailthing.db"),
            mailbox_name: get("MAILBOX_NAME", "My mailbox"),
            mailbox_email: get("MAILBOX_EMAIL", "me@mailthing.local"),
            relay_host: get("SMTP_RELAY_HOST", ""),
            relay_port: get("SMTP_RELAY_PORT", "587").parse()?,
            relay_user: get("SMTP_RELAY_USER", ""),
            relay_password: get("SMTP_RELAY_PASSWORD", ""),
            relay_security: get("SMTP_RELAY_SECURITY", "starttls"),
            tls_cert: env::var("SMTP_TLS_CERT")
                .ok()
                .filter(|v| !v.is_empty())
                .map(PathBuf::from),
            tls_key: env::var("SMTP_TLS_KEY")
                .ok()
                .filter(|v| !v.is_empty())
                .map(PathBuf::from),
            concurrency: get("PIPELINE_CONCURRENCY", "4").parse()?,
            max_message_bytes: get("MAX_MESSAGE_BYTES", "26214400").parse()?,
            assets: get("WEB_ASSETS", "dist/web").into(),
        };
        config.validate()?;
        Ok(config)
    }

    pub fn validate(&self) -> Result<()> {
        ensure!(
            (1..=32).contains(&self.concurrency),
            "PIPELINE_CONCURRENCY must be between 1 and 32"
        );
        ensure!(
            (1024..=100 * 1024 * 1024).contains(&self.max_message_bytes),
            "MAX_MESSAGE_BYTES must be between 1 KiB and 100 MiB"
        );
        ensure!(
            ["starttls", "tls", "plain"].contains(&self.relay_security.as_str()),
            "Invalid SMTP_RELAY_SECURITY"
        );
        ensure!(
            self.tls_cert.is_some() == self.tls_key.is_some(),
            "SMTP_TLS_CERT and SMTP_TLS_KEY must be set together"
        );
        self.mailbox_email
            .parse::<lettre::Address>()
            .context("Invalid MAILBOX_EMAIL")?;
        Ok(())
    }
}
