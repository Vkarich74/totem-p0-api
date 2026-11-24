// G5-T3: trusted Odoo paid preflight for the EXISTING Core activation.
// Never read event/browser payload as payment proof and never do Odoo HTTP
// inside a PostgreSQL activation transaction. Default = WAIT (no grant).
import { createUsOdooReadOnlyClient } from "../billing/usOdooReadOnlyClient.js";
import { verifyUsOdooPaidEntitlement } from "../billing/usOdooPaidEntitlement.js";

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
  if (!keys.every(key => typeof env[key] === "string" && env[key].length > 0)) {
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
