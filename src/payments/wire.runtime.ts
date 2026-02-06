// wire.runtime.ts
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
