# GeekBOX Print Management

A self-hosted, single-user ERP for a 3D-printing filament workflow: filament
inventory, inbound logistics + goods reception, a live Bambu Lab printer
dashboard, and print-job costing. One Docker container, embedded SQLite, an
in-process MQTT listener behind an anti-corruption layer.

- **Backend**: Node 22 · TypeScript 5 (strict, ESM) · Fastify 5 · Zod 4 ·
  better-sqlite3 + Drizzle ORM · MQTT.js · argon2id · AES-256-GCM · Pino · Vitest · Biome.
- **Frontend**: React 19 + Vite (pure SPA) · TanStack Router/Query/Table/Form ·
  Tailwind v4 + shadcn/ui · Zod 4. Built to a static bundle served by the same Fastify container.
- **Deploy**: one `docker compose` service; SQLite (WAL) in a named volume.

## Repository layout

```
apps/backend        Fastify API + domain modules + Bambu ACL (integration/)
apps/frontend       React SPA (all four module UIs)
packages/shared     Zod input schemas + DTO types + constants (used by both halves)
fixtures/bambu      MS-1 recorded Bambu payload corpus (ACL contract tests)
scripts             backup.mjs (VACUUM INTO), restore.md, seed
migrations          Drizzle SQL migrations (applied at startup)
Dockerfile          multi-stage: fe-build → be-build → runtime
docker-compose.yml  single `app` service + gbx-data volume
```

## Prerequisites

- **Node.js 22 LTS specifically** (not 24+) and pnpm 11 (via `corepack enable`) for
  local development. Node 22 is required because the native dependencies
  (`better-sqlite3`, `argon2`) ship prebuilt binaries for the Node 22 ABI (v127).
  On Node 24 there is no matching prebuilt binary, so pnpm falls back to compiling
  from source — which needs a Python 3 + C/C++ toolchain (`node-gyp`) and will fail
  on a machine without one. `dependency-cruiser@16.10` is also validated on Node 22.
- If you cannot install Node 22 locally, use the Docker path below instead — the
  image pins the correct runtime and toolchain.
- Docker + Docker Compose for deployment.

## Configuration (`.env`)

Copy `.env.example` to `.env` and fill in the two required secrets:

```sh
cp .env.example .env
# Generate strong values:
#   SESSION_SECRET       (>= 32 chars):  openssl rand -hex 32
#   TOKEN_ENCRYPTION_KEY (32 bytes b64):  openssl rand -base64 32
```

| Variable | Required | Default | Purpose |
|----------|:--------:|---------|---------|
| `SESSION_SECRET` | yes | — | Signs the session cookie (ADR-007). |
| `TOKEN_ENCRYPTION_KEY` | yes | — | AES-256-GCM key for the Bambu token vault (ADR-010). 32 bytes, base64 or 64-hex. |
| `NODE_ENV` | no | `production` | Runtime mode. |
| `PORT` | no | `8080` | LAN listen port. |
| `DB_PATH` | no | `/data/geekbox.sqlite` | SQLite file inside the volume. |
| `BACKUP_DIR` | no | `/data/backups` | `VACUUM INTO` target. |
| `LOG_LEVEL` | no | `info` | Pino verbosity. |
| `MQTT_REGION` | no | (DB setting) | Overrides the stored region (`us`/`eu`/`cn`/custom hostname). |

Secrets are never baked into the image or logged (Pino redaction strips
password/token/cookie/authorization).

## Run with Docker (production)

```sh
docker compose up -d --build
# open http://<host>:8080 — first visit prompts one-time account setup
```

The container runs migrations at startup, serves the SPA + API on `PORT`, and
supervises the MQTT listener. `docker compose ps` shows the health status.

## Local development

```sh
corepack enable
pnpm install
# backend on :8080
pnpm --filter @geekbox/backend dev
# frontend dev server (proxies /api → :8080)
pnpm --filter @geekbox/frontend dev
```

For local dev you can point `DB_PATH` at a local file, e.g. `DB_PATH=./data/dev.sqlite`.

## Scripts

```sh
pnpm typecheck          # tsc --noEmit across all packages
pnpm lint               # Biome check
pnpm test               # Vitest across all packages
pnpm --filter @geekbox/backend depcruise   # architecture boundary rules (NFR-MA-02)
```

## Backup & restore

Backups are consistent single-file SQLite copies (`VACUUM INTO`), exposed two ways:

- **In-app**: Settings → Backup → Download (session-gated `GET /api/backup`).
- **CLI**: `node scripts/backup.mjs [dbPath] [backupDir]`.

Restore procedure: see [`scripts/restore.md`](scripts/restore.md). Backups are
**sensitive** — they contain the full database including encrypted Bambu tokens.
Store them securely.

## Bambu integration (linking & re-linking)

The Bambu Lab cloud API is **unofficial and community-documented**; the
integration is fully isolated behind an anti-corruption layer (ADR-006) and can
be turned off entirely with the permanent kill switch (Settings → Integration →
Enabled) — the rest of the app works without any printer connected (NFR-RE-05).

- **Link**: Settings → Integration → enter Bambu account email + password. If the
  account requires an email verification code, you'll be prompted for it.
- **Manual token fallback**: if login is blocked, paste your uid + access token
  directly (Settings → Integration → Manual token).
- **Manual printer**: printers can be added by serial without discovery.
- **Region**: set `us`/`eu`/`cn` or a full custom broker hostname.
- **Re-link**: after rotating `TOKEN_ENCRYPTION_KEY`, unlink and link again.

## Limitations (v1, by design)

- Single local account, no RBAC (C-03).
- LAN-only; no public API, no remote printer control.
- No telemetry history charts (latest snapshot only; ADR-008).
- No OpenTelemetry/metrics stack — observability is Pino logs + `/api/health` +
  the in-app integration health panel (ADR-013).
- Currency is display-only; default `NOK` is editable (pending Q-03).

## Architecture & decisions

See `skillset-saves/.../design/` for the full SRS, architecture, ADRs, API
contracts, and data model that this implementation was built from.
