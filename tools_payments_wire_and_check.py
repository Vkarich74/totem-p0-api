# tools_payments_wire_and_check.py
# Purpose:
#  - Wire payments into backend safely (flag-based)
#  - Prepare sandbox test runner
#  - Generate production readiness checklist
#
# Usage:
#   python tools_payments_wire_and_check.py

from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent

SRC = ROOT / "src" / "payments"
TESTS = ROOT / "tests" / "payments"
DOCS = ROOT / "docs" / "prod"

def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    if not content.endswith("\n"):
        content += "\n"
    path.write_text(content, encoding="utf-8")

def main():
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    # ---------- WIRE RUNTIME ----------
    write(
        SRC / "wire.runtime.ts",
        """// wire.runtime.ts
// SAFE runtime wiring for payments (flag-controlled)

import { PaymentService } from "./PaymentService";
import { ProviderRegistry } from "./providers/ProviderRegistry";
import { paymentsFlags } from "./payments.flags";

// NOTE: This file does NOTHING unless flags.enabled === true

export function wirePaymentsRuntime(): PaymentService | null {
  if (!paymentsFlags.enabled) {
    return null;
  }

  const registry = new ProviderRegistry();

  // Providers must be registered explicitly elsewhere
  // Example:
  // registry.register(StripeAdapter);

  return new PaymentService(registry);
}
"""
    )

    write(
        SRC / "index.ts",
        """// index.ts
// Payments public entrypoint (SAFE)

export * from "./PaymentTypes";
export * from "./payments.flags";
export { wirePaymentsRuntime } from "./wire.runtime";
"""
    )

    # ---------- SANDBOX TEST RUN ----------
    write(
        TESTS / "sandbox.run.ts",
        """// sandbox.run.ts
// Manual sandbox test runner (NO real money)

describe("Payments Sandbox Run", () => {
  it("boots payments runtime in sandbox mode", async () => {
    // TODO: enable flags in test env
    // TODO: assert runtime wiring does not throw
    expect(true).toBe(true);
  });
});
"""
    )

    # ---------- PROD CHECKLIST ----------
    write(
        DOCS / "PAYMENTS_PROD_CHECKLIST.md",
        f"""# PAYMENTS_PROD_CHECKLIST

Status: PRE-PRODUCTION

Generated at:
- {now}

---

## Architecture

- [ ] Payments wired via wire.runtime.ts
- [ ] No implicit side-effects on import
- [ ] Flags control all behavior

---

## Provider

- [ ] Adapter implemented
- [ ] Webhook signature verified
- [ ] Sandbox tested

---

## Safety

- [ ] Idempotency enforced
- [ ] Retry policy tested
- [ ] Failure matrix reviewed

---

## Go-live

- [ ] REAL payments explicitly enabled
- [ ] Monitoring active
- [ ] Rollback plan ready

---

## Decision

- [ ] Approved for production

End of checklist.
"""
    )

    print("OK: Payments runtime wiring, sandbox runner and prod checklist generated.")
    print("No real payments enabled.")

if __name__ == "__main__":
    main()
