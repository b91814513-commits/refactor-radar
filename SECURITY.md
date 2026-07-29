# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Refactor Radar, please report it responsibly.

### Via GitHub (Preferred)

Use [GitHub's private vulnerability reporting](../../security/advisories/new) to submit your report. This keeps the vulnerability private until a fix is available.

### Via Email

Alternatively, you can email your report to the maintainers. Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## What to Expect

- We will acknowledge receipt of your report within 48 hours
- We will provide a timeline for a fix after assessing the severity
- We will credit you in the security advisory (unless you prefer to remain anonymous)

## Scope

The following are in scope:

- The Rust analyzer and server (`crates/`)
- The React frontend (`web/`)
- Docker configuration
- CI/CD pipelines

## Out of Scope

- Third-party dependencies (report directly to the respective projects)
- Issues requiring physical access to the user's machine
- Social engineering attacks

## Security Best Practices

Refactor Radar is designed with security in mind:

- **Local-first**: All analysis runs on your machine. No source code is transmitted.
- **No cloud dependencies**: No external APIs or services required.
- **No authentication tokens**: The server binds to localhost by default.

If you have suggestions to improve security, please open an issue or PR.
