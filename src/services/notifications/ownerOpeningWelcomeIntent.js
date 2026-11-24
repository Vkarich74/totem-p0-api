import {assertUsCommercialWriterReleased} from "../provision/usCommercialWriterRelease.js";
// G5-T4: one durable welcome intent in EXISTING Core messages/traces.
// Google Gmail is not transactional with PostgreSQL. Ambiguous delivery
// is NEVER automatically retried; operators may reconcile POSITIVE Gmail proof.
import { assertUsPaidEvidenceForLockedRequest } from "../provision/ownerOpeningCanonicalActivation.js";

const UNCERTAIN="OWNER_OPENING_GMAIL_DELIVERY_UNCERTAIN";
const GMAIL_ID=/^[a-zA-Z0-9_-]{1,200}$/;
const toId=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:0;};
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
  return r.rows[0]||null;
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
function requireReconcile(){throw error("OWNER_OPENING_WELCOME_RECONCILIATION_REQUIRED");}
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
    createTrace,writeAudit}=o;
  const id=toId(requestId),key=welcomeIntentKey(id);
  if(typeof pool?.query!=="function")throw error("WELCOME_POSTGRES_POOL_REQUIRED",500);
  const first=await pool.query(
    "SELECT * FROM public.owner_opening_requests WHERE id=$1",[id]);
  const snapshot=first.rows[0];
  if(!snapshot)throw error("OWNER_OPENING_REQUEST_NOT_FOUND",404);
  assertMarketPolicy(snapshot);
  const initialMarket=getMarketCode(snapshot);
  checkMarket(snapshot,initialMarket);
  if(snapshot.status==="email_sent")return {kind:"already_sent",request:snapshot};
  if(snapshot.message_id!=null||snapshot.status==="email_failed")requireReconcile();
  if(snapshot.status!=="email_ready")throw error("OWNER_OPENING_REQUEST_STATUS_INVALID");
  let paid=null;
  if(initialMarket==="US"){
    paid=await preparePaidEvidence(snapshot);
    if(paid?.status!=="PAID_VERIFIED"||paid.canActivate!==true)
      throw error("US_ODOO_PAID_ENTITLEMENT_REQUIRED");
  }
  return transaction(pool,async db=>{
    const req=await lockRequest(db,id);
    if(!req)throw error("OWNER_OPENING_REQUEST_NOT_FOUND",404);
    assertMarketPolicy(req);
    const market=getMarketCode(req);
    checkMarket(req,market);
    if(req.status==="email_sent")return {kind:"already_sent",request:req};
    if(req.message_id!=null||req.status==="email_failed")requireReconcile();
    if(await lockMessage(db,key))requireReconcile();
    if(req.status!=="email_ready")throw error("OWNER_OPENING_REQUEST_STATUS_INVALID");
    if(market!==initialMarket)throw error("OWNER_OPENING_MARKET_CHANGED");
    if(market==="US"){
      const now=await db.query("SELECT clock_timestamp() AS now");
      assertUsPaidEvidenceForLockedRequest(req,paid,now.rows[0]?.now);
      await assertUsActivationReady(db,req,toId(req.created_owner_id));
    }
    const preview=await createPreview(db,req,market);
    if(!preview?.to||!preview?.subject||!preview?.html)
      throw error("OWNER_OPENING_WELCOME_PREVIEW_INVALID");
    const rfcMessageId=welcomeRfcMessageId(id);
    const data={entity_type:"owner_opening_request",entity_id:id,
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
  admin,createTrace,writeAudit,reconciled}){
  const req=await lockRequest(db,requestId);
  if(!req)throw error("OWNER_OPENING_REQUEST_NOT_FOUND",404);
  const msg=await lockMessage(db,key);
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
  pool,requestId,messageId,gmailMessageId,admin,createTrace,writeAudit}={}){
  assertUsCommercialWriterReleased("welcome");
  if(!GMAIL_ID.test(String(gmailMessageId||"")))
    throw error("GMAIL_MESSAGE_ID_UNVERIFIED");
  const id=toId(requestId),mid=toId(messageId);
  if(!id||!mid)throw error("OWNER_OPENING_WELCOME_INTENT_MISMATCH");
  return transaction(pool,db=>finalizeTx(db,{requestId:id,messageId:mid,
    key:welcomeIntentKey(id),gmailMessageId,admin,createTrace,writeAudit,
    reconciled:false}));
}
// If provider outcome/SQL commit is unknown, mark uncertain best-effort.
// If this marker also fails, the previously committed UNIQUE intent remains.
export async function markOwnerOpeningWelcomeUncertain({
  pool,requestId,messageId,gmailMessageId=null,admin,createTrace,writeAudit}={}){
  assertUsCommercialWriterReleased("welcome");
  const id=toId(requestId),mid=toId(messageId);
  if(!id||!mid)throw error("OWNER_OPENING_WELCOME_INTENT_MISMATCH");
  const key=welcomeIntentKey(id);
  return transaction(pool,async db=>{
    const req=await lockRequest(db,id);
    const msg=await lockMessage(db,key);
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
  pool,requestId,gmailMessageId,verifyGmailSent,admin,createTrace,writeAudit}={}){
  assertUsCommercialWriterReleased("welcome");
  const id=toId(requestId),provider=String(gmailMessageId||"");
  if(!id||!GMAIL_ID.test(provider)||typeof verifyGmailSent!=="function")
    throw error("OWNER_OPENING_WELCOME_RECONCILE_INPUT_INVALID",400);
  const key=welcomeIntentKey(id);
  const result=await pool.query(
    "SELECT id,status,idempotency_key,data FROM public.messages "+
    "WHERE idempotency_key=$1",[key]);
  const msg=result.rows[0];
  if(!msg||!toId(msg.id)||
     msg.data?.rfc_message_id!==welcomeRfcMessageId(id))
    throw error("OWNER_OPENING_WELCOME_INTENT_NOT_FOUND",404);
  const verified=await verifyGmailSent(provider,welcomeRfcMessageId(id),msg.data?.to);
  if(verified!==true)throw error("GMAIL_SENT_READBACK_UNVERIFIED");
  return transaction(pool,db=>finalizeTx(db,{
    requestId:id,messageId:toId(msg.id),key,gmailMessageId:provider,
    admin,createTrace,writeAudit,reconciled:true}));
}
