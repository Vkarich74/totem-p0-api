// Stripe LIVE Connect Standard-account REST adapter, US only.
// No real calls are made without the server-held sk_live_ key AND a
// GET /v1/account match to the explicitly pinned TOTEM USA Connect platform.
// No charges, transfers, payouts, bank details or checkout are implemented.
const STRIPE_API = "https://api.stripe.com";
export const TOTEM_US_CONNECT_PLATFORM = "acct_1UcJO2GBhTJXwgwV";
const ACCOUNT_ID = /^acct_[a-zA-Z0-9]{8,}$/;
const CONNECT_LINK_HOST = "connect.stripe.com";

function liveKey(key) {
  return typeof key === "string" && /^sk_live_[a-zA-Z0-9_]+$/.test(key);
}

async function stripeRequest({
  secretKey, method, path, form, idempotencyKey, fetchImpl = globalThis.fetch,
}) {
  if (!liveKey(secretKey)) throw new Error("US_CONNECT_STRIPE_LIVE_KEY_REQUIRED");
  if (typeof fetchImpl !== "function") throw new Error("US_CONNECT_FETCH_REQUIRED");
  if (!/^\/v1\/[a-zA-Z0-9_/-]+$/.test(path) ||
      !["GET", "POST"].includes(method)) {
    throw new Error("US_CONNECT_STRIPE_PATH_FORBIDDEN");
  }
  const headers = { Authorization: "Bearer " + secretKey, Accept: "application/json" };
  if (method === "POST") {
    if (!form || typeof idempotencyKey !== "string" ||
        idempotencyKey.length > 200) {
      throw new Error("US_CONNECT_STRIPE_POST_IDEMPOTENCY_REQUIRED");
    }
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    headers["Idempotency-Key"] = idempotencyKey;
  }
  const response = await fetchImpl(STRIPE_API + path, {
    method, headers,
    ...(method === "POST" ? { body: new URLSearchParams(form).toString() } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const error = new Error("US_CONNECT_STRIPE_UNAVAILABLE");
    error.httpStatus = response.status;
    // Do not expose Stripe response: it may include account PII.
    throw error;
  }
  return response.json();
}

export async function verifyUsConnectPlatform({ secretKey, fetchImpl } = {}) {
  const account = await stripeRequest({
    secretKey, method: "GET", path: "/v1/account", fetchImpl,
  });
  if (account?.id !== TOTEM_US_CONNECT_PLATFORM || account?.country !== "US" ||
      account?.charges_enabled !== true || account?.capabilities?.card_payments !== "active") {
    throw new Error("US_CONNECT_PLATFORM_ACCOUNT_MISMATCH");
  }
  return true;
}

export function isLiveUsStandardAccount(account, expectedId) {
  return Boolean(
    ACCOUNT_ID.test(String(expectedId || "")) &&
    account?.object === "account" &&
    account.id === expectedId &&
    account.country === "US" &&
    account.type === "standard" &&
    account.livemode !== false
  );
}

export function liveSellerReadiness(account, expectedId) {
  if (!isLiveUsStandardAccount(account, expectedId)) {
    return { ready: false, state: "restricted", reason: "ACCOUNT_ID_OR_COUNTRY_MISMATCH" };
  }
  const ready = account.charges_enabled === true &&
    account.payouts_enabled === true &&
    account.details_submitted === true &&
    account.capabilities?.card_payments === "active" &&
    account.capabilities?.transfers === "active" &&
    !account.requirements?.disabled_reason &&
    (account.requirements?.currently_due || []).length === 0 &&
    (account.requirements?.past_due || []).length === 0;
  return {
    ready,
    state: ready ? "verified" :
      account.details_submitted === true ? "restricted" : "onboarding",
    charges_enabled: account.charges_enabled === true,
    payouts_enabled: account.payouts_enabled === true,
    details_submitted: account.details_submitted === true,
    card_payments_status: ["active","inactive","pending"].includes(account.capabilities?.card_payments)
      ? account.capabilities.card_payments : "unknown",
    transfers_status: ["active","inactive","pending"].includes(account.capabilities?.transfers)
      ? account.capabilities.transfers : "unknown",
  };
}

export async function createUsStandardSeller({
  secretKey, provisioningToken, fetchImpl,
} = {}) {
  if (!/^[0-9a-f-]{36}$/.test(String(provisioningToken || ""))) {
    throw new Error("US_CONNECT_PROVISION_TOKEN_INVALID");
  }
  await verifyUsConnectPlatform({ secretKey, fetchImpl });
  const account = await stripeRequest({
    secretKey, fetchImpl,
    method: "POST", path: "/v1/accounts",
    idempotencyKey: "totem-us-c11-live-standard-" + provisioningToken,
    form: {
      type: "standard",
      country: "US",
      "capabilities[card_payments][requested]": "true",
      "capabilities[transfers][requested]": "true",
      "metadata[totem_market]": "US",
      "metadata[totem_c11_binding]": provisioningToken,
    },
  });
  if (!isLiveUsStandardAccount(account, account?.id)) {
    throw new Error("US_CONNECT_CREATED_ACCOUNT_UNEXPECTED");
  }
  return account.id;
}

export async function getUsStandardSeller({
  secretKey, stripeAccountId, fetchImpl,
} = {}) {
  if (!ACCOUNT_ID.test(String(stripeAccountId || ""))) {
    throw new Error("US_CONNECT_ACCOUNT_ID_INVALID");
  }
  await verifyUsConnectPlatform({ secretKey, fetchImpl });
  return stripeRequest({
    secretKey, fetchImpl, method: "GET",
    path: "/v1/accounts/" + stripeAccountId,
  });
}

export async function createUsStandardOnboardingLink({
  secretKey, stripeAccountId, returnUrl, refreshUrl,
  idempotencyKey, fetchImpl,
} = {}) {
  if (!ACCOUNT_ID.test(String(stripeAccountId || "")) ||
      !/^[a-zA-Z0-9_-]{8,200}$/.test(String(idempotencyKey || ""))) {
    throw new Error("US_CONNECT_ONBOARDING_INPUT_INVALID");
  }
  for (const value of [returnUrl,refreshUrl]) {
    const parsed = new URL(String(value));
    if (parsed.protocol !== "https:" || parsed.hostname !== "app.totemv.com" ||
        parsed.pathname !== "/" || !/^#\/(salon|master)\//.test(parsed.hash)) {
      throw new Error("US_CONNECT_CALLBACK_URL_FORBIDDEN");
    }
  }
  const obj = await stripeRequest({
    secretKey, fetchImpl, method: "POST", path: "/v1/account_links",
    idempotencyKey,
    form: {
      account: stripeAccountId,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    },
  });
  const parsed = new URL(String(obj?.url || ""));
  if (parsed.protocol !== "https:" || parsed.hostname !== CONNECT_LINK_HOST ||
      !Number.isSafeInteger(obj.expires_at)) {
    throw new Error("US_CONNECT_ONBOARDING_URL_UNTRUSTED");
  }
  return { url: obj.url, expires_at: obj.expires_at };
}
