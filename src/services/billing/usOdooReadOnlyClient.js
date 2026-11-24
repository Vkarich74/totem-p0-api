// G5 T2: server-side, company-scoped, read-only Odoo Online JSON-RPC.
// No CRM and no Odoo write methods. NEVER accept credentials from a browser.
const MODELS = new Set([
  "sale.order", "sale.order.line", "sale.subscription.plan",
  "product.product", "account.move", "account.move.line",
  "account.payment", "payment.transaction",
]);

export function createUsOdooReadOnlyClient({
  baseUrl, database, username, apiKey,
  fetchImpl = globalThis.fetch, timeoutMs = 12000, observe = () => {},
} = {}) {
  const url = new URL(baseUrl || "");
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("US_ODOO_HTTPS_ORIGIN_REQUIRED");
  }
  if (![database, username, apiKey].every(x => typeof x === "string" && x.length > 0) ||
      typeof fetchImpl !== "function") {
    throw new Error("US_ODOO_SERVER_CREDENTIALS_REQUIRED");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 2000 || timeoutMs > 60000) {
    throw new Error("US_ODOO_TIMEOUT_INVALID");
  }
  // Diagnostics are fixed codes only; callbacks cannot change proof decisions.
  function report(code){try{observe(code);}catch{}}
  let counter = 0;
  let authenticated = null;

  async function rpc(service, method, args) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL("/jsonrpc", url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", method: "call",
          params: { service, method, args }, id: ++counter,
        }),
        signal: controller.signal,
        redirect: "error",
      });
      if (!response?.ok) {
        report(response?.status===429?"RATE_LIMIT":response?.status===401||response?.status===403?
          "AUTH_REJECTED":"HTTP_ERROR");
        throw new Error("ODOO_HTTP_FAILED");
      }
      const envelope = await response.json();
      if (envelope?.error || !Object.hasOwn(envelope ?? {}, "result")) {
        report("RPC_ERROR");
        throw new Error("ODOO_REMOTE_FAILED");
      }
      report("RPC_OK");
      return envelope.result;
    } catch {
      report(controller.signal.aborted?"TIMEOUT":"READBACK_ERROR");
      // Odoo exceptions may contain billing PII and internal configuration.
      throw new Error("US_ODOO_READBACK_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }

  async function userId() {
    if (!authenticated) {
      authenticated = rpc("common", "authenticate",
        [database, username, apiKey, {}]).then(value => {
        if (!Number.isSafeInteger(value) || value <= 0) {
          report("AUTH_REJECTED");
          throw new Error("US_ODOO_AUTH_FAILED");
        }
        report("AUTH_OK");
        return value;
      }).catch(error => {
        authenticated = null;
        throw error;
      });
    }
    return authenticated;
  }

  return Object.freeze({
    // Establish authentication before starting the evidence observation clock.
    async authenticate() { await userId(); return true; },
    async searchRead(model, domain, fields, limit = 100) {
      if (!MODELS.has(model)) throw new Error("US_ODOO_MODEL_NOT_ALLOWED");
      if (!Array.isArray(domain) || !Array.isArray(fields) || fields.length < 1 ||
          fields.some(f => typeof f !== "string" || !/^[a-z][a-z0-9_]*$/.test(f)) ||
          !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("US_ODOO_READ_ARGUMENTS_INVALID");
      }
      const result = await rpc("object", "execute_kw", [
        database, await userId(), apiKey, model, "search_read", [domain],
        { fields, limit, order: "id asc", context: { allowed_company_ids: [4], company_id: 4 } },
      ]);
      if (!Array.isArray(result)) throw new Error("US_ODOO_RESULT_INVALID");
      return result;
    },
  });
}
