# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
RUN bun install --frozen-lockfile --production=false

# Copy source
COPY . .

# Build frontend
RUN bun run build

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy package files and install production deps only
COPY package.json ./
RUN bun install --frozen-lockfile --production

# Copy built assets and server code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Expose ports
EXPOSE 9005 2500

# Environment defaults
ENV PORT=9005
ENV SMTP_PORT=2500
ENV SQLITE_DB=/data/mailthing.db

# Create data directory
RUN mkdir -p /data

# Start server
CMD ["bun", "run", "src/index.ts"]
