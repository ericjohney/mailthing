//! Receiving is catch-all only. It never relays mail to another SMTP server.
use crate::{AppState, db, models::Envelope};
use anyhow::{Context, Result, bail};
use std::{net::SocketAddr, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufStream},
    net::TcpListener,
    sync::{Semaphore, watch},
};
use tokio_rustls::{TlsAcceptor, rustls};

trait Socket: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Socket for T {}

pub fn tls_acceptor(state: &AppState) -> Result<Option<TlsAcceptor>> {
    let (Some(cert), Some(key)) = (&state.config.tls_cert, &state.config.tls_key) else {
        return Ok(None);
    };
    let certs = rustls_pemfile::certs(&mut std::io::BufReader::new(std::fs::File::open(cert)?))
        .collect::<std::io::Result<Vec<_>>>()?;
    let key = rustls_pemfile::private_key(&mut std::io::BufReader::new(std::fs::File::open(key)?))?
        .context("No private key in SMTP_TLS_KEY")?;
    let config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)?;
    Ok(Some(TlsAcceptor::from(Arc::new(config))))
}

pub async fn serve(
    listener: TcpListener,
    state: AppState,
    mut stop: watch::Receiver<bool>,
) -> Result<()> {
    let tls = tls_acceptor(&state)?;
    let slots = Arc::new(Semaphore::new(128));
    let mut sessions = tokio::task::JoinSet::new();
    loop {
        tokio::select! {
            _ = stop.changed() => break,
            accepted = listener.accept() => {
                let (socket, peer) = accepted?;
                let Ok(permit) = slots.clone().try_acquire_owned() else { continue; };
                let state = state.clone(); let tls = tls.clone();
                sessions.spawn(async move {
                    let _permit = permit;
                    let result = tokio::time::timeout(Duration::from_secs(600), session(Box::new(socket), peer, state, tls)).await;
                    if let Ok(Err(error)) = result { tracing::debug!(%peer, %error, "SMTP session ended"); }
                });
            },
            _ = sessions.join_next(), if !sessions.is_empty() => {},
        }
    }
    // Stop accepting first, and let existing SMTP DATA transactions finish.
    let _ = tokio::time::timeout(Duration::from_secs(15), async {
        while sessions.join_next().await.is_some() {}
    })
    .await;
    sessions.abort_all();
    Ok(())
}

async fn line(stream: &mut BufStream<Box<dyn Socket>>, max: usize) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    let count = tokio::time::timeout(
        Duration::from_secs(120),
        (&mut *stream)
            .take((max + 1) as u64)
            .read_until(b'\n', &mut bytes),
    )
    .await??;
    if count == 0 {
        bail!("Peer disconnected");
    }
    if count > max {
        bail!("SMTP line exceeds limit");
    }
    Ok(bytes)
}

async fn reply(stream: &mut BufStream<Box<dyn Socket>>, text: &str) -> Result<()> {
    stream.write_all(text.as_bytes()).await?;
    stream.flush().await?;
    Ok(())
}

fn address(command: &str, prefix: &str, allow_empty: bool) -> Option<String> {
    if !command.to_uppercase().starts_with(prefix) {
        return None;
    }
    let value = command[prefix.len()..].trim();
    let rest = value.strip_prefix('<')?;
    let end = rest.find('>')?;
    let addr = &rest[..end];
    if allow_empty && addr.is_empty() {
        return Some(String::new());
    }
    if !addr.is_ascii() || addr.parse::<lettre::Address>().is_err() {
        return None;
    }
    Some(addr.to_string())
}

async fn session(
    socket: Box<dyn Socket>,
    _peer: SocketAddr,
    state: AppState,
    tls: Option<TlsAcceptor>,
) -> Result<()> {
    let mut stream = BufStream::new(socket);
    reply(&mut stream, "220 mailthing ESMTP ready\r\n").await?;
    let mut greeted = false;
    let mut encrypted = false;
    let mut envelope = Envelope::default();
    let mut has_sender = false;
    for _ in 0..1000 {
        let bytes = line(&mut stream, 8192).await?;
        let command = String::from_utf8_lossy(&bytes).trim().to_string();
        let verb = command
            .split_whitespace()
            .next()
            .unwrap_or_default()
            .to_uppercase();
        match verb.as_str() {
            "EHLO" | "HELO" => {
                if command.split_whitespace().count() < 2 {
                    reply(&mut stream, "501 Hostname required\r\n").await?;
                    continue;
                }
                greeted = true;
                has_sender = false;
                envelope = Envelope::default();
                if verb == "HELO" {
                    reply(&mut stream, "250 mailthing\r\n").await?;
                } else {
                    let starttls = if tls.is_some() && !encrypted {
                        "250-STARTTLS\r\n"
                    } else {
                        ""
                    };
                    reply(&mut stream, &format!("250-mailthing\r\n250-SIZE {}\r\n250-8BITMIME\r\n{starttls}250 PIPELINING\r\n", state.config.max_message_bytes)).await?;
                }
            }
            "STARTTLS" if tls.is_some() && !encrypted => {
                reply(&mut stream, "220 Ready to start TLS\r\n").await?;
                let socket = stream.into_inner();
                let encrypted_socket = tls.as_ref().expect("TLS configured").accept(socket).await?;
                stream = BufStream::new(Box::new(encrypted_socket));
                encrypted = true;
                greeted = false;
                has_sender = false;
                envelope = Envelope::default();
            }
            "MAIL" => {
                if !greeted {
                    reply(&mut stream, "503 EHLO first\r\n").await?;
                    continue;
                }
                if has_sender {
                    reply(&mut stream, "503 Sender already set; use RSET\r\n").await?;
                    continue;
                }
                if let Some(size) = command.split_whitespace().find_map(|s| {
                    s.to_uppercase()
                        .strip_prefix("SIZE=")
                        .and_then(|v| v.parse::<usize>().ok())
                }) && size > state.config.max_message_bytes
                {
                    reply(&mut stream, "552 Message too large\r\n").await?;
                    continue;
                }
                if let Some(from) = address(&command, "MAIL FROM:", true) {
                    envelope = Envelope {
                        from,
                        to: Vec::new(),
                    };
                    has_sender = true;
                    reply(&mut stream, "250 Sender accepted\r\n").await?;
                } else {
                    reply(&mut stream, "501 Invalid sender\r\n").await?;
                }
            }
            "RCPT" => {
                if !has_sender {
                    reply(&mut stream, "503 MAIL first\r\n").await?;
                    continue;
                }
                if envelope.to.len() >= 100 {
                    reply(&mut stream, "452 Too many recipients\r\n").await?;
                    continue;
                }
                if let Some(to) = address(&command, "RCPT TO:", false) {
                    envelope.to.push(to);
                    reply(&mut stream, "250 Recipient accepted\r\n").await?;
                } else {
                    reply(&mut stream, "501 Invalid recipient\r\n").await?;
                }
            }
            "DATA" => {
                if envelope.to.is_empty() {
                    reply(&mut stream, "503 RCPT first\r\n").await?;
                    continue;
                }
                reply(&mut stream, "354 End data with <CRLF>.<CRLF>\r\n").await?;
                let mut raw = Vec::new();
                let mut oversized = false;
                loop {
                    let bytes = line(&mut stream, 65536).await?;
                    if bytes == b".\r\n" || bytes == b".\n" {
                        break;
                    }
                    let bytes = if bytes.starts_with(b".") {
                        &bytes[1..]
                    } else {
                        &bytes[..]
                    };
                    if raw.len() + bytes.len() > state.config.max_message_bytes {
                        oversized = true;
                    }
                    if !oversized {
                        raw.extend_from_slice(bytes);
                    }
                }
                if oversized {
                    reply(&mut stream, "552 Message too large\r\n").await?;
                } else {
                    match db::enqueue(&state.pool, raw, &envelope).await {
                        Ok(id) => {
                            state.wake.notify_waiters();
                            reply(&mut stream, &format!("250 Queued as {id}\r\n")).await?;
                        }
                        Err(error) => {
                            tracing::error!(%error, "Could not durably accept mail");
                            reply(&mut stream, "451 Temporary storage failure; try again\r\n")
                                .await?;
                        }
                    }
                }
                has_sender = false;
                envelope = Envelope::default();
            }
            "RSET" => {
                has_sender = false;
                envelope = Envelope::default();
                reply(&mut stream, "250 Reset\r\n").await?;
            }
            "NOOP" => reply(&mut stream, "250 OK\r\n").await?,
            "QUIT" => {
                reply(&mut stream, "221 Goodbye\r\n").await?;
                break;
            }
            "VRFY" => {
                reply(
                    &mut stream,
                    "252 Cannot verify; all valid recipients accepted\r\n",
                )
                .await?
            }
            _ => reply(&mut stream, "502 Command not supported\r\n").await?,
        }
    }
    Ok(())
}
