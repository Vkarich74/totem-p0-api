// G5 T2: server-side, company-scoped, read-only Odoo Online JSON-RPC.
// No CRM and no Odoo write methods. NEVER accept credentials from a browser.
const MODELS = new Set([
  "sale.order", "sale.order.line", "sale.subscription.plan",
  "product.product", "account.move", "account.move.line",
  "account.payment", "payment.transaction",
]);

function createReadOnlyClient(models,context,{
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
      if (!models.has(model)) throw new Error("US_ODOO_MODEL_NOT_ALLOWED");
      if (!Array.isArray(domain) || !Array.isArray(fields) || fields.length < 1 ||
          fields.some(f => typeof f !== "string" || !/^[a-z][a-z0-9_]*$/.test(f)) ||
          !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("US_ODOO_READ_ARGUMENTS_INVALID");
      }
      const result = await rpc("object", "execute_kw", [
        database, await userId(), apiKey, model, "search_read", [domain],
        { fields, limit, order: "id asc", context },
      ]);
      if (!Array.isArray(result)) throw new Error("US_ODOO_RESULT_INVALID");
      return result;
    },
  });
}

// Existing billing client remains CRM-free. The approved-source reader has
// only fixed scoped read methods; no generic CRM query or write API is exposed.
export function createUsOdooReadOnlyClient(options={}){
  return createReadOnlyClient(MODELS,{allowed_company_ids:[4],company_id:4},options);
}
const SOURCE_MODELS=new Set(["res.partner","crm.lead","res.country.state"]);
const LEAD_FIELDS=["id","active","type","company_id","team_id","stage_id","partner_id",
 "x_totem_us_source_partner_id","x_totem_us_source_key","x_totem_us_source_marker",
 "x_totem_us_owner_type","x_totem_us_website_id","x_totem_us_slug_requested",
 "x_totem_us_state_code","x_totem_us_postal_code","email_from","phone","street","city",
 "state_id","zip","write_date"];
const PROFILE_FIELDS=["id","active","company_id","website_id","email","name","write_date",
 "x_totem_us_profile_status","x_totem_us_account_kind","x_totem_us_master_entry_mode",
 "x_totem_us_business_name","x_totem_us_business_phone","x_totem_us_business_street",
 "x_totem_us_business_city","x_totem_us_business_state_id","x_totem_us_business_zip",
 "x_totem_us_business_slug","x_totem_us_business_description"];
const validId=id=>Number.isSafeInteger(id)&&id>0;
export function createUsOdooApprovedSourceClient(options={}){
 const c=createReadOnlyClient(SOURCE_MODELS,{allowed_company_ids:[4],company_id:4,active_test:false},options);
 const key=id=>{if(!validId(id))throw Error("US_ODOO_SOURCE_ID_INVALID");return id;};
 const crmScope=[["company_id","=",4],["team_id","=",8]];
 return Object.freeze({
  readLead:id=>c.searchRead("crm.lead",[["id","=",key(id)],...crmScope],LEAD_FIELDS,2),
  readPartnerLeads:id=>c.searchRead("crm.lead",[
    ["x_totem_us_source_partner_id","=",key(id)],...crmScope],LEAD_FIELDS,2),
  readPartner:id=>c.searchRead("res.partner",[
    ["id","=",key(id)],["company_id","=",4],["website_id","=",5]],PROFILE_FIELDS,2),
  readState:id=>c.searchRead("res.country.state",[
    ["id","=",key(id)],["country_id","=",233]],["id","country_id","code"],2),
 });
}
