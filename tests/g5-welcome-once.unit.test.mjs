// G5-T4 isolated mock transaction suite: no real Gmail, users, SQL writes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  welcomeIntentKey,welcomeRfcMessageId,claimOwnerOpeningWelcome,
  finalizeOwnerOpeningWelcomeSent,markOwnerOpeningWelcomeUncertain,
  reconcileOwnerOpeningWelcomeSent,
} from "../src/services/notifications/ownerOpeningWelcomeIntent.js";
import { buildEmailMime } from "../src/services/notifications/emailTemplates.js";

const cp=x=>structuredClone(x);
class Pool{
  constructor(req){this.s={request:cp(req),message:null,traces:[],audits:[]};this.busy=false;this.waiters=[];this.mid=300;}
  async lock(){if(!this.busy){this.busy=true;return;}await new Promise(resolve=>this.waiters.push(resolve));}
  unlock(){const next=this.waiters.shift();if(next)next();else this.busy=false;}
  async query(sql,args=[]){
    if(sql.includes("FROM public.owner_opening_requests")&&!sql.includes("FOR UPDATE"))
      return {rows:[cp(this.s.request)]};
    if(sql.includes("FROM public.messages")&&!sql.includes("FOR UPDATE"))
      return {rows:this.s.message?.idempotency_key===args[0]?[cp(this.s.message)]:[]};
    throw Error("POOL_UNEXPECTED_QUERY");
  }
  async connect(){return new Client(this);}
}
class Client{
  constructor(pool){this.p=pool;this.tx=null;this.held=false;}
  async query(sql,args=[]){
    if(sql==="BEGIN")return {rows:[]};
    if(sql==="ROLLBACK"){this.tx=null;if(this.held){this.p.unlock();this.held=false;}return {rows:[]};}
    if(sql==="COMMIT"){if(this.tx)this.p.s=this.tx;this.tx=null;if(this.held){this.p.unlock();this.held=false;}return {rows:[]};}
    if(sql.includes("FROM public.owner_opening_requests")&&sql.includes("FOR UPDATE")){
      await this.p.lock();this.held=true;this.tx=cp(this.p.s);return {rows:[cp(this.tx.request)]};
    }
    const s=this.tx;
    if(!s)throw Error("SQL_OUTSIDE_TX");
    if(sql.includes("SELECT clock_timestamp()"))return {rows:[{now:new Date()}]};
    if(sql.includes("FROM public.messages")&&sql.includes("FOR UPDATE"))
      return {rows:s.message?.idempotency_key===args[0]?[cp(s.message)]:[]};
    if(sql.includes("INSERT INTO public.messages")){
      if(s.message?.idempotency_key===args[1])return {rows:[]};
      s.message={id:++this.p.mid,status:"pending",idempotency_key:args[1],
        data:JSON.parse(args[2])};
      return {rows:[{id:s.message.id}]};
    }
    if(sql.includes("UPDATE public.messages")&&sql.includes("status='sent'")){
      if(!s.message||s.message.id!==args[0])return {rows:[]};
      s.message.status="sent";Object.assign(s.message.data,JSON.parse(args[2]));
      return {rows:[{id:s.message.id}]};
    }
    if(sql.includes("UPDATE public.messages")&&sql.includes("status='failed'")){
      if(!s.message||s.message.id!==args[0])return {rows:[]};
      s.message.status="failed";Object.assign(s.message.data,JSON.parse(args[2]));
      return {rows:[{id:s.message.id}]};
    }
    if(sql.includes("UPDATE public.owner_opening_requests")){
      if(sql.includes("SET message_id=")){
        if(s.request.status!=="email_ready"||s.request.message_id!=null)return {rows:[]};
        s.request.message_id=args[1];s.request.email_preview_json=JSON.parse(args[2]);
        return {rows:[cp(s.request)]};
      }
      if(sql.includes("status='email_sent'")){
        if(!["email_ready","email_failed"].includes(s.request.status)||s.request.message_id!==args[1])
          return {rows:[]};
        s.request.status="email_sent";s.request.email_status="sent";
        return {rows:[cp(s.request)]};
      }
      if(sql.includes("status='email_failed'")){
        if(!["email_ready","email_failed"].includes(s.request.status)||s.request.message_id!==args[1])
          return {rows:[]};
        s.request.status="email_failed";s.request.email_status="failed";
        s.request.email_error=args[2];return {rows:[cp(s.request)]};
      }
    }
    throw Error("UNKNOWN_SQL_"+sql.slice(0,55));
  }
  release(){if(this.held)throw Error("LOCK_LEAK");}
}
function req(m="KG",x={}){
  return {id:31,status:"email_ready",email_status:"ready",message_id:null,
    owner_type:"salon",created_owner_id:201,created_auth_user_id:301,
    source_namespace:m==="US"?"odoo_online":null,
    source_company_id:m==="US"?4:null,source_website_id:m==="US"?5:null,
    source_partner_id:m==="US"?88:null,source_request_id:m==="US"?"odoo-31":null,
    precheck_result_json:{market_code:m},...x};
}
function receipt(r,changes={}){
  return {status:"PAID_VERIFIED",canActivate:true,requestId:r.id,
    createdOwnerId:201,createdAuthUserId:301,sourceRequestId:r.source_request_id,
    ownerType:"salon",partnerId:88,companyId:4,websiteId:5,
    periodStartUtc:"2026-01-01T00:00:00.000Z",
    periodEndExclusiveUtc:"2027-12-01T00:00:00.000Z",
    verifiedAtUtc:new Date().toISOString(),
    subscriptionOrderId:501,invoiceId:601,commercialPolicyVersion:"test_v1",...changes};
}
function deps(pool,more={}){
  return {pool,requestId:31,admin:{id:5},
    getMarketCode:r=>r.precheck_result_json.market_code,
    assertMarketPolicy:()=>{},assertUsActivationReady:async()=>{},
    preparePaidEvidence:async r=>receipt(r),
    createPreview:async()=>({to:"owner@example.com",subject:"Welcome",
      text:"Welcome",html:"<p>Welcome</p>",links:{}}),
    createTrace:async(db,x)=>{db.tx.traces.push(x);},
    writeAudit:async(db,x)=>{db.tx.audits.push(x);return {id:db.tx.audits.length};},
    ...more};
}
const claim=(p,x={})=>claimOwnerOpeningWelcome(deps(p,x));
const finalize=(p,mid,x={})=>finalizeOwnerOpeningWelcomeSent({
  ...deps(p),messageId:mid,gmailMessageId:"gm_123",...x});
const uncertain=(p,mid,x={})=>markOwnerOpeningWelcomeUncertain({
  ...deps(p),messageId:mid,...x});
const reconcile=(p,x={})=>reconcileOwnerOpeningWelcomeSent({
  ...deps(p),gmailMessageId:"gm_123",verifyGmailSent:async()=>true,...x});

test("stable deterministic key and RFC Message-ID; old MIME is unchanged",()=>{
  assert.equal(welcomeIntentKey(31),"owner_opening:31:welcome:v1");
  assert.equal(welcomeRfcMessageId(31),"<totem-owner-opening-31-welcome-v1@totemv.com>");
  const x={to:"owner@example.com",from:"sender@example.com",
    subject:"Hello",html:"<p>Hi</p>",text:"Hi",locale:"en-US"};
  assert.equal(buildEmailMime(x).includes("Message-ID:"),false);
  assert.ok(buildEmailMime({...x,messageId:welcomeRfcMessageId(31)}).includes("Message-ID: <"));
  assert.throws(()=>buildEmailMime({...x,messageId:"bad\r\nCc: evil"}),/HEADER_INVALID/);
});
test("claim commits one pending message, trace and audit before Gmail",async()=>{
  const p=new Pool(req());const c=await claim(p);
  assert.equal(c.kind,"claimed");assert.equal(p.s.request.message_id,c.messageId);
  assert.equal(p.s.message.idempotency_key,welcomeIntentKey(31));
  assert.equal(p.s.message.data.delivery_state,"claimed");
  assert.equal(p.s.traces.length,1);assert.equal(p.s.audits.length,1);
});
test("repeat SEND/RESEND blocked by same existing intent",async()=>{
  const p=new Pool(req());await claim(p);
  await assert.rejects(()=>claim(p),/RECONCILIATION_REQUIRED/);
  assert.equal(p.s.audits.length,1);
});
test("24 concurrent attempts can create only one intent",async()=>{
  const p=new Pool(req());
  const results=await Promise.allSettled(Array.from({length:24},()=>claim(p)));
  assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(p.s.audits.length,1);assert.equal(p.s.traces.length,1);
});
test("legacy failed row with prior message id cannot resend",async()=>{
  await assert.rejects(()=>claim(new Pool(req("KG",{status:"email_failed",message_id:7}))),
    /RECONCILIATION_REQUIRED/);
});
test("US no verified paid entitlement cannot create intent",async()=>{
  const p=new Pool(req("US"));
  await assert.rejects(()=>claim(p,{preparePaidEvidence:async()=>({
    status:"WAIT",canActivate:false})}),/PAID_ENTITLEMENT_REQUIRED/);
  assert.equal(p.s.message,null);
});
test("US paid and US GEO validation required",async()=>{
  const p=new Pool(req("US"));let calls=0;
  await claim(p,{assertUsActivationReady:async()=>{calls++;}});
  assert.equal(calls,1);
});
test("US wrong partner, role and Core identity cannot borrow payment",async()=>{
  for(const bad of [{partnerId:99},{ownerType:"master"},{createdAuthUserId:999}]){
    const p=new Pool(req("US"));
    await assert.rejects(()=>claim(p,{preparePaidEvidence:async r=>receipt(r,bad)}),
      /PAYMENT_SOURCE_CHANGED/);
    assert.equal(p.s.message,null);
  }
});
test("US typed source never masquerades as legacy KG",async()=>{
  await assert.rejects(()=>claim(new Pool(req("KG",{source_namespace:"odoo_online"}))),
    /SOURCE_MARKET_MISMATCH/);
});
test("audit failure rolls back entire claim",async()=>{
  const p=new Pool(req());
  await assert.rejects(()=>claim(p,{writeAudit:async()=>{throw Error("AUDIT_FAILED");}}),
    /AUDIT_FAILED/);
  assert.equal(p.s.message,null);assert.equal(p.s.request.message_id,null);
});
test("successful Gmail accepted id commits messages and opening as sent",async()=>{
  const p=new Pool(req());const c=await claim(p);await finalize(p,c.messageId);
  assert.equal(p.s.request.status,"email_sent");assert.equal(p.s.message.status,"sent");
  assert.equal(p.s.message.data.gmail_message_id,"gm_123");
  assert.equal(p.s.audits.length,2);
});
test("Gmail timeout is uncertain and cannot be replayed",async()=>{
  const p=new Pool(req());const c=await claim(p);await uncertain(p,c.messageId);
  assert.equal(p.s.request.status,"email_failed");
  assert.equal(p.s.message.data.delivery_state,"uncertain");
  await assert.rejects(()=>claim(p),/RECONCILIATION_REQUIRED/);
});
test("crash after claim commit but before Gmail cannot replay",async()=>{
  const p=new Pool(req());await claim(p);
  await assert.rejects(()=>claim(p),/RECONCILIATION_REQUIRED/);
  assert.equal(p.s.message.status,"pending");
});
test("positive SENT readback reconciles existing message without resending",async()=>{
  const p=new Pool(req());const c=await claim(p);await uncertain(p,c.messageId);
  let data;const a=await reconcile(p,{verifyGmailSent:async(...v)=>{data=v;return true;}});
  assert.equal(a.request.status,"email_sent");
  assert.deepEqual(data,["gm_123",welcomeRfcMessageId(31),"owner@example.com"]);
  assert.equal((await claim(p)).kind,"already_sent");
});
test("negative Gmail verification cannot mark sent",async()=>{
  const p=new Pool(req());const c=await claim(p);await uncertain(p,c.messageId);
  await assert.rejects(()=>reconcile(p,{verifyGmailSent:async()=>false}),/GMAIL_SENT_READBACK_UNVERIFIED/);
  assert.equal(p.s.request.status,"email_failed");
});
test("Gmail read scope unavailable does not authorize new claim",async()=>{
  const p=new Pool(req());const c=await claim(p);
  await assert.rejects(()=>reconcile(p,{verifyGmailSent:async()=>false}),/GMAIL_SENT_READBACK_UNVERIFIED/);
  assert.equal(p.s.request.message_id,c.messageId);
});
test("reconcile twice is idempotent, no new trace or audit",async()=>{
  const p=new Pool(req());const c=await claim(p);await uncertain(p,c.messageId);
  await reconcile(p);const n=p.s.audits.length;
  assert.equal((await reconcile(p)).idempotent,true);
  assert.equal(p.s.audits.length,n);
});
test("KG welcome is independent of US paid Odoo",async()=>{
  const p=new Pool(req());const c=await claim(p,{preparePaidEvidence:async()=>{throw Error("NO_ODOO");}});
  assert.equal(c.kind,"claimed");
});
test("exact partial UNIQUE SQL and both send endpoints use ONE handler",async()=>{
  const service=await readFile(new URL("../src/services/notifications/ownerOpeningWelcomeIntent.js",import.meta.url),"utf8");
  const route=await readFile(new URL("../src/routes/internal/adminOpenOwner.js",import.meta.url),"utf8");
  assert.ok(service.includes("ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL"));
  assert.ok(route.includes('r.post("/requests/:id/send-email",sendWelcomeOnce)'));
  assert.ok(route.includes('r.post("/requests/:id/resend-email",sendWelcomeOnce)'));
  assert.equal((route.match(/sendOwnerOpeningEmail\(claim.preview,claim.rfcMessageId\)/g)||[]).length,1);
  assert.equal(route.includes("async function createOwnerOpeningMessage"),false);
});

test("Gmail accepted but final SQL audit failed: one intent, safe reconciliation",async()=>{
  const p=new Pool(req());const c=await claim(p);
  await assert.rejects(()=>finalize(p,c.messageId,{
    writeAudit:async()=>{throw Error("SIMULATED_AUDIT_DB_FAILURE");}
  }),/SIMULATED_AUDIT_DB_FAILURE/);
  assert.equal(p.s.message.status,"pending");
  assert.equal(p.s.request.status,"email_ready");
  await uncertain(p,c.messageId,{gmailMessageId:"gm_123"});
  await assert.rejects(()=>claim(p),/RECONCILIATION_REQUIRED/);
  const reconciled=await reconcile(p);
  assert.equal(reconciled.request.status,"email_sent");
  assert.equal(p.s.message.status,"sent");
});
test("unknown SQL COMMIT outcome after Gmail ACK blocks repeated send",async()=>{
  const p=new Pool(req());let commits=0;
  const realConnect=p.connect.bind(p);
  p.connect=async()=>{
    const db=await realConnect();const original=db.query.bind(db);
    db.query=async(sql,args)=>{
      if(sql==="COMMIT"&&++commits===2)
        throw Error("SIMULATED_POSTGRES_COMMIT_INTERRUPTED");
      return original(sql,args);
    };
    return db;
  };
  const c=await claim(p);
  await assert.rejects(()=>finalize(p,c.messageId),/COMMIT_INTERRUPTED/);
  assert.equal(p.s.message.status,"pending");
  await uncertain(p,c.messageId,{gmailMessageId:"gm_123"});
  await assert.rejects(()=>claim(p),/RECONCILIATION_REQUIRED/);
  assert.equal((await reconcile(p)).request.status,"email_sent");
});
