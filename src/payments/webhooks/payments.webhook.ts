// payments.webhook.ts
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
