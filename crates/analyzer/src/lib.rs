#![allow(clippy::cast_precision_loss)]

pub mod sarif;

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
    RE.get_or_init(|| {
        Regex::new(r#"require\(\s*["']([^"']+)["']\s*\)"#).expect("valid require regex")
    })
}

fn export_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?m)^\s*export\s+(?:async\s+)?(?:function|const|let|var|class|type)\s+([A-Za-z_][A-Za-z0-9_]*)",
        )
        .expect("valid export regex")
    })
}

fn function_decl_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?m)(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*\{",
        )
        .expect("valid function regex")
    })
}

fn arrow_decl_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?m)(?:export\s+)?(?:const|let|var)\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{",
        )
        .expect("valid arrow regex")
    })
}

fn string_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new("[\"'][^\"']*[\"']").expect("valid string regex"))
}

fn number_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\b\d+\b").expect("valid number regex"))
}

fn comment_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?s://[^\n]*|/\*.*?\*/)").expect("valid comment regex")
    })
}

fn token_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"[A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\.[0-9]+)?|[{}()\[\];,.]|(?:=>)|[+\-*/%=<>!&|^~?:]+")
            .expect("valid token regex")
    })
}

// ---- Types -------------------------------------------------------------------

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
    LongParameterList,
    DeepNesting,
    GodFunction,
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
    pub parameter_count: Option<usize>,
    pub nesting_depth: Option<usize>,
    pub complexity: Option<usize>,
    pub start_line: Option<usize>,
    pub end_line: Option<usize>,
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
    pub priority_score: f64,
    pub summary: String,
    pub files: Vec<String>,
    pub metrics: IssueMetrics,
    pub evidence: Vec<EvidenceItem>,
    pub suggested_actions: Vec<SuggestedAction>,
    pub ai_explanation: Option<AiExplanation>,
    pub start_line: usize,
    pub end_line: usize,
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

// ---- Configuration -----------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AnalyzerConfig {
    pub line_threshold: usize,
    pub function_threshold: usize,
    pub fan_in_threshold: usize,
    pub fan_out_threshold: usize,
    pub exclude_patterns: Vec<String>,
    pub enabled_rules: Vec<String>,
    pub long_parameter_list_threshold: usize,
    pub deep_nesting_threshold: usize,
    pub god_function_threshold: usize,
    pub duplication_similarity_threshold: f64,
}

impl Default for AnalyzerConfig {
    fn default() -> Self {
        Self {
            line_threshold: 45,
            function_threshold: 5,
            fan_in_threshold: 2,
            fan_out_threshold: 4,
            exclude_patterns: Vec::new(),
            enabled_rules: vec![
                "large_module".into(),
                "dependency_hotspot".into(),
                "circular_dependency".into(),
                "duplication_candidate".into(),
                "long_parameter_list".into(),
                "deep_nesting".into(),
                "god_function".into(),
            ],
            long_parameter_list_threshold: 4,
            deep_nesting_threshold: 4,
            god_function_threshold: 10,
            duplication_similarity_threshold: 0.7,
        }
    }
}

/// Load analyzer configuration from a TOML file.
///
/// # Errors
///
/// Returns an error if the config file cannot be read or contains invalid TOML.
pub fn load_config(path: &Path) -> Result<AnalyzerConfig> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("failed to read config file {}", path.display()))?;
    let config: AnalyzerConfig = toml::from_str(&content)
        .with_context(|| format!("failed to parse config file {}", path.display()))?;
    Ok(config)
}

// ---- Analyzer ---------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct Analyzer {
    config: AnalyzerConfig,
}



impl Analyzer {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    #[must_use]
    pub fn with_config(config: AnalyzerConfig) -> Self {
        Self { config }
    }

    /// Analyze a repository and return a structured analysis result.
    ///
    /// # Errors
    ///
    /// Returns an error if the repository path is invalid or analysis fails.
    pub fn analyze_repo<P: AsRef<Path>>(&self, repo_path: P) -> Result<AnalysisResult> {
        self.analyze_repo_with_progress(repo_path, |_| {})
    }

    /// Analyze a repository with progress reporting.
    ///
    /// # Errors
    ///
    /// Returns an error if the repository path is invalid or analysis fails.
    pub fn analyze_repo_with_progress<P, F>(
        &self,
        repo_path: P,
        mut progress: F,
    ) -> Result<AnalysisResult>
    where
        P: AsRef<Path>,
        F: FnMut(AnalysisPhase),
    {
        let root = repo_path.as_ref();
        progress(AnalysisPhase::Discovery);
        validate_repo(root)?;
        let source_files = collect_source_files(root, &self.config.exclude_patterns)?;
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
        if self.config.enabled_rules.contains(&"large_module".into()) {
            issues.extend(self.large_module_issues(&models));
        }
        if self.config.enabled_rules.contains(&"dependency_hotspot".into()) {
            issues.extend(self.dependency_hotspot_issues(&models));
        }
        if self.config.enabled_rules.contains(&"circular_dependency".into()) {
            issues.extend(circular_dependency_issues(&graph, &models));
        }
        if self.config.enabled_rules.contains(&"duplication_candidate".into()) {
            issues.extend(duplication_candidate_issues(
                &models,
                self.config.duplication_similarity_threshold,
            ));
        }
        if self.config.enabled_rules.contains(&"long_parameter_list".into()) {
            issues.extend(long_parameter_list_issues(
                &models,
                self.config.long_parameter_list_threshold,
            ));
        }
        if self.config.enabled_rules.contains(&"deep_nesting".into()) {
            issues.extend(deep_nesting_issues(
                &models,
                self.config.deep_nesting_threshold,
            ));
        }
        if self.config.enabled_rules.contains(&"god_function".into()) {
            issues.extend(god_function_issues(
                &models,
                self.config.god_function_threshold,
            ));
        }

        progress(AnalysisPhase::Scoring);
        improve_scoring(&mut issues, &models);
        issues.sort_by(|left, right| {
            right
                .priority_score
                .total_cmp(&left.priority_score)
                .then_with(|| left.title.cmp(&right.title))
        });

        let files = models
            .into_iter()
            .map(|model| model.analyzed)
            .collect::<Vec<_>>();
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

    #[allow(clippy::unused_self)]
    fn parse_file(
        &self,
        root: &Path,
        file_path: &Path,
        known_files: &HashSet<String>,
    ) -> Result<SourceFileModel> {
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
        let function_infos = extract_function_infos(&source);

        let function_lengths = function_infos
            .iter()
            .map(|fi| fi.end_line - fi.start_line + 1)
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
            function_infos,
        })
    }

    fn large_module_issues(&self, models: &[SourceFileModel]) -> Vec<AnalysisIssue> {
        models
            .iter()
            .filter_map(|model| {
                let metrics = &model.analyzed.metrics;
                let too_large = metrics.line_count >= self.config.line_threshold
                    || metrics.function_count >= self.config.function_threshold
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
                        + metrics.line_count as f64 / 25.0
                        + metrics.function_count as f64 * 1.8,
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
                        start_line: Some(1),
                        end_line: Some(metrics.line_count),
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
                    start_line: 1,
                    end_line: metrics.line_count,
                })
            })
            .collect()
    }

    fn dependency_hotspot_issues(&self, models: &[SourceFileModel]) -> Vec<AnalysisIssue> {
        models
            .iter()
            .filter_map(|model| {
                let metrics = &model.analyzed.metrics;
                let hotspot = metrics.fan_in >= self.config.fan_in_threshold
                    || metrics.fan_out >= self.config.fan_out_threshold
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
                    priority_score: 80.0 + (metrics.fan_in * 4 + metrics.fan_out * 3) as f64,
                    summary: format!(
                        "{} has fan-in {} and fan-out {}, making it a structural hotspot.",
                        model.analyzed.path, metrics.fan_in, metrics.fan_out
                    ),
                    files: vec![model.analyzed.path.clone()],
                    metrics: IssueMetrics {
                        fan_in: Some(metrics.fan_in),
                        fan_out: Some(metrics.fan_out),
                        start_line: Some(1),
                        end_line: Some(1),
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
                    start_line: 1,
                    end_line: 1,
                })
            })
            .collect()
    }
}

// ---- Source file model -------------------------------------------------------

#[derive(Debug, Clone)]
struct SourceFileModel {
    analyzed: AnalyzedFile,
    function_infos: Vec<FunctionInfo>,
}

#[derive(Debug, Clone)]
struct FunctionInfo {
    start_line: usize,
    end_line: usize,
    param_count: usize,
    max_nesting: usize,
    complexity: usize,
    body: String,
}


// ---- File collection ---------------------------------------------------------

fn validate_repo(root: &Path) -> Result<()> {
    if !root.exists() {
        return Err(anyhow!(
            "repository path does not exist: {}",
            root.display()
        ));
    }

    let has_repo_markers = root.join("package.json").exists()
        || root.join("tsconfig.json").exists()
        || collect_source_files(root, &[])
            .is_ok_and(|files| !files.is_empty());

    if !has_repo_markers {
        return Err(anyhow!(
            "path does not look like a JS/TS repository: {}",
            root.display()
        ));
    }

    Ok(())
}

fn collect_source_files(root: &Path, exclude_patterns: &[String]) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    visit_directory(root, root, &mut files, exclude_patterns)?;
    files.sort();
    Ok(files)
}

fn visit_directory(
    root: &Path,
    current: &Path,
    files: &mut Vec<PathBuf>,
    exclude_patterns: &[String],
) -> Result<()> {
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
            visit_directory(root, &path, files, exclude_patterns)?;
            continue;
        }

        if is_source_file(&path) && !is_excluded(root, &path, exclude_patterns) {
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

fn is_excluded(root: &Path, file_path: &Path, patterns: &[String]) -> bool {
    if patterns.is_empty() {
        return false;
    }
    let relative = relative_file_path(root, file_path);
    patterns.iter().any(|pattern| {
        let regex_str = glob_to_regex(pattern);
        Regex::new(&regex_str)
            .is_ok_and(|re| re.is_match(&relative))
    })
}

fn glob_to_regex(glob: &str) -> String {
    let mut regex = String::from("(?i)^");
    let chars: Vec<char> = glob.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '*' => {
                if i + 1 < chars.len() && chars[i + 1] == '*' {
                    regex.push_str(".*");
                    i += 1;
                    if i + 1 < chars.len() && chars[i + 1] == '/' {
                        i += 1;
                    }
                } else {
                    regex.push_str("[^/]*");
                }
            }
            '?' => regex.push_str("[^/]"),
            '.' => regex.push_str("\\."),
            c => regex.push(c),
        }
        i += 1;
    }
    regex.push('$');
    regex
}

// ---- Graph -------------------------------------------------------------------

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
            .map_or(0, Vec::len);
        model.analyzed.metrics.fan_in = fan_in.get(&model.analyzed.path).copied().unwrap_or(0);
    }
}

// ---- New detection rules -----------------------------------------------------

fn long_parameter_list_issues(
    models: &[SourceFileModel],
    threshold: usize,
) -> Vec<AnalysisIssue> {
    let mut issues = Vec::new();
    for model in models {
        for func in &model.function_infos {
            if func.param_count > threshold {
                issues.push(AnalysisIssue {
                    id: format!(
                        "long-params:{}:{}",
                        model.analyzed.path, func.start_line
                    ),
                    issue_type: AnalysisIssueType::LongParameterList,
                    title: format!(
                        "Long parameter list in {} ({} params)",
                        model.analyzed.path, func.param_count
                    ),
                    severity: Severity::Medium,
                    confidence: Confidence::Heuristic,
                    priority_score: 60.0 + (func.param_count - threshold) as f64 * 5.0,
                    summary: format!(
                        "Function at {}:{} has {} parameters, exceeding the threshold of {}.",
                        model.analyzed.path, func.start_line, func.param_count, threshold
                    ),
                    files: vec![model.analyzed.path.clone()],
                    metrics: IssueMetrics {
                        parameter_count: Some(func.param_count),
                        start_line: Some(func.start_line),
                        end_line: Some(func.end_line),
                        ..IssueMetrics::default()
                    },
                    evidence: vec![EvidenceItem {
                        label: "param_count".into(),
                        detail: func.param_count.to_string(),
                    }],
                    suggested_actions: vec![
                        SuggestedAction {
                            title: "Group parameters into an options object".into(),
                            detail: "Bundle related parameters into a configuration struct to reduce the function signature.".into(),
                        },
                        SuggestedAction {
                            title: "Split the function".into(),
                            detail: "Consider whether the function is doing too many things and can be decomposed.".into(),
                        },
                    ],
                    ai_explanation: None,
                    start_line: func.start_line,
                    end_line: func.end_line,
                });
            }
        }
    }
    issues
}

fn deep_nesting_issues(
    models: &[SourceFileModel],
    threshold: usize,
) -> Vec<AnalysisIssue> {
    let mut issues = Vec::new();
    for model in models {
        for func in &model.function_infos {
            if func.max_nesting > threshold {
                issues.push(AnalysisIssue {
                    id: format!(
                        "deep-nesting:{}:{}",
                        model.analyzed.path, func.start_line
                    ),
                    issue_type: AnalysisIssueType::DeepNesting,
                    title: format!(
                        "Deep nesting in {} (depth {})",
                        model.analyzed.path, func.max_nesting
                    ),
                    severity: Severity::Medium,
                    confidence: Confidence::Heuristic,
                    priority_score: 55.0 + (func.max_nesting - threshold) as f64 * 8.0,
                    summary: format!(
                        "Function at {}:{} has nesting depth {}, exceeding the threshold of {}.",
                        model.analyzed.path, func.start_line, func.max_nesting, threshold
                    ),
                    files: vec![model.analyzed.path.clone()],
                    metrics: IssueMetrics {
                        nesting_depth: Some(func.max_nesting),
                        start_line: Some(func.start_line),
                        end_line: Some(func.end_line),
                        ..IssueMetrics::default()
                    },
                    evidence: vec![EvidenceItem {
                        label: "max_nesting_depth".into(),
                        detail: func.max_nesting.to_string(),
                    }],
                    suggested_actions: vec![
                        SuggestedAction {
                            title: "Extract nested logic into helper functions".into(),
                            detail: "Pull deeply nested branches into well-named helper functions to flatten the control flow.".into(),
                        },
                        SuggestedAction {
                            title: "Use early returns".into(),
                            detail: "Replace nested if-else with guard clauses and early returns.".into(),
                        },
                    ],
                    ai_explanation: None,
                    start_line: func.start_line,
                    end_line: func.end_line,
                });
            }
        }
    }
    issues
}

fn god_function_issues(
    models: &[SourceFileModel],
    threshold: usize,
) -> Vec<AnalysisIssue> {
    let mut issues = Vec::new();
    for model in models {
        for func in &model.function_infos {
            if func.complexity > threshold {
                issues.push(AnalysisIssue {
                    id: format!(
                        "god-func:{}:{}",
                        model.analyzed.path, func.start_line
                    ),
                    issue_type: AnalysisIssueType::GodFunction,
                    title: format!(
                        "God function in {} (complexity {})",
                        model.analyzed.path, func.complexity
                    ),
                    severity: Severity::High,
                    confidence: Confidence::Heuristic,
                    priority_score: 75.0 + (func.complexity - threshold) as f64 * 3.0,
                    summary: format!(
                        "Function at {}:{} has complexity score {}, exceeding the threshold of {}.",
                        model.analyzed.path, func.start_line, func.complexity, threshold
                    ),
                    files: vec![model.analyzed.path.clone()],
                    metrics: IssueMetrics {
                        complexity: Some(func.complexity),
                        start_line: Some(func.start_line),
                        end_line: Some(func.end_line),
                        ..IssueMetrics::default()
                    },
                    evidence: vec![EvidenceItem {
                        label: "complexity_score".into(),
                        detail: func.complexity.to_string(),
                    }],
                    suggested_actions: vec![
                        SuggestedAction {
                            title: "Decompose the function".into(),
                            detail: "Break the function into smaller, single-responsibility helper functions.".into(),
                        },
                        SuggestedAction {
                            title: "Apply strategy pattern".into(),
                            detail: "Replace complex conditional logic with polymorphic dispatch or a strategy map.".into(),
                        },
                    ],
                    ai_explanation: None,
                    start_line: func.start_line,
                    end_line: func.end_line,
                });
            }
        }
    }
    issues
}

// ---- Improved duplication detection (Jaccard) --------------------------------

#[allow(clippy::too_many_lines)]
fn duplication_candidate_issues(
    models: &[SourceFileModel],
    similarity_threshold: f64,
) -> Vec<AnalysisIssue> {
    // Collect all functions across files with their token sets
    let mut all_funcs: Vec<(&str, usize, usize, &str, HashSet<String>)> = Vec::new();
    for model in models {
        for func in &model.function_infos {
            let tokens = tokenize_for_jaccard(&func.body);
            if tokens.len() >= 8 {
                all_funcs.push((
                    &model.analyzed.path,
                    func.start_line,
                    func.end_line,
                    &func.body,
                    tokens,
                ));
            }
        }
    }

    // Compare all pairs
    let mut flagged_pairs: Vec<(usize, usize, f64)> = Vec::new();
    for i in 0..all_funcs.len() {
        for j in (i + 1)..all_funcs.len() {
            let sim = jaccard_similarity(&all_funcs[i].4, &all_funcs[j].4);
            if sim > similarity_threshold {
                flagged_pairs.push((i, j, sim));
            }
        }
    }

    if flagged_pairs.is_empty() {
        return Vec::new();
    }

    // Group flagged functions using union-find approach
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut assigned = vec![false; all_funcs.len()];

    for &(i, j, _) in &flagged_pairs {
        let gi = groups.iter().position(|g| g.contains(&i));
        let gj = groups.iter().position(|g| g.contains(&j));
        match (gi, gj) {
            (Some(a), Some(b)) if a == b => {}
            (Some(a), Some(b)) => {
                let merged_b = groups[b].clone();
                groups[a].extend(merged_b);
                groups.remove(b);
            }
            (Some(a), None) => groups[a].push(j),
            (None, Some(b)) => groups[b].push(i),
            (None, None) => groups.push(vec![i, j]),
        }
    }

    // Mark assigned
    for group in &groups {
        for &idx in group {
            assigned[idx] = true;
        }
    }

    groups
        .into_iter()
        .map(|group| {
            let files: Vec<String> = group
                .iter()
                .map(|&i| all_funcs[i].0.to_string())
                .collect();
            let min_start = group.iter().map(|&i| all_funcs[i].1).min().unwrap_or(1);
            let max_end = group.iter().map(|&i| all_funcs[i].2).max().unwrap_or(1);
            let avg_sim = if flagged_pairs.is_empty() {
                0.0
            } else {
                let relevant: Vec<f64> = flagged_pairs
                    .iter()
                    .filter(|(i, j, _)| group.contains(i) || group.contains(j))
                    .map(|(_, _, s)| *s)
                    .collect();
                if relevant.is_empty() {
                    0.0
                } else {
                    relevant.iter().sum::<f64>() / relevant.len() as f64
                }
            };

            AnalysisIssue {
                id: format!("duplication:{}:{}:{}", files.join(","), min_start, max_end),
                issue_type: AnalysisIssueType::DuplicationCandidate,
                title: "Duplication candidate cluster".into(),
                severity: Severity::Medium,
                confidence: Confidence::Heuristic,
                priority_score: 72.0 + files.len() as f64 * 3.5,
                summary: format!(
                    "{} functions across {} files have high token-level similarity (avg Jaccard > {:.2}).",
                    group.len(),
                    files.len(),
                    similarity_threshold
                ),
                files,
                metrics: IssueMetrics {
                    duplicate_group_size: Some(group.len()),
                    start_line: Some(min_start),
                    end_line: Some(max_end),
                    ..IssueMetrics::default()
                },
                evidence: vec![EvidenceItem {
                    label: "avg_jaccard_similarity".into(),
                    detail: format!("{avg_sim:.3}"),
                }],
                suggested_actions: vec![
                    SuggestedAction {
                        title: "Extract a shared helper".into(),
                        detail: "Review the duplicated code and pull the stable transformation into one utility.".into(),
                    },
                    SuggestedAction {
                        title: "Check semantic drift first".into(),
                        detail: "Because this is heuristic detection, confirm the behavior is truly shared before deduplicating.".into(),
                    },
                ],
                ai_explanation: None,
                start_line: min_start,
                end_line: max_end,
            }
        })
        .collect()
}

fn tokenize_for_jaccard(body: &str) -> HashSet<String> {
    let stripped = comment_re().replace_all(body, "");
    let stripped = string_re().replace_all(&stripped, "\"S\"");
    let stripped = number_re().replace_all(&stripped, "0");
    token_re()
        .find_iter(&stripped)
        .map(|m| m.as_str().to_string())
        .collect()
}

fn jaccard_similarity(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    let intersection = a.intersection(b).count();
    let union = a.union(b).count();
    if union == 0 {
        return 0.0;
    }
    intersection as f64 / union as f64
}

// ---- Existing rules (circular deps) -----------------------------------------

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
        .map(|mut cycle| {
            cycle.sort();
            let members_display = cycle.join(", ");
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
                priority_score: 88.0 + average_fan_out as f64 * 2.5,
                summary: format!("Detected a circular dependency across {} modules.", cycle.len()),
                files: cycle.clone(),
                metrics: IssueMetrics {
                    cycle_size: Some(cycle.len()),
                    fan_out: Some(average_fan_out),
                    start_line: Some(1),
                    end_line: Some(1),
                    ..IssueMetrics::default()
                },
                evidence: vec![EvidenceItem {
                    label: "scc_members".into(),
                    detail: members_display,
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
                start_line: 1,
                end_line: 1,
            }
        })
        .collect()
}

// ---- Improved scoring --------------------------------------------------------

fn improve_scoring(issues: &mut [AnalysisIssue], models: &[SourceFileModel]) {
    let total_lines: usize = models
        .iter()
        .map(|m| m.analyzed.metrics.line_count)
        .sum::<usize>();
    let issue_count = issues.len().max(1);
    let issue_density = issue_count as f64 / (total_lines.max(1) as f64 / 100.0);

    let file_metrics: HashMap<String, &FileMetrics> = models
        .iter()
        .map(|m| (m.analyzed.path.clone(), &m.analyzed.metrics))
        .collect();

    for issue in issues.iter_mut() {
        let severity_weight: f64 = match issue.severity {
            Severity::High => 1.5,
            Severity::Medium => 1.0,
            Severity::Low => 0.7,
        };

        let file_modifier = issue
            .files
            .first()
            .and_then(|path| file_metrics.get(path))
            .map_or(0.0, |metrics| {
                let size_factor = (metrics.line_count as f64 / 100.0).min(2.0);
                let dep_factor = (metrics.fan_in + metrics.fan_out) as f64 * 0.3;
                size_factor + dep_factor
            });

        let density_factor = issue_density.min(3.0);

        issue.priority_score =
            (issue.priority_score * severity_weight / 1.5 + file_modifier + density_factor).min(100.0);
    }
}

// ---- Extraction helpers ------------------------------------------------------

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

fn extract_function_infos(source: &str) -> Vec<FunctionInfo> {
    let mut infos = Vec::new();
    for matched in function_decl_re()
        .find_iter(source)
        .chain(arrow_decl_re().find_iter(source))
    {
        if let Some(body) = extract_braced_block(source, matched.end() - 1) {
            let start_line = line_number_at(source, matched.start());
            let end_line = line_number_at(source, matched.end());
            let param_count = count_params(&source[matched.start()..matched.end()]);
            let max_nesting = compute_max_nesting(&body);
            let complexity = compute_complexity(&body);
            infos.push(FunctionInfo {
                start_line,
                end_line,
                param_count,
                max_nesting,
                complexity,
                body,
            });
        }
    }
    infos
}

fn line_number_at(source: &str, byte_offset: usize) -> usize {
    source[..byte_offset.min(source.len())]
        .bytes()
        .filter(|&b| b == b'\n')
        .count()
        + 1
}

fn count_params(match_text: &str) -> usize {
    let Some(paren_start) = match_text.find('(') else {
        return 0;
    };
    let Some(paren_end) = match_text.rfind(')') else {
        return 0;
    };
    if paren_end <= paren_start + 1 {
        return 0;
    }
    let params_str = &match_text[paren_start + 1..paren_end];
    let trimmed = params_str.trim();
    if trimmed.is_empty() {
        return 0;
    }

    let mut count = 1;
    let mut depth = 0i32;
    for ch in trimmed.chars() {
        match ch {
            '(' | '<' | '[' | '{' => depth += 1,
            ')' | '>' | ']' | '}' => depth -= 1,
            ',' if depth == 0 => count += 1,
            _ => {}
        }
    }
    count
}

fn compute_max_nesting(body: &str) -> usize {
    let mut max_depth = 0usize;
    let mut current_depth = 0usize;
    let mut in_string = false;
    let mut string_char: u8 = 0;
    let bytes = body.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if in_string {
            if b == b'\\' {
                i += 1;
            } else if b == string_char {
                in_string = false;
            }
        } else {
            match b {
                b'"' | b'\'' | b'`' => {
                    in_string = true;
                    string_char = b;
                }
                b'{' => {
                    current_depth += 1;
                    if current_depth > max_depth {
                        max_depth = current_depth;
                    }
                }
                b'}' => {
                    current_depth = current_depth.saturating_sub(1);
                }
                _ => {}
            }
        }
        i += 1;
    }
    max_depth.saturating_sub(1)
}

fn complexity_if_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bif\b").expect("valid regex"))
}

fn complexity_else_if_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\belse\s+if\b").expect("valid regex"))
}

fn complexity_switch_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bswitch\b").expect("valid regex"))
}

fn complexity_case_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bcase\b").expect("valid regex"))
}

fn complexity_for_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bfor\b").expect("valid regex"))
}

fn complexity_while_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bwhile\b").expect("valid regex"))
}

fn complexity_do_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bdo\b").expect("valid regex"))
}

fn complexity_catch_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bcatch\b").expect("valid regex"))
}

fn complexity_ternary_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\?[^?]").expect("valid regex"))
}

fn compute_complexity(body: &str) -> usize {
    let stripped = comment_re().replace_all(body, "");
    let mut complexity = 0usize;
    for re in [
        complexity_if_re(),
        complexity_else_if_re(),
        complexity_switch_re(),
        complexity_case_re(),
        complexity_for_re(),
        complexity_while_re(),
        complexity_do_re(),
        complexity_catch_re(),
        complexity_ternary_re(),
    ] {
        complexity += re.find_iter(&stripped).count();
    }
    complexity
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


// ---- Import resolution -------------------------------------------------------

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

    candidates.into_iter().find_map(|candidate| {
        let relative = relative_file_path(root, &candidate);
        known_files.contains(&relative).then_some(relative)
    })
}

// ---- Path utilities ----------------------------------------------------------

fn relative_file_path(root: &Path, file_path: &Path) -> String {
    let relative = file_path.strip_prefix(root).unwrap_or(file_path);
    normalize_path(relative)
}

fn normalize_path(path: &Path) -> String {
    let mut normalized = Vec::<std::ffi::OsString>::new();
    for component in path {
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

// ---- Tarjan's SCC ------------------------------------------------------------

fn detect_cycles(graph: &BTreeMap<String, Vec<String>>) -> Vec<Vec<String>> {
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

        let is_self_loop =
            component.len() == 1 && state.adj[component[0]].iter().any(|&w| w == component[0]);
        if component.len() > 1 || is_self_loop {
            let cycle = component
                .into_iter()
                .map(|i| (*state.nodes[i]).clone())
                .collect::<Vec<_>>();
            state.cycles.push(cycle);
        }
    }
}

// ---- Misc utilities ----------------------------------------------------------


