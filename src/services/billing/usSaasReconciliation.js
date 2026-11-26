// G5-T5: revision-bound renewal/revocation of an EXISTING projection only.
// Reuses the existing T2 verifier and T3 projection writer. No provisioning,
// new entitlement row, wallet/Stripe, welcome, or CRM. Remains hard HOLD.
import {assertUsCommercialWriterReleased} from "../provision/usCommercialWriterRelease.js";
import {prepareUsPaidActivationEvidence} from "../provision/usPaidOwnerOpeningGate.js";
import {assertUsPaidEvidenceForLockedRequest} from "../provision/ownerOpeningCanonicalActivation.js";
import {validG3Seal} from "../provision/usOdooG3SealProof.js";
import {createUsOdooReadOnlyClient} from "./usOdooReadOnlyClient.js";
import {isUsOdooServicePeriodPolicy} from "./usOdooPaidEntitlement.js";
import {persistUsSaasPaidProjection,readUsSaasTransactionClock,usSaasAuditId} from "./usSaasEntitlementProjection.js";
import {US_SAAS_SYSTEM_ACTOR,writeSystemUsSaasReconciliationAudit} from "./usSaasReconciliationAudit.js";

const CURRENT=new Set(["activated","email_ready","email_sent","email_failed"]);
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
const ms=v=>v==null?NaN:new Date(v).getTime();
const wait=reason=>({status:"WAIT",reason});
const hold=()=>({status:"HOLD",reason:"US_SAAS_RESTORATION_AUTHORITY_HOLD"});
const renewable=b=>b?.subscription_status==="active"&&b.blocked_at===null&&b.provider_revoked_at===null;
const fail=code=>Object.assign(Error(code),{code,status:409});
const sourceKey=r=>JSON.stringify([r.id,r.owner_type,r.created_owner_id,r.created_auth_user_id,r.source_namespace,r.source_company_id,r.source_website_id,r.source_partner_id,r.source_request_id,r.status,r.precheck_result_json?.odoo_source_proof]);
const rowKey=b=>JSON.stringify([b.id,b.owner_type,b.owner_id,b.provider_namespace,b.provider_company_id,b.provider_website_id,b.provider_partner_id,b.provider_source_request_id,b.provider_subscription_order_id,b.provider_invoice_id,b.provider_policy_version,b.provider_verified_at,b.provider_revoked_at,b.subscription_status,b.current_period_start,b.current_period_end,b.blocked_at,b.updated_at]);
function exact(r,b){
 return !!r&&!!b&&id(r.id)>0&&id(r.created_owner_id)>0&&id(r.created_auth_user_id)>0&&id(r.source_partner_id)>0&&
  r.source_namespace==="odoo_online"&&Number(r.source_company_id)===4&&Number(r.source_website_id)===5&&
  r.precheck_result_json?.normalized?.market_code==="US"&&validG3Seal(r.precheck_result_json?.odoo_source_proof)&&
  r.source_request_id==="odoo-us-partner-"+r.source_partner_id&&CURRENT.has(r.status)&&
  ["salon","master"].includes(r.owner_type)&&b.owner_type===r.owner_type&&id(b.owner_id)===id(r.created_owner_id)&&
  b.provider_namespace==="odoo_online"&&Number(b.provider_company_id)===4&&Number(b.provider_website_id)===5&&
  id(b.provider_partner_id)===id(r.source_partner_id)&&b.provider_source_request_id===r.source_request_id&&
  b.wallet_only===false&&b.currency==="USD"&&id(b.id)>0&&id(b.provider_subscription_order_id)>0&&id(b.provider_invoice_id)>0;
}
async function readProjection(db,r,lock){
 const result=await db.query("SELECT * FROM public.billing_subscriptions WHERE owner_type=$1 AND owner_id=$2 LIMIT 2"+(lock?" FOR UPDATE":""),[r.owner_type,r.created_owner_id]);
 return result.rows.length===1?result.rows[0]:null;
}
function policyFor(r,env){
 if(env.TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED!=="true"||env.TOTEM_US_ODOO_SAAS_ACCESS_ENABLED!=="true")return null;
 let p;try{p=JSON.parse(env.TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON||"");}catch{return null;}
 if(!isUsOdooServicePeriodPolicy(p)||!Array.isArray(p.coveredOwnerTypes)||
  !p.coveredOwnerTypes.includes(r.owner_type)||!p.coveredOwnerTypes.every(t=>["salon","master"].includes(t)))return null;
 return p;
}
// 7.03: cancellation/credit-note readback alone is not an approved
// revocation or refund/cutoff receipt. No negative writer is released.
async function assertOperatorSession(db,a,operator,lock){
 if(a?.role!=="admin"||!id(a.user_id)||id(a.user_id)!==id(operator?.id)||typeof a.session_id!=="string"||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.session_id))
   throw Object.assign(fail("US_SAAS_RECONCILIATION_ADMIN_REQUIRED"),{status:403});
 const q=await db.query("SELECT s.id FROM public.auth_sessions s JOIN public.auth_users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '24 hours' AND u.role='admin' AND u.enabled=true LIMIT 1"+(lock?" FOR SHARE OF s,u":""),[a.session_id,id(a.user_id)]);
 if(q.rows.length!==1)throw Object.assign(fail("US_SAAS_RECONCILIATION_ADMIN_SESSION_INVALID"),{status:403});
}
export async function reconcileUsSaasOpening(options={}){
 return reconcileOpening(options,null);
}
// Internal queue-only path. Fixed actor, no synthetic admin/session or external
// payload credentials. The leased worker supplies the in-transaction fence.
export async function reconcileUsSaasOpeningFromQueue({pool,requestId,env=process.env,assertLease,signal,createClient}={}){
 assertUsCommercialWriterReleased("projection");
 if(typeof assertLease!=="function"||!signal||typeof createClient!=="function")throw fail("US_SAAS_QUEUE_AUTHORITY_INVALID");
 return reconcileOpening({pool,requestId,env,writeAudit:writeSystemUsSaasReconciliationAudit,operator:US_SAAS_SYSTEM_ACTOR},{assertLease,signal,createClient});
}
async function reconcileOpening({pool,requestId,writeAudit,operator,sourceAdmin,env=process.env}={},queue){
 assertUsCommercialWriterReleased("projection");
 if(!pool||typeof pool.connect!=="function"||!id(requestId)||typeof writeAudit!=="function"||(!queue&&!id(operator?.id)))
   throw fail("US_SAAS_RECONCILIATION_CONTRACT_INVALID");
 const assertQueue=async db=>{
   if(queue.signal.aborted)throw fail("US_SAAS_QUEUE_LEASE_LOST");
   await queue.assertLease(db);
   if(queue.signal.aborted)throw fail("US_SAAS_QUEUE_LEASE_LOST");
 };
 const createClient=queue?.createClient??createUsOdooReadOnlyClient;
 if(queue){if(queue.signal.aborted)throw fail("US_SAAS_QUEUE_LEASE_LOST");}
 else await assertOperatorSession(pool,sourceAdmin,operator,false);
 const pre=await pool.query("SELECT * FROM public.owner_opening_requests WHERE id=$1",[id(requestId)]);
 const r=pre.rows.length===1?pre.rows[0]:null;
 if(!r||r.source_namespace!=="odoo_online"||!CURRENT.has(r.status))return wait("US_SAAS_ACTIVE_SOURCE_REQUIRED");
 const old=await readProjection(pool,r,false);
 if(!exact(r,old))return wait("US_SAAS_EXISTING_PROJECTION_REQUIRED");
 if(!renewable(old))return hold();
 if(r.owner_type==="master"&&["own_salon","existing_salon"].includes(r.precheck_result_json?.odoo_source_proof?.entry_mode))return wait("US_ODOO_MASTER_ROLE_COMMERCIAL_CONTRACT_HOLD");
 const policy=policyFor(r,env);
 if(!policy||old.provider_policy_version!==policy.version)return wait("US_SAAS_COMMERCIAL_POLICY_UNAPPROVED");
 // Network I/O precedes all SQL row locks.
 const evidence=await prepareUsPaidActivationEvidence(r,{env,createClient});
 const paid=evidence?.status==="PAID_VERIFIED"&&evidence.canActivate===true;
 if(!paid)return {...wait(evidence?.reason||"ODOO_READBACK_UNAVAILABLE"),negativeDisposition:"US_SAAS_NEGATIVE_DISPOSITION_HOLD"};
 const db=await pool.connect();
 try{
  await db.query("BEGIN");
  await db.query("SET LOCAL lock_timeout = '2000ms'");
  await db.query("SET LOCAL statement_timeout = '5000ms'");
  if(queue)await assertQueue(db);
  else await assertOperatorSession(db,sourceAdmin,operator,true);
  const locked=(await db.query("SELECT * FROM public.owner_opening_requests WHERE id=$1 FOR UPDATE",[id(requestId)])).rows[0];
  if(!locked||sourceKey(locked)!==sourceKey(r))throw fail("US_SAAS_RECONCILIATION_SOURCE_CHANGED");
  const current=await readProjection(db,locked,true);
  if(exact(locked,current)&&!renewable(current)){
    await db.query("ROLLBACK");
    return hold();
  }
  if(!exact(locked,current)||rowKey(current)!==rowKey(old))throw fail("US_SAAS_RECONCILIATION_REVISION_CHANGED");
  const clock=await readUsSaasTransactionClock(db);
  const observed=ms(evidence.verifiedAtUtc),now=ms(clock);
  if(!Number.isFinite(observed)||!Number.isFinite(now)||observed>now+1000||now-observed>10000||
    (current.provider_verified_at!=null&&observed<=ms(current.provider_verified_at)))throw fail("US_SAAS_RECONCILIATION_EVIDENCE_STALE");
  if(evidence.commercialPolicyVersion!==policy.version||ms(evidence.periodEndExclusiveUtc)<ms(current.current_period_end))throw fail("US_SAAS_RENEWAL_PERIOD_REGRESSION");
  assertUsPaidEvidenceForLockedRequest(locked,evidence,clock);
  const result=await persistUsSaasPaidProjection(db,locked,evidence,clock,assertUsPaidEvidenceForLockedRequest,{operation:"RECONCILE"});
  if(id(result.id)!==id(current.id))throw fail("US_SAAS_RECONCILIATION_NEW_ROW_FORBIDDEN");
  const status="PAID_VERIFIED",eventType="owner_opening.odoo_paid_entitlement_reconciled";
  const data={billing_id:id(current.id),subscription_order_id:id(evidence.subscriptionOrderId),invoice_id:id(evidence.invoiceId),effective_until:evidence.periodEndExclusiveUtc,commercial_policy_version:policy.version};
  const audit=await writeAudit(db,{request:locked,admin:operator,eventType,data});
  const auditId=usSaasAuditId(audit?.id);
  if(!auditId)throw fail("US_SAAS_RECONCILIATION_AUDIT_REQUIRED");
  if(queue)await assertQueue(db);
  // Last check after audit and lease work; rollback on stale or invalid proof.
  assertUsPaidEvidenceForLockedRequest(locked,evidence,await readUsSaasTransactionClock(db));
  await db.query("COMMIT");
  return {status,ownerId:id(locked.created_owner_id),ownerType:locked.owner_type,audit_event_id:auditId};
 }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}
 finally{db.release();}
}
// Existing scheduler must call this in a bounded batch; NOT self-starting.
// Five-minute evidence TTL remains fail-closed. No unknown provider writes.
export async function findUsSaasReconciliationCandidates(db,{limit=25}={}){
 assertUsCommercialWriterReleased("projection");
 if(!Number.isInteger(limit)||limit<1||limit>100)throw fail("US_SAAS_RECON_LIMIT_INVALID");
 const result=await db.query("SELECT req.id AS request_id FROM public.billing_subscriptions billing JOIN public.owner_opening_requests req ON req.owner_type=billing.owner_type AND req.created_owner_id=billing.owner_id AND req.source_namespace='odoo_online' AND req.source_company_id=4 AND req.source_website_id=5 AND req.source_partner_id=billing.provider_partner_id AND req.source_request_id=billing.provider_source_request_id WHERE billing.provider_namespace='odoo_online' AND billing.provider_company_id=4 AND billing.provider_website_id=5 AND billing.wallet_only=false AND billing.currency='USD' AND billing.subscription_status='active' AND billing.blocked_at IS NULL AND billing.provider_revoked_at IS NULL AND req.status IN ('activated','email_ready','email_sent','email_failed') AND (billing.provider_verified_at IS NULL OR billing.provider_verified_at<clock_timestamp()-interval '1 minute' OR billing.current_period_end<=clock_timestamp()) ORDER BY billing.provider_verified_at NULLS FIRST,billing.id LIMIT $1",[limit]);
 return result.rows.map(r=>id(r.request_id)).filter(Boolean);
}
