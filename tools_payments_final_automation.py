# tools_payments_final_automation.py
# Purpose:
#  - Autogenerate provider adapter
#  - Autogenerate secure webhook skeleton
#  - Enable REAL PAYMENTS only by explicit flag
# Usage:
#   python tools_payments_final_automation.py stripe --enable-real
#   python tools_payments_finalations.py stripe   (sandbox only)

from pathlib import Path
import sys
from datetime import datetime

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src" / "payments"
PROVIDERS = SRC / "providers"
WEBHOOKS = SRC / "webhooks"

DOCS = ROOT / "docs" / "payments_provider"

ALLOWED = {"stripe", "adyen", "cloudpayments", "mock"}

def die(msg):
    print("ERROR:", msg)
    sys.exit(1)

def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    if not content.endswith("\n"):
        content += "\n"
    path.write_text(content, encoding="utf-8")

def main():
    if len(sys.argv) < 2:
        die("Provider required. Example: python tools_payments_final_automation.py stripe")

    provider = sys.argv[1].lower()
    enable_real = "--enable-real" in sys.argv

    if provider not in ALLOWED:
        die(f"Unsupported provider '{provider}'. Allowed: {', '.join(ALLOWED)}")

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    # ---------- PROVIDER ADAPTER ----------
    write(
        PROVIDERS / f"{provider}.adapter.ts",
        f"""// {provider}.adapter.ts
// Auto-generated provider adapter (SAFE SKELETON)

import {{ ProviderAdapter }} from "./ProviderAdapter";
import {{ PaymentIntent, WebhookEvent }} from "../PaymentTypes";

export const {provider.capitalize()}Adapter: ProviderAdapter = {{
  name: "{provider}",

  async createIntent(input): Promise<PaymentIntent> {{
    // TODO: integrate {provider} SDK (sandbox first)
    return {{
      paymentId: "sandbox",
      redirectUrl: undefined,
    }};
  }},

  async handleWebhook(event: WebhookEvent): Promise<void> {{
    // TODO: verify signature and map events
    return;
  }},
}};
"""
    )

    # ---------- WEBHOOK SKELETON ----------
    write(
        WEBHOOKS / "payments.webhook.ts",
        """// payments.webhook.ts
// Secure webhook endpoint skeleton (SAFE)

import { PaymentService } from "../PaymentService";

// NOTE: framework-specific wiring intentionally omitted
// Verify signature BEFORE calling service

export async function handlePaymentsWebhook(req: any, res: any) {
  // TODO: extract headers, verify signature
  // TODO: build WebhookEvent
  // await paymentService.handleWebhook(event);
  res.status(200).end();
}
"""
    )

    # ---------- FLAGS ----------
    write(
        SRC / "payments.flags.ts",
        f"""// payments.flags.ts
// Payment feature flags (auto-generated)

export const paymentsFlags = {{
  enabled: {str(enable_real).lower()},
  sandbox: {str(not enable_real).lower()},
  provider: "{provider}",
}};
"""
    )

    # ---------- DOCS ----------
    write(
        DOCS / "REAL_PAYMENTS_ENABLED.md",
        f"""# REAL_PAYMENTS_ENABLED

Status:
- REAL PAYMENTS: {"ENABLED" if enable_real else "DISABLED"}
- Provider: {provider}

Activated at:
- {now}

Rules:
- This file exists ONLY after explicit command
- Production charges allowed ONLY if enabled=true

End of document.
"""
    )

    print("OK: Final payments automation complete.")
    print("Provider:", provider)
    print("REAL PAYMENTS:", "ENABLED" if enable_real else "DISABLED")

if __name__ == "__main__":
    main()
