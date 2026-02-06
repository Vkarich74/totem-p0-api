/**
 * Marketplace Commission Engine (ESM)
 */

export function calculateCommission({ service_price }) {
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

  const COMMISSION_RATE = 0.15;

  const commission_amount = Math.round(service_price * COMMISSION_RATE);
  const provider_amount = service_price - commission_amount;

  return {
    ok: true,
    rate: COMMISSION_RATE,
    service_price,
    commission_amount,
    provider_amount
  };
}
