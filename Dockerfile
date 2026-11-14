# syntax=docker/dockerfile:1.7
# One Dockerfile, three runtime targets: migrate, worker, web.

ARG NODE_IMAGE=node:22-alpine

# ---------- deps: install the whole workspace ----------
FROM ${NODE_IMAGE} AS deps
RUN npm install -g pnpm@11.13.0 && npm cache clean --force
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- build: bundle worker + migrate, build Next standalone ----------
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @jobradar/db build \
 && pnpm --filter @jobradar/worker build \
 && pnpm --filter @jobradar/web build

# ---------- runtime base ----------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production TZ=America/Toronto
RUN apk add --no-cache tzdata
WORKDIR /app

# ---------- migrate (one-shot) ----------
FROM runtime AS migrate
COPY --from=build --chown=node:node /repo/packages/db/dist/migrate.js ./migrate.js
COPY --from=build --chown=node:node /repo/packages/db/migrations ./migrations
ENV MIGRATIONS_DIR=/app/migrations
USER node
CMD ["node", "migrate.js"]

# ---------- worker ----------
FROM runtime AS worker
COPY --from=build --chown=node:node /repo/apps/worker/dist ./dist
COPY --chown=node:node config ./config
ENV WORKER_HEALTH_PORT=8081 CONFIG_DIR=/app/config
EXPOSE 8081
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8081/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.js"]

# ---------- web ----------
FROM runtime AS web
ENV NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
