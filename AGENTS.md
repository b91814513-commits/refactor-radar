# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Project Overview

**Refactor Radar** — a local-first static analysis tool that scans codebases for refactoring opportunities. Three-tier architecture: a Rust analyzer library, a Rust HTTP API server, and a React SPA frontend with interactive visualizations. No cloud dependencies.

## Commands

### Rust (workspace root)

```bash
cargo build                  # Build all crates
cargo run -p server          # Start API server on http://127.0.0.1:8787
cargo test -p analyzer       # Analyzer unit + integration tests (uses fixtures)
cargo test                   # All Rust tests
cargo check                  # Type-check without producing binaries
```

### Frontend (run from `web/`)

```bash
npm install                  # Install dependencies
npm run dev                  # Vite dev server on port 4173
npm run build                # TypeScript type-check + Vite production build
npm test                     # Vitest single run (jsdom)
npm run test:watch           # Vitest watch mode
```

No lint tooling is configured.

### Full-stack development

Start both servers: `cargo run -p server` (API on :8787) and `npm run dev` from `web/` (frontend on :4173). The frontend calls the API directly at `http://127.0.0.1:8787` — there is no Vite proxy.

## Architecture

```
[React SPA :4173] --fetch/JSON--> [Axum API :8787] --> [analyzer crate (lib)]
                                        |
                                   .refactor-radar/analyses/*.json (persisted results)
```

### `crates/analyzer` — Core Analysis Engine (Rust library)

Synchronous library, no I/O. Uses **rayon** for parallel file parsing and **regex** (with `OnceLock` caching) for analysis — no AST parsing.

**Main entry**: `Analyzer::analyze_repo()` and `analyze_repo_with_progress()` (with progress callback).

**Four issue types detected**:
1. `LargeModule` — files exceeding line/function/export thresholds
2. `DependencyHotspot` — high fan-in or fan-out
3. `CircularDependency` — detected via Tarjan's SCC algorithm
4. `DuplicationCandidate` — normalized function-body heuristic matching

**Configurable thresholds** (on `Analyzer` struct): line count (45), function count (5), fan-in (2), fan-out (4).

**Analysis phases**: Discovery → Parsing → Graphing → Rules → Scoring → Done (exposed via `AnalysisPhase` enum for progress reporting).

**Integration tests**: `tests/analysis_fixture.rs` uses `tests/fixtures/sample_repo/`.

### `crates/server` — Axum HTTP API (Rust binary)

| Endpoint | Method | Description |
|---|---|---|
| `/api/analyze` | POST | Start analysis, body: `{ "repoPath": "..." }` |
| `/api/analyze/:id/status` | GET | Poll analysis progress |
| `/api/analyze/:id/results` | GET | Full analysis results |
| `/api/analyze/:id/issues/:issue_id` | GET | Single issue detail |
| `/api/analyses` | GET | List analysis history (max 20) |
| `/api/analyses/:id` | GET | Load saved analysis by ID |

**Key design**:
- Concurrency control via `Semaphore` (parallel limit = CPU core count)
- Dual storage: in-memory job registry + disk persistence at `.refactor-radar/analyses/{id}.json` (atomic write via tmp + rename)
- Startup cleanup: retains only the 50 most recent analysis files
- CORS: `CorsLayer::permissive()`

### `web/` — React 18 + Vite SPA

**Data flow**: POST `/api/analyze` → poll `/api/analyze/:id/status` (1s interval, 10min timeout) → GET `/api/analyze/:id/results` → render dashboard.

**API client** (`lib/api.ts`): Direct `fetch` calls, hardcoded `API_BASE = http://127.0.0.1:8787`. Functions: `startAnalysis`, `getStatus`, `getResults`, `getHistory`.

**Types** (`lib/types.ts`): TypeScript interfaces mirror Rust serde structs. Rust uses `#[serde(rename_all = "camelCase")]` — TS types use camelCase to match.

**i18n** (`lib/i18n.ts`): Custom lightweight solution (not i18next). `Locale` type: `"en" | "zh"`. Uses React Context (`LocaleContext`) + `useLocale()` hook + `createTranslator()` factory. ~80 translation keys, each with en/zh pair. Language persisted to localStorage.

**Components**:
- `charts/` — Recharts: FileMetricsChart, IssueDistributionChart, PriorityRankingChart, SeverityBreakdownChart
- `graph/` — D3-force + react-spring dependency graph visualization
- `layout/` — AnalysisHistory, AnalysisProgress, EmptyState, ExportMenu, VisualizationTabs

**Export** (`lib/export.ts`): JSON, CSV, and Markdown export formats.

**Vite config**: Build chunks recharts and d3-force separately. Test env: jsdom with `@testing-library/jest-dom/vitest`.

## Key Conventions

- **Serde camelCase**: Rust structs use `#[serde(rename_all = "camelCase")]`. When adding fields to `AnalysisResult`, `AnalysisIssue`, `FileAnalysis`, etc., use snake_case in Rust — they auto-serialize to camelCase. TypeScript types in `types.ts` must stay in sync.
- **No async in analyzer**: The analyzer crate is fully synchronous (uses rayon for parallelism). Async lives only in the server (tokio/axum) and frontend.
- **i18n for all UI text**: When adding user-facing strings, add both `en` and `zh` translations in `lib/i18n.ts`.
- **Issue schema stability**: The issue types and severity levels are part of the public API contract between backend and frontend. Changes require updating both Rust types and TypeScript types.
- **Heuristic findings**: The analyzer uses regex-based heuristics, not AST analysis. New detection rules should be documented as heuristic in nature (per CONTRIBUTING.md).
- **Analysis persistence**: Results are saved to `.refactor-radar/analyses/` (gitignored). The directory structure and JSON schema must remain backward-compatible.
