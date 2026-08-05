# syntax=docker/dockerfile:1
# Multi-stage build: fe-build → be-build → runtime (impl-spec §6.1).

# Stage 1 — build the SPA (static dist/)
FROM node:22-alpine AS fe-build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY apps/frontend ./apps/frontend
RUN pnpm install --frozen-lockfile --filter @geekbox/frontend... --filter @geekbox/shared
RUN pnpm --filter @geekbox/frontend build

# Stage 2 — build the backend (compile TS → dist) then a prod-only deploy tree
FROM node:22-alpine AS be-build
WORKDIR /repo
RUN apk add --no-cache python3 make g++
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY apps/backend ./apps/backend
RUN pnpm install --frozen-lockfile --filter @geekbox/backend... --filter @geekbox/shared
RUN pnpm --filter @geekbox/backend build
# Prune to a prod-only node_modules (keeps compiled better-sqlite3 native binding,
# rebuilt inside this alpine/musl stage so it matches the runtime base).
RUN pnpm --filter @geekbox/backend deploy --prod --legacy /deploy

# Stage 3 — runtime (prod deps only, non-root)
FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production
COPY --from=be-build /repo/apps/backend/dist ./dist
COPY --from=be-build /repo/apps/backend/migrations ./migrations
COPY --from=be-build /deploy/node_modules ./node_modules
COPY --from=fe-build /repo/apps/frontend/dist ./dist/public
COPY healthcheck.js ./
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD ["node","healthcheck.js"]
CMD ["node","dist/main.js"]
