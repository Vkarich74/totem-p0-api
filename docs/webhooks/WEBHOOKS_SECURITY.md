# WEBHOOKS_SECURITY

Purpose:
Security requirements for all webhook endpoints.

---

## Signature verification

- Every webhook MUST be signed
- Signature verified before processing
- Invalid signature -> 401 / 403

---

## Secrets

- Secrets stored server-side only
- No secrets in frontend or public configs

---

## IP filtering

- Optional allowlist if provider supports it
- Must not be sole security mechanism

---

## Replay protection

- event_id used for replay detection
- Duplicate events accepted but ignored logically

End of document.
