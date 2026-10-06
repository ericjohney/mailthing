FROM node:24-bookworm-slim AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY web ./web
RUN npm run build

FROM rust:1.99-bookworm AS server
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY server ./server
RUN cargo build --locked --release --bin mailthing

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home mailthing && mkdir -p /app/data && chown mailthing:mailthing /app/data
WORKDIR /app
COPY --from=server /build/target/release/mailthing /usr/local/bin/mailthing
COPY --from=web /build/dist/web ./dist/web
USER mailthing
ENV WEB_HOST=0.0.0.0 PORT=9005 SMTP_HOST=0.0.0.0 SMTP_PORT=2500 DATABASE_URL=sqlite:///app/data/mailthing.db
EXPOSE 9005 2500
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD curl --fail --silent http://127.0.0.1:9005/health || exit 1
CMD ["mailthing"]
