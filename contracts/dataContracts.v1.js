// TOTEM — Data Contracts v1
// Canonical, machine-readable, read-only source of truth
// Used by: SDK, Frontend, Partners, Analytics
// Enforcement level: light (read-only), no auto-mutations

export const DATA_CONTRACT_VERSION = "1.0.0";

export const DATA_CONTRACTS = {
  meta: {
    version: DATA_CONTRACT_VERSION,
    status: "active",
    scope: "marketplace",
    enforcement: "read-only",
    updated_at: "2026-01-27T00:00:00Z",
  },

  entities: {
    booking: {
      description: "Canonical booking record",
      required: [
        "booking_id",
        "salon_id",
        "master_id",
        "service_id",
        "date",
        "start_time",
        "status",
        "price",
        "currency",
        "created_at",
      ],
      optional: [
        "client_id",
        "source",
        "end_time",
        "updated_at",
      ],
      types: {
        booking_id: "number",
        salon_id: "string",
        master_id: "string",
        service_id: "string",
        client_id: "number|null",
        date: "YYYY-MM-DD",
        start_time: "HH:mm",
        end_time: "HH:mm|null",
        status: [
          "created",
          "confirmed",
          "completed",
          "cancelled",
          "no_show",
        ],
        price: "number",
        currency: "string",
        source: ["site", "widget", "admin", "api", null],
        created_at: "ISO-8601",
        updated_at: "ISO-8601|null",
      },
      invariants: [
        "price >= 0",
        "start_time < end_time OR end_time IS NULL",
        "status immutable after completed",
      ],
      hints: [
        "ADD_CLIENT_ID",
        "ADD_PRICE",
        "ADD_SALON_ID",
      ],
    },

    payment: {
      description: "Payment linked to booking",
      required: [
        "payment_id",
        "booking_id",
        "amount",
        "currency",
        "provider",
        "status",
        "created_at",
      ],
      optional: [
        "external_id",
        "updated_at",
      ],
      types: {
        payment_id: "number",
        booking_id: "number",
        amount: "number",
        currency: "string",
        provider: ["qr", "cash", "card", "manual"],
        status: [
          "pending",
          "succeeded",
          "failed",
          "refunded",
        ],
        external_id: "string|null",
        created_at: "ISO-8601",
        updated_at: "ISO-8601|null",
      },
      invariants: [
        "amount >= 0",
        "booking_id exists",
      ],
    },

    payout: {
      description: "Aggregated payout entity",
      required: [
        "payout_id",
        "entity_type",
        "entity_id",
        "period_from",
        "period_to",
        "amount",
        "status",
        "created_at",
      ],
      optional: [
        "processed_at",
      ],
      types: {
        payout_id: "number",
        entity_type: ["salon", "master"],
        entity_id: "string",
        period_from: "YYYY-MM-DD",
        period_to: "YYYY-MM-DD",
        amount: "number",
        status: [
          "pending",
          "locked",
          "paid",
          "failed",
        ],
        created_at: "ISO-8601",
        processed_at: "ISO-8601|null",
      },
      invariants: [
        "period_from <= period_to",
        "amount >= 0",
      ],
    },
  },

  guarantees: {
    backward_compatibility: "minor",
    breaking_changes: "major_only",
    deprecated_fields_policy: "explicit",
  },
};

export default {
  version: DATA_CONTRACT_VERSION,
  contracts: DATA_CONTRACTS,
};
