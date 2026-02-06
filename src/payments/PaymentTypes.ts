// PaymentTypes.ts
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
\n