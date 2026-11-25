// G5-T5: revision-bound renewal/revocation of an EXISTING projection only.
// Reuses the existing T2 verifier and T3 projection writer. No provisioning,
// new entitlement row, wallet/Stripe, welcome, or CRM. Remains hard HOLD.
import {assertUsCommercialWriterReleased} from "../provision/usCommercialWriterRelease.js";
import {prepareUsPaidActivationEvidence} from "../provision/usPaidOwnerOpeningGate.js";
import {assertUsPaidEvidenceForLockedRequest} from "../provision/ownerOpeningCanonicalActivation.js";
import {validG3Seal} from "../provision/usOdooG3SealProof.js";
import {createUsOdooReadOnlyClient} from "./usOdooReadOnlyClient.js";
import {persistUsSaasPaidProjection,revokeUsSaasProjection} from "./usSaasEntitlementProjection.js";

const CURRENT=new Set(["activated","email_ready","email_sent","email_failed"]);
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
const ms=v=>v==null?NaN:new Date(v).getTime();
const wait=reason=>({status:"WAIT",reason});
const fail=code=>Object.assign(Error(code),{code,status:409});
const relationId=v=>id(Array.isArray(v)?v[0]:v);
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
 if(p?.approved!==true||p.companyId!==4||p.websiteId!==5||!Array.isArray(p.coveredOwnerTypes)||!p.coveredOwnerTypes.includes(r.owner_type)||
  p.allowDeferredRevenuePeriod!==true||!id(p.planId)||!id(p.productTemplateId)||!id(p.currencyId)||p.billingPeriodUnit!=="month"||p.billingPeriodValue!==1||!["manual","online"].includes(p.paymentChannel)||
  typeof p.version!=="string"||!/^[a-zA-Z0-9_.-]{1,40}$/.test(p.version))return null;
 return p;
}
// A WAIT reason alone is not proof of revocation. Read ONLY the exact
// existing provider order, corroborate scope, and use a definitive reversal
// or explicitly cancelled sale order. Unknown, timeout, missing -> WAIT.
async function readNegative(r,b,policy,env){
 if(env.TOTEM_US_ODOO_URL!=="https://totem-platform.odoo.com"||env.TOTEM_US_ODOO_DB!=="totem-platform"||!env.TOTEM_US_ODOO_USER||!env.TOTEM_US_ODOO_API_KEY)return null;
 const orderId=id(b.provider_subscription_order_id);
 try{
  const client=createUsOdooReadOnlyClient({baseUrl:env.TOTEM_US_ODOO_URL,database:env.TOTEM_US_ODOO_DB,username:env.TOTEM_US_ODOO_USER,apiKey:env.TOTEM_US_ODOO_API_KEY});
  const readOrder=async()=>{
   const rows=await client.searchRead("sale.order",[["id","=",orderId],["company_id","=",4],["website_id","=",5],["partner_id","=",id(r.source_partner_id)]],["id","company_id","website_id","partner_id","state","is_subscription","plan_id","currency_id","invoice_ids"],2);
   const q=rows[0];
   return rows.length===1&&id(q.id)===orderId&&relationId(q.company_id)===4&&relationId(q.website_id)===5&&relationId(q.partner_id)===id(r.source_partner_id)&&q.is_subscription===true&&relationId(q.plan_id)===policy.planId&&relationId(q.currency_id)===policy.currencyId?q:null;
  };
  const first=await readOrder();
  if(!first)return null;
  let reason=null;
  if(first.state==="cancel")reason="ODOO_SUBSCRIPTION_NOT_ELIGIBLE";
  else{
   const invoiceId=id(b.provider_invoice_id);
   if(!Array.isArray(first.invoice_ids)||!first.invoice_ids.includes(invoiceId))return null;
   const invoices=await client.searchRead("account.move",[["id","=",invoiceId],["company_id","=",4],["partner_id","=",id(r.source_partner_id)]],["id","company_id","partner_id","currency_id","move_type","state"],2);
   const invoice=invoices[0];
   if(invoices.length!==1||id(invoice.id)!==invoiceId||relationId(invoice.company_id)!==4||
      relationId(invoice.partner_id)!==id(r.source_partner_id)||relationId(invoice.currency_id)!==policy.currencyId||invoice.move_type!=="out_invoice"||invoice.state!=="posted")return null;
   const refunds=await client.searchRead("account.move",[["reversed_entry_id","=",invoiceId],["company_id","=",4],["partner_id","=",id(r.source_partner_id)],["move_type","=","out_refund"],["state","=","posted"]],["id","company_id","partner_id","currency_id","move_type","state","reversed_entry_id"],100);
   if(refunds.length&&refunds.every(x=>id(x.id)>0&&relationId(x.company_id)===4&&relationId(x.partner_id)===id(r.source_partner_id)&&relationId(x.currency_id)===policy.currencyId&&x.move_type==="out_refund"&&x.state==="posted"&&relationId(x.reversed_entry_id)===invoiceId))reason="ODOO_INVOICE_REVERSED";
  }
  if(!reason)return null;
  const last=await readOrder();
  if(!last||last.state!==first.state||JSON.stringify(last.invoice_ids)!==JSON.stringify(first.invoice_ids))return null;
  return Object.freeze({reason,orderId,verifiedAtUtc:new Date().toISOString()});
 }catch{return null;}
}
async function assertOperatorSession(db,a,operator,lock){
 if(a?.role!=="admin"||!id(a.user_id)||id(a.user_id)!==id(operator?.id)||typeof a.session_id!=="string"||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.session_id))
   throw Object.assign(fail("US_SAAS_RECONCILIATION_ADMIN_REQUIRED"),{status:403});
 const q=await db.query("SELECT s.id FROM public.auth_sessions s JOIN public.auth_users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '24 hours' AND u.role='admin' AND u.enabled=true LIMIT 1"+(lock?" FOR SHARE OF s,u":""),[a.session_id,id(a.user_id)]);
 if(q.rows.length!==1)throw Object.assign(fail("US_SAAS_RECONCILIATION_ADMIN_SESSION_INVALID"),{status:403});
}
export async function reconcileUsSaasOpening({pool,requestId,writeAudit,operator,sourceAdmin,env=process.env}={}){
 assertUsCommercialWriterReleased("projection");
 if(!pool||typeof pool.connect!=="function"||!id(requestId)||typeof writeAudit!=="function"||!id(operator?.id))
   throw fail("US_SAAS_RECONCILIATION_CONTRACT_INVALID");
 await assertOperatorSession(pool,sourceAdmin,operator,false);
 const pre=await pool.query("SELECT * FROM public.owner_opening_requests WHERE id=$1",[id(requestId)]);
 const r=pre.rows.length===1?pre.rows[0]:null;
 if(!r||r.source_namespace!=="odoo_online"||!CURRENT.has(r.status))return wait("US_SAAS_ACTIVE_SOURCE_REQUIRED");
 const old=await readProjection(pool,r,false);
 if(!exact(r,old))return wait("US_SAAS_EXISTING_PROJECTION_REQUIRED");
 if(r.owner_type==="master"&&["own_salon","existing_salon"].includes(r.precheck_result_json?.odoo_source_proof?.entry_mode))return wait("US_ODOO_MASTER_ROLE_COMMERCIAL_CONTRACT_HOLD");
 const policy=policyFor(r,env);
 if(!policy||old.provider_policy_version!==policy.version)return wait("US_SAAS_COMMERCIAL_POLICY_UNAPPROVED");
 // Network I/O precedes all SQL row locks.
 const evidence=await prepareUsPaidActivationEvidence(r,{env});
 const paid=evidence?.status==="PAID_VERIFIED"&&evidence.canActivate===true;
 const negative=paid?null:await readNegative(r,old,policy,env);
 if(!paid&&!negative)return wait(evidence?.reason||"ODOO_READBACK_UNAVAILABLE");
 const db=await pool.connect();
 try{
  await db.query("BEGIN");
  await db.query("SET LOCAL lock_timeout = '2000ms'");
  await db.query("SET LOCAL statement_timeout = '5000ms'");
  await assertOperatorSession(db,sourceAdmin,operator,true);
  const locked=(await db.query("SELECT * FROM public.owner_opening_requests WHERE id=$1 FOR UPDATE",[id(requestId)])).rows[0];
  if(!locked||sourceKey(locked)!==sourceKey(r))throw fail("US_SAAS_RECONCILIATION_SOURCE_CHANGED");
  const current=await readProjection(db,locked,true);
  if(!exact(locked,current)||rowKey(current)!==rowKey(old))throw fail("US_SAAS_RECONCILIATION_REVISION_CHANGED");
  const clock=(await db.query("SELECT clock_timestamp() AS now")).rows[0]?.now;
  const observed=ms(paid?evidence.verifiedAtUtc:negative.verifiedAtUtc),now=ms(clock);
  if(!Number.isFinite(observed)||!Number.isFinite(now)||observed>now+1000||now-observed>10000||
    (current.provider_verified_at!=null&&observed<=ms(current.provider_verified_at)))throw fail("US_SAAS_RECONCILIATION_EVIDENCE_STALE");
  let status,eventType,data;
  if(paid){
   if(evidence.commercialPolicyVersion!==policy.version||ms(evidence.periodEndExclusiveUtc)<ms(current.current_period_end))throw fail("US_SAAS_RENEWAL_PERIOD_REGRESSION");
   assertUsPaidEvidenceForLockedRequest(locked,evidence,clock);
   const result=await persistUsSaasPaidProjection(db,locked,evidence,clock,assertUsPaidEvidenceForLockedRequest);
   if(id(result.id)!==id(current.id))throw fail("US_SAAS_RECONCILIATION_NEW_ROW_FORBIDDEN");
   status="PAID_VERIFIED";eventType="owner_opening.odoo_paid_entitlement_reconciled";
   data={billing_id:id(current.id),subscription_order_id:id(evidence.subscriptionOrderId),invoice_id:id(evidence.invoiceId),effective_until:evidence.periodEndExclusiveUtc};
  }else{
   if(negative.orderId!==id(current.provider_subscription_order_id))throw fail("US_SAAS_REVOCATION_SCOPE_CHANGED");
   if(!await revokeUsSaasProjection(db,locked,negative))throw fail("US_SAAS_REVOKE_PROJECTION_MISSING");
   status="REVOKED";eventType="owner_opening.odoo_entitlement_revoked";
   data={billing_id:id(current.id),reason:negative.reason,subscription_order_id:negative.orderId};
  }
  const audit=await writeAudit(db,{request:locked,admin:operator,eventType,data});
  await db.query("COMMIT");
  return {status,ownerId:id(locked.created_owner_id),ownerType:locked.owner_type,audit_event_id:audit?.id||null};
 }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}
 finally{db.release();}
}
// Existing scheduler must call this in a bounded batch; NOT self-starting.
// Five-minute evidence TTL remains fail-closed. No unknown provider writes.
export async function findUsSaasReconciliationCandidates(db,{limit=25}={}){
 assertUsCommercialWriterReleased("projection");
 if(!Number.isInteger(limit)||limit<1||limit>100)throw fail("US_SAAS_RECON_LIMIT_INVALID");
 const result=await db.query("SELECT req.id AS request_id FROM public.billing_subscriptions billing JOIN public.owner_opening_requests req ON req.owner_type=billing.owner_type AND req.created_owner_id=billing.owner_id AND req.source_namespace='odoo_online' AND req.source_company_id=4 AND req.source_website_id=5 AND req.source_partner_id=billing.provider_partner_id AND req.source_request_id=billing.provider_source_request_id WHERE billing.provider_namespace='odoo_online' AND billing.provider_company_id=4 AND billing.provider_website_id=5 AND billing.wallet_only=false AND billing.currency='USD' AND req.status IN ('activated','email_ready','email_sent','email_failed') AND (billing.provider_verified_at IS NULL OR billing.provider_verified_at<clock_timestamp()-interval '1 minute' OR billing.current_period_end<=clock_timestamp()) ORDER BY billing.provider_verified_at NULLS FIRST,billing.id LIMIT $1",[limit]);
 return result.rows.map(r=>id(r.request_id)).filter(Boolean);
}
