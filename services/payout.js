/**
 * Payout Calculation Engine (ESM)
 */

import { calculateCommission } from "./commission.js";

export function calculatePayout({ service_price, marketplace }) {
  if (
    typeof service_price !== "number" ||
    isNaN(service_price) ||
    service_price <= 0
  ) {
    return {
      ok: false,
      error: "INVALID_SERVICE_PRICE"
    };
  }

  if (!marketplace || marketplace.enabled !== true) {
    return {
      ok: true,
      type: "direct",
      service_price,
      commission_amount: 0,
      provider_amount: service_price,
      marketplace_amount: 0
    };
  }

  const commissionResult = calculateCommission({ service_price });

  if (!commissionResult.ok) {
    return commissionResult;
  }

  return {
    ok: true,
    type: "marketplace",
    service_price,
    rate: commissionResult.rate,
    commission_amount: commissionResult.commission_amount,
    provider_amount: commissionResult.provider_amount,
    marketplace_amount: commissionResult.commission_amount
  };
}
