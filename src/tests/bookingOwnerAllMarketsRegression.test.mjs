// Stage 3/4: all-market owner authorization for personal booking reads and
// state-changing lifecycle. SQL is an in-memory stub, NEVER Production.
import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import {
  checkUsLifecycleSession,checkBookingOwnerSession,
  authorizePublicSalonBookingReader,authorizeBookingLifecycleActor,
  authorizeUsLifecycleActor,
} from "../routes/publicLifecycle.js";

const auth=(role="salon_admin",source="session")=>({
  source,role,user_id:81,
  session_id:source==="session"?"synthetic-offline-test-id":null,
});
function dbRows(rows){
  const calls=[];
  return {calls,async query(sql,params){
    if(/\b(?:UPDATE|INSERT|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i.test(sql))
      throw new Error("NO_TEST_DATA_WRITES");
    calls.push({sql,params});
    return {rows};
  }};
}
const owner=dbRows([{one:1}]);

test("anonymous, legacy JWT, missing session and privileged system fail closed",()=>{
  for(const identity of [
    null,{},auth("salon_admin","jwt_legacy"),
    {...auth(),session_id:null},
  ]){
    const result=checkBookingOwnerSession(identity);
    assert.equal(result.ok,false);
    assert.equal(result.status,401);
    assert.equal(result.error,"BOOKING_OWNER_SESSION_REQUIRED");
  }
  for(const role of ["admin","system","owner","client"]){
    const result=checkBookingOwnerSession(auth(role));
    assert.equal(result.ok,false);
    assert.equal(result.status,403);
  }
  assert.equal(checkUsLifecycleSession(auth("master")).ok,true);
});

test("only authenticated salon_admin may READ whole salon booking list",async()=>{
  for(const identity of [null,auth("master"),auth("salon_admin","jwt_legacy")]){
    const db=dbRows([{one:1}]);
    const result=await authorizePublicSalonBookingReader(db,identity,32);
    assert.equal(result.ok,false);
    assert.equal(db.calls.length,0);
  }
  const allowed=await authorizePublicSalonBookingReader(owner,auth(),32);
  assert.equal(allowed.ok,true);
  assert.deepEqual(owner.calls.at(-1).params,[81,32]);
});

test("disabled, foreign and revoked-owner salon bindings are denied",async()=>{
  const db=dbRows([]);
  assert.deepEqual(await authorizePublicSalonBookingReader(db,auth(),32),{
    ok:false,status:403,error:"BOOKING_OWNER_FORBIDDEN",
  });
  const query=db.calls.at(-1).sql;
  assert.match(query,/u\.enabled=true/);
  assert.match(query,/u\.role='salon_admin'/);
  assert.match(query,/os\.status='active'/);
  assert.match(query,/os\.salon_id=s\.id/);
});

test("unlinked legacy salon_admin fallback remains only without ANY owner_salon membership",async()=>{
  const db=dbRows([{one:1}]);
  assert.equal((await authorizePublicSalonBookingReader(db,auth(),1)).ok,true);
  const sql=db.calls.at(-1).sql;
  assert.match(sql,/NOT EXISTS\(/);
  assert.match(sql,/u\.salon_id=s\.id::text OR u\.salon_slug=s\.slug/);
  assert.match(sql,/os\.owner_id=u\.id::text/);
  assert.match(sql,/os\.status='active'/);
});

test("salon_admin + master can change ONLY their own salon/master booking",async()=>{
  for(const role of ["salon_admin","master"]){
    const db=dbRows([{one:1}]);
    assert.equal((await authorizeBookingLifecycleActor(db,auth(role),32,17)).ok,true);
    assert.equal(db.calls.length,1);
    if(role==="master"){
      assert.deepEqual(db.calls[0].params,[81,32,17]);
      assert.match(db.calls[0].sql,/m\.user_id=u\.id/);
      assert.match(db.calls[0].sql,/m\.active=true/);
      assert.match(db.calls[0].sql,/ms\.status='active'/);
      assert.match(db.calls[0].sql,/ms\.salon_id=\$2/);
    }else{
      assert.deepEqual(db.calls[0].params,[81,32]);
    }
  }
});

test("master from another salon cannot act on target booking",async()=>{
  const db=dbRows([]);
  assert.deepEqual(await authorizeBookingLifecycleActor(db,auth("master"),32,17),{
    ok:false,status:403,error:"BOOKING_OWNER_FORBIDDEN",
  });
  assert.equal(db.calls.length,1);
});
test("US authorization is retained without changed error codes",async()=>{
  assert.deepEqual(checkUsLifecycleSession(null),{
    ok:false,status:401,error:"US_LIFECYCLE_SESSION_REQUIRED",
  });
  const db=dbRows([]);
  assert.deepEqual(await authorizeUsLifecycleActor(db,auth("master"),32,17),{
    ok:false,status:403,error:"US_LIFECYCLE_OWNER_FORBIDDEN",
  });
});

test("invalid scope denied with no database query",async()=>{
  for(const invalid of [0,-2,"x",null]){
    const db=dbRows([{one:1}]);
    assert.equal((await authorizePublicSalonBookingReader(db,auth(),invalid)).ok,false);
    assert.equal(db.calls.length,0);
  }
});

test("both public booking endpoints require authenticated owner session",()=>{
  const route=fs.readFileSync(new URL("../routes/public.js",import.meta.url),"utf8").replace(/\r\n/g,"\n");
  const getter=route.indexOf('"/salons/:slug/bookings",\n    resolveTenant');
  const lifecycle=route.indexOf('"/salons/:slug/bookings/:id/lifecycle"');
  assert.ok(getter>=0 && lifecycle>=0);
  const getScope=route.slice(getter,getter+1150);
  const postScope=route.slice(lifecycle,lifecycle+700);
  assert.match(getScope,/buildPublicAccessGuard\("booking_read"\),\s*resolveAuth/);
  assert.match(getScope,/authorizePublicSalonBookingReader\(pool,req\.auth,salon_id\)/);
  assert.match(getScope,/Cache-Control","private, no-store"/);
  assert.match(postScope,/buildPublicAccessGuard\("booking_create"\),[\s\S]*?resolveAuth,\s*publicLifecycle/);
  assert.doesNotMatch(postScope,/market_code === "US"\s*\?/);
});

test("US/KG/KZ all verify actor BEFORE booking/payment mutation",()=>{
  const life=fs.readFileSync(new URL("../routes/publicLifecycle.js",import.meta.url),"utf8");
  const route=life.slice(life.indexOf("export async function publicLifecycle("));
  const tx=life.slice(life.indexOf("export async function executeUsLifecycleTransaction("),
    life.indexOf("async function notifyUsLifecycleAfterCommit"));
  const guard=life.slice(life.indexOf("async function authorizeLifecycleWrite("),
    life.indexOf("export async function executeUsLifecycleTransaction("));
  assert.ok(route.indexOf("checkBookingOwnerSession(req.auth)")<route.indexOf("executeUsLifecycleTransaction(pool"));
  assert.ok(tx.indexOf("authorizeLifecycleWrite(tx")<tx.indexOf("UPDATE public.bookings"));
  assert.ok(tx.indexOf("const commitAuthority=await authorizeLifecycleWrite(tx")<tx.lastIndexOf('await tx.query("COMMIT")'));
  assert.match(guard,/authorizeBookingLifecycleActor\(db,auth,booking\.salon_id,booking\.master_id,true\)/);
  assert.match(tx,/WHERE b\.id=\$1 AND b\.salon_id=\$2/);
  assert.doesNotMatch(guard,/OR ms\.id IS NOT NULL/);
  assert.match(route,/Number\.isSafeInteger\(bookingId\)/);
});
