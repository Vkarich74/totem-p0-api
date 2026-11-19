// Stage 3/4 actual existing Express salon-bookings handler with in-memory
// query adapter. No users, customer data, PostgreSQL, payment or writes.
import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import buildSalonsRouter from "../routes/internal/salons.js";

function makePool(){
  const calls=[];
  return {calls,async query(sql,params){
    if(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i.test(sql))
      throw Error("DB_WRITE_FORBIDDEN");
    calls.push({sql,params});
    if(/SELECT id FROM salons WHERE slug=\$1/i.test(sql))
      return {rows:[{id:params[0]==="master-prime"?32:33}]};
    if(/FROM bookings b/i.test(sql))return {rows:[]};
    throw Error("UNEXPECTED_SQL");
  }};
}
function handler(pool){
  const router=buildSalonsRouter(pool,(_req,_res,next)=>next());
  const route=router.stack.filter(layer=>
    layer.route?.path==="/salons/:slug/bookings" &&
    layer.route?.methods?.get
  );
  assert.equal(route.length,1);
  return route[0].route.stack.at(-1).handle;
}
async function request(role,identity,slug="master-prime"){
  const pool=makePool(),perform=handler(pool);
  const req={params:{slug},auth:role?{role,source:"session",user_id:12}:null,identity};
  const res={statusCode:200,body:null,status(n){this.statusCode=n;return this;},
    json(data){this.body=data;return this;}};
  await perform(req,res);
  return {status:res.statusCode,body:res.body,calls:pool.calls};
}
const identity={salons:[32],ownership:[{owner_type:"salon",owner_id:32,relation:"master_salon"}]};

test("master session cannot access ANY salon booking list via derived master_salon",async()=>{
  const x=await request("master",identity);
  assert.equal(x.status,403);
  assert.equal(x.body?.error,"FORBIDDEN");
  assert.equal(x.calls.length,1);
  assert.doesNotMatch(x.calls[0].sql,/FROM bookings b/);
});
test("salon_admin with own salon identity retains existing bookings response",async()=>{
  const x=await request("salon_admin",identity);
  assert.equal(x.status,200);
  assert.equal(x.body?.ok,true);
  assert.deepEqual(x.body?.bookings,[]);
  assert.equal(x.calls.length,2);
});
test("owner legacy role and internal system are not accidentally blocked",async()=>{
  for(const role of ["owner","system"]){
    const x=await request(role,role==="system"?{salons:[]}:identity);
    assert.equal(x.status,200);
    assert.equal(x.body?.ok,true);
  }
});
test("anonymous/admin/foreign salon identity is denied",async()=>{
  for(const role of [null,"admin"]){
    const x=await request(role,identity);
    assert.equal(x.status,403);
    assert.equal(x.calls.length,1);
  }
  const foreign=await request("salon_admin",identity,"other-salon");
  assert.equal(foreign.status,403);
  assert.equal(foreign.calls.length,1);
});
test("role gate is applied before ALL salon-cabinet membership reads",()=>{
  const s=fs.readFileSync(new URL("../routes/internal/salons.js",import.meta.url),"utf8");
  const p=s.slice(s.indexOf("function hasSalonOwnership("),s.indexOf("function roundProjectionMoney("));
  assert.match(p,/req\?\.auth\?\.role !== "salon_admin"/);
  assert.match(p,/req\?\.auth\?\.role !== "owner"/);
  assert.ok(p.indexOf('role !== "salon_admin"')<p.indexOf("getIdentitySalonIds("));
  assert.equal((s.match(/hasSalonOwnership\(req,/g)||[]).length>25,true);
});
