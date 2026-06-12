use std::path::PathBuf;

use analyzer::{AnalysisIssueType, Analyzer};

fn fixture_repo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("sample_repo")
}

#[test]
fn detects_repository_and_excludes_generated_directories() {
    let result = Analyzer::default()
        .analyze_repo(fixture_repo())
        .expect("fixture analysis should succeed");

    assert!(result.summary.file_count >= 8);
    assert!(
        result
            .files
            .iter()
            .all(|file| !file.path.contains("dist/generated.js"))
    );
}

#[test]
fn emits_large_module_and_dependency_findings() {
    let result = Analyzer::default()
        .analyze_repo(fixture_repo())
        .expect("fixture analysis should succeed");

    assert!(result.issues.iter().any(|issue| {
        issue.issue_type == AnalysisIssueType::LargeModule
            && issue.files.iter().any(|file| file.ends_with("src/services/userService.ts"))
    }));

    assert!(result.issues.iter().any(|issue| {
        issue.issue_type == AnalysisIssueType::DependencyHotspot
            && issue.files.iter().any(|file| file.ends_with("src/core/logger.ts"))
    }));
}

#[test]
fn detects_circular_dependencies_and_duplication_candidates() {
    let result = Analyzer::default()
        .analyze_repo(fixture_repo())
        .expect("fixture analysis should succeed");

    assert!(result
        .issues
        .iter()
        .any(|issue| issue.issue_type == AnalysisIssueType::CircularDependency));

    assert!(result
        .issues
        .iter()
        .any(|issue| issue.issue_type == AnalysisIssueType::DuplicationCandidate));
}

