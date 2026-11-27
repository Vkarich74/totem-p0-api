import {assertUsCommercialWriterReleased} from "../provision/usCommercialWriterRelease.js";
import {assertManualG3RequestReceipt,isScopedUsOdooRequest} from "../provision/usG3ManualRequestReceipt.js";
// G5-T4: one durable welcome intent in EXISTING Core messages/traces.
// Google Gmail is not transactional with PostgreSQL. Ambiguous delivery
// is NEVER automatically retried; operators may reconcile POSITIVE Gmail proof.
import { assertUsPaidEvidenceForLockedRequest } from "../provision/ownerOpeningCanonicalActivation.js";

const UNCERTAIN="OWNER_OPENING_GMAIL_DELIVERY_UNCERTAIN";
const GMAIL_ID=/^[a-zA-Z0-9_-]{1,200}$/;
// Canonical positive numeric IDs and PostgreSQL bigint strings only.
const toId=v=>{
  if(typeof v!=="number"&&(typeof v!=="string"||!/^[1-9][0-9]*$/.test(v)))return 0;
  const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:0;
};
function error(code,status=409){const e=new Error(code);e.code=code;e.status=status;return e;}
export function welcomeIntentKey(v){
  const id=toId(v);
  if(!id)throw error("OWNER_OPENING_REQUEST_ID_INVALID",400);
  return "owner_opening:"+id+":welcome:v1";
}
export function welcomeRfcMessageId(v){
  const id=toId(v);
  if(!id)throw error("OWNER_OPENING_REQUEST_ID_INVALID",400);
  return "<totem-owner-opening-"+id+"-welcome-v1@totemv.com>";
}
async function transaction(pool,fn){
  if(typeof pool?.connect!=="function")throw error("WELCOME_POSTGRES_POOL_REQUIRED",500);
  const db=await pool.connect();
  try{
    await db.query("BEGIN");
    const result=await fn(db);
    await db.query("COMMIT");
    return result;
  }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}
  finally{db.release();}
}
async function lockRequest(db,id){
  const r=await db.query(
    "SELECT * FROM public.owner_opening_requests WHERE id=$1 FOR UPDATE",[id]);
  return r.rows.length===1?r.rows[0]:null;
}
async function lockMessage(db,key){
  const r=await db.query(
    "SELECT id,status,idempotency_key,data FROM public.messages WHERE idempotency_key=$1 FOR UPDATE",
    [key]);
  return r.rows[0]||null;
}
function checkMarket(r,market){
  if(market!=="US"&&r.source_namespace==="odoo_online")
    throw error("US_ODOO_SOURCE_MARKET_MISMATCH");
}
function checkUsScope(r,required){
  if(!r)throw error("OWNER_OPENING_REQUEST_NOT_FOUND",404);
  if((isScopedUsOdooRequest(r)&&!required)||
     (required&&(!isScopedUsOdooRequest(r)||toId(r.source_company_id)!==4||toId(r.source_website_id)!==5||r.precheck_result_json?.normalized?.market_code!=="US")))
    throw error("US_G3_ADMIN_SOURCE_SCOPE_CHANGED");
}
function requireReconcile(){throw Object.assign(error("OWNER_OPENING_WELCOME_RECONCILIATION_REQUIRED"),{requires_reconciliation:true});}
const email=v=>typeof v==="string"?v.trim().toLowerCase():"";
// The existing one-intent-per-request key remains immutable. An own-salon
// master shares a paid salon projection, not a second mail authorization.
// Consent for an existing-salon master likewise does not establish a paid grant.
export function usWelcomeRoleStatus(r){
 const p=r?.precheck_result_json?.odoo_source_proof;
 if(!isScopedUsOdooRequest(r)||toId(r.source_company_id)!==4||
    toId(r.source_website_id)!==5||r.precheck_result_json?.normalized?.market_code!=="US")
   return "SOURCE_SCOPE_INVALID";
 if(r.owner_type==="salon"&&((p?.entry_mode==="salon"&&p.role_set==="salon")||
    (p?.entry_mode==="own_salon"&&p.role_set==="salon,master")))return "SALON_PAID_PROOF_REQUIRED";
 if(r.owner_type==="master"&&p?.entry_mode==="own_salon"&&p.role_set==="salon,master")
   return "OWN_SALON_MASTER_WELCOME_HOLD";
 if(r.owner_type==="master"&&p?.entry_mode==="existing_salon"&&p.role_set==="master")
   return "EXISTING_SALON_MASTER_WELCOME_HOLD";
 return "SOURCE_SCOPE_INVALID";
}
export function assertUsWelcomeRole(r){
 const role=usWelcomeRoleStatus(r);
 if(role==="SOURCE_SCOPE_INVALID")throw error("US_G3_ADMIN_SOURCE_SCOPE_CHANGED");
 if(role!=="SALON_PAID_PROOF_REQUIRED")throw error("US_ODOO_MASTER_ROLE_COMMERCIAL_CONTRACT_HOLD");
 if(!toId(r.created_owner_id)||!toId(r.created_auth_user_id))throw error("US_G3_WELCOME_IDENTITY_REQUIRED");
}
// JSONB key order is not stable; compare exact field values. This is a
// durable source-identity snapshot, not payment proof or a release switch.
function sourceBinding(r){
 const p=r?.precheck_result_json?.odoo_source_proof;
 if(usWelcomeRoleStatus(r)==="SOURCE_SCOPE_INVALID"||!toId(r.id)||
    !toId(r.created_owner_id)||!toId(r.created_auth_user_id)||!toId(r.source_partner_id)||
    r.source_request_id!=="odoo-us-partner-"+toId(r.source_partner_id)||
    toId(p?.source_partner_id)!==toId(r.source_partner_id)||p?.source_request_id!==r.source_request_id||
    p?.source_stage_id!==82||p?.source_marker!=="totem_us_portal_approved_v1"||
    p?.source!=="odoo_us_approved_profile_v1"||
    p?.source_schema!=="g3_source_v1"||p?.source_revision!=="1"||
    typeof p?.source_approved_at!=="string"||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(p.source_approved_at)||
    !Number.isFinite(Date.parse(p.source_approved_at))||
    new Date(p.source_approved_at).toISOString().replace(".000Z","Z")!==p.source_approved_at||
    !/^[a-f0-9]{64}$/.test(p?.source_hash??"")||!toId(p?.odoo_lead_id)||
    !toId(p?.source_approved_by_id)||p?.source_external_id!=="totem_us_bridge.company4_site5_partner_"+toId(r.source_partner_id))
   return null;
 return {contract:"us_welcome_source_binding_v1",company_id:4,website_id:5,
  partner_id:toId(r.source_partner_id),source_request_id:r.source_request_id,
  request_id:toId(r.id),owner_id:toId(r.created_owner_id),auth_user_id:toId(r.created_auth_user_id),
  owner_type:r.owner_type,entry_mode:p.entry_mode,role_set:p.role_set,lead_id:toId(p.odoo_lead_id),
  source_revision:p.source_revision,source_hash:p.source_hash,source_external_id:p.source_external_id,
  source_approved_by_id:toId(p.source_approved_by_id),source_approved_at:p.source_approved_at??null};
}
function sameBinding(req,value){
 const expected=sourceBinding(req);
 return !!expected&&!!value&&typeof value==="object"&&!Array.isArray(value)&&
   Object.keys(expected).length===Object.keys(value).length&&
   Object.keys(expected).every(k=>expected[k]===value[k]);
}
function exactIntent(req,msg){
 const key=welcomeIntentKey(req.id),d=msg?.data;
 return !!msg&&toId(msg.id)>0&&toId(req.message_id)===toId(msg.id)&&
 msg.idempotency_key===key&&d?.logical_intent_key===key&&d.rfc_message_id===welcomeRfcMessageId(req.id)&&
 d.entity_type==="owner_opening_request"&&toId(d.entity_id)===toId(req.id)&&
 d.owner_type===req.owner_type&&d.slug===req.slug_final&&email(d.to)!==""&&email(d.to)===email(req.email)&&
 sameBinding(req,d.us_source_binding);
}
export async function readUsWelcomeRelatedMessages(db,req,{lock=false}={}){
 const requestId=toId(req?.id),messageId=req?.message_id==null?null:toId(req.message_id);
 if(!requestId||messageId===0)requireReconcile();
 const q=await db.query("SELECT id,status,idempotency_key,data FROM public.messages "+
 "WHERE idempotency_key LIKE $1 OR id=$2 OR (data->>'entity_type'='owner_opening_request' AND data->>'entity_id'=$3) "+
 "ORDER BY id LIMIT 2"+(lock?" FOR UPDATE":""),["owner_opening:"+requestId+":%",messageId,String(requestId)]);
 return q.rows;
}
const relatedMessages=(db,req)=>readUsWelcomeRelatedMessages(db,req,{lock:true});
export function classifyUsWelcomeDecision(req,rows){
 if(!req||!Array.isArray(rows))requireReconcile();
 if(rows.length===0&&req.message_id==null&&!req.email_sent_at&&!["sent","failed"].includes(req.email_status)&&!["email_sent","email_failed"].includes(req.status)){
   if(req.status!=="email_ready")throw error("OWNER_OPENING_REQUEST_STATUS_INVALID");
   assertUsWelcomeRole(req);
   if(!sourceBinding(req))throw error("US_G3_WELCOME_FRESH_SOURCE_REQUIRED");
   return {kind:"unclaimed"};
 }
 if(rows.length!==1||!exactIntent(req,rows[0]))requireReconcile();
 const msg=rows[0],d=msg.data;
 if(req.status==="email_sent"&&req.email_status==="sent"&&req.email_sent_at&&msg.status==="sent"&&d.delivery_state==="sent"&&GMAIL_ID.test(String(d.gmail_message_id||"")))
   return {kind:"already_sent",request:req,messageId:toId(msg.id),gmailMessageId:d.gmail_message_id};
 requireReconcile();
}
async function assertAdminSession(db,a,required){
 if(!required)return;
 if(a?.role!=="admin"||!toId(a.user_id)||typeof a.session_id!=="string"||!a.session_id)throw error("US_G3_ADMIN_SESSION_REQUIRED",403);
 const q=await db.query("SELECT s.id FROM public.auth_sessions s JOIN public.auth_users u ON u.id=s.user_id "+
 "WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() "+
 "AND s.last_seen_at>clock_timestamp()-interval '24 hours' AND u.role='admin' AND u.enabled=true FOR SHARE OF s,u",[a.session_id,toId(a.user_id)]);
 if(q.rows.length!==1)throw error("US_G3_ADMIN_SESSION_INVALID",403);
}
async function inspectLockedWelcome(db,id,requireUsScope,sourceAdmin){
 const req=await lockRequest(db,id);
 if(!req)throw error("OWNER_OPENING_REQUEST_NOT_FOUND",404);
 checkUsScope(req,requireUsScope);
 await assertAdminSession(db,sourceAdmin,requireUsScope);
 const rows=await relatedMessages(db,req);
 return {req,rows};
}
function reconcileCandidate(req,rows,provider){
 if(rows.length!==1||!exactIntent(req,rows[0]))requireReconcile();
 const msg=rows[0],d=msg.data,old=d.gmail_message_id;
 if(old!=null&&(!GMAIL_ID.test(String(old))||(provider&&old!==provider)))requireReconcile();
 if(req.status==="email_sent"){
   classifyUsWelcomeDecision(req,rows);
 }else if(!["email_ready","email_failed"].includes(req.status)||!["pending","failed"].includes(msg.status)||!["claimed","uncertain"].includes(d.delivery_state)||req.email_sent_at)requireReconcile();
 return {id:toId(msg.id),key:msg.idempotency_key,recipient:d.to,rfcMessageId:d.rfc_message_id,oldProvider:old??null,ownerType:req.owner_type,ownerId:toId(req.created_owner_id),authId:toId(req.created_auth_user_id),partnerId:toId(req.source_partner_id),sourceRequestId:req.source_request_id};
}
function sameCandidate(a,b){
 return Object.keys(a).every(k=>a[k]===b[k]);
}
function checkCallbacks(o,names){
  if(names.some(name=>typeof o?.[name]!=="function"))
    throw error("WELCOME_CALLBACK_CONTRACT_INVALID",500);
}
// FIRST commit intent + audit + request.message_id. THEN Gmail may be called.
export async function claimOwnerOpeningWelcome(o={}){
  assertUsCommercialWriterReleased("welcome");
  checkCallbacks(o,["getMarketCode","assertMarketPolicy","assertUsActivationReady",
    "preparePaidEvidence","createPreview","createTrace","writeAudit"]);
  const {pool,requestId,admin,getMarketCode,assertMarketPolicy,
    assertUsActivationReady,preparePaidEvidence,createPreview,
    createTrace,writeAudit,sourceReceipt=null,sourceAdmin=null,requireUsScope=false,prepareSourceReceipt=null}=o;
  const id=toId(requestId),key=welcomeIntentKey(id);
  if(typeof pool?.query!=="function")throw error("WELCOME_POSTGRES_POOL_REQUIRED",500);
  const first=await pool.query(
    "SELECT * FROM public.owner_opening_requests WHERE id=$1",[id]);
  const snapshot=first.rows[0];
  if(!snapshot)throw error("OWNER_OPENING_REQUEST_NOT_FOUND",404);
  checkUsScope(snapshot,requireUsScope);
  assertMarketPolicy(snapshot);
  const initialMarket=getMarketCode(snapshot);
  checkMarket(snapshot,initialMarket);
  if(requireUsScope){
    const decision=await transaction(pool,async db=>{
      const {req,rows}=await inspectLockedWelcome(db,id,true,sourceAdmin);
      return classifyUsWelcomeDecision(req,rows);
    });
    if(decision.kind==="already_sent")return decision;
  }else{
    if(snapshot.status==="email_sent")return {kind:"already_sent",request:snapshot};
    if(snapshot.message_id!=null||snapshot.status==="email_failed")requireReconcile();
    if(snapshot.status!=="email_ready")throw error("OWNER_OPENING_REQUEST_STATUS_INVALID");
  }
  // Only an unclaimed intent requires new signed source and paid evidence.
  let receipt=sourceReceipt;
  if(requireUsScope){
    if(typeof prepareSourceReceipt!=="function")throw error("US_G3_WELCOME_FRESH_SOURCE_REQUIRED");
    try{receipt=await prepareSourceReceipt();}
    catch(e){
      // A concurrent winner may have claimed or completed between reads.
      const decision=await transaction(pool,async db=>{
        const {req,rows}=await inspectLockedWelcome(db,id,true,sourceAdmin);
        return classifyUsWelcomeDecision(req,rows);
      });
      if(decision.kind==="already_sent")return decision;
      throw e;
    }
  }
  let paid=null;
  if(initialMarket==="US"){
    paid=await preparePaidEvidence(snapshot);
    if(paid?.status!=="PAID_VERIFIED"||paid.canActivate!==true)
      throw error("US_ODOO_PAID_ENTITLEMENT_REQUIRED");
  }
  return transaction(pool,async db=>{
    const req=await lockRequest(db,id);
    if(!req)throw error("OWNER_OPENING_REQUEST_NOT_FOUND",404);
    checkUsScope(req,requireUsScope);
    assertMarketPolicy(req);
    const market=getMarketCode(req);
    checkMarket(req,market);
    if(requireUsScope){
      await assertAdminSession(db,sourceAdmin,true);
      const decision=classifyUsWelcomeDecision(req,await relatedMessages(db,req));
      if(decision.kind==="already_sent")return decision;
    }else{
      if(req.status==="email_sent")return {kind:"already_sent",request:req};
      if(req.message_id!=null||req.status==="email_failed")requireReconcile();
      if(await lockMessage(db,key))requireReconcile();
      if(req.status!=="email_ready")throw error("OWNER_OPENING_REQUEST_STATUS_INVALID");
    }
    if(market!==initialMarket)throw error("OWNER_OPENING_MARKET_CHANGED");
    if(market==="US"){
      if(assertManualG3RequestReceipt(req,receipt,{purpose:"welcome",admin:sourceAdmin})!==true)
        throw error("US_G3_WELCOME_FRESH_SOURCE_REQUIRED");
      const now=await db.query("SELECT clock_timestamp() AS now");
      assertUsPaidEvidenceForLockedRequest(req,paid,now.rows[0]?.now);
      await assertUsActivationReady(db,req,toId(req.created_owner_id));
    }
    const preview=await createPreview(db,req,market);
    if(!preview?.to||!preview?.subject||!preview?.html||(requireUsScope&&email(preview.to)!==email(req.email)))
      throw error("OWNER_OPENING_WELCOME_PREVIEW_INVALID");
    const rfcMessageId=welcomeRfcMessageId(id);
    const binding=requireUsScope?sourceBinding(req):null;
    if(requireUsScope&&!binding)throw error("US_G3_WELCOME_FRESH_SOURCE_REQUIRED");
    const data={entity_type:"owner_opening_request",entity_id:id,
      ...(binding?{us_source_binding:binding}:{}),
      owner_type:req.owner_type,slug:req.slug_final,
      to:preview.to,subject:preview.subject,text:preview.text||"",
      html:preview.html,links:preview.links||{},status:"pending",
      delivery_state:"claimed",rfc_message_id:rfcMessageId,
      logical_intent_key:key};
    const insert=await db.query(
      "INSERT INTO public.messages(lead_id,moderation_case_id,status,idempotency_key,data,created_at,updated_at) "+
      "VALUES(NULL,$1,'pending',$2,$3::jsonb,NOW(),NOW()) "+
      "ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL "+
      "DO NOTHING RETURNING id",
      [req.moderation_case_id?toId(req.moderation_case_id):null,key,JSON.stringify(data)]);
    const messageId=toId(insert.rows[0]?.id);
    if(!messageId)requireReconcile();
    await createTrace(db,{messageId,attempt:1,status:"pending",
      data:{event:"owner_opening.welcome_intent_claimed",rfc_message_id:rfcMessageId}});
    const update=await db.query(
      "UPDATE public.owner_opening_requests "+
      "SET message_id=$2,email_preview_json=$3::jsonb,email_status='ready',"+
      "email_error=NULL,updated_at=NOW() "+
      "WHERE id=$1 AND status='email_ready' AND message_id IS NULL RETURNING *",
      [id,messageId,JSON.stringify(preview)]);
    if(update.rows.length!==1)throw error("OWNER_OPENING_WELCOME_STATE_RACE");
    await writeAudit(db,{request:update.rows[0],admin,
      eventType:"owner_opening.email_intent_claimed",
      data:{message_id:messageId,logical_intent_key:key,rfc_message_id:rfcMessageId}});
    return {kind:"claimed",request:update.rows[0],preview,
      messageId,rfcMessageId,key};
  });
}
async function finalizeTx(db,{requestId,messageId,key,gmailMessageId,
  admin,createTrace,writeAudit,reconciled,requireUsScope=false,sourceAdmin=null,expectedCandidate=null}){
  const req=await lockRequest(db,requestId);
  if(!req)throw error("OWNER_OPENING_REQUEST_NOT_FOUND",404);
  checkUsScope(req,requireUsScope);
  await assertAdminSession(db,sourceAdmin,requireUsScope);
  const related=requireUsScope?await relatedMessages(db,req):null;
  const msg=requireUsScope?related[0]:await lockMessage(db,key);
  if(requireUsScope){
    const current=reconcileCandidate(req,related,gmailMessageId);
    if(expectedCandidate&&!sameCandidate(expectedCandidate,current))requireReconcile();
  }
  if(!msg||toId(msg.id)!==messageId||toId(req.message_id)!==messageId||msg.data?.logical_intent_key!==key||msg.data?.rfc_message_id!==welcomeRfcMessageId(requestId))
    throw error("OWNER_OPENING_WELCOME_INTENT_MISMATCH");
  if(req.status==="email_sent"&&msg.status==="sent"){
    if(req.email_status!=="sent"||!req.email_sent_at||
       msg.data?.delivery_state!=="sent"||msg.data?.gmail_message_id!==gmailMessageId||
       msg.data?.logical_intent_key!==key||msg.data?.rfc_message_id!==welcomeRfcMessageId(requestId))
      requireReconcile();
    return {request:req,messageId,gmailMessageId,idempotent:true};
  }
  if(!["email_ready","email_failed"].includes(req.status)||
     !["pending","failed"].includes(msg.status)||
     !["claimed","uncertain"].includes(msg.data?.delivery_state))
    throw error("OWNER_OPENING_WELCOME_STATE_INVALID");
  const change=await db.query(
    "UPDATE public.messages SET status='sent',updated_at=NOW(),data=data || $3::jsonb "+
    "WHERE id=$1 AND idempotency_key=$2 AND status IN ('pending','failed') "+
    "AND data->>'delivery_state' IN ('claimed','uncertain') RETURNING id",
    [messageId,key,JSON.stringify({
      delivery_state:"sent",gmail_message_id:gmailMessageId,
      ...(reconciled?{reconciled_at:new Date().toISOString()}:
        {sent_at:new Date().toISOString()})})]);
  if(change.rows.length!==1)throw error("OWNER_OPENING_WELCOME_MESSAGE_RACE");
  const changes=await db.query(
    "UPDATE public.owner_opening_requests "+
    "SET status='email_sent',email_status='sent',email_sent_at=NOW(),"+
    "email_error=NULL,updated_at=NOW() "+
    "WHERE id=$1 AND message_id=$2 AND status IN ('email_ready','email_failed') "+
    "RETURNING *",[requestId,messageId]);
  if(changes.rows.length!==1)throw error("OWNER_OPENING_WELCOME_STATUS_RACE");
  await createTrace(db,{messageId,attempt:1,status:"sent",
    data:{event:reconciled?"owner_opening.email_reconciled":
      "owner_opening.email_sent",gmail_message_id:gmailMessageId}});
  const audit=await writeAudit(db,{request:changes.rows[0],admin,
    eventType:reconciled?"owner_opening.email_reconciled":"owner_opening.email_sent",
    data:{message_id:messageId,gmail_message_id:gmailMessageId}});
  return {request:changes.rows[0],messageId,gmailMessageId,
    audit_event_id:audit?.id?Number(audit.id):null};
}
export async function finalizeOwnerOpeningWelcomeSent({
  pool,requestId,messageId,gmailMessageId,admin,createTrace,writeAudit,requireUsScope=false,sourceAdmin=null}={}){
  assertUsCommercialWriterReleased("welcome");
  if(!GMAIL_ID.test(String(gmailMessageId||"")))
    throw error("GMAIL_MESSAGE_ID_UNVERIFIED");
  const id=toId(requestId),mid=toId(messageId);
  if(!id||!mid)throw error("OWNER_OPENING_WELCOME_INTENT_MISMATCH");
  return transaction(pool,db=>finalizeTx(db,{requestId:id,messageId:mid,
    key:welcomeIntentKey(id),gmailMessageId,admin,createTrace,writeAudit,
    reconciled:false,requireUsScope,sourceAdmin}));
}
// If provider outcome/SQL commit is unknown, mark uncertain best-effort.
// If this marker also fails, the previously committed UNIQUE intent remains.
export async function markOwnerOpeningWelcomeUncertain({
  pool,requestId,messageId,gmailMessageId=null,admin,createTrace,writeAudit,requireUsScope=false,sourceAdmin=null}={}){
  assertUsCommercialWriterReleased("welcome");
  const id=toId(requestId),mid=toId(messageId);
  if(!id||!mid)throw error("OWNER_OPENING_WELCOME_INTENT_MISMATCH");
  const key=welcomeIntentKey(id);
  return transaction(pool,async db=>{
    const req=await lockRequest(db,id);
    checkUsScope(req,requireUsScope);
    await assertAdminSession(db,sourceAdmin,requireUsScope);
    const related=requireUsScope?await relatedMessages(db,req):null;
    const msg=requireUsScope?related[0]:await lockMessage(db,key);
    if(requireUsScope)reconcileCandidate(req,related,gmailMessageId);
    if(!req||!msg||toId(msg.id)!==mid||toId(req.message_id)!==mid)
      throw error("OWNER_OPENING_WELCOME_INTENT_MISMATCH");
    if(req.status==="email_sent"&&msg.status==="sent")
      return {kind:"already_sent",messageId:mid};
    if(!["email_ready","email_failed"].includes(req.status)||
       !["pending","failed"].includes(msg.status))
      throw error("OWNER_OPENING_WELCOME_STATE_INVALID");
    const provider=gmailMessageId&&GMAIL_ID.test(String(gmailMessageId))?
      String(gmailMessageId):null;
    const data={delivery_state:"uncertain",error_code:UNCERTAIN,
      ...(provider?{gmail_message_id:provider}:{})};
    const change=await db.query(
      "UPDATE public.messages SET status='failed',updated_at=NOW(),data=data || $3::jsonb "+
      "WHERE id=$1 AND idempotency_key=$2 AND status IN ('pending','failed') RETURNING id",
      [mid,key,JSON.stringify(data)]);
    if(change.rows.length!==1)throw error("OWNER_OPENING_WELCOME_MESSAGE_RACE");
    const changes=await db.query(
      "UPDATE public.owner_opening_requests "+
      "SET status='email_failed',email_status='failed',email_error=$3,updated_at=NOW() "+
      "WHERE id=$1 AND message_id=$2 AND status IN ('email_ready','email_failed') "+
      "RETURNING *",[id,mid,UNCERTAIN]);
    if(changes.rows.length!==1)throw error("OWNER_OPENING_WELCOME_STATUS_RACE");
    if(msg.data?.delivery_state!=="uncertain"){
      await createTrace(db,{messageId:mid,attempt:1,status:"failed",
        data:{event:"owner_opening.email_delivery_uncertain",code:UNCERTAIN}});
      await writeAudit(db,{request:changes.rows[0],admin,
        eventType:"owner_opening.email_delivery_uncertain",
        data:{message_id:mid,code:UNCERTAIN}});
    }
    return {kind:"uncertain",messageId:mid};
  });
}
// Gmail metadata must positively match Gmail SENT, RFC Message-ID AND recipient.
// Neither timeout nor absence of an id proves non-delivery.
export async function reconcileOwnerOpeningWelcomeSent({
  pool,requestId,gmailMessageId=null,verifyGmailSent,admin,sourceAdmin,createTrace,writeAudit,requireUsScope=true}={}){
  assertUsCommercialWriterReleased("welcome");
  const id=toId(requestId),provider=gmailMessageId==null?null:String(gmailMessageId);
  if(!id||(provider!==null&&!GMAIL_ID.test(provider))||typeof verifyGmailSent!=="function"||requireUsScope!==true)
    throw error("OWNER_OPENING_WELCOME_RECONCILE_INPUT_INVALID",400);
  // Snapshot exact existing intent under locks. No provider call inside SQL.
  const expected=await transaction(pool,async db=>{
    const {req,rows}=await inspectLockedWelcome(db,id,true,sourceAdmin);
    return reconcileCandidate(req,rows,provider);
  });
  const result=await verifyGmailSent({providerId:provider??expected.oldProvider,rfcMessageId:expected.rfcMessageId,recipient:expected.recipient});
  const verifiedId=result?.providerId;
  if(!GMAIL_ID.test(String(verifiedId||""))||result?.verified!==true||
     (provider&&provider!==verifiedId)||(expected.oldProvider&&expected.oldProvider!==verifiedId))
    throw error("GMAIL_SENT_READBACK_UNVERIFIED");
  // Re-lock exact intent; reject changed recipient, identity, source or provider.
  return transaction(pool,db=>finalizeTx(db,{
    requestId:id,messageId:expected.id,key:expected.key,gmailMessageId:verifiedId,
    admin,sourceAdmin,createTrace,writeAudit,reconciled:true,requireUsScope:true,expectedCandidate:expected}));
}
