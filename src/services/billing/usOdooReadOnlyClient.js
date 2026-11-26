// G5 T2: server-side, company-scoped, read-only Odoo Online JSON-RPC.
// No CRM and no Odoo write methods. NEVER accept credentials from a browser.
const MODELS = new Set([
  "sale.order", "sale.order.line", "sale.subscription.plan",
  "product.product", "account.move", "account.move.line",
  "account.payment", "payment.transaction",
]);

// S01: no Billing reader UID has been approved. This immutable binding is
// deliberately separate from the manual Bridge/source reader and environment.
// An owner-approved exact existing internal UID requires a reviewed release.
const APPROVED_BILLING_READER_UID = null;
export function assertUsOdooBillingReaderUid(expectedUid,actualUid){
  if(!Number.isSafeInteger(expectedUid)||expectedUid<=2||
     !Number.isSafeInteger(actualUid)||actualUid!==expectedUid)
    throw new Error("US_ODOO_BILLING_READER_UID_MISMATCH");
  return actualUid;
}

// S02: exact current paid-verifier shapes, not a generic field union.
// ID provenance and native effective record isolation are separate S03 gates.
const POSITIVE_ID=Symbol("positive-id");
const ID_SET=Symbol("unique-id-set");
const SINGLE_ID_SET=Symbol("single-id-set");
const eq=(field,value)=>[field,"=",value];
const byId=[[ "id","=",POSITIVE_ID ]];
const byIds=[[ "id","in",ID_SET ]];
const shape=(id,model,domain,fields,limit)=>({id,model,domain,fields:fields.split(" "),limit});
const BILLING_READ_SHAPES=[
 shape("R01","sale.order",[eq("company_id",4),eq("website_id",5),eq("partner_id",POSITIVE_ID),eq("is_subscription",true),eq("subscription_state","3_progress"),eq("plan_id",6)],"id",100),
 shape("R02","sale.order",byId,"id company_id website_id partner_id subscription_id",2),
 shape("R03","sale.order",byId,"id company_id website_id partner_id currency_id is_subscription state subscription_state plan_id order_line invoice_ids payment_exception pending_transaction subscription_id start_date end_date next_invoice_date",2),
 shape("R04","sale.subscription.plan",[eq("id",6)],"id company_id billing_period_unit billing_period_value",2),
 shape("R05","sale.order.line",byIds,"id company_id order_id product_id recurring_invoice price_unit price_subtotal discount product_uom_qty product_uom_id currency_id",100),
 shape("R06","product.product",byIds,"id company_id product_tmpl_id recurring_invoice",100),
 shape("R07","account.move",byIds,"id company_id partner_id currency_id move_type state payment_state amount_total amount_residual invoice_date invoice_line_ids payment_ids reversal_move_ids",100),
 shape("R08","account.move",[eq("reversed_entry_id",POSITIVE_ID),eq("move_type","out_refund"),eq("state","posted"),eq("company_id",4)],"id company_id reversed_entry_id state",100),
 shape("R09","account.move.line",byIds,"id move_id company_id product_id subscription_id sale_line_ids deferred_start_date deferred_end_date price_subtotal price_unit discount quantity product_uom_id currency_id",100),
 shape("R10","account.payment",byIds,"id state company_id partner_id currency_id payment_type invoice_ids amount",100),
 shape("R11","payment.transaction",[["invoice_ids","in",SINGLE_ID_SET]],"id state company_id partner_id currency_id invoice_ids amount operation source_transaction_id child_transaction_ids",100),
];
// R12-R14 negative writer reads were removed in 7.03. Do not retain them.
const positiveId=x=>Number.isSafeInteger(x)&&x>0;
function snapshotArray(value,max){
 if(!Array.isArray(value)||value.length<1||value.length>max)
  throw Error("US_ODOO_BILLING_READ_SHAPE_DENIED");
 const copy=[];
 for(let i=0;i<value.length;i++){
  const d=Object.getOwnPropertyDescriptor(value,String(i));
  if(!d||!Object.hasOwn(d,"value"))throw Error("US_ODOO_BILLING_READ_SHAPE_DENIED");
  copy.push(d.value);
 }
 return copy;
}
function valueMatches(actual,expected){
 if(expected===POSITIVE_ID)return positiveId(actual);
 if(expected===ID_SET||expected===SINGLE_ID_SET)
  return Array.isArray(actual)&&(expected!==SINGLE_ID_SET||actual.length===1)&&
   actual.every(positiveId)&&new Set(actual).size===actual.length;
 return actual===expected;
}
export function validateUsOdooBillingReadShape(model,domain,fields,limit=100){
 // Snapshot plain array values before authentication awaits. No caller-owned
 // arrays are passed into RPC, and sparse/accessor arrays fail closed.
 const safeDomain=snapshotArray(domain,6).map(clause=>{
  const c=snapshotArray(clause,3);
  if(c.length!==3)throw Error("US_ODOO_BILLING_READ_SHAPE_DENIED");
  if(Array.isArray(c[2]))c[2]=snapshotArray(c[2],100);
  return c;
 });
 const safeFields=snapshotArray(fields,17);
 const match=BILLING_READ_SHAPES.find(s=>s.model===model&&s.limit===limit&&
  s.fields.length===safeFields.length&&s.fields.every((f,i)=>f===safeFields[i])&&
  s.domain.length===safeDomain.length&&s.domain.every((c,i)=>
   c[0]===safeDomain[i][0]&&c[1]===safeDomain[i][1]&&valueMatches(safeDomain[i][2],c[2])));
 if(!match)throw Error("US_ODOO_BILLING_READ_SHAPE_DENIED");
 return {shapeId:match.id,model,domain:safeDomain,fields:safeFields,limit};
}

function createReadOnlyClient(models,context,{
  baseUrl, database, username, apiKey,
  fetchImpl = globalThis.fetch, timeoutMs = 12000, observe = () => {},
} = {}, expectedBillingUid = null) {
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
        if(expectedBillingUid!==null){
          try{assertUsOdooBillingReaderUid(expectedBillingUid,value);}
          catch(error){report("AUTH_REJECTED");throw error;}
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
    async assertSourceReader(expectedUid) {
      if (!models.has("crm.lead") || !Number.isSafeInteger(expectedUid) || expectedUid <= 2 ||
          await userId() !== expectedUid) throw Error("US_ODOO_SOURCE_READER_INVALID");
    },
    async sourceWitness(partnerId) {
      if (!models.has("crm.lead") || !Number.isSafeInteger(partnerId) || partnerId <= 0)
        throw Error("US_ODOO_SOURCE_ID_INVALID");
      return rpc("object","execute_kw",[database,await userId(),apiKey,
        "ir.model.data","check_object_reference",
        ["totem_us_bridge","company4_site5_partner_"+partnerId],
        {raise_on_access_error:true,context}]);
    },
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
  if(!Number.isSafeInteger(APPROVED_BILLING_READER_UID)||APPROVED_BILLING_READER_UID<=2)
    throw new Error("US_ODOO_BILLING_READER_APPROVAL_HOLD");
  const c=createReadOnlyClient(MODELS,{allowed_company_ids:[4],company_id:4},options,APPROVED_BILLING_READER_UID);
  return Object.freeze({authenticate:c.authenticate,
    async searchRead(model,domain,fields,limit=100){
      const q=validateUsOdooBillingReadShape(model,domain,fields,limit);
      return c.searchRead(q.model,q.domain,q.fields,q.limit);
    }
  });
}
const SOURCE_MODELS=new Set(["res.partner","crm.lead","res.country.state"]);
export const LEAD_FIELDS=Object.freeze(["id","active","type","company_id","team_id","stage_id","partner_id",
 "x_totem_us_source_partner_id","x_totem_us_source_key","x_totem_us_source_marker",
 "x_totem_us_owner_type","x_totem_us_website_id","x_totem_us_slug_requested",
 "x_totem_us_state_code","x_totem_us_postal_code","x_totem_us_salon_slug","x_totem_us_specialization","email_from","phone","street","city",
 "state_id","zip","write_date","contact_name","partner_name","country_id","street2","website",
 "x_totem_us_master_entry_mode","x_totem_us_business_phone","x_totem_us_existing_salon_partner_id",
 "x_totem_us_source_revision","x_totem_us_source_hash"]);
export const PROFILE_FIELDS=Object.freeze(["id","active","company_id","website_id","email","name","write_date",
 "x_totem_us_profile_status","x_totem_us_account_kind","x_totem_us_master_entry_mode",
 "x_totem_us_business_name","x_totem_us_business_phone","x_totem_us_business_street",
 "x_totem_us_business_city","x_totem_us_business_state_id","x_totem_us_business_zip",
 "x_totem_us_business_slug","x_totem_us_business_description",
 "phone","x_totem_us_master_slug","x_totem_us_master_specialty","x_totem_us_master_bio","x_totem_us_master_salon_id",
 "x_totem_us_business_website","x_totem_us_approval_revision","x_totem_us_approved_at",
 "x_totem_us_approved_by_id","x_totem_us_approved_salon_slug","x_totem_us_approved_state_code"]);
const validId=id=>Number.isSafeInteger(id)&&id>0;
export function createUsOdooApprovedSourceClient(options={}){
 const c=createReadOnlyClient(SOURCE_MODELS,{allowed_company_ids:[4],company_id:4,active_test:false},options);
 const key=id=>{if(!validId(id))throw Error("US_ODOO_SOURCE_ID_INVALID");return id;};
 const crmScope=[["company_id","=",4],["team_id","=",8]];
 return Object.freeze({
  assertReader:uid=>c.assertSourceReader(uid),
  readWitness:id=>c.sourceWitness(key(id)),
  readLead:id=>c.searchRead("crm.lead",[["id","=",key(id)],...crmScope],LEAD_FIELDS,2),
  readPartnerLeads:id=>c.searchRead("crm.lead",[
    "|","|",["x_totem_us_source_partner_id","=",key(id)],["x_totem_us_source_key","=","odoo-us-partner-"+key(id)],
    "&",["partner_id","=",key(id)],["team_id","=",8],["company_id","=",4]],LEAD_FIELDS,2),
  readPartner:id=>c.searchRead("res.partner",[
    ["id","=",key(id)],["company_id","=",4],["website_id","=",5]],PROFILE_FIELDS,2),
  readState:id=>c.searchRead("res.country.state",[
    ["id","=",key(id)],["country_id","=",233]],["id","country_id","code"],2),
 });
}
