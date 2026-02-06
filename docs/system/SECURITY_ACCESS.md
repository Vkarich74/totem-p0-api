# SECURITY_ACCESS

Purpose:
Define security posture, access control, and audit depth.

---

## Threat model (high-level)

- Unauthorized access
- Privilege escalation
- Token leakage
- Replay attacks

---

## Access control

- Role-based access (RBAC)
- Deny by default
- Backend-enforced only

---

## Tokens

- Short-lived access tokens
- Refresh tokens rotated
- Revocation supported

---

## Audit

- All sensitive actions logged
- Logs are append-only
- Logs are immutable

---

## Frontend rules

- No secrets
- No direct privilege decisions
- Reflect backend errors only

End of document.
