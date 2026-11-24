// Real durable message and trace schema; synthetic Gmail ACK/unknown only.
import test,{beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {claimOwnerOpeningWelcome,finalizeOwnerOpeningWelcomeSent,markOwnerOpeningWelcomeUncertain,reconcileOwnerOpeningWelcomeSent,welcomeRfcMessageId} from "../src/services/notifications/ownerOpeningWelcomeIntent.js";
import {fixtureData,fixtureEnv,fixtureTransport} from "./fixtures/g5-odoo-batch-fixture.mjs";
import {createUsOdooReadOnlyClient} from "../src/services/billing/usOdooReadOnlyClient.js";
import {prepareUsPaidActivationEvidence} from "../src/services/provision/usPaidOwnerOpeningGate.js";
const url=process.env.G5_TEST_DATABASE_URL;
if(!url||process.env.DATABASE_URL||process.env.G5_RELEASE_ISOLATED!=="YES")throw Error("G5_RELEASE_ISOLATED_REQUIRED");
const parsed=new URL(url);if(parsed.hostname!=="127.0.0.1"||parsed.pathname!=="/g5_queue_test")throw Error("NONLOCAL");
const pool=new pg.Pool({connectionString:url,max:25});
const q=(sql,args)=>pool.query(sql,args);
const count=async sql=>(await q(sql)).rows[0].n;
beforeEach(async()=>{
 assert.equal((await q("SELECT current_database() AS db")).rows[0].db,"g5_queue_test");
 await q("TRUNCATE public.owner_opening_requests,public.messages,public.traces,public.audit_events RESTART IDENTITY");
});
after(async()=>pool.end());
async function seed(market="US"){
 const r=await q(`INSERT INTO public.owner_opening_requests(owner_type,status,name,email,created_owner_id,created_auth_user_id,precheck_result_json,
 source_namespace,source_company_id,source_website_id,source_partner_id,source_request_id,email_status)
 VALUES('salon','email_ready','fixture','fixture@example.invalid',1,10001,$1::jsonb,$2,$3,$4,$5,$6,'ready') RETURNING *`,
 [JSON.stringify({market_code:market}),market==="US"?"odoo_online":null,market==="US"?4:null,market==="US"?5:null,market==="US"?20001:null,market==="US"?"fixture-1":null]);
 return r.rows[0];
}
const createTrace=async(db,{messageId,attempt,status,data})=>(await db.query(
 "INSERT INTO public.traces(message_id,attempt,status,data,created_at) VALUES($1,$2,$3,$4,NOW()) RETURNING *",
 [Number(messageId),Number(attempt),status,JSON.stringify(data)])).rows[0];
const writeAudit=async(db,{request,eventType,data})=>(await db.query(
 "INSERT INTO public.audit_events(event_type,actor,data) VALUES($1,'fixture:admin',$2::jsonb) RETURNING id",
 [eventType,JSON.stringify({...data,request_id:Number(request.id)})])).rows[0];
function callbacks(r,overrides={}){
 const f=fixtureData(1),transport=fixtureTransport(f.data);
 return {pool,requestId:Number(r.id),admin:{id:1},getMarketCode:x=>x.precheck_result_json.market_code,
 assertMarketPolicy:()=>{},assertUsActivationReady:async()=>{},
 preparePaidEvidence:row=>prepareUsPaidActivationEvidence(row,{env:fixtureEnv(),createClient:o=>createUsOdooReadOnlyClient({...o,fetchImpl:transport.fetchImpl})}),
 createPreview:async()=>({to:"fixture@example.invalid",subject:"fixture",text:"fixture",html:"<p>fixture</p>"}),
 createTrace,writeAudit,...overrides};
}
test("24 simultaneous claimers, one durable intent and one possible send",async()=>{
 const r=await seed(),o=callbacks(r);
 const results=await Promise.allSettled(Array.from({length:24},()=>claimOwnerOpeningWelcome(o)));
 const won=results.filter(x=>x.status==="fulfilled");
 assert.equal(won.length,1);assert.equal(won[0].value.kind,"claimed");
 assert.equal(await count("SELECT count(*)::int AS n FROM public.messages"),1);
 assert.equal(await count("SELECT count(*)::int AS n FROM public.traces"),1);
 assert.equal(await count("SELECT count(*)::int AS n FROM public.audit_events"),1);
 const claimed=won[0].value;assert.equal(claimed.rfcMessageId,welcomeRfcMessageId(r.id));
 await finalizeOwnerOpeningWelcomeSent({...o,messageId:claimed.messageId,gmailMessageId:"synthetic_ack"});
 assert.equal((await q("SELECT status FROM public.messages")).rows[0].status,"sent");
 assert.equal((await q("SELECT status FROM public.owner_opening_requests")).rows[0].status,"email_sent");
 assert.equal(await count("SELECT count(*)::int AS n FROM public.traces"),2);
});
test("claim committed before process exit; retry refuses another send",async()=>{
 const r=await seed(),o=callbacks(r),a=await claimOwnerOpeningWelcome(o);
 assert.equal(a.kind,"claimed");await assert.rejects(()=>claimOwnerOpeningWelcome(o),/RECONCILIATION_REQUIRED/);
 assert.equal(await count("SELECT count(*)::int AS n FROM public.messages"),1);
});
test("provider ACK but SQL audit failure: no duplicate intent; positive reconciliation only",async()=>{
 const r=await seed(),o=callbacks(r),a=await claimOwnerOpeningWelcome(o);
 await assert.rejects(()=>finalizeOwnerOpeningWelcomeSent({...o,messageId:a.messageId,gmailMessageId:"synthetic_ack",
  writeAudit:async()=>{throw Error("FIXTURE_AUDIT_FAILURE");}}),/FIXTURE_AUDIT_FAILURE/);
 assert.equal((await q("SELECT status FROM public.messages")).rows[0].status,"pending");
 assert.equal(await count("SELECT count(*)::int AS n FROM public.traces"),1);
 await markOwnerOpeningWelcomeUncertain({...o,messageId:a.messageId});
 await assert.rejects(()=>claimOwnerOpeningWelcome(o),/RECONCILIATION_REQUIRED/);
 await assert.rejects(()=>reconcileOwnerOpeningWelcomeSent({...o,gmailMessageId:"synthetic_ack",verifyGmailSent:async()=>false}),/READBACK_UNVERIFIED/);
 const ack=await reconcileOwnerOpeningWelcomeSent({...o,gmailMessageId:"synthetic_ack",verifyGmailSent:async(id,rfc,to)=>id==="synthetic_ack"&&rfc===a.rfcMessageId&&to==="fixture@example.invalid"});
 assert.equal(ack.request.status,"email_sent");
 const again=await reconcileOwnerOpeningWelcomeSent({...o,gmailMessageId:"synthetic_ack",verifyGmailSent:async()=>true});
 assert.equal(again.idempotent,true);assert.equal(await count("SELECT count(*)::int AS n FROM public.messages"),1);
 assert.equal(await count("SELECT count(*)::int AS n FROM public.traces"),3);
 assert.equal(await count("SELECT count(*)::int AS n FROM public.audit_events"),3);
});
test("claim audit failure rolls back message, trace and request binding",async()=>{
 const r=await seed(),o=callbacks(r,{writeAudit:async()=>{throw Error("FIXTURE_AUDIT_FAILURE");}});
 await assert.rejects(()=>claimOwnerOpeningWelcome(o),/FIXTURE_AUDIT_FAILURE/);
 assert.equal(await count("SELECT count(*)::int AS n FROM public.messages"),0);
 assert.equal(await count("SELECT count(*)::int AS n FROM public.traces"),0);
 assert.equal((await q("SELECT message_id FROM public.owner_opening_requests")).rows[0].message_id,null);
});
test("US without paid confirmation cannot create message; legacy KG unaffected",async()=>{
 const r=await seed();
 await assert.rejects(()=>claimOwnerOpeningWelcome(callbacks(r,{preparePaidEvidence:async()=>({status:"WAIT"})})),/PAID_ENTITLEMENT_REQUIRED/);
 assert.equal(await count("SELECT count(*)::int AS n FROM public.messages"),0);
 await q("DELETE FROM public.owner_opening_requests");
 const kg=await seed("KG");
 assert.equal((await claimOwnerOpeningWelcome(callbacks(kg,{preparePaidEvidence:async()=>{throw Error("NO_ODOO_FOR_KG");}}))).kind,"claimed");
});
