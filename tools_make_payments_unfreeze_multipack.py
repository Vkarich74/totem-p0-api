# tools_make_payments_unfreeze_multipack.py
# Purpose: Create UNFREEZE_PAYMENTS docs multipack in repo (docs only).
# Usage (CMD): python tools_make_payments_unfreeze_multipack.py

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET_DIR = ROOT / "docs" / "payments_unfreeze"

FILES: dict[str, str] = {
    "PROVIDER_REQUIREMENTS.md": """# PROVIDER_REQUIREMENTS

Purpose:
Define hard requirements for selecting a payment provider.

---

## Mandatory capabilities

- Hosted payment page OR client SDK
- Webhook support
- Idempotency keys
- Partial and full refunds
- Test / sandbox mode

---

## Technical requirements

- HTTPS only
- Webhook retries supported
- Event IDs provided by provider
- Signature verification supported

---

## Business requirements

- Multi-currency (optional)
- Clear fee structure
- Dispute handling

---

## Disallowed providers

- No webhooks
- No idempotency
- Client-only confirmation without server verification

End of document.
""",
    "PROVIDER_EVALUATION.md": """# PROVIDER_EVALUATION

Purpose:
Standard comparison framework for payment providers.

---

## Evaluation criteria

- API reliability
- Webhook quality
- Documentation clarity
- Refund support
- Regional availability

---

## Scoring (example)

Each criterion: 1–5

Total score determines suitability.

---

## Non-technical factors

- Support responsiveness
- Account approval time
- Legal constraints

End of document.
""",
    "PAYMENT_FLOW_SEQUENCE.md": """# PAYMENT_FLOW_SEQUENCE

Purpose:
End-to-end payment flow sequence (logical).

---

## Sequence

1. Booking created (pending_payment)
2. Payment intent created
3. Client redirected / widget opened
4. Provider processes payment
5. Webhook received (paid / failed)
6. Backend updates payment
7. Booking updated accordingly
8. Frontend reflects final state

---

## Invariants

- Webhook is source of truth
- Client redirect is NOT confirmation
- Booking paid only after webhook

End of document.
""",
    "PAYMENT_FAILURE_MATRIX.md": """# PAYMENT_FAILURE_MATRIX

Purpose:
Define system behavior for payment failures.

---

## Failure cases

| Case | Provider Status | System Action | Booking |
|----|----------------|---------------|---------|
| Card declined | failed | payment failed | pending_payment |
| Timeout | unknown | wait / retry | pending_payment |
| Duplicate payment | paid twice | ignore second | paid |
| Late webhook | paid | accept paid | paid |

---

## Principles

- No booking cancellation on payment failure
- Paid always wins

End of document.
""",
    "REFUNDS_POLICY.md": """# REFUNDS_POLICY

Purpose:
Define refund rules independent of provider.

---

## Refund triggers

- Owner cancellation after payment
- System error
- Duplicate charge

---

## Rules

- Refunds are async
- Refund status tracked separately
- Booking state does not auto-revert

---

## Provider dependency

- Provider must support refunds
- Partial refunds optional

End of document.
""",
    "PAYMENT_SECURITY_MODEL.md": """# PAYMENT_SECURITY_MODEL

Purpose:
Security model for payment processing.

---

## Rules

- No payment secrets in frontend
- Webhook signature mandatory
- TLS enforced everywhere

---

## Attack vectors

- Fake webhooks
- Replay attacks
- Client-side tampering

---

## Mitigations

- Signature verification
- Idempotency
- Backend-only state changes

End of document.
""",
    "UNFREEZE_CHECKLIST.md": """# UNFREEZE_CHECKLIST

Purpose:
Final checklist before starting payment integration.

---

## Documentation

- [ ] Provider requirements defined
- [ ] Failure matrix reviewed
- [ ] Refund policy agreed
- [ ] Security model approved

---

## Architecture

- [ ] Booking lifecycle stable
- [ ] Payment domain stable
- [ ] Webhooks rules enforced

---

## Decision

- [ ] Provider selected
- [ ] UNFREEZE approved explicitly

End of checklist.
""",
}

def write_file(path: Path, content: str) -> None:
    # Normalize newlines for Windows friendliness, ensure trailing newline.
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    if not normalized.endswith("\n"):
        normalized += "\n"
    path.write_text(normalized, encoding="utf-8")

def main() -> int:
    TARGET_DIR.mkdir(parents=True, exist_ok=True)

    created = []
    updated = []

    for name, content in FILES.items():
        p = TARGET_DIR / name
        if p.exists():
            before = p.read_text(encoding="utf-8", errors="ignore")
            normalized_before = before.replace("\r\n", "\n").replace("\r", "\n")
            normalized_new = content.replace("\r\n", "\n").replace("\r", "\n")
            if not normalized_new.endswith("\n"):
                normalized_new += "\n"
            if normalized_before != normalized_new:
                write_file(p, content)
                updated.append(name)
        else:
            write_file(p, content)
            created.append(name)

    print("OK: docs/payments_unfreeze generated.")
    if created:
        print("Created:")
        for n in created:
            print(f" - {n}")
    if updated:
        print("Updated:")
        for n in updated:
            print(f" - {n}")
    if not created and not updated:
        print("No changes (already up to date).")

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
