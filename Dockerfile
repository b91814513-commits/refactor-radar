# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build Rust binary
FROM rust:1.77-alpine AS rust-builder
RUN apk add --no-cache musl-dev
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
# Create dummy main.rs to cache dependencies
RUN mkdir -p crates/server/src && echo "fn main() {}" > crates/server/src/main.rs
RUN cargo build --release --package server || true
# Copy real source and rebuild
COPY crates/server/src/main.rs crates/server/src/main.rs
COPY crates/analyzer/src/ crates/analyzer/src/
RUN cargo build --release --package server

# Stage 3: Final minimal image
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=rust-builder /build/target/release/server ./refactor-radar-server
COPY --from=frontend-builder /build/web/dist ./web/dist
RUN mkdir -p /app/.refactor-radar
EXPOSE 8787
CMD ["./refactor-radar-server"]
