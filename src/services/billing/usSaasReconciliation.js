// G5-T5: verified Odoo readback updates EXISTING Core billing projection.
// No account creation, new provisioning, reactivation, wallet debit or welcome.
// Intended as a handler for the EXISTING async_jobs; NOT auto-started.
import {prepareUsPaidActivationEvidenceBatch} from "./usOdooBatchReadback.js";
import { prepareUsPaidActivationEvidence } from
  "../provision/usPaidOwnerOpeningGate.js";
import { assertUsPaidEvidenceForLockedRequest } from
  "../provision/ownerOpeningCanonicalActivation.js";
import { persistUsSaasPaidProjection,revokeUsSaasProjection } from
  "./usSaasEntitlementProjection.js";

const positive=x=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0;};
const CURRENT=new Set(["activated","email_ready","email_failed","email_sent"]);
const REVOKED=new Set([
  "ODOO_INVOICE_REVERSED","ODOO_SUBSCRIPTION_NOT_ELIGIBLE",
  "ODOO_PAID_INVOICE_NOT_FOUND","ODOO_PAID_PERIOD_NOT_CURRENT",
  "ODOO_INVOICE_SCOPE_MISMATCH","ODOO_SUBSCRIPTION_SCOPE_MISMATCH",
]);
function err(code){const e=new Error(code);e.code=code;e.status=409;return e;}
function equalSource(a,b){
  return a&&b&&Number(a.id)===Number(b.id)&&
    a.owner_type===b.owner_type&&
    Number(a.created_owner_id)===Number(b.created_owner_id)&&
    Number(a.created_auth_user_id)===Number(b.created_auth_user_id)&&
    a.source_namespace==="odoo_online"&&
    a.source_request_id===b.source_request_id&&
    Number(a.source_partner_id)===Number(b.source_partner_id)&&
    Number(a.source_company_id)===4&&Number(a.source_website_id)===5;
}
// A transient MVCC version protects the existing projection from out-of-order
// provider readbacks. Compare only within a single reconcile call; never persist
// xmin or use it as a business identifier.
async function readProjectionVersion(db,request,lock=false){
  const {rows}=await db.query(
    "SELECT id::text AS projection_id,xmin::text AS projection_revision "+
    "FROM public.billing_subscriptions WHERE owner_type=$1 AND owner_id=$2 "+
    "AND provider_namespace='odoo_online' AND provider_company_id=4 "+
    "AND provider_website_id=5 AND provider_partner_id=$3 "+
    "AND provider_source_request_id=$4"+(lock?" FOR UPDATE":""),
    [request.owner_type,request.created_owner_id,request.source_partner_id,request.source_request_id]);
  const version=rows.length===1?rows[0]:null;
  return version&&typeof version.projection_id==="string"&&
    typeof version.projection_revision==="string"?version:null;
}
export async function reconcileUsSaasOpening({
  pool,requestId,readback=prepareUsPaidActivationEvidence,
  writeAudit,operator={id:0},
}={}){
  if(!pool||typeof pool.connect!=="function"||!positive(requestId)||
     typeof readback!=="function"||typeof writeAudit!=="function")
    throw err("US_SAAS_RECONCILIATION_CONTRACT_INVALID");
  const prepared=await loadReconciliationSnapshot(pool,requestId);
  if(prepared.status==="WAIT")return prepared;
  const {snapshot,prior}=prepared;
  let result;
  try{result=await readback(snapshot);}catch{
    return {status:"WAIT",reason:"ODOO_READBACK_UNAVAILABLE"};
  }
  return applyReconciliationResult({pool,requestId,snapshot,prior,result,writeAudit,operator});
}
async function loadReconciliationSnapshot(pool,requestId){
  // Provider network access MUST finish before the SQL lock/transaction.
  const pre=await pool.query(
    "SELECT * FROM public.owner_opening_requests WHERE id=$1",
    [positive(requestId)]);
  const snapshot=pre.rows[0];
  if(!snapshot||snapshot.source_namespace!=="odoo_online"||
     !CURRENT.has(snapshot.status))
    return {status:"WAIT",reason:"US_SAAS_ACTIVE_SOURCE_REQUIRED"};
  const prior=await readProjectionVersion(pool,snapshot);
  if(!prior)return {status:"WAIT",reason:"US_SAAS_EXISTING_PROJECTION_REQUIRED"};
  return {snapshot,prior};
}
async function applyReconciliationResult({pool,requestId,snapshot,prior,result,writeAudit,operator,assertLease,signal}){
  if(signal?.aborted)return {status:"WAIT",reason:"US_SAAS_BATCH_LEASE_LOST"};
  const paid=result?.status==="PAID_VERIFIED"&&result.canActivate===true;
  const definitive=!paid&&REVOKED.has(result?.reason);
  if(!paid&&!definitive)
    return {status:"WAIT",reason:result?.reason||"ODOO_READBACK_UNAVAILABLE"};

  const db=await pool.connect();
  try{
    await db.query("BEGIN");
    const locked=await db.query(
      "SELECT * FROM public.owner_opening_requests WHERE id=$1 FOR UPDATE",
      [positive(requestId)]);
    const request=locked.rows[0];
    if(!equalSource(request,snapshot)||!CURRENT.has(request.status))
      throw err("US_SAAS_RECONCILIATION_SOURCE_CHANGED");
    const current=await readProjectionVersion(db,request,true);
    if(!current||current.projection_id!==prior.projection_id||
       current.projection_revision!==prior.projection_revision){
      await db.query("ROLLBACK");
      return {status:"WAIT",reason:"US_SAAS_RECONCILIATION_PROJECTION_CHANGED"};
    }
    if(assertLease)await assertLease(db);
    if(signal?.aborted)throw err("US_SAAS_BATCH_LEASE_LOST");
    if(paid){
      const now=await db.query("SELECT clock_timestamp() AS now");
      const billing=await persistUsSaasPaidProjection(
        db,request,result,now.rows[0]?.now,
        assertUsPaidEvidenceForLockedRequest);
      const audit=await writeAudit(db,{request,admin:operator,
        eventType:"owner_opening.odoo_paid_entitlement_reconciled",
        data:{billing_id:Number(billing.id),
          subscription_order_id:positive(result.subscriptionOrderId),
          invoice_id:positive(result.invoiceId),
          effective_until:result.periodEndExclusiveUtc,
          commercial_policy_version:result.commercialPolicyVersion}});
      await db.query("COMMIT");
      return {status:"PAID_VERIFIED",ownerId:Number(request.created_owner_id),
        ownerType:request.owner_type,renewed:true,
        periodEndExclusiveUtc:result.periodEndExclusiveUtc,
        audit_event_id:audit?.id||null};
    }
    // A definitive refund/cancellation/churn state is rechecked via T2.
    // API errors/unknown states are NOT treated as authoritative revocation;
    // the per-operation verified-at TTL will fail closed if stale.
    const now=await db.query("SELECT clock_timestamp() AS now");
    const observed=result.batchObservedAtUtc;
    if(observed!=null){
      const age=new Date(now.rows[0]?.now)-new Date(observed);
      if(!Number.isFinite(age)||age < -1000||age>10000){
        await db.query("ROLLBACK");
        return {status:"WAIT",reason:"US_SAAS_BATCH_RECEIPT_STALE"};
      }
    }
    const applied=await revokeUsSaasProjection(db,request,{
      reason:result.reason,verifiedAtUtc:observed??now.rows[0]?.now});
    if(!applied)throw err("US_SAAS_REVOKE_PROJECTION_MISSING");
    await writeAudit(db,{request,admin:operator,
      eventType:"owner_opening.odoo_entitlement_revoked",
      data:{reason:result.reason}});
    await db.query("COMMIT");
    return {status:"REVOKED",ownerType:request.owner_type,
      ownerId:Number(request.created_owner_id),reason:result.reason};
  }catch(e){
    await db.query("ROLLBACK").catch(()=>{});
    throw e;
  }finally{db.release();}
}
export async function findUsSaasReconciliationCandidates(db,{limit=25}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw err("US_SAAS_RECON_LIMIT_INVALID");
  const rows=await db.query(
    "SELECT req.id AS request_id FROM public.billing_subscriptions billing "+
    "JOIN public.owner_opening_requests req "+
    "ON req.owner_type=billing.owner_type "+
    "AND req.created_owner_id=billing.owner_id "+
    "AND req.source_namespace='odoo_online' "+
    "AND req.source_request_id=billing.provider_source_request_id "+
    "WHERE billing.provider_namespace='odoo_online' "+
    "AND (billing.provider_verified_at IS NULL "+
    "OR billing.provider_verified_at < clock_timestamp() - interval '1 minute' "+
    "OR billing.current_period_end <= clock_timestamp()) "+
    "ORDER BY billing.provider_verified_at NULLS FIRST,billing.id "+
    "LIMIT $1",[limit]);
  return rows.rows.map(x=>Number(x.request_id));
}

async function bounded(items,concurrency,fn){
 const out=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
   while(next<items.length){const i=next++;try{out[i]=await fn(items[i],i);}
     catch(e){out[i]=e instanceof Error?e:err("US_SAAS_BATCH_FAILED");}}
 }));
 return out;
}
// Only claimed queue jobs enter here. Read all MVCC versions BEFORE Odoo,
// then use the same locked per-owner apply function as single reconciliation.
export async function reconcileUsSaasOpeningsBatch({pool,jobs,env=process.env,
 writeAudit,operator,concurrency=4,readback=prepareUsPaidActivationEvidenceBatch}={}){
 if(!pool||typeof pool.connect!=="function"||!Array.isArray(jobs)||jobs.length<1||jobs.length>50||
    !Number.isInteger(concurrency)||concurrency<1||concurrency>4||
    typeof writeAudit!=="function"||typeof readback!=="function"||
    jobs.some(j=>!positive(j.requestId)||typeof j.assertLease!=="function"))
   throw err("US_SAAS_BATCH_CONTRACT_INVALID");
 const prepared=await bounded(jobs,concurrency,j=>loadReconciliationSnapshot(pool,j.requestId));
 const selected=prepared.flatMap((p,i)=>p instanceof Error||p.status==="WAIT"||jobs[i].signal?.aborted?[]:[i]);
 let proofs=[];
 try{
   if(selected.length)proofs=await readback(selected.map(i=>prepared[i].snapshot),{env});
   if(!Array.isArray(proofs)||proofs.length!==selected.length)throw err("US_SAAS_BATCH_RESULT_INVALID");
 }catch{return jobs.map(()=>({status:"WAIT",reason:"US_ODOO_BATCH_INCOMPLETE"}));}
 const byIndex=new Map(selected.map((i,j)=>[i,proofs[j]]));
 return bounded(jobs,concurrency,async(j,i)=>{
   const p=prepared[i];
   if(p instanceof Error||p.status==="WAIT")return p;
   if(!byIndex.has(i)||j.signal?.aborted)return {status:"WAIT",reason:"US_SAAS_BATCH_LEASE_LOST"};
   return applyReconciliationResult({pool,requestId:j.requestId,...p,result:byIndex.get(i),
     writeAudit,operator,assertLease:j.assertLease,signal:j.signal});
 });
}
