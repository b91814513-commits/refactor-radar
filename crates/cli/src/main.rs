use std::path::PathBuf;
use std::process;

use anyhow::{Context, Result};
use clap::Parser;

use analyzer::{Analyzer, AnalyzerConfig, Severity};

#[derive(Parser)]
#[command(
    name = "refactor-radar",
    about = "Static analysis tool for JS/TS refactoring opportunities"
)]
struct Cli {
    /// Path to the repository to analyze
    repo_path: PathBuf,

    /// Path to configuration file (.refactor-radar.toml)
    #[arg(long)]
    config: Option<PathBuf>,

    /// Output format
    #[arg(long, default_value = "json")]
    format: OutputFormat,
}

#[derive(Clone, Debug, clap::ValueEnum)]
enum OutputFormat {
    Json,
    Sarif,
    Summary,
}

fn run(cli: &Cli) -> Result<analyzer::AnalysisResult> {
    let config = match &cli.config {
        Some(config_path) => analyzer::load_config(config_path)
            .with_context(|| format!("failed to load config from {}", config_path.display()))?,
        None => AnalyzerConfig::default(),
    };

    let analyzer = Analyzer::with_config(config);
    let result = analyzer
        .analyze_repo(&cli.repo_path)
        .with_context(|| format!("failed to analyze {}", cli.repo_path.display()))?;

    Ok(result)
}

fn print_summary(result: &analyzer::AnalysisResult) {
    let high = result
        .issues
        .iter()
        .filter(|i| i.severity == Severity::High)
        .count();
    let medium = result
        .issues
        .iter()
        .filter(|i| i.severity == Severity::Medium)
        .count();
    let low = result
        .issues
        .iter()
        .filter(|i| i.severity == Severity::Low)
        .count();

    println!("Refactor Radar Analysis Summary");
    println!("==============================");
    println!("Files analyzed: {}", result.summary.file_count);
    println!("Total issues:   {}", result.issues.len());
    println!("  High:   {high}");
    println!("  Medium: {medium}");
    println!("  Low:    {low}");
    println!();

    if !result.issues.is_empty() {
        println!("Top issues:");
        for issue in result.issues.iter().take(10) {
            let severity_label = match issue.severity {
                Severity::High => "HIGH",
                Severity::Medium => "MED",
                Severity::Low => "LOW",
            };
            println!("  [{severity_label}] {}", issue.title);
        }
    }
}

fn exit_code_for_result(result: &analyzer::AnalysisResult) -> i32 {
    let has_high = result
        .issues
        .iter()
        .any(|i| i.severity == Severity::High);
    if has_high {
        return 1;
    }

    let has_medium = result
        .issues
        .iter()
        .any(|i| i.severity == Severity::Medium);
    if has_medium {
        return 2;
    }

    let has_low = result
        .issues
        .iter()
        .any(|i| i.severity == Severity::Low);
    if has_low {
        return 3;
    }

    0
}

fn main() {
    let cli = Cli::parse();

    if !cli.repo_path.exists() {
        eprintln!("error: path does not exist: {}", cli.repo_path.display());
        process::exit(128);
    }

    let result = match run(&cli) {
        Ok(r) => r,
        Err(err) => {
            eprintln!("error: {err:#}");
            process::exit(128);
        }
    };

    match cli.format {
        OutputFormat::Json => {
            let json = serde_json::to_string_pretty(&result);
            match json {
                Ok(s) => println!("{s}"),
                Err(e) => {
                    eprintln!("error: failed to serialize result: {e}");
                    process::exit(128);
                }
            }
        }
        OutputFormat::Sarif => {
            let sarif = analyzer::sarif::to_sarif(&result);
            let json = serde_json::to_string_pretty(&sarif);
            match json {
                Ok(s) => println!("{s}"),
                Err(e) => {
                    eprintln!("error: failed to serialize SARIF output: {e}");
                    process::exit(128);
                }
            }
        }
        OutputFormat::Summary => {
            print_summary(&result);
        }
    }

    process::exit(exit_code_for_result(&result));
}
