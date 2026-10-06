pub mod api;
pub mod config;
pub mod db;
pub mod labels;
pub mod models;
pub mod outgoing;
pub mod pipeline;
pub mod search;
pub mod smtp;

use config::Config;
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::{Notify, broadcast, watch};

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub config: Arc<Config>,
    pub wake: Arc<Notify>,
    pub events: broadcast::Sender<()>,
    pub pipeline: Arc<pipeline::Pipeline>,
    pub shutdown: watch::Sender<bool>,
}

impl AppState {
    pub fn new(pool: SqlitePool, config: Config) -> Self {
        Self {
            pool,
            config: Arc::new(config),
            wake: Arc::new(Notify::new()),
            events: broadcast::channel(64).0,
            pipeline: Arc::new(pipeline::Pipeline::default()),
            shutdown: watch::channel(false).0,
        }
    }

    pub fn start_workers(&self, stop: watch::Receiver<bool>) -> Vec<tokio::task::JoinHandle<()>> {
        let mut tasks = vec![self.start_snooze_waker(stop.clone())];
        tasks.extend(self.start_queue_workers(stop));
        tasks
    }

    /// Snoozed conversations return to the inbox by regaining INBOX when they are due.
    fn start_snooze_waker(&self, mut stop: watch::Receiver<bool>) -> tokio::task::JoinHandle<()> {
        let state = self.clone();
        tokio::spawn(async move {
            loop {
                match db::wake_snoozed(&state.pool).await {
                    Ok(0) => {}
                    Ok(_) => {
                        let _ = state.events.send(());
                    }
                    Err(error) => tracing::error!(%error, "Snooze wake-up failed"),
                }
                tokio::select! {
                    _ = stop.changed() => break,
                    _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {},
                }
            }
        })
    }

    fn start_queue_workers(&self, stop: watch::Receiver<bool>) -> Vec<tokio::task::JoinHandle<()>> {
        (0..self.config.concurrency)
            .map(|_| {
                let state = self.clone();
                let mut stop = stop.clone();
                tokio::spawn(async move {
                    loop {
                        if *stop.borrow() {
                            break;
                        }
                        match pipeline::process_next(&state.pool, state.pipeline.clone()).await {
                            Ok(true) => {
                                let _ = state.events.send(());
                                continue;
                            }
                            Err(error) => tracing::error!(%error, "Queue worker failed"),
                            Ok(false) => {}
                        }
                        tokio::select! {
                            _ = stop.changed() => break,
                            _ = state.wake.notified() => {},
                            _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {},
                        }
                    }
                })
            })
            .collect()
    }
}
