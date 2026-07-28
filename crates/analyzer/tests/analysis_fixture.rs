use std::path::PathBuf;

use analyzer::{AnalysisIssueType, Analyzer, AnalyzerConfig, load_config};

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
    assert!(result
        .files
        .iter()
        .all(|file| !file.path.contains("dist/generated.js")));
}

#[test]
fn emits_large_module_and_dependency_findings() {
    let result = Analyzer::default()
        .analyze_repo(fixture_repo())
        .expect("fixture analysis should succeed");

    assert!(result.issues.iter().any(|issue| {
        issue.issue_type == AnalysisIssueType::LargeModule
            && issue
                .files
                .iter()
                .any(|file| file.ends_with("src/services/userService.ts"))
    }));

    assert!(result.issues.iter().any(|issue| {
        issue.issue_type == AnalysisIssueType::DependencyHotspot
            && issue
                .files
                .iter()
                .any(|file| file.ends_with("src/core/logger.ts"))
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

// ---- New tests for config support -------------------------------------------

#[test]
fn config_loading_from_toml_file() {
    let config_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests");
    let config_path = config_dir.join("test_config.toml");

    let toml_content = r#"
lineThreshold = 100
functionThreshold = 10
fanInThreshold = 5
fanOutThreshold = 8
longParameterListThreshold = 3
deepNestingThreshold = 3
godFunctionThreshold = 5
enabledRules = ["large_module", "dependency_hotspot"]
"#;
    std::fs::write(&config_path, toml_content).expect("write temp config");

    let config = load_config(&config_path).expect("config should load");
    assert_eq!(config.line_threshold, 100);
    assert_eq!(config.function_threshold, 10);
    assert_eq!(config.fan_in_threshold, 5);
    assert_eq!(config.fan_out_threshold, 8);
    assert_eq!(config.long_parameter_list_threshold, 3);
    assert_eq!(config.deep_nesting_threshold, 3);
    assert_eq!(config.god_function_threshold, 5);
    assert_eq!(config.enabled_rules.len(), 2);

    // Use the config and verify thresholds are applied
    let analyzer = Analyzer::with_config(config);
    let result = analyzer.analyze_repo(fixture_repo()).expect("analysis should succeed");

    // With line_threshold=100 and function_threshold=10, fewer LargeModule issues
    // Note: export_count >= 4 is still hardcoded, so some files may still trigger
    let large_module_count = result.issues.iter()
        .filter(|i| i.issue_type == AnalysisIssueType::LargeModule)
        .count();
    // Default analyzer would flag more files; with high thresholds only export-heavy files remain
    assert!(
        large_module_count <= 1,
        "expected at most 1 LargeModule issue with high thresholds, got {large_module_count}"
    );

    // Cleanup
    let _ = std::fs::remove_file(&config_path);
}

// ---- New tests for new rules ------------------------------------------------

#[test]
fn detects_long_parameter_list() {
    let result = Analyzer::default()
        .analyze_repo(fixture_repo())
        .expect("fixture analysis should succeed");

    // complex.ts has complexProcessor with 5 params (default threshold is 4)
    assert!(
        result.issues.iter().any(|issue| {
            issue.issue_type == AnalysisIssueType::LongParameterList
                && issue.files.iter().any(|f| f.ends_with("src/utils/complex.ts"))
        }),
        "should detect long parameter list in complex.ts"
    );
}

#[test]
fn detects_deep_nesting() {
    let result = Analyzer::default()
        .analyze_repo(fixture_repo())
        .expect("fixture analysis should succeed");

    // complex.ts has 5+ levels of nesting (default threshold is 4)
    assert!(
        result.issues.iter().any(|issue| {
            issue.issue_type == AnalysisIssueType::DeepNesting
                && issue.files.iter().any(|f| f.ends_with("src/utils/complex.ts"))
        }),
        "should detect deep nesting in complex.ts"
    );
}

#[test]
fn detects_god_function() {
    let result = Analyzer::default()
        .analyze_repo(fixture_repo())
        .expect("fixture analysis should succeed");

    // complex.ts has complexProcessor with many branches (default threshold is 10)
    assert!(
        result.issues.iter().any(|issue| {
            issue.issue_type == AnalysisIssueType::GodFunction
                && issue.files.iter().any(|f| f.ends_with("src/utils/complex.ts"))
        }),
        "should detect god function in complex.ts"
    );
}

// ---- Line range information -------------------------------------------------

#[test]
fn issues_have_line_range_information() {
    let result = Analyzer::default()
        .analyze_repo(fixture_repo())
        .expect("fixture analysis should succeed");

    assert!(!result.issues.is_empty(), "should have issues");

    for issue in &result.issues {
        assert!(
            issue.start_line > 0,
            "issue {} should have start_line > 0, got {}",
            issue.id,
            issue.start_line
        );
        assert!(
            issue.end_line >= issue.start_line,
            "issue {} should have end_line >= start_line",
            issue.id
        );
    }

    // Check LargeModule has full file range
    let large_module = result
        .issues
        .iter()
        .find(|i| i.issue_type == AnalysisIssueType::LargeModule)
        .expect("should have a LargeModule issue");
    assert_eq!(large_module.start_line, 1);
    assert!(large_module.end_line > 1);

    // Check new rules have specific line ranges
    let long_params = result
        .issues
        .iter()
        .find(|i| i.issue_type == AnalysisIssueType::LongParameterList)
        .expect("should have a LongParameterList issue");
    assert!(long_params.start_line > 1, "function should not start at line 1");
}

// ---- Disabled rules ---------------------------------------------------------

#[test]
fn disabled_rules_do_not_produce_issues() {
    let config = AnalyzerConfig {
        enabled_rules: vec!["large_module".into()],
        ..AnalyzerConfig::default()
    };
    let analyzer = Analyzer::with_config(config);
    let result = analyzer
        .analyze_repo(fixture_repo())
        .expect("analysis should succeed");

    // Only LargeModule issues should be present
    assert!(
        result.issues.iter().all(|i| i.issue_type == AnalysisIssueType::LargeModule),
        "only LargeModule issues expected when other rules are disabled"
    );

    // Specifically, no new rule issues
    assert!(!result.issues.iter().any(|i| i.issue_type == AnalysisIssueType::LongParameterList));
    assert!(!result.issues.iter().any(|i| i.issue_type == AnalysisIssueType::DeepNesting));
    assert!(!result.issues.iter().any(|i| i.issue_type == AnalysisIssueType::GodFunction));
    assert!(!result.issues.iter().any(|i| i.issue_type == AnalysisIssueType::CircularDependency));
    assert!(!result.issues.iter().any(|i| i.issue_type == AnalysisIssueType::DuplicationCandidate));
}

#[test]
fn backward_compatible_default_analyzer() {
    // Ensure Analyzer::new() works the same as Analyzer::default()
    let result_new = Analyzer::new()
        .analyze_repo(fixture_repo())
        .expect("analysis should succeed");
    let result_default = Analyzer::default()
        .analyze_repo(fixture_repo())
        .expect("analysis should succeed");

    assert_eq!(result_new.summary.issue_count, result_default.summary.issue_count);
    assert_eq!(result_new.summary.file_count, result_default.summary.file_count);
}
