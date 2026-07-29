# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Project Overview

**Refactor Radar** — a local-first static analysis tool that scans JS/TS codebases (`.js/.jsx/.ts/.tsx`) for refactoring opportunities. Three-tier architecture: a Rust analyzer library, a Rust HTTP API server, and a React SPA frontend with interactive visualizations. No cloud dependencies; no source code leaves the machine.

## Commands

### Rust (workspace root)

```bash
cargo build                            # Build all crates
cargo run -p server                    # Start API server on http://127.0.0.1:8787
cargo test -p analyzer                 # Analyzer unit + integration tests (uses fixtures)
cargo test --workspace                 # All Rust tests
cargo check --workspace                # Type-check without producing binaries
cargo clippy --workspace -- -D warnings  # Lint (CI-enforced; pedantic + unwrap/expect/panic warn via workspace lints)
cargo fmt                              # Format (CI-enforced)
```

Run a single Rust test: `cargo test -p analyzer <test_name>`.

Server CLI flags: `--host` (127.0.0.1), `--port` (8787), `--data-dir` (.refactor-radar), `--log-level` (info; `RUST_LOG` takes precedence).

### Frontend (run from `web/`)

```bash
npm install                  # Install dependencies
npm run dev                  # Vite dev server on port 4173
npm run build                # TypeScript type-check (tsc --noEmit) + Vite production build
npm test                     # Vitest single run (jsdom)
npx vitest <file>            # Run a single test file / watch mode
```

No lint tooling is configured for the frontend.

### CI (`.github/workflows/ci.yml`)

- Rust job on ubuntu/macos/windows: `cargo check --workspace` → `cargo test --workspace` → `cargo clippy --workspace -- -D warnings`
- Frontend job: `npm ci` → `npm run build` → `npm test`

### Full-stack development

Start both servers: `cargo run -p server` (API on :8787) and `npm run dev` from `web/` (frontend on :4173). The frontend calls the API directly — there is no Vite proxy. `API_BASE` defaults to `http://127.0.0.1:8787` and can be overridden via the `VITE_API_BASE` env var.

`sample-test/` is a small TS project useful as an analysis target during manual testing.

## Architecture

```
[React SPA :4173] --fetch/JSON--> [Axum API :8787] --> [analyzer crate (lib)]
                                        |
                                   .refactor-radar/analyses/*.json (persisted results)
```

### `crates/analyzer` — Core Analysis Engine (Rust library)

Synchronous library (single file: `src/lib.rs`). Uses **rayon** for parallel file parsing and **regex** (with `OnceLock` caching) for analysis — no AST parsing.

**Main entry**: `Analyzer::analyze_repo()` / `analyze_repo_with_progress()` (progress callback). Construct via `Analyzer::default()` or `Analyzer::with_config(AnalyzerConfig)`.

**Seven issue types** (`AnalysisIssueType`, serialized snake_case):
1. `LargeModule` — files exceeding line/function/export thresholds
2. `DependencyHotspot` — high fan-in or fan-out
3. `CircularDependency` — detected via Tarjan's SCC algorithm
4. `DuplicationCandidate` — normalized function-body similarity matching
5. `LongParameterList` — functions with too many parameters
6. `DeepNesting` — deeply nested control flow
7. `GodFunction` — oversized functions

**Configuration** (`AnalyzerConfig`, all fields have defaults): `line_threshold` (45), `function_threshold` (5), `fan_in_threshold` (2), `fan_out_threshold` (4), `long_parameter_list_threshold` (4), `deep_nesting_threshold` (4), `god_function_threshold` (10), `duplication_similarity_threshold` (0.7), `exclude_patterns`, `enabled_rules` (rule names in snake_case; each rule block in `analyze_repo_with_progress` is gated on membership). `load_config(path)` parses a TOML file using **camelCase keys** (config serde uses `rename_all = "camelCase"`).

**Analysis phases**: Discovery → Parsing → Graphing → Rules → Scoring → Done (`AnalysisPhase` enum, used for progress reporting).

**Issues carry a `Confidence` level** (`Heuristic` | `Medium` | `High`) reflecting the regex-heuristic nature of findings.

**Integration tests**: `tests/analysis_fixture.rs` uses `tests/fixtures/sample_repo/` and covers config loading + threshold behavior.

### `crates/server` — Axum HTTP API (Rust binary)

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check (status + version) |
| `/api/analyze` | POST | Start analysis, body: `{ "repoPath": "..." }` → `{ analysisId, status }` |
| `/api/analyze/:id/status` | GET | Poll analysis progress |
| `/api/analyze/:id/results` | GET | Full analysis results (falls back to disk after restart) |
| `/api/analyze/:id/issues/:issue_id` | GET | Single issue detail |
| `/api/analyses` | GET | List analysis history (newest first, max 20) |
| `/api/analyses/:id` | GET | Load saved analysis by ID from disk |

**Key design**:
- Concurrency limited by a `Semaphore` sized to CPU core count; permits are acquired with `try_acquire_owned` — at capacity the server **fails fast with 409 Conflict** rather than queueing
- Analysis runs in `spawn_blocking` (analyzer is sync); job registry is in-memory (`Mutex<HashMap>`), results persisted to `{data-dir}/analyses/{id}.json` via atomic write (tmp file + rename)
- Unified error type `AppError` → JSON `{ "error": msg, "code": "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "UNPROCESSABLE_ENTITY" | "INTERNAL_ERROR" }`
- Startup cleanup retains only the 50 most recent analysis files; graceful shutdown waits up to 30s for in-flight analyses on Ctrl+C
- CORS: `CorsLayer::permissive()`

### `web/` — React 18 + Vite SPA

**Routing** (`main.tsx`): react-router-dom with `App` as layout shell (`Outlet`) — routes `/` (Dashboard), `/history`, `/settings`. Wrapped in `ErrorBoundary` + `ToastProvider`.

**Data flow**: POST `/api/analyze` → poll `/api/analyze/:id/status` every 1s (max 600 attempts = 10min timeout, in `hooks/useAnalysis.ts`) → GET `/api/analyze/:id/results` → render dashboard.

**API client** (`lib/api.ts`): Direct `fetch`; GET requests use `fetchWithRetry` (3 attempts, exponential backoff). Functions: `startAnalysis`, `getStatus`, `getResults`, `getHistory`.

**Types** (`lib/types.ts`): TypeScript interfaces mirror Rust serde structs. Rust uses `#[serde(rename_all = "camelCase")]` — TS types use camelCase to match.

**i18n** (`lib/i18n.ts`): Custom lightweight solution (not i18next). `Locale = "en" | "zh"`; React Context (`LocaleContext`) + `useLocale()` + `createTranslator()`. Language persisted to localStorage.

**State/persistence quirks**: recent repo paths, theme, locale, and the Settings page thresholds are all stored in localStorage. The Settings thresholds are **not** sent to the backend — the server always analyzes with `Analyzer::default()`.

**Components**:
- `charts/` — Recharts: FileMetricsChart, IssueDistributionChart, PriorityRankingChart, SeverityBreakdownChart
- `graph/` — D3-force dependency graph visualization
- `layout/` — AnalysisHistory, AnalysisProgress, EmptyState, ExportMenu, VisualizationTabs

**Export** (`lib/export.ts`): JSON, CSV, and Markdown export formats.

**Vite config** (`vite.config.mjs`): recharts and d3-force split into manual chunks. Test env: jsdom with setup in `src/test/setup.ts`.

## Key Conventions

- **Serde camelCase**: Rust structs use `#[serde(rename_all = "camelCase")]`. When adding fields to `AnalysisResult`, `AnalysisIssue`, `FileAnalysis`, etc., use snake_case in Rust — they auto-serialize to camelCase. TypeScript types in `types.ts` must stay in sync. Enums (`AnalysisIssueType`, `Severity`, `Confidence`, `AnalysisPhase`) serialize as snake_case strings.
- **No async in analyzer**: The analyzer crate is fully synchronous (rayon for parallelism). Async lives only in the server (tokio/axum) and frontend.
- **Adding a detection rule** (full recipe in CONTRIBUTING.md): add `AnalysisIssueType` variant → add threshold to `AnalyzerConfig` + `Default` → add rule name to `enabled_rules` defaults → gate detection logic on `enabled_rules` → mirror the type in `types.ts` → add en/zh translations → add fixture tests.
- **i18n for all UI text**: When adding user-facing strings, add both `en` and `zh` translations in `lib/i18n.ts`.
- **Issue schema stability**: Issue types, severity, and confidence levels are part of the API contract between backend and frontend; changes require updating both Rust and TypeScript types.
- **Heuristic findings**: The analyzer uses regex-based heuristics, not AST analysis. New detection rules should be documented as heuristic and use an appropriate `Confidence` level.
- **Analysis persistence**: Results are saved to `.refactor-radar/analyses/` (gitignored). The JSON schema must remain backward-compatible.
- **Clippy is strict**: workspace lints enable `clippy::pedantic` plus `unwrap_used`/`expect_used`/`panic` as warnings, and CI runs clippy with `-D warnings` — avoid `unwrap()`/`expect()` in non-test code (use `anyhow::Result` + `Context`).
- **Commits**: Conventional Commits preferred (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
