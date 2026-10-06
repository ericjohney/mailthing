mod common;
use common::*;
use mailthing::{AppState, models::Draft, outgoing, smtp};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufStream},
    net::{TcpListener, TcpStream},
    sync::watch,
};

async fn response<T: AsyncRead + AsyncWrite + Unpin>(stream: &mut BufStream<T>) -> String {
    let mut result = String::new();
    loop {
        let mut line = String::new();
        stream.read_line(&mut line).await.unwrap();
        assert!(!line.is_empty());
        let final_line = line.as_bytes().get(3) == Some(&b' ');
        result.push_str(&line);
        if final_line {
            break;
        }
    }
    result
}
async fn command<T: AsyncRead + AsyncWrite + Unpin>(
    stream: &mut BufStream<T>,
    value: &str,
) -> String {
    stream.write_all(value.as_bytes()).await.unwrap();
    stream.flush().await.unwrap();
    response(stream).await
}

#[tokio::test]
async fn incoming_starttls_upgrades_connection_and_resets_smtp_state() {
    let (temp, state) = setup().await;
    tokio_rustls::rustls::crypto::ring::default_provider()
        .install_default()
        .ok();
    let certificate = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let cert = temp.path().join("cert.pem");
    let key = temp.path().join("key.pem");
    std::fs::write(&cert, certificate.cert.pem()).unwrap();
    std::fs::write(&key, certificate.key_pair.serialize_pem()).unwrap();
    let mut config = (*state.config).clone();
    config.tls_cert = Some(cert);
    config.tls_key = Some(key);
    let state = AppState::new(state.pool, config);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (stop, receiver) = watch::channel(false);
    let server = tokio::spawn(smtp::serve(listener, state, receiver));
    let mut client = BufStream::new(TcpStream::connect(address).await.unwrap());
    response(&mut client).await;
    assert!(
        command(&mut client, "EHLO test\r\n")
            .await
            .contains("STARTTLS")
    );
    assert!(
        command(&mut client, "STARTTLS\r\n")
            .await
            .starts_with("220")
    );
    let mut roots = tokio_rustls::rustls::RootCertStore::empty();
    roots.add(certificate.cert.der().clone()).unwrap();
    let client_config = tokio_rustls::rustls::ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    let connector = tokio_rustls::TlsConnector::from(std::sync::Arc::new(client_config));
    let encrypted = connector
        .connect(
            tokio_rustls::rustls::pki_types::ServerName::try_from("localhost").unwrap(),
            client.into_inner(),
        )
        .await
        .unwrap();
    let mut client = BufStream::new(encrypted);
    assert!(
        command(&mut client, "MAIL FROM:<sam@example.net>\r\n")
            .await
            .starts_with("503")
    );
    assert!(
        !command(&mut client, "EHLO test\r\n")
            .await
            .contains("STARTTLS")
    );
    assert!(
        command(&mut client, "MAIL FROM:<sam@example.net>\r\n")
            .await
            .starts_with("250")
    );
    command(&mut client, "QUIT\r\n").await;
    stop.send(true).unwrap();
    server.await.unwrap().unwrap();
}

#[tokio::test]
async fn smtp_catches_any_recipient_persists_before_ack_and_unstuffs_dots() {
    let (_temp, state) = setup().await;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let (stop, receiver) = watch::channel(false);
    let server = tokio::spawn(smtp::serve(listener, state.clone(), receiver));
    let mut client = BufStream::new(TcpStream::connect(addr).await.unwrap());
    assert!(response(&mut client).await.starts_with("220"));
    assert!(command(&mut client, "DATA\r\n").await.starts_with("503"));
    assert!(
        command(&mut client, "EHLO test.example\r\n")
            .await
            .contains("PIPELINING")
    );
    assert!(
        command(&mut client, "MAIL FROM:<sam@example.net>\r\n")
            .await
            .starts_with("250")
    );
    assert!(
        command(&mut client, "RCPT TO:<anything@unrelated.example>\r\n")
            .await
            .starts_with("250")
    );
    assert!(
        command(&mut client, "RCPT TO:<another@different.example>\r\n")
            .await
            .starts_with("250")
    );
    assert!(command(&mut client, "DATA\r\n").await.starts_with("354"));
    assert!(command(&mut client,"From: sam@example.net\r\nTo: hidden@example.com\r\nSubject: SMTP test\r\n\r\n..leading dot\r\n.\r\n").await.starts_with("250 Queued"));
    let raw: Vec<u8> = sqlx::query_scalar("SELECT raw FROM jobs")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert!(
        String::from_utf8(raw)
            .unwrap()
            .contains("\r\n.leading dot\r\n")
    );
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    let envelope: String = sqlx::query_scalar("SELECT envelope FROM jobs")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert!(envelope.contains("anything@unrelated.example"));
    assert!(envelope.contains("another@different.example"));
    assert!(command(&mut client, "QUIT\r\n").await.starts_with("221"));
    stop.send(true).unwrap();
    server.await.unwrap().unwrap();
}

#[tokio::test]
async fn oversized_smtp_mail_is_rejected_without_queueing() {
    let (_temp, state) = setup().await;
    let mut config = (*state.config).clone();
    config.max_message_bytes = 1024;
    let state = AppState::new(state.pool, config);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let (stop, receiver) = watch::channel(false);
    let server = tokio::spawn(smtp::serve(listener, state.clone(), receiver));
    let mut client = BufStream::new(TcpStream::connect(addr).await.unwrap());
    response(&mut client).await;
    command(&mut client, "EHLO test\r\n").await;
    assert!(
        command(&mut client, "MAIL FROM:<sam@example.net> SIZE=2000\r\n")
            .await
            .starts_with("552")
    );
    command(&mut client, "MAIL FROM:<>\r\n").await;
    command(&mut client, "RCPT TO:<alex@example.com>\r\n").await;
    command(&mut client, "DATA\r\n").await;
    assert!(
        command(&mut client, &format!("{}\r\n.\r\n", "x".repeat(1500)))
            .await
            .starts_with("552")
    );
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
        .fetch_one(&state.pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    command(&mut client, "QUIT\r\n").await;
    stop.send(true).unwrap();
    server.await.unwrap().unwrap();
}

#[tokio::test]
async fn outbound_relay_sends_attachments_and_bcc_without_exposing_bcc_header() {
    let (_relay_temp, relay) = setup().await;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let (stop, receiver) = watch::channel(false);
    let server = tokio::spawn(smtp::serve(listener, relay.clone(), receiver));
    let (_sender_temp, sender) = setup().await;
    let mut config = (*sender.config).clone();
    config.relay_host = "127.0.0.1".into();
    config.relay_port = addr.port();
    config.relay_security = "plain".into();
    let sender = AppState::new(sender.pool, config);
    let draft = Draft {
        id: "outgoing".into(),
        to: "friend@example.net".into(),
        bcc: "hidden@example.net".into(),
        subject: "A real send".into(),
        body: "Hello from Rust".into(),
        attachments: vec![mailthing::models::DraftAttachment {
            name: "hello.txt".into(),
            content_type: "text/plain".into(),
            data: "aGVsbG8=".into(),
        }],
        ..Default::default()
    };
    sqlx::query("INSERT INTO drafts(id,data,updated_at) VALUES(?,?,0)")
        .bind(&draft.id)
        .bind(serde_json::to_string(&draft).unwrap())
        .execute(&sender.pool)
        .await
        .unwrap();
    outgoing::send(&sender, &draft).await.unwrap();
    let raw: Vec<u8> = sqlx::query_scalar("SELECT raw FROM jobs")
        .fetch_one(&relay.pool)
        .await
        .unwrap();
    let parsed = mailparse::parse_mail(&raw).unwrap();
    use mailparse::MailHeaderMap;
    assert!(parsed.headers.get_first_value("Bcc").is_none());
    assert_eq!(
        parsed.headers.get_first_value("Subject").unwrap(),
        "A real send"
    );
    let envelope: String = sqlx::query_scalar("SELECT envelope FROM jobs")
        .fetch_one(&relay.pool)
        .await
        .unwrap();
    assert!(envelope.contains("hidden@example.net"));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM messages WHERE folder='sent'")
            .fetch_one(&sender.pool)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM drafts")
            .fetch_one(&sender.pool)
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        sqlx::query_scalar::<_, Vec<u8>>("SELECT content FROM attachments")
            .fetch_one(&sender.pool)
            .await
            .unwrap(),
        b"hello"
    );
    stop.send(true).unwrap();
    server.await.unwrap().unwrap();
}
