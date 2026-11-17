// US-PAY-C11 payee authorization: real PostgreSQL17 SQL and HTTP route tests.
// Req.auth is injected in this isolated test harness, NOT in production.
// The service independently checks real auth_sessions/auth_users and
// owner_salon and derives recipient ID from the booking (not supplied JSON).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pg from "pg";
import { buildUsPayC11OwnerRouter } from "../src/routes/internalUsPayC11Owner.js";
import { buildPublicUsPayC11Router } from "../src/routes/publicUsPayC11.js";
import { verifyClientCabinetAccess } from "../src/services/clientCabinetTokenAccess.js";

const cs = process.env.US_PAY_C11_TEST_DATABASE_URL || "";
if (!/^postgres:\/\/[^@]+@127\.0\.0\.1:55432\/us_pay_c11_staging$/.test(cs)) {
  throw new Error("US_C11_OWNER_TEST_REQUIRES_SYNTHETIC_LOCAL_PG");
}
const pool = new pg.Pool({ connectionString: cs, max: 4 });

const session = (userId, sessionSuffix = userId, role = "salon_admin") => ({
  user_id: userId,
  role,
  source: "session",
  session_id: `00000000-0000-4000-8000-${String(sessionSuffix).padStart(12,"0")}`,
});
const testActors = Object.freeze({
  owner: session(900),
  master: session(901,901,"master"),
  otherSalon: session(902),
  unassignedOwner: session(903),
  disabled: session(904),
  expired: session(900,905),
  revoked: session(900,906),
  legacy: { user_id:900, role:"owner", source:"jwt_legacy" },
});
const app = express();
app.use(express.json());
app.use("/internal", (req, _res, next) => {
  // Test-only injection; production path uses /internal resolveAuth.
  const selector = String(req.headers["x-test-actor"] || "");
  req.auth = testActors[selector] || null;
  next();
}, buildUsPayC11OwnerRouter(pool));
app.use("/public",buildPublicUsPayC11Router({pool,verifyClientCabinetAccess}));

let server;
let base;
before(async () => {
  server = await new Promise(ok => {
    const listener=app.listen(0,"127.0.0.1",()=>ok(listener));
  });
  base=`http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if(server) await new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve()));
  await pool.end();
});

async function req(method, bookingId, actor="owner", body) {
  const res=await fetch(`${base}/internal/us-pay-c11/bookings/${bookingId}/collector`,{
    method,headers:{"x-test-actor":actor,"Content-Type":"application/json"},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  });
  return {status:res.status,body:await res.json()};
}

test("owner can select salon then booked master with current revision, never mark verified",async ()=>{
  let r=await req("GET",505);
  assert.equal(r.status,200);
  assert.equal(r.body.collector,null);
  r=await req("PUT",505,"owner",{collector_owner_type:"salon",expected_revision:0});
  assert.equal(r.status,201);
  assert.equal(r.body.collector.collector_owner_id,100);
  assert.equal(r.body.collector.verification_status,"pending");
  assert.equal(r.body.collector.revision,1);
  assert.equal(r.body.payment_ready,false);
  assert.equal(r.body.verification_pending,true);
  assert.equal(typeof r.body.selection_event_id,"string");

  r=await req("PUT",505,"owner",{collector_owner_type:"master",expected_revision:1});
  assert.equal(r.status,200);
  assert.equal(r.body.collector.collector_owner_type,"master");
  assert.equal(r.body.collector.collector_owner_id,200);
  assert.equal(r.body.collector.revision,2);
  assert.equal(r.body.collector.verification_status,"pending");

  const got=await req("GET",505);
  assert.equal(got.body.collector.revision,2);

  // The public booking reader must not prematurely claim a pending receiver.
  const publicRes=await fetch(`${base}/public/clients/55/synthetic-us-55/us-pay-c11/505`);
  assert.equal(publicRes.status,200);
  const publicBody=await publicRes.json();
  assert.equal(publicBody.price.amount_minor,"1205");
  assert.equal(publicBody.collector,null);
  assert.equal(publicBody.payment_ready,false);
  assert.equal(publicBody.payment.service_payment_status,"requires_review");

  const audit=await pool.query(
    `SELECT actor_user_id,previous_owner_type,selected_owner_type,
            selected_owner_id,revision
       FROM public.us_booking_collector_selection_events
      WHERE booking_id=505 ORDER BY revision`
  );
  assert.equal(audit.rows.length,2);
  assert.deepEqual(audit.rows.map(x=>Number(x.revision)),[1,2]);
  assert.deepEqual(audit.rows.map(x=>x.selected_owner_type),["salon","master"]);
  assert.deepEqual(audit.rows.map(x=>Number(x.actor_user_id)),[900,900]);
});

test("optimistic revision prevents stale overwrite and extra audit entries",async ()=>{
  const r=await req("PUT",505,"owner",{collector_owner_type:"salon",expected_revision:1});
  assert.equal(r.status,409);
  assert.equal(r.body.error,"US_COLLECTOR_REVISION_CONFLICT");
  const res=await pool.query("SELECT count(*)::int AS n FROM public.us_booking_collector_selection_events WHERE booking_id=505");
  assert.equal(res.rows[0].n,2);
});

test("no JWT/session or wrong role/owner cannot choose or read receiver",async ()=>{
  for(const actor of ["master","otherSalon","unassignedOwner","disabled","expired","revoked","legacy","none"]){
    const res=await req("PUT",506,actor,{collector_owner_type:"salon",expected_revision:0});
    assert.ok([401,403,404].includes(res.status),`${actor}: ${res.status}`);
    const read=await req("GET",506,actor);
    assert.ok([401,403,404].includes(read.status),`${actor}: GET ${read.status}`);
  }
  const check=await req("GET",506);
  assert.equal(check.body.collector,null);
});

test("cannot nominate arbitrary recipient or tamper with actor/verification",async ()=>{
  const attempts=[
    {collector_owner_type:"salon",expected_revision:0,collector_owner_id:99999},
    {collector_owner_type:"master",expected_revision:0,selected_by_user_id:902},
    {collector_owner_type:"salon",expected_revision:0,verification_status:"verified"},
    {collector_owner_type:"system",expected_revision:0},
    {collector_owner_type:"salon",expected_revision:-1},
    {collector_owner_type:"salon",expected_revision:0.5},
    {collector_owner_type:"salon"},
  ];
  for(const body of attempts){
    const r=await req("PUT",506,"owner",body);
    assert.equal(r.status,400,`${JSON.stringify(body)}:${r.status}`);
  }
  assert.equal((await req("GET",506)).body.collector,null);
});

test("no KY/KZ, missing price, completed, inactive master, verified override",async ()=>{
  const choices=[
    [502,{collector_owner_type:"salon",expected_revision:0},404],
    [503,{collector_owner_type:"salon",expected_revision:0},404],
    [507,{collector_owner_type:"salon",expected_revision:0},409],
    [508,{collector_owner_type:"salon",expected_revision:0},409],
    [509,{collector_owner_type:"master",expected_revision:0},409],
    [500,{collector_owner_type:"salon",expected_revision:1},409],
  ];
  for(const [id,body,expected] of choices){
    const r=await req("PUT",id,"owner",body);
    assert.equal(r.status,expected,`${id}: ${r.status}`);
  }
});

test("immutable recipient audit cannot be edited or deleted", async ()=>{
  for(const sql of [
    "UPDATE public.us_booking_collector_selection_events SET selected_owner_id=9999 WHERE booking_id=505",
    "DELETE FROM public.us_booking_collector_selection_events WHERE booking_id=505",
  ]){
    await assert.rejects(pool.query(sql),error=>error.code==="23514");
  }
});

test("second independent US booking accepts master choice and maintains pending",async ()=>{
  const r=await req("PUT",506,"owner",{collector_owner_type:"master",expected_revision:0});
  assert.equal(r.status,201);
  assert.equal(r.body.collector.collector_owner_id,200);
  assert.equal(r.body.collector.verification_status,"pending");
  assert.equal(r.body.payment_ready,false);
});
