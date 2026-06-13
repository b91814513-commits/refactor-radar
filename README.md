<p align="center">
  <img src="https://img.shields.io/badge/Rust-2021-orange?logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
</p>

<p align="center">
  English | <a href="./README.zh-CN.md">简体中文</a>
</p>

<h1 align="center">Refactor Radar</h1>

<p align="center">
  <strong>Local-first JS/TS codebase analyzer — find what to refactor first.</strong><br />
  Deterministic structural analysis + interactive dashboard with dependency graph visualization.
</p>

---

## Why Refactor Radar?

Teams know there's technical debt, but can't quickly prove **where to start**. Refactor Radar scans a local JS/TS project and produces a ranked list of concrete refactoring opportunities — each backed by metrics and evidence.

No cloud, no API keys, no code leaves your machine.

## Features

| Feature | Description |
|---------|-------------|
| **Large Module Detection** | Flags files with too many lines, functions, or exports |
| **Dependency Hotspots** | Identifies files with high fan-in or fan-out |
| **Circular Dependencies** | Detects cycles in local module imports via DFS |
| **Duplication Candidates** | Heuristic detection of near-identical function bodies |
| **Priority Scoring** | Every issue gets a score so you always know what to fix first |
| **Interactive Charts** | Issue distribution, severity breakdown, file metrics, priority ranking |
| **Dependency Graph** | Force-directed SVG graph with drag, zoom, pan, and cycle highlighting |
| **i18n** | Chinese / English toggle with persistent preference |

## Architecture

```
refactor-radar/
├── crates/
│   ├── analyzer/     # Core analysis engine (Rust)
│   │   ├── src/
│   │   │   └── lib.rs        # File discovery, parsing, graph, rules, scoring
│   │   └── tests/
│   │       ├── analysis_fixture.rs
│   │       └── fixtures/sample_repo/
│   └── server/       # Axum HTTP API (Rust)
│       └── src/
│           └── main.rs       # Job orchestration, result persistence
├── web/              # React + Vite dashboard (TypeScript)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── lib/
│   │   │   ├── api.ts        # HTTP client for Rust API
│   │   │   ├── types.ts      # Shared type definitions
│   │   │   └── i18n.ts       # Translation dictionary + context
│   │   └── components/
│   │       ├── charts/       # Recharts-based visualizations
│   │       ├── graph/        # D3-force dependency graph
│   │       └── layout/       # VisualizationTabs
│   └── package.json
├── Cargo.toml        # Workspace root
└── README.md
```

## Quick Start

### Prerequisites

- **Rust toolchain** (stable, via [rustup](https://rustup.rs/))
- **Node.js** 20+ and **npm** 10+

### Run

Open two terminals:

**Terminal 1 — Rust API server:**
```bash
cargo run -p server
```
Server starts on `http://127.0.0.1:8787`.

**Terminal 2 — Web dashboard:**
```bash
cd web
npm install
npm run dev
```
Dashboard opens on `http://localhost:5173` (or next available port).

### Usage

1. Paste a local JS/TS project path into the input field
2. Click **Analyze Repository**
3. Explore the dashboard:
   - **Overview** — Issue type distribution + severity breakdown
   - **Files** — Top files by lines / functions / fan-in / fan-out
   - **Priority** — Ranked bar chart of highest-priority issues
   - **Dependency Graph** — Interactive force-directed graph with cycle highlighting
4. Click any issue in the list to see evidence and suggested refactor actions

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | POST | Start analysis. Body: `{ "repoPath": "..." }` |
| `/api/analyze/:id/status` | GET | Poll analysis progress (phase, done, error) |
| `/api/analyze/:id/results` | GET | Fetch full analysis result (files + issues) |
| `/api/analyze/:id/issues/:issue_id` | GET | Fetch a single issue with evidence |

Results are persisted to `.refactor-radar/analyses/` as JSON files.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Analysis engine | Rust — regex-based parsing, BTreeMap dependency graph, DFS cycle detection |
| HTTP server | Axum 0.7 + Tokio async runtime + tower-http CORS |
| Frontend | React 18 + TypeScript + Vite |
| Charts | Recharts (pie, bar, horizontal bar) |
| Graph | D3-force (force-directed layout) + native SVG rendering |
| Fonts | Outfit + IBM Plex Mono (Google Fonts) |

## Testing

```bash
# Rust analyzer tests
cargo test -p analyzer

# Web UI tests (Vitest)
cd web && npm run test

# Type check + production build
cd web && npm run build
```

## Roadmap

- [ ] Support additional languages (Python, Go, Java)
- [ ] AST-backed semantic duplication detection (tree-sitter)
- [ ] Editor integrations (VS Code extension)
- [ ] PR and diff analysis mode
- [ ] Opt-in AI explanation layer for complex findings
- [ ] Auto-fix suggestions for selected patterns

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development flow and standards.

## License

[MIT](./LICENSE)
