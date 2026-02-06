// stripe.adapter.ts
// Auto-generated provider adapter (SAFE SKELETON)

import { ProviderAdapter } from "./ProviderAdapter";
import { PaymentIntent, WebhookEvent } from "../PaymentTypes";

export const StripeAdapter: ProviderAdapter = {
  name: "stripe",

  async createIntent(input): Promise<PaymentIntent> {
    // TODO: integrate stripe SDK (sandbox first)
    return {
      paymentId: "sandbox",
      redirectUrl: undefined,
    };
  },

  async handleWebhook(event: WebhookEvent): Promise<void> {
    // TODO: verify signature and map events
    return;
  },
};
