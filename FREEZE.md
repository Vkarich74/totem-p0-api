# TOTEM — FREEZE

Status: STABLE
Stage: OPS_MINIMAL COMPLETED

## Backend
- Platform: Railway
- Language: Node.js (ESM)
- Auto-deploy: ENABLED
- Health: /health → { ok: true }

## Frontend
- Platform: Odoo Website (SaaS)
- Logic: NONE (backend-driven)
- JS: custom_code_head only

## OPS
- gitignore: hardened
- ops_check: scripts/ops_check.js
- runbook: OPS_RUNBOOK_MINIMAL.md

## Constraints
- Backend = source of truth
- No business logic in frontend
- No manual deploys

## Next Allowed Blocks
- PAYMENTS_PROVIDER
- RELEASE_PACK
- FEATURE (explicit)

END
