# tools_make_payments_full_automation.py
# Purpose: Generate full payments automation pack:
# - Provider evaluation
# - Migration & feature flags
# - Payments test skeleton
# SAFE: no runtime wiring, no providers enabled

from pathlib import Path

ROOT = Path(__file__).resolve().parent

DOCS = ROOT / "docs" / "payments_automation"
TESTS = ROOT / "tests" / "payments"

FILES = {
    # ---------- DOCS ----------
    DOCS / "PROVIDER_EVAL_TABLE.md": """# PROVIDER_EVAL_TABLE

Purpose:
Unified comparison table for payment providers.

---

## Evaluation Matrix

| Provider | API | Webhooks | Idempotency | Refunds | Regions | Score |
|---------|-----|----------|-------------|---------|---------|-------|
| Stripe  | ✔   | ✔        | ✔           | ✔       | Global  |       |
| Adyen   | ✔   | ✔        | ✔           | ✔       | Global  |       |
| Custom  | ?   | ?        | ?           | ?       | Local   |       |

---

## Scoring Rules

- API reliability (1–5)
- Webhook quality (1–5)
- Docs clarity (1–5)
- Support (1–5)

Total score = sum.

End of document.
""",

    DOCS / "MIGRATION_PLAN.md": """# MIGRATION_PLAN

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
""",

    DOCS / "FEATURE_FLAGS.md": """# FEATURE_FLAGS

Purpose:
Feature flags for payment rollout.

---

## Flags

- payments_enabled
- payments_provider_active
- payments_webhooks_active

---

## Rules

- All flags OFF by default
- Flags are backend-only
- Emergency disable supported

End of document.
""",

    # ---------- TESTS ----------
    TESTS / "payment.flow.test.ts": """// payment.flow.test.ts
// Skeleton test for payment flow

describe("Payment Flow", () => {
  it("creates payment intent", async () => {
    // TODO: mock provider adapter
    expect(true).toBe(true);
  });
});
""",

    TESTS / "payment.webhook.test.ts": """// payment.webhook.test.ts
// Skeleton test for webhook handling

describe("Payment Webhook", () => {
  it("handles paid webhook idempotently", async () => {
    // TODO: simulate webhook event
    expect(true).toBe(true);
  });
});
""",

    TESTS / "payment.refund.test.ts": """// payment.refund.test.ts
// Skeleton test for refunds

describe("Payment Refund", () => {
  it("processes refund asynchronously", async () => {
    // TODO: refund flow test
    expect(true).toBe(true);
  });
});
"""
}

def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = content.replace("\\r\\n", "\\n").replace("\\r", "\\n")
    if not content.endswith("\\n"):
        content += "\\n"
    path.write_text(content, encoding="utf-8")

def main():
    created, updated = [], []
    for path, content in FILES.items():
        if path.exists():
            if path.read_text(encoding="utf-8", errors="ignore") != content:
                write(path, content)
                updated.append(str(path))
        else:
            write(path, content)
            created.append(str(path))

    print("OK: Payments full automation pack generated.")
    if created:
        print("Created:")
        for f in created: print(" -", f)
    if updated:
        print("Updated:")
        for f in updated: print(" -", f)
    if not created and not updated:
        print("No changes (already up to date).")

if __name__ == "__main__":
    main()
