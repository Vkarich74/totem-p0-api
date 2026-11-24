import test from "node:test";
import assert from "node:assert/strict";
import {createUsOdooReadOnlyClient,createUsOdooApprovedSourceClient} from "../src/services/billing/usOdooReadOnlyClient.js";
import {readUsApprovedOdooSalonSource,readUsApprovedOdooSource,registerApprovedUsOdooSalon,isUsOdooIntakeHint} from "../src/services/provision/usApprovedOdooSalonIntake.js";
import {sourceFixture,masterSourceFixture,sourceEnv,sourceHint,sourceHeaders,sourceTransport} from "./fixtures/g5-approved-source-fixture.mjs";
const options={baseUrl:"https://totem-platform.odoo.com",database:"totem-platform",username:"fixture",apiKey:"fixture"};
const client=t=>createUsOdooApprovedSourceClient({...options,fetchImpl:t.fetchImpl});
const read=t=>readUsApprovedOdooSalonSource(9001,{client:client(t)});
test("exact live schema contract: stage82/profile/CRM/partner/website/state; verified payload only",async()=>{
 const t=sourceTransport(),r=await read(t);
 assert.equal(r.proof.source_request_id,"odoo-us-partner-20001");
 assert.equal(r.proof.partner_id,20001);assert.equal(r.intake.owner_type,"salon");
 assert.equal(r.intake.state_code,"NY");assert.equal(r.intake.postal_code,"10001");
 assert.equal(r.provenance.odoo_lead_id,9001);assert.equal(r.intake.name,"Fixture Salon");
 assert.equal(t.metrics.auth,1);assert.equal(t.metrics.reads,5);
 assert.equal(Object.hasOwn(client(t),"searchRead"),false);
 const billing=createUsOdooReadOnlyClient({...options,fetchImpl:t.fetchImpl});
 await assert.rejects(()=>billing.searchRead("crm.lead",[],["id"]),/MODEL_NOT_ALLOWED/);
});
for(const [label,change,code] of [
 ["stage81 HOLD",f=>{f.lead.stage_id=[81,"hold"]},"SCOPE_REQUIRED"],
 ["foreign company",f=>{f.lead.company_id=[1,"foreign"]},"NOT_FOUND"],
 ["foreign site",f=>{f.lead.x_totem_us_website_id=4},"SCOPE_REQUIRED"],
 ["bad marker",f=>{f.lead.x_totem_us_source_marker="forged"},"SCOPE_REQUIRED"],
 ["bad source key",f=>{f.lead.x_totem_us_source_key="other"},"SCOPE_REQUIRED"],
 ["wrong partner",f=>{f.lead.partner_id=[20002,"foreign"]},"SCOPE_REQUIRED"],
 ["archived lead",f=>{f.lead.active=false},"SCOPE_REQUIRED"],
 ["rejected profile",f=>{f.partner.x_totem_us_profile_status="rejected"},"PROFILE_REQUIRED"],
 ["changed profile",f=>{f.partner.write_date="2026-11-23 10:02:00"},"PROFILE_REQUIRED"],
 ["changed email",f=>{f.partner.email="different@example.invalid"},"SNAPSHOT_MISMATCH"],
 ["changed ZIP",f=>{f.partner.x_totem_us_business_zip="10002"},"SNAPSHOT_MISMATCH"],
 ["non-US state",f=>{f.state.country_id=[1,"foreign"]},"STATE_REQUIRED"],
]){
 test("reject "+label,async()=>{const f=sourceFixture();change(f);await assert.rejects(()=>read(sourceTransport(f)),new RegExp(code));});
}
test("duplicate CRM source including archived record is not an approved identity",async()=>{
 const t=sourceTransport(sourceFixture(),{change:({model,domain,rows})=>
 model==="crm.lead"&&domain.some(d=>d[0]==="x_totem_us_source_partner_id")?[rows[0],{...rows[0],id:9002,active:false}]:rows});
 await assert.rejects(()=>read(t),/SOURCE_AMBIGUOUS/);
});
test("readback mutation before completion is rejected",async()=>{
 const t=sourceTransport(sourceFixture(),{change:({model,rows,metrics})=>model==="res.partner"&&metrics.reads===5?[{...rows[0],active:false}]:rows});
 await assert.rejects(()=>read(t),/SOURCE_CHANGED/);
});
test("US registration disabled or invalid header/hint/config: no provider or SQL",async()=>{
 const no=()=>{throw Error("UNEXPECTED_SIDE_EFFECT")};
 const base={pool:{connect:no},body:sourceHint,headers:sourceHeaders,query:{},createClient:no,createExistingOpeningRequest:no};
 await assert.rejects(()=>registerApprovedUsOdooSalon({...base,env:{}}),/INTAKE_HOLD/);
 await assert.rejects(()=>registerApprovedUsOdooSalon({...base,env:sourceEnv(),headers:{}}),/HEADER_REQUIRED/);
 await assert.rejects(()=>registerApprovedUsOdooSalon({...base,env:sourceEnv(),query:{token:"fixture-bridge-not-real"}}),/HEADER_REQUIRED/);
 await assert.rejects(()=>registerApprovedUsOdooSalon({...base,env:sourceEnv(),body:{...sourceHint,owner_type:"salon",payment_state:"paid"}}),/HINT_INVALID/);
 await assert.rejects(()=>registerApprovedUsOdooSalon({...base,env:{...sourceEnv(),TOTEM_US_ODOO_URL:"https://foreign.invalid"}}),/CONFIG_REQUIRED/);
 assert.equal(isUsOdooIntakeHint({market_code:"KG",team_id:7}),false);
 assert.equal(isUsOdooIntakeHint({team_id:[8,"US"]}),true);
 assert.equal(isUsOdooIntakeHint({x_totem_us_source_key:"x"}),true);
});
test("provider errors sanitized, no invented proof",async()=>{
 const t=sourceTransport(sourceFixture(),{change:()=>{throw Error("PRIVATE_PROVIDER_ERROR");}});
 await assert.rejects(()=>read(t),e=>e.message==="US_ODOO_APPROVED_SOURCE_READBACK_UNAVAILABLE"&&!String(e).includes("PRIVATE"));
});

const readRoles=f=>readUsApprovedOdooSource(9001,{client:client(sourceTransport(f))});
test("own_salon has exactly two ordered role requests from one approved source, not two payments",async()=>{
 const r=await readRoles(masterSourceFixture());
 assert.deepEqual(r.map(x=>x.proof.owner_type),["salon","master"]);
 assert.equal(new Set(r.map(x=>x.proof.source_request_id)).size,1);
 assert.equal(new Set(r.map(x=>x.provenance.odoo_lead_id)).size,1);
 assert.equal(r[1].intake.salon_slug,r[0].intake.slug_requested);
 assert.equal(r[0].intake.email,r[1].intake.email);
 assert.equal(r[1].provenance.entry_mode,"own_salon");
 assert.equal(r[1].provenance.role_set,"salon,master");
 assert.equal(r[1].provenance.target_salon_partner_id,null);
});
test("existing_salon has only master request; target association is not owner consent",async()=>{
 const r=await readRoles(masterSourceFixture("existing_salon"));
 assert.equal(r.length,1);assert.equal(r[0].proof.owner_type,"master");
 assert.equal(r[0].proof.partner_id,20001);assert.equal(r[0].provenance.target_salon_partner_id,20002);
 assert.equal(r[0].provenance.consent_status,"REQUIRED");
});
for(const [name,mode,mutate,expected] of [
 ["unrecognized entry mode","own_salon",f=>f.partner.x_totem_us_master_entry_mode="other","ENTRY_MODE_INVALID"],
 ["own salon foreign relation","own_salon",f=>f.partner.x_totem_us_master_salon_id=[20002,"foreign"],"SNAPSHOT_MISMATCH"],
 ["same public slug for two roles","own_salon",f=>{f.partner.x_totem_us_master_slug="fixture-salon";f.lead.x_totem_us_slug_requested="fixture-salon"},"SNAPSHOT_MISMATCH"],
 ["target not approved","existing_salon",f=>f.target.x_totem_us_profile_status="submitted","TARGET_SALON_REQUIRED"],
 ["foreign target","existing_salon",f=>f.target.company_id=[1,"foreign"],"TARGET_SALON_REQUIRED"],
 ["self target","existing_salon",f=>f.partner.x_totem_us_master_salon_id=[20001,"self"],"TARGET_SALON_REQUIRED"],
 ["target slug substituted","existing_salon",f=>f.lead.x_totem_us_salon_slug="wrong-salon","SNAPSHOT_MISMATCH"],
]){
 test("reject "+name,async()=>{const f=masterSourceFixture(mode);mutate(f);await assert.rejects(()=>readRoles(f),new RegExp(expected));});
}
