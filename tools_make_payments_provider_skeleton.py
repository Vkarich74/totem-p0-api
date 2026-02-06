# tools_make_payments_provider_skeleton.py
# Purpose: Generate provider-agnostic payments skeleton (TypeScript).
# SAFE: no routes, no env, no runtime wiring.
# Usage: python tools_make_payments_provider_skeleton.py

from __future__ import annotations
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = ROOT / "src" / "payments"
PROVIDERS = BASE / "providers"

FILES: dict[Path, str] = {
    BASE / "PaymentTypes.ts": """// PaymentTypes.ts
// Canonical types for payments domain (provider-agnostic)

export type PaymentStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "canceled";

export interface Payment {
  paymentId: string;
  bookingId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider?: string;
  providerRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentIntent {
  paymentId: string;
  redirectUrl?: string;
}

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  provider: string;
  payload: unknown;
}
""",

    BASE / "PaymentService.ts": """// PaymentService.ts
// Orchestrates payment flow without binding to a concrete provider.

import { Payment, PaymentIntent, WebhookEvent } from "./PaymentTypes";
import { ProviderRegistry } from "./providers/ProviderRegistry";

export class PaymentService {
  constructor(private registry: ProviderRegistry) {}

  async createPaymentIntent(input: {
    bookingId: string;
    amount: number;
    currency: string;
    provider: string;
    returnUrl: string;
  }): Promise<PaymentIntent> {
    const provider = this.registry.get(input.provider);
    // NOTE: persistence is intentionally omitted (SAFE SKELETON)
    return provider.createIntent(input);
  }

  async handleWebhook(event: WebhookEvent): Promise<void> {
    const provider = this.registry.get(event.provider);
    // NOTE: idempotency & persistence handled elsewhere
    await provider.handleWebhook(event);
  }
}
""",

    PROVIDERS / "ProviderAdapter.ts": """// ProviderAdapter.ts
// Interface every payment provider must implement.

import { PaymentIntent, WebhookEvent } from "../PaymentTypes";

export interface ProviderAdapter {
  readonly name: string;

  createIntent(input: {
    bookingId: string;
    amount: number;
    currency: string;
    returnUrl: string;
  }): Promise<PaymentIntent>;

  handleWebhook(event: WebhookEvent): Promise<void>;
}
""",

    PROVIDERS / "ProviderRegistry.ts": """// ProviderRegistry.ts
// Registers and resolves provider adapters.

import { ProviderAdapter } from "./ProviderAdapter";

export class ProviderRegistry {
  private providers = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    this.providers.set(adapter.name, adapter);
  }

  get(name: string): ProviderAdapter {
    const p = this.providers.get(name);
    if (!p) {
      throw new Error(`Payment provider not registered: ${name}`);
    }
    return p;
  }
}
""",

    PROVIDERS / "providers.README.md": """# Providers Skeleton

This folder contains provider adapters.
No provider is enabled by default.

Rules:
- One adapter per provider
- Implement ProviderAdapter interface
- No secrets in code
- Webhooks are the source of truth
""",

    BASE / "payments.README.md": """# Payments Skeleton

This is a SAFE skeleton.
- No routes registered
- No env variables required
- No provider enabled

How to integrate a provider later:
1. Implement ProviderAdapter
2. Register it in ProviderRegistry
3. Wire persistence and idempotency
4. Enable routes explicitly
"""
}

def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = content.replace("\\r\\n", "\\n").replace("\\r", "\\n")
    if not text.endswith("\\n"):
        text += "\\n"
    path.write_text(text, encoding="utf-8")

def main() -> int:
    created, updated = [], []
    for p, content in FILES.items():
        if p.exists():
            if p.read_text(encoding="utf-8", errors="ignore") != content:
                write(p, content)
                updated.append(str(p))
        else:
            write(p, content)
            created.append(str(p))
    print("OK: payments provider skeleton generated.")
    if created:
        print("Created:")
        for x in created: print(" -", x)
    if updated:
        print("Updated:")
        for x in updated: print(" -", x)
    if not created and not updated:
        print("No changes (already up to date).")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
