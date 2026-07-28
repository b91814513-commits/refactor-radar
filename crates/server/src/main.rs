use std::collections::HashMap;
use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use analyzer::{AnalysisIssue, AnalysisPhase, AnalysisResult, Analyzer};
use anyhow::{anyhow, Context, Result};
use axum::extract::{Path as AxumPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use clap::Parser;
use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;
use tower_http::cors::CorsLayer;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/// Refactor Radar — local-first static analysis server.
#[derive(Parser, Debug)]
#[command(name = "server", version = env!("CARGO_PKG_VERSION"), about)]
struct Cli {
    /// Host address to bind to.
    #[arg(long, default_value = "127.0.0.1")]
    host: String,

    /// Port to listen on.
    #[arg(long, default_value_t = 8787)]
    port: u16,

    /// Root directory for persisted analysis data.
    #[arg(long, default_value = ".refactor-radar")]
    data_dir: PathBuf,

    /// Log level filter (trace, debug, info, warn, error).
    #[arg(long, default_value = "info")]
    log_level: String,
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/// How many analyses may run concurrently. Bounded to protect filesystem
/// handles and memory under burst load; sized to available parallelism so
/// long queueing requests wait rather than oversubscribing the machine.
fn analysis_concurrency() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

#[derive(Clone)]
struct AppState {
    jobs: Arc<Mutex<HashMap<String, AnalysisJob>>>,
    result_root: PathBuf,
    /// Bounds the number of concurrent analyses (each holds one permit for the
    /// duration of its `spawn_blocking` work).
    analysis_permits: Arc<Semaphore>,
    /// Tracks how many analyses are currently running; used during graceful
    /// shutdown to wait for in-flight work.
    active_count: Arc<std::sync::atomic::AtomicUsize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisJob {
    analysis_id: String,
    repo_path: String,
    phase: AnalysisPhase,
    done: bool,
    error: Option<String>,
    result_path: Option<String>,
    started_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeRequest {
    repo_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeResponse {
    analysis_id: String,
    status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusResponse {
    analysis_id: String,
    phase: AnalysisPhase,
    done: bool,
    error: Option<String>,
    completed_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/// Unified application error returned by all handlers as JSON.
#[derive(Debug)]
enum AppError {
    BadRequest(String),
    NotFound(String),
    Conflict(String),
    Unprocessable(String),
    Internal(String),
}

impl AppError {
    fn bad_request(msg: impl Into<String>) -> Self { Self::BadRequest(msg.into()) }
    fn not_found(msg: impl Into<String>) -> Self { Self::NotFound(msg.into()) }
    fn conflict(msg: impl Into<String>) -> Self { Self::Conflict(msg.into()) }
    fn unprocessable(msg: impl Into<String>) -> Self { Self::Unprocessable(msg.into()) }
    fn internal(msg: impl Into<String>) -> Self { Self::Internal(msg.into()) }

    fn error_code(&self) -> &'static str {
        match self {
            Self::BadRequest(_) => "BAD_REQUEST",
            Self::NotFound(_) => "NOT_FOUND",
            Self::Conflict(_) => "CONFLICT",
            Self::Unprocessable(_) => "UNPROCESSABLE_ENTITY",
            Self::Internal(_) => "INTERNAL_ERROR",
        }
    }

    fn status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Unprocessable(_) => StatusCode::UNPROCESSABLE_ENTITY,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn message(&self) -> &str {
        match self {
            Self::BadRequest(m)
            | Self::NotFound(m)
            | Self::Conflict(m)
            | Self::Unprocessable(m)
            | Self::Internal(m) => m,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let body = serde_json::json!({
            "error": self.message(),
            "code": self.error_code(),
        });
        error!(error_code = self.error_code(), status = status.as_u16(), message = self.message(), "request failed");
        (status, Json(body)).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(error: anyhow::Error) -> Self {
        Self::Internal(error.to_string())
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialise tracing subscriber with env-filter; CLI flag sets the default
    // but `RUST_LOG` always takes precedence.
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(&cli.log_level));
    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .init();

    info!(host = %cli.host, port = cli.port, data_dir = %cli.data_dir.display(), "starting Refactor Radar server");

    let result_root = cli.data_dir.join("analyses");
    fs::create_dir_all(&result_root)
        .with_context(|| format!("failed to create analysis cache directory: {}", result_root.display()))?;
    cleanup_old_results(&result_root, 50);

    let max_concurrent = analysis_concurrency();
    let active_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));

    let state = AppState {
        jobs: Arc::new(Mutex::new(HashMap::new())),
        result_root,
        analysis_permits: Arc::new(Semaphore::new(max_concurrent)),
        active_count: active_count.clone(),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/", get(root))
        .route("/api/analyze", post(start_analysis))
        .route("/api/analyze/:id/status", get(get_status))
        .route("/api/analyze/:id/results", get(get_results))
        .route("/api/analyze/:id/issues/:issue_id", get(get_issue))
        .route("/api/analyses", get(list_analyses))
        .route("/api/analyses/:id", get(get_analysis_by_id))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let address: SocketAddr = format!("{}:{}", cli.host, cli.port)
        .parse()
        .map_err(|e| anyhow!("invalid bind address: {e}"))?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    info!(%address, "Refactor Radar server listening");

    // Graceful shutdown: on Ctrl+C we stop accepting new connections and wait
    // up to 30 seconds for in-flight analyses to finish.
    let server = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(active_count));

    if let Err(e) = server.await {
        error!(error = %e, "server exited with error");
        return Err(anyhow!("server error: {e}"));
    }

    info!("server shut down cleanly");
    Ok(())
}

/// Waits for Ctrl+C, then gives in-flight analyses up to 30 s to complete.
async fn shutdown_signal(active_count: Arc<std::sync::atomic::AtomicUsize>) {
    let ctrl_c = async {
        if let Err(e) = tokio::signal::ctrl_c().await {
            error!(error = %e, "failed to listen for Ctrl+C");
        }
    };

    tokio::select! {
        _ = ctrl_c => {
            info!("received Ctrl+C — initiating graceful shutdown");
        }
    }

    // Wait for all active analyses to drain (up to 30 s).
    let drain = async {
        loop {
            if active_count.load(std::sync::atomic::Ordering::Relaxed) == 0 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    };

    let timeout = tokio::time::sleep(std::time::Duration::from_secs(30));
    tokio::select! {
        _ = drain => {
            info!("all in-flight analyses completed");
        }
        _ = timeout => {
            warn!("shutdown timeout reached — some analyses may not have finished");
        }
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn root() -> &'static str {
    "Refactor Radar API"
}

async fn start_analysis(
    State(state): State<AppState>,
    Json(request): Json<AnalyzeRequest>,
) -> std::result::Result<Json<AnalyzeResponse>, AppError> {
    let raw_path = request.repo_path.trim();
    if raw_path.is_empty() {
        return Err(AppError::bad_request("repoPath must not be empty"));
    }

    // Canonicalize and validate the path.
    let canonical = fs::canonicalize(raw_path)
        .map_err(|e| AppError::bad_request(format!("invalid repoPath '{raw_path}': {e}")))?;
    if !canonical.is_dir() {
        return Err(AppError::bad_request(format!(
            "repoPath '{}' is not a directory",
            canonical.display()
        )));
    }
    let repo_path_str = canonical.to_string_lossy().replace('\\', "/");

    debug!(repo_path = %repo_path_str, "starting analysis");

    let analysis_id = Uuid::new_v4().to_string();
    let job = AnalysisJob {
        analysis_id: analysis_id.clone(),
        repo_path: repo_path_str.clone(),
        phase: AnalysisPhase::Discovery,
        done: false,
        error: None,
        result_path: None,
        started_at: Utc::now(),
        completed_at: None,
    };

    {
        let mut jobs = state
            .jobs
            .lock()
            .map_err(|_| AppError::internal("job registry poisoned"))?;
        jobs.insert(analysis_id.clone(), job);
    }

    let state_for_task = state.clone();
    let state_for_error = state.clone();
    let analysis_id_for_task = analysis_id.clone();

    // Take a permit *before* spawning so we can fail fast if at capacity.
    // The permit is moved into the blocking task and released when it ends.
    let permit = state
        .analysis_permits
        .clone()
        .try_acquire_owned()
        .map_err(|_| AppError::conflict("server at maximum concurrent analysis capacity"))?;

    tokio::spawn(async move {
        // Track this analysis for graceful shutdown.
        state_for_task.active_count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        if let Err(error) =
            run_analysis_job(state_for_task.clone(), &analysis_id_for_task, &repo_path_str, permit).await
        {
            error!(analysis_id = %analysis_id_for_task, error = %error, "analysis failed");
            let _ = update_job(&state_for_error, &analysis_id_for_task, |job| {
                job.done = true;
                job.error = Some(error.to_string());
                job.completed_at = Some(Utc::now());
            });
        }

        state_for_task.active_count.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
    });

    Ok(Json(AnalyzeResponse {
        analysis_id,
        status: "queued",
    }))
}

async fn run_analysis_job(
    state: AppState,
    analysis_id: &str,
    repo_path: &str,
    permit: tokio::sync::OwnedSemaphorePermit,
) -> Result<()> {
    let analysis_id_owned = analysis_id.to_string();
    let repo_path_owned = repo_path.to_string();
    let state_for_progress = state.clone();

    // The permit is moved into the blocking closure so it is held for the
    // entire duration of the analysis and released when the closure returns.
    let result = tokio::task::spawn_blocking(move || {
        let _permit = permit; // held until closure ends
        let analyzer = Analyzer::default();
        analyzer.analyze_repo_with_progress(&repo_path_owned, |phase| {
            let _ = update_job(&state_for_progress, &analysis_id_owned, |job| {
                job.phase = phase;
            });
        })
    })
    .await
    .map_err(|join_error| anyhow!("analysis worker failed: {join_error}"))?;

    let mut result = result?;

    result.analysis_id = analysis_id.to_string();
    let result_path = persist_result(&state.result_root, analysis_id, &result)?;
    info!(analysis_id = %analysis_id, result = %result_path.display(), "analysis completed");
    update_job(&state, analysis_id, |job| {
        job.phase = AnalysisPhase::Done;
        job.done = true;
        job.result_path = Some(result_path.to_string_lossy().replace('\\', "/"));
        job.completed_at = Some(Utc::now());
    })?;

    Ok(())
}

async fn get_status(
    State(state): State<AppState>,
    AxumPath(analysis_id): AxumPath<String>,
) -> std::result::Result<Json<StatusResponse>, AppError> {
    let job = get_job(&state, &analysis_id)?;
    Ok(Json(StatusResponse {
        analysis_id: job.analysis_id,
        phase: job.phase,
        done: job.done,
        error: job.error,
        completed_at: job.completed_at,
    }))
}

async fn get_results(
    State(state): State<AppState>,
    AxumPath(analysis_id): AxumPath<String>,
) -> std::result::Result<Json<AnalysisResult>, AppError> {
    // Try in-memory job first; fall back to persisted file for post-restart access.
    let job = match get_job(&state, &analysis_id) {
        Ok(job) => job,
        Err(_) => {
            let file_path = state.result_root.join(format!("{analysis_id}.json"));
            if !file_path.exists() {
                return Err(AppError::not_found("analysis not found"));
            }
            let result = tokio::task::spawn_blocking(move || read_result(&file_path))
                .await
                .map_err(|join_error| {
                    AppError::internal(format!("result read task failed: {join_error}"))
                })??;
            return Ok(Json(result));
        }
    };

    if !job.done {
        return Err(AppError::conflict("analysis is still running"));
    }

    if let Some(error) = job.error {
        return Err(AppError::unprocessable(error));
    }

    let result_path = job
        .result_path
        .ok_or_else(|| AppError::not_found("analysis result not found"))?;
    // Disk reads are blocking; move off the async runtime.
    let result = tokio::task::spawn_blocking(move || read_result(Path::new(&result_path)))
        .await
        .map_err(|join_error| {
            AppError::internal(format!("result read task failed: {join_error}"))
        })??;
    Ok(Json(result))
}

async fn get_issue(
    State(state): State<AppState>,
    AxumPath((analysis_id, issue_id)): AxumPath<(String, String)>,
) -> std::result::Result<Json<AnalysisIssue>, AppError> {
    let job = get_job(&state, &analysis_id)?;
    let result_path = job
        .result_path
        .ok_or_else(|| AppError::not_found("analysis result not found"))?;
    let result = tokio::task::spawn_blocking(move || read_result(Path::new(&result_path)))
        .await
        .map_err(|join_error| {
            AppError::internal(format!("result read task failed: {join_error}"))
        })??;
    result
        .issues
        .into_iter()
        .find(|issue| issue.id == issue_id)
        .map(Json)
        .ok_or_else(|| AppError::not_found("issue not found"))
}

async fn list_analyses(
    State(state): State<AppState>,
) -> std::result::Result<Json<Vec<serde_json::Value>>, AppError> {
    // The whole listing does synchronous directory + file reads; run it on a
    // blocking thread so the Tokio worker isn't stalled.
    let result_root = state.result_root.clone();
    let items = tokio::task::spawn_blocking(move || list_analyses_blocking(&result_root))
        .await
        .map_err(|join_error| {
            AppError::internal(format!("list task failed: {join_error}"))
        })?;
    Ok(Json(items))
}

/// Load a persisted analysis by ID directly from disk.
/// This works even after server restart when in-memory jobs are gone.
async fn get_analysis_by_id(
    State(state): State<AppState>,
    AxumPath(analysis_id): AxumPath<String>,
) -> std::result::Result<Json<AnalysisResult>, AppError> {
    let file_path = state.result_root.join(format!("{analysis_id}.json"));
    if !file_path.exists() {
        return Err(AppError::not_found("analysis not found"));
    }
    let result = tokio::task::spawn_blocking(move || read_result(&file_path))
        .await
        .map_err(|join_error| {
            AppError::internal(format!("result read task failed: {join_error}"))
        })??;
    Ok(Json(result))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn list_analyses_blocking(result_root: &Path) -> Vec<serde_json::Value> {
    let entries = match fs::read_dir(result_root) {
        Ok(entries) => entries,
        Err(e) => {
            warn!(error = %e, dir = %result_root.display(), "failed to read results directory");
            return vec![];
        }
    };

    let mut items: Vec<serde_json::Value> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().extension().and_then(|ext| ext.to_str()) == Some("json"))
        .filter_map(|entry| {
            let bytes = fs::read(entry.path()).ok()?;
            let result: AnalysisResult = serde_json::from_slice(&bytes).ok()?;
            let id = entry.path().file_stem()?.to_string_lossy().to_string();
            Some(serde_json::json!({
                "id": id,
                "repoPath": result.repo_path,
                "analyzedAt": result.summary.analyzed_at,
                "issueCount": result.summary.issue_count,
                "highPriorityCount": result.summary.high_priority_count,
            }))
        })
        .collect();

    items.sort_by(|a, b| {
        let a_time = a["analyzedAt"].as_str().unwrap_or("");
        let b_time = b["analyzedAt"].as_str().unwrap_or("");
        b_time.cmp(a_time)
    });

    items.truncate(20);
    items
}

fn cleanup_old_results(result_root: &Path, max_files: usize) {
    let entries = match fs::read_dir(result_root) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    let mut files: Vec<_> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().extension().and_then(|ext| ext.to_str()) == Some("json"))
        .collect();

    if files.len() <= max_files {
        return;
    }

    files.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
    });

    for entry in files.iter().take(files.len() - max_files) {
        if let Err(e) = fs::remove_file(entry.path()) {
            warn!(error = %e, file = %entry.path().display(), "failed to remove old result file");
        }
    }
}

fn persist_result(
    result_root: &Path,
    analysis_id: &str,
    result: &AnalysisResult,
) -> Result<PathBuf> {
    let file_path = result_root.join(format!("{analysis_id}.json"));
    let json = serde_json::to_vec_pretty(result)?;
    // Atomic write: serialize to a temp sibling file, then rename. Prevents
    // `list_analyses`/`get_results` from observing a half-written file.
    let temp_path = result_root.join(format!("{analysis_id}.json.tmp"));
    fs::write(&temp_path, &json)
        .with_context(|| format!("failed to write {}", temp_path.display()))?;
    fs::rename(&temp_path, &file_path)
        .with_context(|| format!("failed to finalize {}", file_path.display()))?;
    Ok(file_path)
}

fn read_result(path: &Path) -> Result<AnalysisResult, AppError> {
    let bytes = fs::read(path)
        .with_context(|| format!("failed to read analysis result {}", path.display()))
        .map_err(|e| AppError::Internal(e.to_string()))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| AppError::Internal(error.to_string()))
}

fn update_job<F>(state: &AppState, analysis_id: &str, update: F) -> Result<()>
where
    F: FnOnce(&mut AnalysisJob),
{
    let mut jobs = state
        .jobs
        .lock()
        .map_err(|_| anyhow!("job registry poisoned"))?;
    let job = jobs
        .get_mut(analysis_id)
        .ok_or_else(|| anyhow!("analysis not found: {analysis_id}"))?;
    update(job);
    Ok(())
}

fn get_job(state: &AppState, analysis_id: &str) -> std::result::Result<AnalysisJob, AppError> {
    state
        .jobs
        .lock()
        .map_err(|_| AppError::internal("job registry poisoned"))?
        .get(analysis_id)
        .cloned()
        .ok_or_else(|| AppError::not_found("analysis not found"))
}
