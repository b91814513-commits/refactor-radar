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
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    jobs: Arc<Mutex<HashMap<String, AnalysisJob>>>,
    result_root: PathBuf,
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

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(serde_json::json!({ "error": self.message }))).into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let result_root = PathBuf::from(".refactor-radar").join("analyses");
    fs::create_dir_all(&result_root).context("failed to create analysis cache directory")?;
    cleanup_old_results(&result_root, 50);

    let state = AppState {
        jobs: Arc::new(Mutex::new(HashMap::new())),
        result_root,
    };

    let app = Router::new()
        .route("/", get(root))
        .route("/api/analyze", post(start_analysis))
        .route("/api/analyze/:id/status", get(get_status))
        .route("/api/analyze/:id/results", get(get_results))
        .route("/api/analyze/:id/issues/:issue_id", get(get_issue))
        .route("/api/analyses", get(list_analyses))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let address: SocketAddr = "127.0.0.1:8787".parse().expect("valid socket address");
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("Refactor Radar server listening on http://{address}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn root() -> &'static str {
    "Refactor Radar API"
}

async fn start_analysis(
    State(state): State<AppState>,
    Json(request): Json<AnalyzeRequest>,
) -> Result<Json<AnalyzeResponse>, ApiError> {
    if request.repo_path.trim().is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "repoPath must not be empty",
        ));
    }

    let analysis_id = Uuid::new_v4().to_string();
    let job = AnalysisJob {
        analysis_id: analysis_id.clone(),
        repo_path: request.repo_path.clone(),
        phase: AnalysisPhase::Discovery,
        done: false,
        error: None,
        result_path: None,
        started_at: Utc::now(),
        completed_at: None,
    };

    state
        .jobs
        .lock()
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "job registry poisoned"))?
        .insert(analysis_id.clone(), job);

    let state_for_task = state.clone();
    let repo_path = request.repo_path.clone();
    let analysis_id_for_task = analysis_id.clone();

    tokio::spawn(async move {
        if let Err(error) = run_analysis_job(state_for_task, &analysis_id_for_task, &repo_path).await {
            let _ = update_job(&state, &analysis_id_for_task, |job| {
                job.done = true;
                job.error = Some(error.to_string());
                job.completed_at = Some(Utc::now());
            });
        }
    });

    Ok(Json(AnalyzeResponse {
        analysis_id,
        status: "queued",
    }))
}

async fn run_analysis_job(state: AppState, analysis_id: &str, repo_path: &str) -> Result<()> {
    let analysis_id_owned = analysis_id.to_string();
    let repo_path_owned = repo_path.to_string();
    let state_for_progress = state.clone();

    let mut result = tokio::task::spawn_blocking(move || {
        let analyzer = Analyzer::default();
        analyzer.analyze_repo_with_progress(&repo_path_owned, |phase| {
            let _ = update_job(&state_for_progress, &analysis_id_owned, |job| {
                job.phase = phase;
            });
        })
    })
    .await
    .map_err(|join_error| anyhow!("analysis worker failed: {join_error}"))??;

    result.analysis_id = analysis_id.to_string();
    let result_path = persist_result(&state.result_root, analysis_id, &result)?;
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
) -> Result<Json<StatusResponse>, ApiError> {
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
) -> Result<Json<AnalysisResult>, ApiError> {
    let job = get_job(&state, &analysis_id)?;
    if !job.done {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "analysis is still running",
        ));
    }

    if let Some(error) = job.error {
        return Err(ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, error));
    }

    let result_path = job
        .result_path
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "analysis result not found"))?;
    let result = read_result(Path::new(&result_path))?;
    Ok(Json(result))
}

async fn get_issue(
    State(state): State<AppState>,
    AxumPath((analysis_id, issue_id)): AxumPath<(String, String)>,
) -> Result<Json<AnalysisIssue>, ApiError> {
    let job = get_job(&state, &analysis_id)?;
    let result_path = job
        .result_path
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "analysis result not found"))?;
    let result = read_result(Path::new(&result_path))?;
    result
        .issues
        .into_iter()
        .find(|issue| issue.id == issue_id)
        .map(Json)
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "issue not found"))
}

async fn list_analyses(
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, ApiError> {
    let entries = match fs::read_dir(&state.result_root) {
        Ok(entries) => entries,
        Err(_) => return Ok(Json(vec![])),
    };

    let mut items: Vec<serde_json::Value> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().extension().and_then(|ext| ext.to_str()) == Some("json")
        })
        .filter_map(|entry| {
            let bytes = fs::read(entry.path()).ok()?;
            let result: AnalysisResult = serde_json::from_slice(&bytes).ok()?;
            let id = entry
                .path()
                .file_stem()?
                .to_string_lossy()
                .to_string();
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
    Ok(Json(items))
}

fn cleanup_old_results(result_root: &Path, max_files: usize) {
    let entries = match fs::read_dir(result_root) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    let mut files: Vec<_> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                == Some("json")
        })
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
        let _ = fs::remove_file(entry.path());
    }
}

fn persist_result(result_root: &Path, analysis_id: &str, result: &AnalysisResult) -> Result<PathBuf> {
    let file_path = result_root.join(format!("{analysis_id}.json"));
    let json = serde_json::to_vec_pretty(result)?;
    fs::write(&file_path, json).with_context(|| format!("failed to write {}", file_path.display()))?;
    Ok(file_path)
}

fn read_result(path: &Path) -> Result<AnalysisResult, ApiError> {
    let bytes = fs::read(path)
        .with_context(|| format!("failed to read analysis result {}", path.display()))
        .map_err(ApiError::from)?;
    serde_json::from_slice(&bytes)
        .map_err(|error| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))
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

fn get_job(state: &AppState, analysis_id: &str) -> Result<AnalysisJob, ApiError> {
    state
        .jobs
        .lock()
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "job registry poisoned"))?
        .get(analysis_id)
        .cloned()
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "analysis not found"))
}
