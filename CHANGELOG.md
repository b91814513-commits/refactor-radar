# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **3 new detection rules**: LongParameterList, DeepNesting, and GodFunction issue types
- **Configuration file support**: `.refactor-radar.toml` for customizing thresholds, enabled rules, and exclude patterns
- **Jaccard-based duplication detection**: Improved near-duplicate function detection using token-level Jaccard similarity
- **Issue line ranges**: Issues now include `startLine` and `endLine` for precise location
- **Health endpoint**: `GET /health` returns server status and version
- **CLI arguments**: Server supports `--host`, `--port`, `--data-dir`, and `--log-level` via clap
- **Structured logging**: Server uses `tracing` for structured, leveled logging
- **Graceful shutdown**: Server waits for in-flight analyses to complete before exiting
- **Dark mode**: System-aware theme with manual toggle, persisted to localStorage
- **React Router**: Multi-page routing with Dashboard, History, and Settings pages
- **Error boundaries**: React error boundaries for graceful error handling
- **Toast notifications**: User-facing toast messages for actions and errors
- **Skeleton loading**: Loading skeletons for better perceived performance
- **Settings page**: User preferences and configuration UI
- **Responsive design**: Mobile-friendly layout across all pages
- **Docker support**: Multi-stage Dockerfile and docker-compose.yml
- **CI/CD**: GitHub Actions workflow for Rust (check/test/clippy) and Frontend (build/test) across multiple platforms

### Changed

- Improved priority scoring algorithm with better weight distribution
- Enhanced duplication detection accuracy with configurable similarity threshold
- Updated dashboard with modern UI components and better visual hierarchy

### Fixed

- Various stability improvements to the analysis pipeline
- Better error messages for invalid repository paths
