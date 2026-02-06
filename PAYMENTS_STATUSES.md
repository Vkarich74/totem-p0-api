# PAYMENTS_STATUSES

Canonical payment statuses.
Provider-agnostic.

Statuses:
- created   — payment created, provider not started
- pending   — payment in progress
- paid      — confirmed by provider
- failed    — payment failed
- canceled  — canceled by user or system

Allowed transitions:
created  -> pending
created  -> canceled
pending  -> paid
pending  -> failed
pending  -> canceled

Rules:
- No backward transitions
- paid is final
- Frontend cannot change statuses

Timeouts:
- pending has TTL
- TTL expired -> canceled
