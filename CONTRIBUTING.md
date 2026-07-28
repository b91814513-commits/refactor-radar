# Contributing to Refactor Radar

Thank you for your interest in contributing to Refactor Radar! This document will help you get started.

## Welcome

Refactor Radar is a local-first static analysis tool for JS/TS codebases. We welcome contributions of all kinds — bug reports, feature requests, documentation improvements, and code changes.

## Development Setup

### Prerequisites

- **Rust** (stable toolchain via [rustup](https://rustup.rs/))
- **Node.js** 20+ and **npm** 10+

### Getting Started

1. Fork and clone the repository
2. Install frontend dependencies:
   ```bash
   cd web && npm install
   ```
3. Start the API server (Terminal 1):
   ```bash
   cargo run -p server
   ```
4. Start the frontend dev server (Terminal 2):
   ```bash
   cd web && npm run dev
   ```
5. Open `http://127.0.0.1:4173` in your browser

## How to Add a New Detection Rule

The analyzer uses regex-based heuristics (not AST parsing). Here's how to add a new rule:

### Step 1: Define the Issue Type

In `crates/analyzer/src/lib.rs`, add a variant to `AnalysisIssueType`:

```rust
pub enum AnalysisIssueType {
    LargeModule,
    DependencyHotspot,
    CircularDependency,
    DuplicationCandidate,
    LongParameterList,
    DeepNesting,
    GodFunction,
    YourNewRule,  // Add here
}
```

### Step 2: Add Configuration

Add threshold fields to `AnalyzerConfig` and update the `Default` implementation:

```rust
pub struct AnalyzerConfig {
    // ... existing fields
    pub your_new_rule_threshold: usize,
}
```

Add the rule name to the default `enabled_rules` list:

```rust
enabled_rules: vec![
    // ... existing rules
    "your_new_rule".into(),
],
```

### Step 3: Implement the Detection Logic

In the `apply_rules` method, add a new block that checks if the rule is enabled and creates issues:

```rust
if config.enabled_rules.contains(&"your_new_rule".to_string()) {
    // Your detection logic here
    // Create AnalysisIssue with:
    // - issue_type: AnalysisIssueType::YourNewRule
    // - title, severity, confidence, priority_score
    // - summary, files, metrics, evidence, suggested_actions
}
```

### Step 4: Update Frontend Types

In `web/src/lib/types.ts`, add the new issue type to the TypeScript enum:

```typescript
export type AnalysisIssueType =
  | "large_module"
  | "dependency_hotspot"
  // ... existing types
  | "your_new_rule";
```

### Step 5: Add Translations

In `web/src/lib/i18n.ts`, add translations for the new rule name in both `en` and `zh`.

### Step 6: Write Tests

Add test cases in `crates/analyzer/tests/` using the fixture repository pattern.

## Code Style

### Rust

- Run `cargo fmt` before committing (enforced by CI)
- Run `cargo clippy --workspace -- -D warnings` (enforced by CI)
- Follow existing patterns: use `anyhow::Result` for error handling, `#[serde(rename_all = "camelCase")]` for JSON serialization
- Keep the analyzer crate synchronous (no async) — it uses rayon for parallelism

### TypeScript / React

- No lint tool is configured, but follow existing patterns in the codebase
- Use TypeScript strict mode
- Add both `en` and `zh` translations for all user-facing strings
- Keep components small and focused

## Testing

Before submitting a PR, ensure all tests pass:

```bash
# Rust tests
cargo test --workspace

# Frontend tests
cd web && npm test

# Frontend build (type check + production build)
cd web && npm run build
```

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main`
2. **Make your changes** following the guidelines above
3. **Test** your changes locally
4. **Commit** with a clear message (see Conventional Commits below)
5. **Push** to your fork and open a Pull Request
6. **Wait for CI** to pass (rust check/test/clippy + frontend build/test)
7. **Request review** from maintainers

## Commit Message Conventions

We prefer [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add GodFunction detection rule
fix: correct priority scoring for circular dependencies
docs: update API reference with health endpoint
test: add fixture for deep nesting detection
refactor: extract duplication detection into separate function
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Important Notes

- **Heuristic Nature**: The analyzer uses regex-based heuristics, not AST analysis. All detection rules should be documented as heuristic in nature. Confidence levels (`Heuristic`, `Medium`, `High`) should reflect this.
- **Issue Schema Stability**: The issue types and severity levels are part of the public API contract between backend and frontend. Changes require updating both Rust types and TypeScript types.
- **Local-First**: No cloud dependencies. All analysis runs locally. No source code leaves the user's machine.
- **Backward Compatibility**: Analysis results are persisted to `.refactor-radar/analyses/`. The JSON schema must remain backward-compatible.

## Questions?

Open an issue or discussion if you have questions. We're here to help!
