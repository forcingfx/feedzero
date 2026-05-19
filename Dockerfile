# syntax=docker/dockerfile:1.7
#
# FeedZero — single-container deploy.
# Builds the SPA + Hono server, then runs them out of a slim Node image.
# Caddy/Traefik in front for TLS (see docker-compose.yml).

ARG NODE_VERSION=22-alpine

# ---------- build stage ----------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# Install deps with the full lockfile so the build is reproducible.
COPY package.json package-lock.json ./
RUN npm ci

# Build the SPA + serverless bundles. The latter is unused at runtime
# (Hono replaces it) but the build script lives next to the SPA build
# and is the canonical "everything is built" target.
COPY . .
# Bake the self-hosted flag into the SPA at build time so the bundle
# matches the runtime SELF_HOSTED=1 env var below. Without this, the
# client UI shows Subscribe surfaces and rejects the self-host code
# paths even when the server is in self-host mode.
ENV VITE_SELF_HOSTED=1
RUN npm run build:all

# ---------- runtime stage ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    SELF_HOSTED=1 \
    SYNC_STORAGE=filesystem \
    SYNC_FILESYSTEM_DIR=/data/vaults \
    PORT=3000

# Production deps only. `tsx` is needed at runtime because `serve`
# launches `node --import tsx server.ts` to handle TypeScript on the fly.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the source the runtime actually needs:
#   - dist/      — the SPA (Hono serves it as static files)
#   - api/       — Vercel wrappers, also imported by tests; harmless
#   - src/       — Hono handlers + core (imported at runtime via tsx)
#   - server.ts  — the entry point
#   - tsconfig.json — tsx reads paths/baseUrl from here
COPY --from=build /app/dist        ./dist
COPY --from=build /app/api         ./api
COPY --from=build /app/src         ./src
COPY --from=build /app/server.ts   ./server.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Sync vaults live here when SYNC_STORAGE=filesystem.
RUN mkdir -p /data/vaults && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000

# Health check hits the canonical /api/health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || exit 1

CMD ["npm", "run", "serve"]
