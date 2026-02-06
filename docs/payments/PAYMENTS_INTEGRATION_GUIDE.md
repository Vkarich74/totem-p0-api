# PAYMENTS_INTEGRATION_GUIDE

Purpose:
Single entry point for integrating a real payment provider
without breaking current stable state.

This document binds together:
- Public Flow Contract (v1)
- Payment Contract (bridge)
- Payment Domain
- Canonical Statuses
- Frontend UX (mock)
- Backend readiness

---

## Existing contracts (DO NOT CHANGE)

Public:
- PUBLIC_API_v1.md
- PUBLIC_WIDGET_CONTRACT.md
- PAYMENTS — Public Flow Contract (v1)

Internal (docs/payments):
- PAYMENTS_CONTRACT.md
- PAYMENTS_DOMAIN.md
- PAYMENTS_STATUSES.md
- PAYMENT_UX_FLOW.md
- PAYMENTS_BACKEND_READY.md

Architecture:
Backend (Railway) → Odoo Website (SaaS)
Backend is SOURCE OF TRUTH
Architecture is FROZEN

---

## What is intentionally missing

- No payment provider
- No provider SDK
- No webhook endpoints
- No refunds
- No accounting

---

## Allowed future integration steps (ONLY)

1. Add provider adapter (backend only)
2. Implement webhook endpoint (backend only)
3. Map provider events → canonical statuses
4. Move booking to paid ONLY when payment = paid

---

## Hard rules

- Do NOT change public contracts
- Do NOT change canonical statuses
- Do NOT add frontend business logic
- Do NOT deploy partial payment logic
- Do NOT bypass backend authority

---

## Deployment policy

- Docs changes → git commit allowed
- Backend changes → UNFREEZE required
- Frontend changes → UNFREEZE required

---

## Ready checklist

- [ ] Docs committed
- [ ] Freeze acknowledged
- [ ] Provider chosen separately
- [ ] Integration reviewed
- [ ] UNFREEZE approved

End of document.
