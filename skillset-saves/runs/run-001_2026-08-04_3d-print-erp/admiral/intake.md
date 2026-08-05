---
type: intake-record
run_id: run-001_2026-08-04_3d-print-erp
created: 2026-08-04T18:14:58Z
pipeline_mode: full
---

# Admiral Intake — GeekBOX Print Management

## Project Essence
A self-hosted web application that acts as a purpose-built ERP for a 3D-printing operation:
filament/material inventory, inbound logistics (purchase orders, filament in transit),
goods reception, live printer integration via the Bambu Lab Cloud API, print-job history
and per-print costing. Built for a single owner-operator.

## Pipeline Mode Decision
**Full Pipeline** (Stages 1-3: Design → Build → Review). Stage 4 (Azure) is NOT included —
the user explicitly chose self-hosted Docker deployment.

## User-Confirmed Decisions (AskUserQuestion, 2026-08-04)
| Question | Answer |
|----------|--------|
| Printer connection | Bambu Cloud API (api.bambulab.com + Bambu cloud MQTT) |
| Users | Single user (owner), simple login protection |
| Deployment | Self-hosted / local, Docker |
| V1 modules | ALL FOUR: filament inventory; inbound logistics + reception; printer dashboard; print jobs + costing |

## Technical Notes for Design Stage
- The Bambu Lab cloud API is not an officially documented public API. Community knowledge:
  login via `https://api.bambulab.com/v1/user-service/user/login` (email + password/verification
  code → access token), device list via `/v1/iot-service/api/user/bind`, task/print history via
  `/v1/user-service/my/tasks`, and live telemetry via MQTT over TLS at `mqtts://us.mqtt.bambulab.com:8883`
  authenticating with username `u_{uid}` + access token, topic `device/{serial}/report`.
  Design must treat this as an EXTERNAL, UNSTABLE dependency: isolate behind an adapter/anti-corruption
  layer, handle token expiry and schema drift defensively, and verify current endpoint behavior during build.
- Self-hosted Docker means a long-running server process is available → a persistent MQTT
  listener service is the right architecture for live printer/AMS telemetry (no serverless workaround needed).
- Single user → simple credential-based auth (one account, hashed password), session cookie; no RBAC.

## Existing Artifacts
None. Greenfield — empty workspace.
