use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use rayon::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

// ---- Compiled-once regexes ---------------------------------------------------
// Regex compilation is expensive; previously these were recompiled on every call
// (and `normalize_function_body` is called once per function body across every
// file). Hoisting them into `OnceLock`s turns repeated compilation into a single
// lookup after first use.

fn import_from_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?m)^\s*import\s+.+?\s+from\s+["']([^"']+)["']"#).expect("valid import regex")
    })
}

fn import_side_effect_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?m)^\s*import\s+["']([^"']+)["']"#).expect("valid side effect import regex")
    })
}

fn require_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"require\(\s*["']([^"']+)["']\s*\)"#).expect("valid require regex"))
}

fn export_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r#"(?m)^\s*export\s+(?:async\s+)?(?:function|const|let|var|class|type)\s+([A-Za-z_][A-Za-z0-9_]*)"#,
        )
        .expect("valid export regex")
    })
}

fn function_decl_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r#"(?m)(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*\{"#,
        )
        .expect("valid function regex")
    })
}

fn arrow_decl_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r#"(?m)(?:export\s+)?(?:const|let|var)\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{"#,
        )
        .expect("valid arrow regex")
    })
}

fn string_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"["'][^"']*["']"#).expect("valid string regex"))
}

fn number_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"\b\d+\b"#).expect("valid number regex"))
}

fn identifier_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"\b[A-Za-z_][A-Za-z0-9_]*\b"#).expect("valid identifier regex"))
}

fn whitespace_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"\s+"#).expect("valid whitespace regex"))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisPhase {
    Discovery,
    Parsing,
    Graphing,
    Rules,
    Scoring,
    Done,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisIssueType {
    LargeModule,
    DependencyHotspot,
    CircularDependency,
    DuplicationCandidate,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    Heuristic,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSummary {
    pub file_count: usize,
    pub module_count: usize,
    pub issue_count: usize,
    pub high_priority_count: usize,
    pub analyzed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetrics {
    pub line_count: usize,
    pub import_count: usize,
    pub export_count: usize,
    pub function_count: usize,
    pub average_function_length: usize,
    pub fan_in: usize,
    pub fan_out: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzedFile {
    pub path: String,
    pub imports: Vec<String>,
    pub exports: Vec<String>,
    pub metrics: FileMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceItem {
    pub label: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IssueMetrics {
    pub line_count: Option<usize>,
    pub function_count: Option<usize>,
    pub export_count: Option<usize>,
    pub fan_in: Option<usize>,
    pub fan_out: Option<usize>,
    pub duplicate_group_size: Option<usize>,
    pub cycle_size: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedAction {
    pub title: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiExplanation {
    pub plain_english_explanation: String,
    pub refactor_outline: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisIssue {
    pub id: String,
    pub issue_type: AnalysisIssueType,
    pub title: String,
    pub severity: Severity,
    pub confidence: Confidence,
    pub priority_score: f32,
    pub summary: String,
    pub files: Vec<String>,
    pub metrics: IssueMetrics,
    pub evidence: Vec<EvidenceItem>,
    pub suggested_actions: Vec<SuggestedAction>,
    pub ai_explanation: Option<AiExplanation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub analysis_id: String,
    pub repo_path: String,
    pub summary: AnalysisSummary,
    pub files: Vec<AnalyzedFile>,
    pub issues: Vec<AnalysisIssue>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct Analyzer {
    large_module_line_threshold: usize,
    large_module_function_threshold: usize,
    dependency_fan_in_threshold: usize,
    dependency_fan_out_threshold: usize,
}

impl Default for Analyzer {
    fn default() -> Self {
        Self {
            large_module_line_threshold: 45,
            large_module_function_threshold: 5,
            dependency_fan_in_threshold: 2,
            dependency_fan_out_threshold: 4,
        }
    }
}

#[derive(Debug, Clone)]
struct SourceFileModel {
    analyzed: AnalyzedFile,
    normalized_functions: Vec<String>,
}

impl Analyzer {
    pub fn analyze_repo<P: AsRef<Path>>(&self, repo_path: P) -> Result<AnalysisResult> {
        self.analyze_repo_with_progress(repo_path, |_| {})
    }

    pub fn analyze_repo_with_progress<P, F>(&self, repo_path: P, mut progress: F) -> Result<AnalysisResult>
    where
        P: AsRef<Path>,
        F: FnMut(AnalysisPhase),
    {
        let root = repo_path.as_ref();
        progress(AnalysisPhase::Discovery);
        validate_repo(root)?;
        let source_files = collect_source_files(root)?;
        // Build the known-source set once so import resolution can use O(1)
        // membership checks instead of up to ~18 stat syscalls per import. The
        // set is keyed by the same normalized relative-path strings used
        // elsewhere (`relative_file_path`), so candidate resolution matches
        // deterministically regardless of absolute path form / drive prefix.
        let known_files: HashSet<String> = source_files
            .iter()
            .map(|path| relative_file_path(root, path))
            .collect();

        progress(AnalysisPhase::Parsing);
        let mut models = source_files
            .par_iter()
            .map(|path| self.parse_file(root, path, &known_files))
            .collect::<Result<Vec<_>>>()?;

        progress(AnalysisPhase::Graphing);
        let graph = build_graph(&models);
        apply_graph_metrics(&mut models, &graph);

        progress(AnalysisPhase::Rules);
        let mut issues = Vec::new();
        issues.extend(self.large_module_issues(&models));
        issues.extend(self.dependency_hotspot_issues(&models));
        issues.extend(circular_dependency_issues(&graph, &models));
        issues.extend(duplication_candidate_issues(&models));

        progress(AnalysisPhase::Scoring);
        issues.sort_by(|left, right| {
            right
                .priority_score
                .total_cmp(&left.priority_score)
                .then_with(|| left.title.cmp(&right.title))
        });

        let files = models.into_iter().map(|model| model.analyzed).collect::<Vec<_>>();
        let summary = AnalysisSummary {
            file_count: files.len(),
            module_count: graph.len(),
            issue_count: issues.len(),
            high_priority_count: issues
                .iter()
                .filter(|issue| matches!(issue.severity, Severity::High))
                .count(),
            analyzed_at: Utc::now(),
        };

        progress(AnalysisPhase::Done);
        Ok(AnalysisResult {
            analysis_id: Uuid::new_v4().to_string(),
            repo_path: normalize_path(root),
            summary,
            files,
            issues,
            metadata: json!({
                "languageScope": ["js", "jsx", "ts", "tsx"],
                "analysisMode": "local_structural_rules",
                "aiEnabled": false
            }),
        })
    }

    fn parse_file(&self, root: &Path, file_path: &Path, known_files: &HashSet<String>) -> Result<SourceFileModel> {
        let source = fs::read_to_string(file_path)
            .with_context(|| format!("failed to read source file {}", file_path.display()))?;

        let raw_imports = extract_imports(&source);
        let raw_exports = extract_exports(&source);

        let imports = raw_imports
            .iter()
            .filter_map(|import| resolve_local_import(root, file_path, import, known_files))
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let functions = extract_function_bodies(&source);
        let function_lengths = functions
            .iter()
            .map(|body| body.lines().count())
            .collect::<Vec<_>>();
        let normalized_functions = functions
            .iter()
            .map(|body| normalize_function_body(body))
            .filter(|body| body.len() >= 40)
            .collect::<Vec<_>>();

        let average_function_length = if function_lengths.is_empty() {
            0
        } else {
            function_lengths.iter().sum::<usize>() / function_lengths.len()
        };

        Ok(SourceFileModel {
            analyzed: AnalyzedFile {
                path: relative_file_path(root, file_path),
                imports,
                exports: raw_exports.clone(),
                metrics: FileMetrics {
                    line_count: source.lines().count(),
                    import_count: raw_imports.len(),
                    export_count: raw_exports.len(),
                    function_count: function_lengths.len(),
                    average_function_length,
                    fan_in: 0,
                    fan_out: 0,
                },
            },
            normalized_functions,
        })
    }

    fn large_module_issues(&self, models: &[SourceFileModel]) -> Vec<AnalysisIssue> {
        models
            .iter()
            .filter_map(|model| {
                let metrics = &model.analyzed.metrics;
                let too_large = metrics.line_count >= self.large_module_line_threshold
                    || metrics.function_count >= self.large_module_function_threshold
                    || metrics.export_count >= 4;
                if !too_large {
                    return None;
                }

                Some(AnalysisIssue {
                    id: format!("large-module:{}", model.analyzed.path),
                    issue_type: AnalysisIssueType::LargeModule,
                    title: format!("Large module: {}", model.analyzed.path),
                    severity: Severity::High,
                    confidence: Confidence::High,
                    priority_score: 92.0
                        + metrics.line_count as f32 / 25.0
                        + metrics.function_count as f32 * 1.8,
                    summary: format!(
                        "{} combines {} lines, {} functions, and {} exports, which suggests responsibility drift.",
                        model.analyzed.path,
                        metrics.line_count,
                        metrics.function_count,
                        metrics.export_count
                    ),
                    files: vec![model.analyzed.path.clone()],
                    metrics: IssueMetrics {
                        line_count: Some(metrics.line_count),
                        function_count: Some(metrics.function_count),
                        export_count: Some(metrics.export_count),
                        ..IssueMetrics::default()
                    },
                    evidence: vec![
                        EvidenceItem {
                            label: "line_count".into(),
                            detail: metrics.line_count.to_string(),
                        },
                        EvidenceItem {
                            label: "function_count".into(),
                            detail: metrics.function_count.to_string(),
                        },
                        EvidenceItem {
                            label: "export_count".into(),
                            detail: metrics.export_count.to_string(),
                        },
                    ],
                    suggested_actions: vec![
                        SuggestedAction {
                            title: "Split by responsibility".into(),
                            detail: "Move formatting, data access, and state orchestration into separate modules.".into(),
                        },
                        SuggestedAction {
                            title: "Create narrower exports".into(),
                            detail: "Expose smaller entry points so downstream modules depend on fewer concerns.".into(),
                        },
                    ],
                    ai_explanation: None,
                })
            })
            .collect()
    }

    fn dependency_hotspot_issues(&self, models: &[SourceFileModel]) -> Vec<AnalysisIssue> {
        models
            .iter()
            .filter_map(|model| {
                let metrics = &model.analyzed.metrics;
                let hotspot = metrics.fan_in >= self.dependency_fan_in_threshold
                    || metrics.fan_out >= self.dependency_fan_out_threshold
                    || metrics.fan_in + metrics.fan_out >= 5;
                if !hotspot {
                    return None;
                }

                Some(AnalysisIssue {
                    id: format!("dependency-hotspot:{}", model.analyzed.path),
                    issue_type: AnalysisIssueType::DependencyHotspot,
                    title: format!("Dependency hotspot: {}", model.analyzed.path),
                    severity: if metrics.fan_in >= 3 || metrics.fan_out >= 5 {
                        Severity::High
                    } else {
                        Severity::Medium
                    },
                    confidence: Confidence::High,
                    priority_score: 80.0 + (metrics.fan_in * 4 + metrics.fan_out * 3) as f32,
                    summary: format!(
                        "{} has fan-in {} and fan-out {}, making it a structural hotspot.",
                        model.analyzed.path, metrics.fan_in, metrics.fan_out
                    ),
                    files: vec![model.analyzed.path.clone()],
                    metrics: IssueMetrics {
                        fan_in: Some(metrics.fan_in),
                        fan_out: Some(metrics.fan_out),
                        ..IssueMetrics::default()
                    },
                    evidence: vec![
                        EvidenceItem {
                            label: "fan_in".into(),
                            detail: metrics.fan_in.to_string(),
                        },
                        EvidenceItem {
                            label: "fan_out".into(),
                            detail: metrics.fan_out.to_string(),
                        },
                    ],
                    suggested_actions: vec![
                        SuggestedAction {
                            title: "Stabilize the public surface".into(),
                            detail: "Pull volatile internals behind a narrow API or extract downstream-specific helpers.".into(),
                        },
                        SuggestedAction {
                            title: "Reduce dependency fan-out".into(),
                            detail: "Move orchestration logic closer to call sites to lower cross-module coupling.".into(),
                        },
                    ],
                    ai_explanation: None,
                })
            })
            .collect()
    }
}

fn validate_repo(root: &Path) -> Result<()> {
    if !root.exists() {
        return Err(anyhow!("repository path does not exist: {}", root.display()));
    }

    // Cheap marker check first. Only when neither is present do we fall back to
    // a full directory walk — avoiding a redundant second traversal (the main
    // analysis walk happens right after this returns Ok).
    let has_repo_markers = root.join("package.json").exists()
        || root.join("tsconfig.json").exists()
        || collect_source_files(root)
            .map(|files| !files.is_empty())
            .unwrap_or(false);

    if !has_repo_markers {
        return Err(anyhow!(
            "path does not look like a JS/TS repository: {}",
            root.display()
        ));
    }

    Ok(())
}

fn collect_source_files(root: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    visit_directory(root, root, &mut files)?;
    files.sort();
    Ok(files)
}

fn visit_directory(root: &Path, current: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(current)
        .with_context(|| format!("failed to read directory {}", current.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();

        if entry.file_type()?.is_dir() {
            if should_skip_dir(root, &path, &file_name) {
                continue;
            }
            visit_directory(root, &path, files)?;
            continue;
        }

        if is_source_file(&path) {
            files.push(path);
        }
    }

    Ok(())
}

fn should_skip_dir(root: &Path, path: &Path, file_name: &str) -> bool {
    if path == root {
        return false;
    }

    matches!(
        file_name,
        "node_modules" | "dist" | "build" | ".next" | "coverage" | "target" | ".git"
    ) || file_name.starts_with('.')
}

fn is_source_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()),
        Some("js" | "jsx" | "ts" | "tsx")
    )
}

fn build_graph(models: &[SourceFileModel]) -> BTreeMap<String, Vec<String>> {
    let known_files = models
        .iter()
        .map(|model| model.analyzed.path.clone())
        .collect::<HashSet<_>>();

    models
        .iter()
        .map(|model| {
            let imports = model
                .analyzed
                .imports
                .iter()
                .filter(|import| known_files.contains(import.as_str()))
                .cloned()
                .collect::<Vec<_>>();
            (model.analyzed.path.clone(), imports)
        })
        .collect()
}

fn apply_graph_metrics(models: &mut [SourceFileModel], graph: &BTreeMap<String, Vec<String>>) {
    let mut fan_in = HashMap::<String, usize>::new();
    for imports in graph.values() {
        for target in imports {
            *fan_in.entry(target.clone()).or_default() += 1;
        }
    }

    for model in models {
        model.analyzed.metrics.fan_out = graph
            .get(&model.analyzed.path)
            .map(|imports| imports.len())
            .unwrap_or(0);
        model.analyzed.metrics.fan_in = fan_in.get(&model.analyzed.path).copied().unwrap_or(0);
    }
}

fn circular_dependency_issues(
    graph: &BTreeMap<String, Vec<String>>,
    models: &[SourceFileModel],
) -> Vec<AnalysisIssue> {
    let cycles = detect_cycles(graph);
    let metrics_by_path = models
        .iter()
        .map(|model| (model.analyzed.path.as_str(), &model.analyzed.metrics))
        .collect::<HashMap<_, _>>();

    cycles
        .into_iter()
        .map(|cycle| {
            let joined = cycle.join(" -> ");
            let average_fan_out = cycle
                .iter()
                .filter_map(|path| metrics_by_path.get(path.as_str()))
                .map(|metrics| metrics.fan_out)
                .sum::<usize>()
                / cycle.len().max(1);

            AnalysisIssue {
                id: format!("cycle:{}", cycle.join("|")),
                issue_type: AnalysisIssueType::CircularDependency,
                title: "Circular dependency chain".into(),
                severity: Severity::High,
                confidence: Confidence::High,
                priority_score: 88.0 + average_fan_out as f32 * 2.5,
                summary: format!("Detected a circular dependency across {} modules.", cycle.len()),
                files: cycle.clone(),
                metrics: IssueMetrics {
                    cycle_size: Some(cycle.len()),
                    fan_out: Some(average_fan_out),
                    ..IssueMetrics::default()
                },
                evidence: vec![EvidenceItem {
                    label: "cycle".into(),
                    detail: joined,
                }],
                suggested_actions: vec![
                    SuggestedAction {
                        title: "Break the cycle with a boundary".into(),
                        detail: "Move shared state or DTO types into a separate module and invert one dependency edge.".into(),
                    },
                    SuggestedAction {
                        title: "Introduce a coordinator".into(),
                        detail: "Keep modules leaf-like and move orchestration into a third module.".into(),
                    },
                ],
                ai_explanation: None,
            }
        })
        .collect()
}

fn duplication_candidate_issues(models: &[SourceFileModel]) -> Vec<AnalysisIssue> {
    let mut groups = BTreeMap::<String, BTreeSet<String>>::new();

    for model in models {
        for normalized in &model.normalized_functions {
            groups
                .entry(normalized.clone())
                .or_default()
                .insert(model.analyzed.path.clone());
        }
    }

    groups
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .map(|(signature, files)| {
            let files = files.into_iter().collect::<Vec<_>>();
            AnalysisIssue {
                id: format!("duplication:{}", short_hash(&signature)),
                issue_type: AnalysisIssueType::DuplicationCandidate,
                title: "Duplication candidate cluster".into(),
                severity: Severity::Medium,
                confidence: Confidence::Heuristic,
                priority_score: 72.0 + files.len() as f32 * 3.5,
                summary: format!(
                    "{} files contain highly similar normalized function bodies.",
                    files.len()
                ),
                files: files.clone(),
                metrics: IssueMetrics {
                    duplicate_group_size: Some(files.len()),
                    ..IssueMetrics::default()
                },
                evidence: vec![EvidenceItem {
                    label: "normalized_signature".into(),
                    detail: signature.chars().take(80).collect(),
                }],
                suggested_actions: vec![
                    SuggestedAction {
                        title: "Extract a shared helper".into(),
                        detail: "Review the duplicated branch and pull the stable transformation into one utility.".into(),
                    },
                    SuggestedAction {
                        title: "Check semantic drift first".into(),
                        detail: "Because this is heuristic detection, confirm the behavior is truly shared before deduplicating.".into(),
                    },
                ],
                ai_explanation: None,
            }
        })
        .collect()
}

fn extract_imports(source: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for re in [import_from_re(), import_side_effect_re(), require_re()] {
        imports.extend(
            re.captures_iter(source)
                .filter_map(|capture| capture.get(1).map(|value| value.as_str().to_string())),
        );
    }
    imports
}

fn extract_exports(source: &str) -> Vec<String> {
    export_re()
        .captures_iter(source)
        .filter_map(|capture| capture.get(1).map(|value| value.as_str().to_string()))
        .collect()
}

fn extract_function_bodies(source: &str) -> Vec<String> {
    let mut bodies = Vec::new();
    for matched in function_decl_re()
        .find_iter(source)
        .chain(arrow_decl_re().find_iter(source))
    {
        if let Some(body) = extract_braced_block(source, matched.end() - 1) {
            bodies.push(body);
        }
    }

    bodies
}

fn extract_braced_block(source: &str, open_brace_index: usize) -> Option<String> {
    let bytes = source.as_bytes();
    let mut depth = 0usize;
    let mut end_index = None;
    for (index, byte) in bytes.iter().enumerate().skip(open_brace_index) {
        match byte {
            b'{' => depth += 1,
            b'}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    end_index = Some(index);
                    break;
                }
            }
            _ => {}
        }
    }

    end_index.map(|end| source[open_brace_index..=end].to_string())
}

fn normalize_function_body(body: &str) -> String {
    let body = string_re().replace_all(body, "\"str\"");
    let body = number_re().replace_all(&body, "0");
    let body = identifier_re().replace_all(&body, "id");
    whitespace_re().replace_all(&body, "").to_string()
}

fn resolve_local_import(
    root: &Path,
    file_path: &Path,
    import: &str,
    known_files: &HashSet<String>,
) -> Option<String> {
    if !import.starts_with('.') {
        return None;
    }

    let base = file_path.parent()?.join(import);
    let candidates = [
        base.clone(),
        base.with_extension("ts"),
        base.with_extension("tsx"),
        base.with_extension("js"),
        base.with_extension("jsx"),
        base.join("index.ts"),
        base.join("index.tsx"),
        base.join("index.js"),
        base.join("index.jsx"),
    ];

    // Membership check against the pre-collected source set instead of up to
    // 9 exists()/is_file() stat pairs per import. Candidates are converted to
    // the same normalized relative-path string form as the known set (via the
    // existing `relative_file_path` helper, which collapses `.`/`..` and
    // normalizes separators), so the comparison is deterministic regardless of
    // absolute path form or drive prefix.
    candidates
        .into_iter()
        .find_map(|candidate| {
            let relative = relative_file_path(root, &candidate);
            known_files.contains(&relative).then_some(relative)
        })
}

fn relative_file_path(root: &Path, file_path: &Path) -> String {
    let relative = file_path.strip_prefix(root).unwrap_or(file_path);
    normalize_path(relative)
}

fn normalize_path(path: &Path) -> String {
    let mut normalized = Vec::<std::ffi::OsString>::new();
    for component in path.iter() {
        match component.to_str() {
            Some(".") => {}
            Some("..") => {
                if !normalized.is_empty()
                    && normalized.last().map(|c| c.to_str()) != Some(Some(".."))
                {
                    normalized.pop();
                }
            }
            _ => normalized.push(component.to_os_string()),
        }
    }
    let path_buf: PathBuf = normalized.iter().collect();
    path_buf.to_string_lossy().replace('\\', "/")
}

fn detect_cycles(graph: &BTreeMap<String, Vec<String>>) -> Vec<Vec<String>> {
    // Tarjan's strongly-connected-components algorithm. Runs in O(V+E) and
    // finds every cyclic SCC deterministically. The previous DFS-without-a
    // "finished" set enumerated all simple paths, which degrades toward
    // exponential on dense graphs and could stack-overflow on deep chains.
    // Each non-trivial SCC (or self-loop) yields one representative cycle.
    let nodes: Vec<&String> = graph.keys().collect();
    let mut index_of: HashMap<&str, usize> = HashMap::with_capacity(nodes.len());
    for (i, node) in nodes.iter().enumerate() {
        index_of.insert(node.as_str(), i);
    }

    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); nodes.len()];
    for (i, node) in nodes.iter().enumerate() {
        if let Some(neighbors) = graph.get(*node) {
            for target in neighbors {
                if let Some(&j) = index_of.get(target.as_str()) {
                    adj[i].push(j);
                }
            }
        }
    }

    let mut state = TarjanState {
        index: 0,
        indices: vec![None; nodes.len()],
        lowlink: vec![0; nodes.len()],
        on_stack: vec![false; nodes.len()],
        stack: Vec::new(),
        cycles: Vec::new(),
        nodes: &nodes,
        adj: &adj,
    };

    for v in 0..nodes.len() {
        if state.indices[v].is_none() {
            strong_connect(v, &mut state);
        }
    }

    state.cycles
}

struct TarjanState<'a> {
    index: usize,
    indices: Vec<Option<usize>>,
    lowlink: Vec<usize>,
    on_stack: Vec<bool>,
    stack: Vec<usize>,
    cycles: Vec<Vec<String>>,
    nodes: &'a Vec<&'a String>,
    adj: &'a Vec<Vec<usize>>,
}

fn strong_connect(v: usize, state: &mut TarjanState<'_>) {
    state.indices[v] = Some(state.index);
    state.lowlink[v] = state.index;
    state.index += 1;
    state.stack.push(v);
    state.on_stack[v] = true;

    for &w in &state.adj[v] {
        match state.indices[w] {
            None => {
                strong_connect(w, state);
                state.lowlink[v] = state.lowlink[v].min(state.lowlink[w]);
            }
            Some(_) if state.on_stack[w] => {
                state.lowlink[v] = state.lowlink[v].min(state.indices[w].unwrap());
            }
            _ => {}
        }
    }

    // Root of an SCC.
    if state.lowlink[v] == state.indices[v].unwrap() {
        let mut component = Vec::new();
        loop {
            let w = state.stack.pop().expect("tarjan stack non-empty");
            state.on_stack[w] = false;
            component.push(w);
            if w == v {
                break;
            }
        }

        // Non-trivial SCC (>= 2 nodes), or a self-loop.
        let is_self_loop = component.len() == 1
            && state.adj[component[0]].iter().any(|&w| w == component[0]);
        if component.len() > 1 || is_self_loop {
            let cycle = component
                .into_iter()
                .map(|i| (*state.nodes[i]).clone())
                .collect::<Vec<_>>();
            state.cycles.push(cycle);
        }
    }
}

fn short_hash(value: &str) -> String {
    let hash = value
        .bytes()
        .fold(0u64, |acc, byte| acc.wrapping_mul(109).wrapping_add(byte as u64));
    format!("{hash:x}")
}

