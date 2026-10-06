use anyhow::Result;
use mailthing::{AppState, api, config::Config, db, smtp};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tokio_rustls::rustls::crypto::ring::default_provider()
        .install_default()
        .ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mailthing=info,tower_http=info".into()),
        )
        .init();
    let config = Config::from_env()?;
    let pool = db::connect(&config).await?;
    let web = TcpListener::bind((config.web_host, config.port)).await?;
    let smtp_listener = TcpListener::bind((config.smtp_host, config.smtp_port)).await?;
    let state = AppState::new(pool, config);
    smtp::tls_acceptor(&state)?;
    let stop = state.shutdown.clone();
    let stopped = state.shutdown.subscribe();
    let workers = state.start_workers(stopped.clone());
    tracing::info!(web=%web.local_addr()?, smtp=%smtp_listener.local_addr()?, "Mailthing is ready");
    let smtp_state = state.clone();
    let smtp_task = tokio::spawn(smtp::serve(smtp_listener, smtp_state, stopped));
    let shutdown = async move {
        #[cfg(unix)]
        {
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("Install SIGTERM handler");
            tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
        }
        #[cfg(not(unix))]
        tokio::signal::ctrl_c().await.ok();
        let _ = stop.send(true);
    };
    axum::serve(web, api::router(state.clone()))
        .with_graceful_shutdown(shutdown)
        .await?;
    smtp_task.await??;
    for worker in workers {
        worker.await?;
    }
    state.pool.close().await;
    Ok(())
}
