# Refactor Radar

Refactor Radar is a local-first repository analyzer that finds the parts of a JS/TS codebase most worth refactoring first. It combines deterministic structural analysis with an optional AI explanation layer, then surfaces the results in a focused Web UI.

## Why it exists

Code review and architecture cleanup usually fail for the same reason: teams know there is technical debt, but cannot quickly prove where to start. Refactor Radar turns that into a ranked list of concrete opportunities with evidence.

## Core capabilities

- Detect large modules that likely mix responsibilities
- Highlight dependency hotspots and fan-in/fan-out risks
- Detect circular dependencies in local modules
- Surface duplication candidates with evidence and confidence
- Rank findings so the first screen answers "what should we fix first?"

## Project layout

- `crates/analyzer`: repository discovery, metrics, graphing, rules
- `crates/server`: local HTTP API and job orchestration
- `web`: Vite + React dashboard

## Local development

### Prerequisites

- Rust toolchain
- Node.js 20+
- npm 10+

### Run

```bash
cargo run -p server
cd web
npm install
npm run dev
```

The server starts on `http://127.0.0.1:8787` by default and stores analysis results in `.refactor-radar/`.

## Demo workflow

1. Start the Rust API.
2. Start the Web UI.
3. Analyze any local JS/TS repository path.
4. Review the top 5 refactor opportunities on the dashboard.

## Screenshots

Screenshot placeholders are intentionally kept until the first verified UI run. Add captures of:

- Analyzer view with live progress
- Dashboard overview with ranked issues
- Issue detail panel with evidence

## Roadmap

- Support additional languages
- Add editor integrations
- Improve duplication clustering with AST-backed semantics
- Add PR and diff analysis mode
- Add opt-in auto-fix suggestions for selected findings

## License

MIT

