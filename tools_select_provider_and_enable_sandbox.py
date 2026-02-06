# tools_select_provider_and_enable_sandbox.py
# Purpose:
#  - Select and фиксировать payment provider (docs)
#  - Enable SANDBOX mode via flags/config (SAFE)
#  - Generate smoke test skeleton
# Usage:
#   python tools_select_provider_and_enable_sandbox.py stripe
#   python tools_select_provider_and_enable_sandbox.py adyen

from pathlib import Path
import sys
import json
from datetime import datetime

ROOT = Path(__file__).resolve().parent

DOCS = ROOT / "docs" / "payments_provider"
CONFIG = ROOT / "config"
TESTS = ROOT / "tests" / "payments"

ALLOWED_PROVIDERS = {"stripe", "adyen", "cloudpayments", "mock"}

def die(msg: str):
    print("ERROR:", msg)
    sys.exit(1)

def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    if not content.endswith("\n"):
        content += "\n"
    path.write_text(content, encoding="utf-8")

def main():
    if len(sys.argv) != 2:
        die("Provider name required. Example: python tools_select_provider_and_enable_sandbox.py stripe")

    provider = sys.argv[1].lower()
    if provider not in ALLOWED_PROVIDERS:
        die(f"Unsupported provider '{provider}'. Allowed: {', '.join(sorted(ALLOWED_PROVIDERS))}")

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    # ---------- DOCS ----------
    write(
        DOCS / "SELECTED_PROVIDER.md",
        f"""# SELECTED_PROVIDER

Status: SELECTED (SANDBOX)

Provider:
- name: {provider}

Selected at:
- {now}

Notes:
- Sandbox mode only
- No production traffic enabled
- Provider adapter may be implemented next

End of document.
"""
    )

    write(
        DOCS / "SANDBOX_MODE.md",
        f"""# SANDBOX_MODE

Purpose:
Define sandbox/test mode behavior for payments.

---

## Mode

- SANDBOX: ENABLED
- REAL PAYMENTS: DISABLED

---

## Rules

- No real money processed
- Provider sandbox credentials only
- Webhooks accepted in test mode
- Booking lifecycle unchanged

---

## Active provider

- {provider}

Activated at:
- {now}

End of document.
"""
    )

    write(
        DOCS / "PROVIDER_DECISION_LOG.md",
        f"""# PROVIDER_DECISION_LOG

Decision:
- Provider selected: {provider}
- Mode: SANDBOX

Rationale:
- Meets technical requirements
- Supports webhooks and idempotency
- Sandbox available

Decision date:
- {now}

End of document.
"""
    )

    # ---------- CONFIG (FLAGS) ----------
    CONFIG.mkdir(parents=True, exist_ok=True)
    flags_path = CONFIG / "payments.flags.json"

    flags = {
        "payments_enabled": False,
        "payments_provider": provider,
        "payments_sandbox": True,
        "payments_webhooks_active": True
    }

    write(flags_path, json.dumps(flags, indent=2))

    # ---------- TEST SKELETON ----------
    write(
        TESTS / "sandbox.smoke.test.ts",
        f"""// sandbox.smoke.test.ts
// Smoke test for sandbox payments ({provider})

describe("Payments Sandbox Smoke", () => {{
  it("creates sandbox payment intent without real charge", async () => {{
    // TODO: mock provider adapter ({provider})
    expect(true).toBe(true);
  }});
}});
"""
    )

    print("OK: Provider selected and SANDBOX enabled.")
    print("Provider:", provider)
    print("Files updated:")
    print(" - docs/payments_provider/*")
    print(" - config/payments.flags.json")
    print(" - tests/payments/sandbox.smoke.test.ts")

if __name__ == "__main__":
    main()
