# Claude Code Instructions

This file provides context for Claude Code when working on this project.

## Project Overview

Mailthing is a development SMTP mail catcher built with:
- **Bun** runtime (fast Node.js alternative with built-in SQLite)
- **React 18** + **tRPC** for type-safe full-stack development
- **shadcn/ui** components (Radix primitives + Tailwind CSS)

## Key Commands

```bash
bun install          # Install dependencies
bun run build        # Build CSS + bundle React
bun run dev          # Start server with hot reload
bun run test-ui.ts   # Run Playwright UI tests
```

## Architecture

### Server (`src/server/`)
- `db.ts` - SQLite via `bun:sqlite` (NOT better-sqlite3)
- `smtp.ts` - SMTP server using `smtp-server` package
- `trpc.ts` - tRPC router with `messages.list`, `messages.get`, `messages.delete`

### Client (`src/client/`)
- `App.tsx` - Main React component with mail layout
- `trpc.ts` - tRPC client configuration
- `components/` - shadcn/ui components + custom mail components

### Shared (`src/shared/`)
- `types.ts` - TypeScript types shared between client/server

## Important Notes

1. **Use `bun:sqlite`** - NOT better-sqlite3 (native bindings don't work with Bun)
2. **tRPC version** - Using RC version `^11.0.0-rc.608`
3. **Build output** - Frontend builds to `dist/public/`
4. **Ports** - HTTP on 9005, SMTP on 2500 (both configurable via env)

## Testing

The app can be tested by:
1. Starting the server: `bun run dev`
2. Sending emails via Python/Node to `localhost:2500`
3. Viewing emails at `http://localhost:9005`

UI tests use Playwright (`test-ui.ts`) but require a cached Chromium binary.

## Deployment

- `Dockerfile` - Multi-stage Bun build
- `k8s/` - Kubernetes manifests with Kustomize
- `.github/workflows/docker.yaml` - CI/CD to ghcr.io

## File Locations

| What | Where |
|------|-------|
| Entry point | `src/index.ts` |
| Database | `src/server/db.ts` |
| API routes | `src/server/trpc.ts` |
| React app | `src/client/App.tsx` |
| UI components | `src/client/components/` |
| Tailwind config | `tailwind.config.js` |
| K8s manifests | `k8s/` |
