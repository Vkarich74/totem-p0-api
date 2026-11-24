// Actual existing intake creation/precheck, real PG, synthetic JSON-RPC only.
import test,{before,beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {sourceFixture,sourceEnv,sourceHint,sourceHeaders,sourceTransport} from "./fixtures/g5-approved-source-fixture.mjs";
import {createUsOdooApprovedSourceClient} from "../src/services/billing/usOdooReadOnlyClient.js";
import {registerApprovedUsOdooSalon} from "../src/services/provision/usApprovedOdooSalonIntake.js";
const url=process.env.G5_TEST_DATABASE_URL;
if(!url||process.env.DATABASE_URL||process.env.G5_RELEASE_ISOLATED!=="YES")throw Error("G5_RELEASE_ISOLATED_REQUIRED");
const u=new URL(url);if(u.hostname!=="127.0.0.1"||u.pathname!=="/g5_queue_test")throw Error("NONLOCAL");
const db=new pg.Pool({connectionString:url,max:25});
const q=(s,a)=>db.query(s,a);
const count=async table=>(await q("SELECT count(*)::int AS n FROM public."+table)).rows[0].n;
let createVerifiedUsIntakeRequest;
before(async()=>{
 assert.equal((await q("SELECT current_database() AS db")).rows[0].db,"g5_queue_test");
 process.env.TOTEM_US_ADMIN_MANUAL_ACTIVATION="true";
 // Exact identity/owner/moderation/audit schema was installed by setup script.
 // These four read-only lookup tables are minimal isolated fixtures for precheck;
 // they do not certify real salon/master provisioning.
 await q(`CREATE TABLE public.salons(id integer PRIMARY KEY,slug text,name text);
 CREATE TABLE public.masters(id integer PRIMARY KEY,slug text);
 CREATE TABLE public.slug_reservations(id integer PRIMARY KEY,slug text,status text);
 CREATE TABLE public.markets(code text PRIMARY KEY,country_code text,active boolean,default_currency text);
 INSERT INTO public.markets VALUES('US','US',true,'USD'),('KG','KG',true,'KGS');`);
 ({createVerifiedUsIntakeRequest}=await import("../src/routes/internal/adminOpenOwner.js"));
});
beforeEach(async()=>{
 await q("TRUNCATE public.owner_opening_requests,public.moderation_cases,public.audit_events,public.messages,public.traces,public.auth_users,public.billing_subscriptions RESTART IDENTITY");
});
after(async()=>db.end());
function register(f=sourceFixture(),override={}){
 const t=sourceTransport(f);
 return registerApprovedUsOdooSalon({pool:db,body:sourceHint,headers:sourceHeaders,query:{},
  env:sourceEnv(),createClient:o=>createUsOdooApprovedSourceClient({...o,fetchImpl:t.fetchImpl}),
  createExistingOpeningRequest:createVerifiedUsIntakeRequest,...override});
}
test("actual intake precheck + 50 simultaneous source deliveries: one validated request, moderation, audit; no payment/provision",async()=>{
 const results=await Promise.all(Array.from({length:50},()=>register()));
 assert.equal(results.filter(x=>!x.duplicate).length,1);assert.equal(new Set(results.map(x=>x.request_id)).size,1);
 assert.equal(await count("owner_opening_requests"),1);assert.equal(await count("moderation_cases"),1);assert.equal(await count("audit_events"),1);
 const r=(await q("SELECT * FROM public.owner_opening_requests")).rows[0];
 assert.equal(r.status,"validated");assert.equal(r.source_namespace,"odoo_online");assert.equal(r.source_request_id,"odoo-us-partner-20001");
 assert.equal(Number(r.source_partner_id),20001);assert.equal(r.precheck_result_json.normalized.state_code,"NY");
 assert.equal(r.precheck_result_json.odoo_source_proof.odoo_lead_id,9001);
 assert.equal(r.created_auth_user_id,null);assert.equal(r.created_owner_id,null);assert.equal(r.created_by_admin_id,null);
 assert.equal((await q("SELECT actor FROM public.audit_events")).rows[0].actor,"system:us_odoo_intake");
 assert.equal(await count("auth_users"),0);assert.equal(await count("billing_subscriptions"),0);assert.equal(await count("messages"),0);
});
test("failed real Core precheck rolls back request/moderation/audit",async()=>{
 await q("INSERT INTO public.slug_reservations VALUES(1,'fixture-salon','reserved')");
 try{await assert.rejects(()=>register(),/INTAKE_PRECHECK_FAILED/);}
 finally{await q("DELETE FROM public.slug_reservations WHERE id=1");}
 for(const table of ["owner_opening_requests","moderation_cases","audit_events"])assert.equal(await count(table),0);
});
test("unverified source leaves real Core unchanged",async()=>{
 const f=sourceFixture();f.lead.stage_id=[81,"hold"];
 await assert.rejects(()=>register(f),/SCOPE_REQUIRED/);
 for(const table of ["owner_opening_requests","moderation_cases","audit_events"])assert.equal(await count(table),0);
});
test("legacy same contact remains distinct and is never silently backfilled",async()=>{
 await q("INSERT INTO public.owner_opening_requests(owner_type,status,name,email) VALUES('salon','validated','legacy','fixture@example.invalid')");
 const r=await register();assert.equal(r.duplicate,false);
 const rows=(await q("SELECT source_namespace FROM public.owner_opening_requests ORDER BY id")).rows;
 assert.deepEqual(rows.map(x=>x.source_namespace),[null,"odoo_online"]);
});
