# MIGRATION_PLAN

Purpose:
Controlled rollout plan for payment integration.

---

## Stages

1. Skeleton only (current)
2. Provider adapter added
3. Webhooks enabled (shadow mode)
4. Payments enabled for test users
5. Full rollout

---

## Rollback Rules

- Disable feature flag
- Ignore provider webhooks
- No DB rollback required

---

## Invariants

- Booking lifecycle unchanged
- Paid is final
- Webhook is source of truth

End of document.
\n