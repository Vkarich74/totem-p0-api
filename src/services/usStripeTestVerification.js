// US-PAY-C11 Stripe TEST account check. Server-to-Stripe GET only.
// No account creation, onboarding impersonation, charges or Stripe writes.
// The connected account ID must originate from server-proven onboarding,
// not an arbitrary owner-provided string. This function only checks readiness.
const ACCOUNT_ID = /^acct_[a-zA-Z0-9]{8,}$/;

export function checkStripeTestSellerSnapshot(account, expectedId) {
  if (!ACCOUNT_ID.test(String(expectedId || "")) ||
      !account || account.id !== expectedId ||
      account.object !== "account" || account.livemode !== false ||
      account.country !== "US") {
    return { verified: false, reason: "STRIPE_TEST_ACCOUNT_ID_OR_MARKET_MISMATCH" };
  }
  if (account.charges_enabled !== true ||
      account.payouts_enabled !== true ||
      account.details_submitted !== true ||
      account.capabilities?.card_payments !== "active" ||
      account.capabilities?.transfers !== "active" ||
      Boolean(account.requirements?.disabled_reason) ||
      (account.requirements?.currently_due || []).length > 0 ||
      (account.requirements?.past_due || []).length > 0) {
    return { verified: false, reason: "STRIPE_TEST_SELLER_NOT_READY" };
  }
  return {
    verified: true,
    account_id: expectedId,
    stripe_mode: "TEST",
    country: "US",
    card_payments_status: "active",
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    verification_source: "stripe_api_test",
  };
}

export async function verifyStripeTestConnectedAccount({
  connectedAccountId, secretKey, fetchImpl = globalThis.fetch,
} = {}) {
  if (!ACCOUNT_ID.test(String(connectedAccountId || ""))) {
    throw new Error("STRIPE_TEST_CONNECTED_ACCOUNT_ID_INVALID");
  }
  if (typeof secretKey !== "string" || !secretKey.startsWith("sk_test_") ||
      typeof fetchImpl !== "function") {
    throw new Error("STRIPE_TEST_SECRET_REQUIRED_AND_LIVE_KEY_FORBIDDEN");
  }
  const headers = {
    Authorization: "Bearer " + secretKey,
    Accept: "application/json",
  };
  const response = await fetchImpl(
    "https://api.stripe.com/v1/accounts/" + encodeURIComponent(connectedAccountId),
    { method: "GET", headers, redirect: "error" }
  );
  if (!response.ok) {
    return { verified: false, reason: "STRIPE_TEST_ACCOUNT_READ_FAILED" };
  }
  const data = await response.json();
  return checkStripeTestSellerSnapshot(data, connectedAccountId);
}
