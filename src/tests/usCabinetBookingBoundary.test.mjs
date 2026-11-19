// Stage 2/4 — existing US master booking and lifecycle contract.
// All data stores are in-memory stubs. No external network, PostgreSQL,
// salon/master/client/booking/payment creation or calls to Production.
import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import {checkMasterQuickBookingMarket} from "../routes/internal/masters.js";
import {
  checkUsLifecycleSession,authorizeUsLifecycleActor,
} from "../routes/publicLifecycle.js";

function marketDb(row) {
  const calls=[];
  return {calls,async query(sql,params){
    calls.push({sql,params});
    if(/INSERT|UPDATE|DELETE/i.test(sql))throw Error("DATA_MUTATION_FORBIDDEN");
    return {rows:row?[row]:[]};
  }};
}
function identity(role,source="session"){
  return {user_id:81,role,source,session_id:source==="session"?"offline-session":null};
}

for(const market of ["KG","KZ"]){
  test(market+" legacy quick booking remains allowed",async()=>{
    const db=marketDb({market_code:market,active:true});
    assert.deepEqual(await checkMasterQuickBookingMarket(db,32),{ok:true,market_code:market});
    assert.equal(db.calls.length,1);
    assert.deepEqual(db.calls[0].params,[32]);
    assert.match(db.calls[0].sql,/tenant_market_settings/);
    assert.match(db.calls[0].sql,/public.markets/);
  });
}
test("US quick booking fails before any client/slot/price writes",async()=>{
  const db=marketDb({market_code:"US",active:true});
  assert.deepEqual(await checkMasterQuickBookingMarket(db,101),{
    ok:false,status:409,error:"US_QUICK_BOOKING_LOCATION_PRICE_REQUIRED",
  });
  assert.equal(db.calls.length,1);
});
test("missing/inactive/unknown market fails closed",async()=>{
  for(const row of [null,{market_code:"US",active:false},{market_code:"MX",active:true}]){
    const db=marketDb(row);
    const r=await checkMasterQuickBookingMarket(db,101);
    assert.equal(r.ok,false);
    assert.equal(r.status,409);
  }
});
test("invalid salon id triggers no SQL",async()=>{
  const db=marketDb(null);
  const r=await checkMasterQuickBookingMarket(db,-1);
  assert.equal(r.ok,false);
  assert.equal(db.calls.length,0);
});

test("US lifecycle requires an existing validated session",()=>{
  for(const auth of [undefined,null,{},identity("master","jwt_legacy"),
    {user_id:1,role:"master",source:"session"}]){
    const r=checkUsLifecycleSession(auth);
    assert.equal(r.ok,false);
    assert.equal(r.status,401);
  }
});
test("unrelated roles cannot mutate US booking lifecycle",()=>{
  for(const role of ["system","owner","admin","client"]){
    const r=checkUsLifecycleSession(identity(role));
    assert.equal(r.ok,false);
    assert.equal(r.status,403);
  }
});
test("US salon-admin ownership checked against active owner_salon relation",async()=>{
  const db=marketDb({allow:true});
  const allowed=await authorizeUsLifecycleActor(db,identity("salon_admin"),32,17);
  assert.equal(allowed.ok,true);
  assert.match(db.calls[0].sql,/public.owner_salon/);
  assert.match(db.calls[0].sql,/os.status='active'/);
  assert.deepEqual(db.calls[0].params,[81,32]);
});
test("US master ownership checked against active master_salon and own user",async()=>{
  const db=marketDb({allow:true});
  const allowed=await authorizeUsLifecycleActor(db,identity("master"),32,17);
  assert.equal(allowed.ok,true);
  assert.match(db.calls[0].sql,/m.user_id=u.id/);
  assert.match(db.calls[0].sql,/ms.status='active'/);
  assert.deepEqual(db.calls[0].params,[81,32,17]);
});
test("foreign/master-inactive owner denied without updates",async()=>{
  for(const role of ["salon_admin","master"]){
    const db=marketDb(null);
    const result=await authorizeUsLifecycleActor(db,identity(role),32,17);
    assert.deepEqual(result,{
      ok:false,status:403,error:"US_LIFECYCLE_OWNER_FORBIDDEN",
    });
    assert.equal(db.calls.length,1);
  }
});
test("malformed scope denied before DB access",async()=>{
  const db=marketDb(null);
  const r=await authorizeUsLifecycleActor(db,identity("master"),"x",17);
  assert.equal(r.status,403);
  assert.equal(db.calls.length,0);
});
test("backend gates US manual create before legacy side effects",()=>{
  const route=fs.readFileSync(new URL("../routes/internal/masters.js",import.meta.url),"utf8");
  const start=route.indexOf('r.post("/masters/:slug/bookings"');
  const end=route.indexOf('/*\nMASTER WALLET BALANCE',start);
  assert.ok(start>=0&&end>start);
  const body=route.slice(start,end);
  const check=body.indexOf("await checkMasterQuickBookingMarket(db,salonId)");
  assert.ok(check>=0);
  assert.ok(check<body.indexOf("normalizePhoneForMarket"));
  assert.ok(check<body.indexOf("INSERT INTO clients"));
  assert.ok(check<body.indexOf("INSERT INTO bookings"));
  assert.ok(body.includes('await db.query("ROLLBACK");'));
});
test("owner lifecycle auth middleware now covers US, KG and KZ",()=>{
  const route=fs.readFileSync(new URL("../routes/public.js",import.meta.url),"utf8");
  assert.match(route,/resolveAuth,\s*publicLifecycle/);
  assert.match(route,/buildPublicAccessGuard\("booking_read"\),\s*resolveAuth/);
  const life=fs.readFileSync(new URL("../routes/publicLifecycle.js",import.meta.url),"utf8");
  const endpoint=life.slice(life.indexOf("export async function publicLifecycle("));
  assert.ok(endpoint.indexOf("checkUsLifecycleSession(req.auth)")<
    endpoint.indexOf("const { rows } = await pool.query("));
  assert.ok(endpoint.indexOf("authorizeUsLifecycleActor(")<
    endpoint.indexOf("const currentStatus ="));
  assert.ok(endpoint.indexOf("authorizeUsLifecycleActor(")<
    endpoint.indexOf("UPDATE bookings"));
  assert.match(endpoint, /WHERE b\.id = \$1\s+AND b\.salon_id = \$2/);
  assert.doesNotMatch(endpoint, /OR ms\.id IS NOT NULL/);
});
