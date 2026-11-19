// US-SERVICES-01: deterministic in-memory transaction/security tests.
// No real DB, network, bookings, user, payment, Stripe or Odoo writes.
import test from "node:test";
import assert from "node:assert/strict";
import {readUsServiceLinkOptions,saveUsServiceLink,
  rejectLegacyUsServiceMutation,rejectLegacyUsMasterServiceCreation} from "../services/usServiceLink.service.js";

const SESSION="11111111-2222-4333-8444-555555555555";
const salonAuth={source:"session",role:"salon_admin",user_id:81,session_id:SESSION};
const masterAuth={...salonAuth,role:"master"};
const salonReq={ownerType:"salon",ownerSlug:"us-salon",auth:salonAuth,
  identity:{user_id:81}};
const masterReq={ownerType:"master",ownerSlug:"us-master",auth:masterAuth,
  identity:{user_id:81}};
const create={operation:"create",master_id:46,name:"Haircut",
  duration_min:45,amount_minor:15025};
const attach={operation:"attach",master_id:46,service_pk:6,
  duration_min:60,amount_minor:20000};

class MemoryPool {
  constructor(settings={}) {
    this.settings=settings;
    this.calls=[];this.writes=0;this.commits=0;this.rollbacks=0;
    this.link=null;this.price=null;this.created=null;
  }
  async connect() {
    const state=this;
    let snapshot=null;
    return {
      async query(query,values=[]) {
        const sql=String(query).replace(/\s+/g," ").trim();
        state.calls.push({sql,values});
        if(sql==="BEGIN"||sql==="BEGIN READ ONLY"){
          snapshot={link:state.link,price:state.price,created:state.created,writes:state.writes};
          return {rows:[]};
        }
        if(sql==="COMMIT"){state.commits++;snapshot=null;return {rows:[]};}
        if(sql==="ROLLBACK"){
          state.rollbacks++;
          if(snapshot)Object.assign(state,snapshot);
          snapshot=null;return {rows:[]};
        }
        if(sql.startsWith("SET LOCAL"))return {rows:[]};
        if(sql.includes("FROM public.auth_sessions s")) {
          return {rows:state.settings.session===false?[]:[{one:1}]};
        }
        if(sql.includes("FROM public.salons s JOIN public.owner_salon os")) {
          return {rows:state.settings.owner===false?[]:[{owner_id:32,market_id:4}]};
        }
        if(sql.includes("FROM public.masters master JOIN public.master_salon ms") &&
           sql.includes("master.slug=$1")) {
          return {rows:state.settings.owner===false?[]:[{owner_id:46,market_id:4}]};
        }
        if(sql.includes("FROM public.billing_subscriptions")) {
          return {rows:state.settings.billingBlocked?
            [{subscription_status:"blocked",blocked_at:new Date().toISOString()}]:[]};
        }
        if(sql.includes("SELECT s.id AS salon_id,s.slug AS salon_slug")) {
          if(state.settings.target===false||values[4]!==4||
             (values[0]==="salon"&&(values[1]!==32||values[2]!==46))||
             (values[0]==="master"&&(values[2]!==46||values[3]!=="us-salon"))) {
            return {rows:[]};
          }
          return {rows:[{salon_id:32,salon_slug:"us-salon",master_id:46,
            master_slug:"us-master",master_name:"Example"}]};
        }
        if(sql.includes("SELECT m.id,m.slug,m.name FROM public.master_salon ms")) {
          return {rows:[{id:46,name:"Example master",slug:"us-master"}]};
        }
        if(sql.includes("SELECT s.id,s.slug,s.name FROM public.master_salon ms")) {
          return {rows:[{id:32,name:"Example US salon",slug:"us-salon"}]};
        }
        if(sql.includes("SELECT DISTINCT sms.master_id,sms.service_pk")) {
          assert.match(sql,/source_ms|JOIN public.master_salon ms/);
          assert.match(sql,/market\.code='US'/);
          assert.match(sql,/sms\.currency_code='USD'/);
          assert.ok(values.includes(4),"US market id must be scoped");
          if(sql.includes("source_ms")) {
            assert.match(sql,/sms\.salon_id=\$1/,"salon catalog must not leak other salons");
            assert.equal(values[0],32);
          }
          return {rows:[{master_id:46,service_pk:6,name:"Hair styling",
            duration_min:60}]};
        }
        if(sql.includes("FROM public.services svc WHERE svc.id=$1")) {
          assert.match(sql,/market\.code='US'/);
          assert.match(sql,/old\.currency_code='USD'/);
          assert.deepEqual(values,[6,46,4,"salon",32]);
          assert.match(sql,/\(\(\$4='salon' AND old\.salon_id=\$5\)/);
          return {rows:state.settings.source===false?[]:[{id:6}]};
        }
        if(sql.includes("SELECT sms.id FROM public.salon_master_services sms")&&
           sql.includes("lower(btrim(svc.name))")) {
          return {rows:state.settings.duplicate?[{id:10}]:[]};
        }
        if(sql.includes("SELECT pg_advisory_xact_lock"))return {rows:[{}]};
        if(sql.includes("MAX(service_id::int)"))return {rows:[{next_service_id:111}]};
        if(sql.startsWith("INSERT INTO public.services(")) {
          state.created={id:8,name:values[1]};state.writes++;
          return {rows:[{id:8}]};
        }
        if(sql.startsWith("SELECT id FROM public.salon_master_services")) {
          return {rows:state.settings.existing?[{id:77}]:[]};
        }
        if(sql.startsWith("INSERT INTO public.salon_master_services")) {
          assert.match(sql,/currency_code/);
          assert.match(sql,/VALUES \(\$1,\$2,\$3,0,\$4,true,'USD'\)/);
          state.link={id:77,salon_id:values[0],master_id:values[1],
            service_pk:values[2],duration_min:values[3],
            name:state.created?.name||"Hair styling"};
          state.writes++;return {rows:[{id:77}]};
        }
        if(sql.startsWith("INSERT INTO public.us_service_price_amounts")) {
          if(state.settings.priceFail)throw Object.assign(new Error("constraint"),{code:"23514"});
          state.price={amount_minor:String(values[2]),price_version:1};state.writes++;
          return {rows:[state.price]};
        }
        if(sql.includes("SELECT sms.id,sms.salon_id,sms.master_id,sms.service_pk")) {
          if(state.settings.corruptReadback)return {rows:[]};
          return {rows:[{...state.link,...state.price,active:true,currency_code:"USD"}]};
        }
        if(sql.includes("SELECT EXISTS (SELECT 1 FROM public.master_salon ms")) {
          assert.equal(values[0],46);
          return {rows:[{has_us_scope:state.settings.masterUs===true}]};
        }
        if(sql.includes("FROM public.tenant_market_settings tm JOIN public.markets m")) {
          return {rows:state.settings.legacyMarket==="missing"?[]:
            [{code:state.settings.legacyMarket||"KG",default_currency:
              state.settings.legacyMarket==="US"?"USD":"KGS"}]};
        }
        throw Error("UNEXPECTED_SQL: "+sql.slice(0,220));
      },
      release(){},
    };
  }
}

test("no actor or invalid body never opens any transaction",async()=>{
  const db=new MemoryPool();
  const denied=await saveUsServiceLink(db,{...salonReq,auth:{role:"salon_admin"},body:create});
  assert.equal(denied.status,403);
  const invalid=await saveUsServiceLink(db,{...salonReq,
    body:{...create,amount_minor:15.5}});
  assert.equal(invalid.status,400);
  const missingSalon=await saveUsServiceLink(db,{...masterReq,
    body:{operation:"create",name:"Cut",duration_min:45,amount_minor:1000}});
  assert.equal(missingSalon.status,400);
  assert.equal(db.calls.length,0);
});

test("new salon service is atomic with explicit master and USD cents readback",async()=>{
  const db=new MemoryPool();
  const response=await saveUsServiceLink(db,{...salonReq,body:create});
  assert.equal(response.status,200);
  assert.equal(response.body.service.salon_id,32);
  assert.equal(response.body.service.master_id,46);
  assert.equal(response.body.service.amount_minor,"15025");
  assert.equal(response.body.service.price_version,1);
  assert.equal(response.body.service.currency_code,"USD");
  assert.equal(response.body.readback_verified,true);
  assert.equal(db.commits,1);
  assert.equal(db.writes,3);
  assert.equal(db.calls.filter(x=>x.sql.includes("pg_advisory_xact_lock")).length,2);
  assert.ok(db.calls.some(x=>x.sql.includes("FOR SHARE OF ms,s,master,tm,market")));
});

test("US master selects exact US salon; never inferred latest salon",async()=>{
  const db=new MemoryPool();
  const body={operation:"create",salon_slug:"us-salon",name:"Shampoo",
    duration_min:30,amount_minor:1250};
  const response=await saveUsServiceLink(db,{...masterReq,body});
  assert.equal(response.body.service.salon_slug,"us-salon");
  assert.equal(response.body.service.master_id,46);
  assert.equal(db.commits,1);
  assert.equal(db.calls.some(x=>x.sql.includes("ORDER BY activated_at DESC")),false);
});

test("attach existing master catalog service but never reuse old prices",async()=>{
  const db=new MemoryPool();
  const response=await saveUsServiceLink(db,{...salonReq,body:attach});
  assert.equal(response.status,200);
  assert.equal(response.body.service.service_pk,6);
  assert.equal(response.body.service.amount_minor,"20000");
  assert.equal(db.calls.filter(x=>x.sql.startsWith("INSERT INTO public.services")).length,0);
  assert.equal(db.writes,2);
});

test("foreign salon, wrong session and blocked billing deny all writes",async()=>{
  for(const settings of [{target:false},{owner:false},{session:false},{billingBlocked:true}]){
    const db=new MemoryPool(settings);
    const response=await saveUsServiceLink(db,{...salonReq,body:create});
    assert.notEqual(response.status,200);
    assert.equal(db.writes,0);
    assert.equal(db.commits,0);
    assert.equal(db.rollbacks,1);
  }
});

test("duplicate service or reused target link cannot create a second link",async()=>{
  for(const settings of [{duplicate:true},{existing:true}]){
    const db=new MemoryPool(settings);
    const response=await saveUsServiceLink(db,{...salonReq,body:create});
    assert.equal(response.status,409);
    assert.equal(db.writes,0); // first INSERT rolled back when target link exists
    assert.equal(db.commits,0);
    assert.equal(db.rollbacks,1);
  }
});

test("USD price integrity failure and readback mismatch roll back entire create",async()=>{
  for(const settings of [{priceFail:true},{corruptReadback:true}]){
    const db=new MemoryPool(settings);
    await assert.rejects(()=>saveUsServiceLink(db,{...salonReq,body:create}));
    assert.equal(db.writes,0);
    assert.equal(db.link,null);
    assert.equal(db.created,null);
    assert.equal(db.commits,0);
    assert.equal(db.rollbacks,1);
  }
});

test("options are read-only and scoped to verified owner",async()=>{
  for(const request of [salonReq,masterReq]){
    const db=new MemoryPool();
    const data=await readUsServiceLinkOptions(db,request);
    assert.equal(data.status,200);
    assert.equal(data.body.market_code,"US");
    assert.equal(data.body.currency_code,"USD");
    assert.equal(data.body.catalog_services[0].service_pk,6);
    assert.equal(db.writes,0);
    assert.equal(db.commits,0);
    assert.equal(db.calls[0].sql,"BEGIN READ ONLY");
  }
});

test("legacy US mutation hard-stops while active KG route remains intact",async()=>{
  const us=new MemoryPool({legacyMarket:"US"});
  assert.equal((await rejectLegacyUsServiceMutation(await us.connect(),32)).status,409);
  const kg=new MemoryPool({legacyMarket:"KG"});
  assert.equal(await rejectLegacyUsServiceMutation(await kg.connect(),32),null);
  const missing=new MemoryPool({legacyMarket:"missing"});
  assert.equal((await rejectLegacyUsServiceMutation(await missing.connect(),32)).status,409);
});

test("master with both US and KG salons cannot enter legacy auto-salon route",async()=>{
  const mixed=new MemoryPool({masterUs:true});
  const masterDb=await mixed.connect();
  const denied=await rejectLegacyUsMasterServiceCreation(masterDb,46);
  assert.deepEqual(denied,{status:409,error:"US_SERVICE_LINK_ENDPOINT_REQUIRED"});
  assert.equal(mixed.writes,0);
  const kg=new MemoryPool({masterUs:false});
  const allowed=await rejectLegacyUsMasterServiceCreation(await kg.connect(),46);
  assert.equal(allowed,null);
  assert.equal(kg.writes,0);
  const bad=new MemoryPool();
  assert.equal((await rejectLegacyUsMasterServiceCreation(await bad.connect(),0)).status,409);
  assert.equal(bad.calls.length,0);
});

test("source list and attach SQL reject KG/other market contamination",async()=>{
  const salonDb=new MemoryPool();
  const options=await readUsServiceLinkOptions(salonDb,salonReq);
  assert.equal(options.status,200);
  assert.ok(salonDb.calls.some(call=>call.sql.includes("market.id=$2") &&
    call.sql.includes("sms.currency_code='USD'")));
  const attachDb=new MemoryPool();
  const bound=await saveUsServiceLink(attachDb,{...salonReq,body:attach});
  assert.equal(bound.status,200);
  assert.ok(attachDb.calls.some(call=>call.sql.includes("old.service_pk=svc.id") &&
    call.sql.includes("market.id=$3") &&
    call.sql.includes("old.currency_code='USD'") &&
    call.values[3]==="salon" && call.values[4]===32));
});
