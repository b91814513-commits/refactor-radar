use serde::Serialize;

use crate::{AnalysisIssueType, AnalysisResult, Severity};

#[derive(Serialize)]
pub struct SarifLog {
    pub version: String,
    #[serde(rename = "$schema")]
    pub schema: String,
    pub runs: Vec<Run>,
}

#[derive(Serialize)]
pub struct Run {
    pub tool: Tool,
    pub results: Vec<SarifResult>,
}

#[derive(Serialize)]
pub struct Tool {
    pub driver: Driver,
}

#[derive(Serialize)]
pub struct Driver {
    pub name: String,
    pub version: String,
    pub rules: Vec<ReportingRule>,
}

#[derive(Serialize)]
pub struct ReportingRule {
    pub id: String,
    pub short_description: Message,
    #[serde(rename = "defaultConfiguration")]
    pub default_configuration: RuleConfiguration,
}

#[derive(Serialize)]
pub struct RuleConfiguration {
    pub level: String,
}

#[derive(Serialize)]
pub struct SarifResult {
    pub rule_id: String,
    pub level: String,
    pub message: Message,
    pub locations: Vec<Location>,
}

#[derive(Serialize)]
pub struct Message {
    pub text: String,
}

#[derive(Serialize)]
pub struct Location {
    pub physical_location: PhysicalLocation,
}

#[derive(Serialize)]
pub struct PhysicalLocation {
    pub artifact_location: ArtifactLocation,
    pub region: Region,
}

#[derive(Serialize)]
pub struct ArtifactLocation {
    pub uri: String,
}

#[derive(Serialize)]
pub struct Region {
    pub start_line: u32,
    pub end_line: u32,
}

fn severity_to_level(severity: &Severity) -> &'static str {
    match severity {
        Severity::High => "error",
        Severity::Medium => "warning",
        Severity::Low => "note",
    }
}

fn issue_type_to_id(issue_type: &AnalysisIssueType) -> &'static str {
    match issue_type {
        AnalysisIssueType::LargeModule => "large-module",
        AnalysisIssueType::DependencyHotspot => "dependency-hotspot",
        AnalysisIssueType::CircularDependency => "circular-dependency",
        AnalysisIssueType::DuplicationCandidate => "duplication-candidate",
        AnalysisIssueType::LongParameterList => "long-parameter-list",
        AnalysisIssueType::DeepNesting => "deep-nesting",
        AnalysisIssueType::GodFunction => "god-function",
    }
}

fn issue_type_default_level(issue_type: &AnalysisIssueType) -> &'static str {
    match issue_type {
        AnalysisIssueType::LargeModule
        | AnalysisIssueType::CircularDependency
        | AnalysisIssueType::GodFunction => "error",
        AnalysisIssueType::DependencyHotspot
        | AnalysisIssueType::DuplicationCandidate
        | AnalysisIssueType::LongParameterList
        | AnalysisIssueType::DeepNesting => "warning",
    }
}

fn issue_type_description(issue_type: &AnalysisIssueType) -> &'static str {
    match issue_type {
        AnalysisIssueType::LargeModule => "Detects modules that are too large",
        AnalysisIssueType::DependencyHotspot => "Detects files with excessive dependencies",
        AnalysisIssueType::CircularDependency => "Detects circular dependency chains",
        AnalysisIssueType::DuplicationCandidate => "Detects potential code duplication",
        AnalysisIssueType::LongParameterList => "Detects functions with too many parameters",
        AnalysisIssueType::DeepNesting => "Detects deeply nested code structures",
        AnalysisIssueType::GodFunction => "Detects functions with excessive complexity",
    }
}

/// Convert an [`AnalysisResult`] into a SARIF 2.1.0 log.
#[must_use]
pub fn to_sarif(result: &AnalysisResult) -> SarifLog {
    // Collect unique issue types preserving first-seen order.
    let mut seen_types = Vec::<&AnalysisIssueType>::new();
    for issue in &result.issues {
        if !seen_types.contains(&&issue.issue_type) {
            seen_types.push(&issue.issue_type);
        }
    }

    let rules: Vec<ReportingRule> = seen_types
        .iter()
        .map(|issue_type| {
            let id = issue_type_to_id(issue_type);
            // Use the highest severity seen for this rule as the default level.
            let level = result
                .issues
                .iter()
                .filter(|i| &i.issue_type == *issue_type)
                .map(|i| severity_to_level(&i.severity))
                .min_by_key(|l| match *l {
                    "error" => 0,
                    "warning" => 1,
                    _ => 2,
                })
                .unwrap_or(issue_type_default_level(issue_type));

            ReportingRule {
                id: id.to_string(),
                short_description: Message {
                    text: issue_type_description(issue_type).to_string(),
                },
                default_configuration: RuleConfiguration {
                    level: level.to_string(),
                },
            }
        })
        .collect();

    let results: Vec<SarifResult> = result
        .issues
        .iter()
        .map(|issue| {
            let uri = issue
                .files
                .first()
                .cloned()
                .unwrap_or("unknown".to_string());

            SarifResult {
                rule_id: issue_type_to_id(&issue.issue_type).to_string(),
                level: severity_to_level(&issue.severity).to_string(),
                message: Message {
                    text: issue.summary.clone(),
                },
                locations: vec![Location {
                    physical_location: PhysicalLocation {
                        artifact_location: ArtifactLocation { uri },
                        region: Region {
                            start_line: issue.start_line.max(1).try_into().unwrap_or(u32::MAX),
                            end_line: issue.end_line.max(1).try_into().unwrap_or(u32::MAX),
                        },
                    },
                }],
            }
        })
        .collect();

    SarifLog {
        version: "2.1.0".to_string(),
        schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json".to_string(),
        runs: vec![Run {
            tool: Tool {
                driver: Driver {
                    name: "refactor-radar".to_string(),
                    version: env!("CARGO_PKG_VERSION").to_string(),
                    rules,
                },
            },
            results,
        }],
    }
}
