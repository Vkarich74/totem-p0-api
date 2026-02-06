// ProviderAdapter.ts
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
\n