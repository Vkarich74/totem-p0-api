// PaymentService.ts
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
\n