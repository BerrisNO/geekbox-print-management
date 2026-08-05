# syntax=docker/dockerfile:1
# Multi-stage build: fe-build → be-build → runtime (impl-spec §6.1).

# Stage 1 — build the SPA (static dist/)
FROM node:22-alpine AS fe-build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/frontend ./apps/frontend
# pnpm 11 gates dependency build scripts (ERR_PNPM_IGNORED_BUILDS) even when they
# are listed in onlyBuiltDependencies. esbuild and @tailwindcss/oxide resolve their
# native binaries from prebuilt musl optional-dependency packages, so their
# postinstall is not required — tolerate the non-fatal gate; the SPA build below
# fails loudly if a binary is genuinely missing, which validates the install.
RUN pnpm install --frozen-lockfile --filter @geekbox/frontend... --filter @geekbox/shared || true
# Build the shared workspace package to dist first; the production build resolves
# @geekbox/shared to its compiled JS (the "development" export condition keeps
# dev/test/bundlers on source).
RUN pnpm --filter @geekbox/shared build
RUN pnpm --filter @geekbox/frontend build

# Stage 2 — build the backend (compile TS → dist) then a prod-only deploy tree
FROM node:22-alpine AS be-build
WORKDIR /repo
RUN apk add --no-cache python3 make g++
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/backend ./apps/backend
# pnpm 11 gates dependency build scripts; tolerate the non-fatal gate, then compile
# the better-sqlite3 native binding explicitly (node-gyp bypasses the pnpm gate).
# argon2 ships prebuilt binaries and needs no compile. Downstream steps assert the
# binding exists, so a real install/compile failure still fails the build.
RUN pnpm install --frozen-lockfile --filter @geekbox/backend... --filter @geekbox/shared || true
RUN cd "$(find . -type d -path '*.pnpm/better-sqlite3@*/node_modules/better-sqlite3' | head -1)" \
    && npm run build-release \
    && find . -path '*build/Release/*.node' | grep -q .
# Compile the shared workspace package to dist so the backend's runtime bare import
# of @geekbox/shared resolves to JS (pnpm deploy then bundles dist into /deploy).
RUN pnpm --filter @geekbox/shared build
RUN pnpm --filter @geekbox/backend build
# Prune to a prod-only node_modules. Keep the compiled better-sqlite3 native binding;
# if pnpm deploy reconstructs node_modules without it, compile it in place, then assert.
RUN pnpm --filter @geekbox/backend deploy --prod --legacy /deploy || true
RUN if ! find /deploy -path '*better-sqlite3*/build/Release/*.node' | grep -q .; then \
      cd "$(find /deploy -type d -name better-sqlite3 | head -1)" && npm run build-release; \
    fi \
    && find /deploy -path '*better-sqlite3*/build/Release/*.node' | grep -q . \
    && test -f /deploy/node_modules/fastify/package.json
# pnpm deploy symlinks workspace packages back into the source tree (/repo), which
# does not exist in the runtime image, so the @geekbox/shared link dangles. Replace
# it with a real copy of the built package so `node dist/main.js` can resolve it.
RUN rm -rf /deploy/node_modules/@geekbox/shared \
    && mkdir -p /deploy/node_modules/@geekbox/shared \
    && cp -R packages/shared/package.json packages/shared/dist /deploy/node_modules/@geekbox/shared/ \
    && test -f /deploy/node_modules/@geekbox/shared/dist/index.js

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
