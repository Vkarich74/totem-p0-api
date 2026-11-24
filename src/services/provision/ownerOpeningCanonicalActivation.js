import {assertUsCommercialWriterReleased} from "./usCommercialWriterRelease.js";
import {kgSharedMasterProof,assertKgSharedMasterActivation} from "./kgSharedMasterIdentity.js";
import {isUsOwnSalonMaster,assertUsOwnSalonActivationReady} from "./usOwnSalonCanonicalActivation.js";
import { persistUsSaasPaidProjection } from "../billing/usSaasEntitlementProjection.js";
// G5-T3: one transactional Core Owner Opening activation for Admin and
// future authenticated reconciliation workers. This is NOT an HTTP endpoint.
// Existing Core canonical entity activation and audit callbacks are reused.
const RECEIPT_MAX_AGE_MS = 10_000;

function fail(code, status = 409) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}
function positive(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function assertUsPaidEvidenceForLockedRequest(request, evidence, now) {
  if (!evidence || evidence.status !== "PAID_VERIFIED" ||
      evidence.canActivate !== true) {
    throw fail("US_ODOO_PAID_ENTITLEMENT_REQUIRED");
  }
  if (!request || request.source_namespace !== "odoo_online" ||
      positive(request.source_company_id) !== 4 ||
      positive(request.source_website_id) !== 5 ||
      positive(request.source_partner_id) !== positive(evidence.partnerId) ||
      positive(request.source_partner_id) === 0 ||
      String(request.source_request_id || "") !== String(evidence.sourceRequestId || "") ||
      !request.source_request_id ||
      positive(request.id) !== positive(evidence.requestId) ||
      positive(request.created_owner_id) !== positive(evidence.createdOwnerId) ||
      positive(request.created_auth_user_id) !== positive(evidence.createdAuthUserId) ||
      request.owner_type !== evidence.ownerType ||
      evidence.companyId !== 4 || evidence.websiteId !== 5) {
    throw fail("US_ODOO_PAYMENT_SOURCE_CHANGED");
  }

  if(request.owner_type==="master"&&["own_salon","existing_salon"].includes(request.precheck_result_json?.odoo_source_proof?.entry_mode))
    throw fail("US_ODOO_MASTER_ROLE_COMMERCIAL_CONTRACT_HOLD");
  const checkedAt = new Date(evidence.verifiedAtUtc);
  const start = new Date(evidence.periodStartUtc);
  const end = new Date(evidence.periodEndExclusiveUtc);
  const instant = new Date(now);
  if (!Number.isFinite(checkedAt.getTime()) ||
      !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
      !Number.isFinite(instant.getTime()) ||
      checkedAt.getTime() > instant.getTime() + 1000 ||
      instant.getTime() - checkedAt.getTime() > RECEIPT_MAX_AGE_MS ||
      !(start.getTime() <= instant.getTime() && instant.getTime() < end.getTime()) ||
      positive(evidence.subscriptionOrderId) === 0 ||
      positive(evidence.invoiceId) === 0 ||
      typeof evidence.commercialPolicyVersion !== "string" ||
      !/^[a-zA-Z0-9_.-]{1,40}$/.test(evidence.commercialPolicyVersion)) {
    throw fail("US_ODOO_PAID_ENTITLEMENT_STALE_OR_EXPIRED");
  }
}

/**
 * Performs the SAME canonical activation for the protected Admin route and
 * future verified events. No Odoo HTTP call inside this PostgreSQL transaction.
 * Takes a fresh FOR UPDATE lock and revalidates the verified Odoo receipt.
 */
export async function activateOwnerOpeningCanonical({
  pool, requestId, admin, paidEvidence = null, masterReceipt = null,
  getMarketCode, assertMarketPolicy, assertUsActivationReady,
  activateEntity, writeAudit,
} = {}) {
  assertUsCommercialWriterReleased("activation");
  if (!pool || typeof pool.connect !== "function" ||
      !positive(requestId) || typeof getMarketCode !== "function" ||
      typeof assertMarketPolicy !== "function" ||
      typeof assertUsActivationReady !== "function" ||
      typeof activateEntity !== "function" ||
      typeof writeAudit !== "function") {
    throw fail("OWNER_OPENING_CANONICAL_ACTIVATION_CONTRACT_INVALID", 500);
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await db.query(
      "SELECT * FROM public.owner_opening_requests WHERE id=$1 LIMIT 1 FOR UPDATE",
      [Number(requestId)],
    );
    const current = result.rows[0] || null;
    if (!current) throw fail("OWNER_OPENING_REQUEST_NOT_FOUND", 404);

    // Legacy policies remain authoritative for KG/KZ and frozen US.
    assertMarketPolicy(current);
    const market = getMarketCode(current);
    // A trusted US Odoo source may never be treated as legacy KG/KZ by a
    // malformed, changed or stale precheck market field.
    if (market !== "US" &&
        (current.source_namespace === "odoo_online" || paidEvidence)) {
      throw fail("US_ODOO_SOURCE_MARKET_MISMATCH");
    }
    if (current.status === "activated") {
      await db.query("COMMIT");
      return { request: current, idempotent: true };
    }
    if (current.status !== "provisioned") {
      throw fail("OWNER_OPENING_REQUEST_STATUS_INVALID");
    }

    if(kgSharedMasterProof(current)){
      if(market!=="KG")throw fail("KG_SHARED_MASTER_MARKET_MISMATCH");
      await assertKgSharedMasterActivation(db,current);
    }
    let sharedAuthority=null;
    if(market==="US"&&isUsOwnSalonMaster(current)){
      // The same salon subscription is already projected. Never consume a
      // master payment receipt or create a duplicate projection.
      if(paidEvidence)throw fail("US_MASTER_SECOND_PAID_RECEIPT_FORBIDDEN");
      sharedAuthority=await assertUsOwnSalonActivationReady(db,current,masterReceipt);
    }else if (market === "US") {
      const nowRow = await db.query("SELECT clock_timestamp() AS now");
      assertUsPaidEvidenceForLockedRequest(
        current, paidEvidence, nowRow.rows[0]?.now,
      );
      await assertUsActivationReady(db, current, positive(current.created_owner_id));
      // Odoo-paid entitlement projection is committed atomically with owner/auth.
      await persistUsSaasPaidProjection(db,current,paidEvidence,nowRow.rows[0]?.now,
        assertUsPaidEvidenceForLockedRequest);
    }

    const ownerActivation = await activateEntity(db, current);
    if(sharedAuthority){
      if(Number(ownerActivation?.master?.id)!==sharedAuthority.masterId||
         Number(ownerActivation?.master?.user_id)!==sharedAuthority.principalAuthUserId||
         ownerActivation?.master?.active!==true)
        throw fail("US_MASTER_SHARED_ACTIVATION_READBACK_MISMATCH");
    }else if (market === "US") {
      const role = current.owner_type === "salon" ? "salon_admin" :
        current.owner_type === "master" ? "master" : null;
      if (!role) throw fail("OWNER_OPENING_ROLE_INVALID");
      const unlocked = await db.query(
        "UPDATE public.auth_users SET enabled=true WHERE id=$1 AND role=$2 AND enabled=false RETURNING id",
        [current.created_auth_user_id, role],
      );
      if (unlocked.rows.length !== 1) {
        throw fail("US_AUTH_ACTIVATION_READBACK_MISMATCH");
      }
    }
    const updated = await db.query(
      "UPDATE public.owner_opening_requests SET status='activated', activated_at=NOW(), updated_at=NOW() WHERE id=$1 AND status='provisioned' RETURNING *",
      [requestId],
    );
    if (updated.rows.length !== 1) {
      throw fail("OWNER_OPENING_ACTIVATION_STATE_CHANGED");
    }
    const request = updated.rows[0];
    const auditEvent = await writeAudit(db, {
      request, eventType: "owner_opening.activated", admin,
      data: {
        created_owner_id: positive(current.created_owner_id),
        owner_activation: ownerActivation,
        ...(sharedAuthority ? {
          shared_salon_subscription:true,salon_owner_id:sharedAuthority.salonId,
          principal_auth_user_id:sharedAuthority.principalAuthUserId,
          odoo_subscription_order_id:sharedAuthority.subscriptionOrderId,
          paid_period_end_utc:sharedAuthority.paidUntil,
        } : market === "US" ? {
          odoo_paid_invoice_id: positive(paidEvidence.invoiceId),
          odoo_subscription_order_id: positive(paidEvidence.subscriptionOrderId),
          paid_period_end_utc: paidEvidence.periodEndExclusiveUtc,
          commercial_policy_version: paidEvidence.commercialPolicyVersion,
          payment_source_verified: true,
        } : {}),
      },
    });
    if(market==="US"&&!auditEvent?.id)throw fail("US_ACTIVATION_AUDIT_REQUIRED");
    await db.query("COMMIT");
    return {
      request, owner_activation: ownerActivation,
      audit_event_id: auditEvent?.id ? Number(auditEvent.id) : null,
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
