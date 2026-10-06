use crate::{
    AppState, db, labels,
    models::{Draft, Envelope},
    pipeline,
};
use anyhow::{Context, Result, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{
        Attachment, Mailbox, MultiPart, SinglePart,
        header::{ContentType, InReplyTo},
    },
    transport::smtp::authentication::Credentials,
};

fn mailboxes(value: &str) -> Result<Vec<Mailbox>> {
    if value.trim().is_empty() {
        return Ok(Vec::new());
    }
    value
        .split(',')
        .map(|s| s.trim().parse().context("Invalid recipient address"))
        .collect()
}

pub async fn send(state: &AppState, draft: &Draft) -> Result<String> {
    ensure!(
        !state.config.relay_host.is_empty(),
        "Configure SMTP_RELAY_HOST before sending mail"
    );
    let account = db::account(&state.pool).await?;
    let to = mailboxes(&draft.to)?;
    let cc = mailboxes(&draft.cc)?;
    let bcc = mailboxes(&draft.bcc)?;
    ensure!(
        !to.is_empty() || !cc.is_empty() || !bcc.is_empty(),
        "Add at least one recipient"
    );
    ensure!(
        to.len() + cc.len() + bcc.len() <= 100,
        "At most 100 recipients are allowed"
    );
    let mut message = Message::builder()
        .from(Mailbox::new(
            Some(account.name.clone()),
            account.email.parse()?,
        ))
        .subject(&draft.subject);
    for mailbox in &to {
        message = message.to(mailbox.clone());
    }
    for mailbox in &cc {
        message = message.cc(mailbox.clone());
    }
    for mailbox in &bcc {
        message = message.bcc(mailbox.clone());
    }
    if !draft.in_reply_to.is_empty() {
        message = message.header(InReplyTo::from(draft.in_reply_to.clone()));
    }
    let mut multipart = MultiPart::mixed().singlepart(SinglePart::plain(draft.body.clone()));
    for attachment in &draft.attachments {
        multipart = multipart.singlepart(Attachment::new(attachment.name.clone()).body(
            STANDARD.decode(&attachment.data)?,
            attachment.content_type.parse::<ContentType>()?,
        ));
    }
    let message = message.multipart(multipart)?;
    let raw = message.formatted();
    ensure!(
        raw.len() <= state.config.max_message_bytes,
        "Message exceeds size limit"
    );
    let config = &state.config;
    let mut builder = match config.relay_security.as_str() {
        "tls" => AsyncSmtpTransport::<Tokio1Executor>::relay(&config.relay_host)?,
        "starttls" => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.relay_host)?,
        _ => AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.relay_host),
    }
    .port(config.relay_port)
    .timeout(Some(std::time::Duration::from_secs(30)));
    if !config.relay_user.is_empty() {
        builder = builder.credentials(Credentials::new(
            config.relay_user.clone(),
            config.relay_password.clone(),
        ));
    }
    let transport = builder.build();
    let envelope = Envelope {
        from: account.email,
        to: to
            .iter()
            .chain(cc.iter())
            .chain(bcc.iter())
            .map(|m| m.email.to_string())
            .collect(),
    };
    let mut parsed = state.pipeline.run(&raw, &envelope, &[])?;
    // Sent mail carries only SENT; the conversation stays wherever its other messages are.
    parsed.labels = vec![labels::SENT.into()];
    // Persist a raw receipt before the network call. A crash after relay acceptance is
    // visible as an ambiguous outgoing receipt rather than automatically resent.
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO jobs(id,raw,envelope,kind,status,error,received_at) VALUES(?,?,?,'outgoing','failed','Outbound delivery may have succeeded; verify relay delivery before retrying',?)")
        .bind(&id).bind(&raw).bind(serde_json::to_string(&envelope)?).bind(db::now()).execute(&state.pool).await?;
    if let Err(error) = transport.send(message).await {
        sqlx::query("DELETE FROM jobs WHERE id=?")
            .bind(&id)
            .execute(&state.pool)
            .await?;
        return Err(error.into());
    }
    // Failure here leaves the original raw mail available for recovery in the DB.
    let thread =
        pipeline::persist(&state.pool, &id, &raw, &envelope, &parsed, db::now(), 0).await?;
    sqlx::query("DELETE FROM drafts WHERE id=?")
        .bind(&draft.id)
        .execute(&state.pool)
        .await?;
    let _ = state.events.send(());
    Ok(thread)
}
