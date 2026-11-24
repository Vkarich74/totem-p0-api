import {isScopedUsOdooRequest} from "./usG3ManualRequestReceipt.js";
import {validG3Seal} from "./usOdooG3SealProof.js";
// G5-T3: trusted Odoo paid preflight for the EXISTING Core activation.
// Never read event/browser payload as payment proof and never do Odoo HTTP
// inside a PostgreSQL activation transaction. Default = WAIT (no grant).
import { createUsOdooReadOnlyClient } from "../billing/usOdooReadOnlyClient.js";
import { verifyUsOdooPaidEntitlement } from "../billing/usOdooPaidEntitlement.js";

// Installation is deliberately independent of approval. This hard code gate
// must remain false until paid authority, source receipt, projection and T5
// access guards are jointly accepted. Environment values cannot lift it.
const PAID_ACTIVATION_CODE_RELEASE_APPROVED=false;
const PROJECTION_COLUMNS=Object.freeze({
 provider_namespace:"text",provider_company_id:"integer",provider_website_id:"integer",
 provider_partner_id:"bigint",provider_source_request_id:"text",
 provider_subscription_order_id:"bigint",provider_invoice_id:"bigint",provider_policy_version:"text",
 provider_verified_at:"timestamp with time zone",provider_revoked_at:"timestamp with time zone"
});
export async function inspectUsPaidAuthorityContract(db){
 const q=await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='billing_subscriptions' AND column_name=ANY($1::text[])",[Object.keys(PROJECTION_COLUMNS)]);
 const found=new Map(q.rows.map(x=>[x.column_name,x.data_type]));
 const missing=Object.keys(PROJECTION_COLUMNS).filter(k=>found.get(k)!==PROJECTION_COLUMNS[k]);
 return Object.freeze({verifier_installed:true,preflight_installed:true,release:"HOLD",
  projection_columns_required:Object.keys(PROJECTION_COLUMNS).length,
  projection_columns_present:Object.keys(PROJECTION_COLUMNS).length-missing.length,
  projection_columns_missing:missing,commercial_policy_approved:false,
  paid_evidence_verified:false,reason:"US_ODOO_PAID_ACTIVATION_CODE_RELEASE_HOLD"});
}
function positive(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}
function WAIT(reason) {
  return Object.freeze({ status: "WAIT", canActivate: false, reason });
}

export async function prepareUsPaidActivationEvidence(request, {
  env = process.env, createClient = createUsOdooReadOnlyClient,
  verify = verifyUsOdooPaidEntitlement, now = () => new Date(),
} = {}) {
  if(!PAID_ACTIVATION_CODE_RELEASE_APPROVED)return WAIT("US_ODOO_PAID_ACTIVATION_CODE_RELEASE_HOLD");
  if(!isScopedUsOdooRequest(request)||!validG3Seal(request?.precheck_result_json?.odoo_source_proof)||
      request.precheck_result_json?.normalized?.market_code!=="US"||
      request.source_request_id!=="odoo-us-partner-"+request.source_partner_id||
      !["provisioned","activated","email_ready","email_sent","email_failed"].includes(request.status))
    return WAIT("US_ODOO_TRUSTED_SOURCE_REQUIRED");
  if(request?.owner_type==="master"&&request.source_namespace==="odoo_online"&&
     request.precheck_result_json?.odoo_source_proof?.entry_mode==="own_salon")
    return WAIT("US_OWN_SALON_SHARED_SUBSCRIPTION_NO_SECOND_PAID_RECEIPT");
  if (!request || request.source_namespace !== "odoo_online" ||
      positive(request.source_company_id) !== 4 ||
      positive(request.source_website_id) !== 5 ||
      !positive(request.source_partner_id) ||
      !positive(request.id) || !positive(request.created_owner_id) ||
      !positive(request.created_auth_user_id) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(String(request.source_request_id || "")) ||
      !["salon", "master"].includes(request.owner_type)) {
    return WAIT("US_ODOO_TRUSTED_SOURCE_REQUIRED");
  }
  if (env.TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED !== "true") {
    return WAIT("US_ODOO_SAAS_ACTIVATION_HOLD");
  }
  let policy;
  try {
    policy = JSON.parse(env.TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON || "");
  } catch {
    return WAIT("US_ODOO_COMMERCIAL_POLICY_MISSING");
  }
  if (policy?.approved !== true ||
      !Array.isArray(policy.coveredOwnerTypes) ||
      !policy.coveredOwnerTypes.includes(request.owner_type) ||
      !policy.coveredOwnerTypes.every(type => ["salon", "master"].includes(type))) {
    return WAIT("US_ODOO_ROLE_COMMERCIAL_POLICY_UNAPPROVED");
  }
  const keys = ["TOTEM_US_ODOO_URL", "TOTEM_US_ODOO_DB",
    "TOTEM_US_ODOO_USER", "TOTEM_US_ODOO_API_KEY"];
  if (env.TOTEM_US_ODOO_URL!=="https://totem-platform.odoo.com"||
      env.TOTEM_US_ODOO_DB!=="totem-platform"||
      !keys.every(key => typeof env[key] === "string" && env[key].length > 0)) {
    return WAIT("US_ODOO_SERVER_CREDENTIALS_NOT_CONFIGURED");
  }
  try {
    const client = createClient({
      baseUrl: env.TOTEM_US_ODOO_URL,
      database: env.TOTEM_US_ODOO_DB,
      username: env.TOTEM_US_ODOO_USER,
      apiKey: env.TOTEM_US_ODOO_API_KEY,
    });

    // Source ownership is held in the verified existing Core request.
    // Never accept subscription_order_id, company or partner from req.body.
    const partnersOrders = await client.searchRead("sale.order", [
      ["company_id", "=", 4],
      ["website_id", "=", 5],
      ["partner_id", "=", Number(request.source_partner_id)],
      ["is_subscription", "=", true],
      ["subscription_state", "=", "3_progress"],
      ["plan_id", "=", policy.planId],
    ], ["id"], 100);

    // Multiple active orders require a separately verified renewal lineage.
    // Do not arbitrarily pick an order to activate the wrong business.
    if (partnersOrders.length !== 1 ||
        !positive(partnersOrders[0]?.id)) {
      return WAIT(partnersOrders.length === 0 ?
        "US_ODOO_PAID_SUBSCRIPTION_NOT_FOUND" :
        "US_ODOO_SUBSCRIPTION_ORDER_AMBIGUOUS");
    }
    const result = await verify({
      client, sourcePartnerId: Number(request.source_partner_id),
      subscriptionOrderId: Number(partnersOrders[0].id), policy, now: now(),
    });
    if (result?.status !== "PAID_VERIFIED" || result.canActivate !== true) {
      return WAIT(result?.reason || "US_ODOO_PAID_ENTITLEMENT_NOT_VERIFIED");
    }
    // T5 renewal: a new active Odoo order may continue existing owner access
    // only if Odoo itself attests the subscription_id parent relationship.
    // Never trust an event.body renewable parent pointer.
    const lineage = await client.searchRead("sale.order", [
      ["id", "=", Number(partnersOrders[0].id)],
    ], ["id", "company_id", "website_id", "partner_id", "subscription_id"], 2);
    if (lineage.length !== 1 ||
        Number(lineage[0].id) !== Number(partnersOrders[0].id) ||
        Number(Array.isArray(lineage[0].company_id) ?
          lineage[0].company_id[0] : lineage[0].company_id) !== 4 ||
        Number(Array.isArray(lineage[0].website_id) ?
          lineage[0].website_id[0] : lineage[0].website_id) !== 5 ||
        Number(Array.isArray(lineage[0].partner_id) ?
          lineage[0].partner_id[0] : lineage[0].partner_id) !== Number(request.source_partner_id)) {
      return WAIT("US_ODOO_RENEWAL_LINEAGE_READBACK_UNVERIFIED");
    }
    const linkedParent = lineage[0].subscription_id;
    const parentId = Array.isArray(linkedParent) ?
      positive(linkedParent[0]) : positive(linkedParent);
    // This is a short-lived result, rechecked against FOR UPDATE request.
    const readbackCompletedAt = new Date(now());
    if (!Number.isFinite(readbackCompletedAt.getTime())) {
      return WAIT("US_ODOO_CLOCK_INVALID");
    }
    return Object.freeze({
      ...result,
      verifiedAtUtc: readbackCompletedAt.toISOString(),
      requestId: Number(request.id),
      createdOwnerId: Number(request.created_owner_id),
      createdAuthUserId: Number(request.created_auth_user_id),
      sourceRequestId: request.source_request_id,
      ownerType: request.owner_type,
      renewedFromOrderId: parentId || null,
    });
  } catch {
    return WAIT("US_ODOO_PAID_READBACK_UNAVAILABLE");
  }
}
