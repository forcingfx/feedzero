# @feedzero/web

Placeholder. See [ADR 023](../../docs/decisions/023-native-ios-via-react-native.md).

The web SPA (React + Vite + Tailwind), the Vercel serverless functions in
`api/`, and the Hono self-hosting server (`server.ts`) currently live at the
repo root. They keep running there until a future PR migrates them under
`packages/web/` (React UI + `api/` + `server.ts`). This directory exists now
so the workspace topology is wired up and the move can land as code-only PRs
without touching the workspace config.
