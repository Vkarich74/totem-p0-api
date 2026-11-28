import test from "node:test";
import assert from "node:assert/strict";
import {sampleUsSaasRuntimeWatchdog,readUsSaasRuntimeWatchdog} from "../src/services/billing/usSaasRuntimeMonitoring.js";
const keys=["total","orphaned","due","at_risk","stale","expired_active","active","blocked","pending","runnable","processing","lease_expired","recent_failed","recent_done"];
const instant="2026-11-28T06:00:00.123Z";
function fixture(control,aggregate,{mode="ACTIVE"}={}){
 const calls=[],releases=[];
 const db={query:async sql=>{
   calls.push(sql);
   if(sql==="SHOW transaction_read_only")return {rows:[{transaction_read_only:"on"}]};
   if(sql.includes("us_saas_runtime_control"))return {rows:[{sampled_at:control,last_outcome:mode==="HOLD"?"NEVER":"OK",consecutive_failures:0,heartbeat_age_s:mode==="HOLD"?null:"1",cooling:false}]};
   if(sql.includes("billing_subscriptions"))return {rows:[{sampled_at:aggregate,...Object.fromEntries(keys.map(k=>[k,"0"])),max_active_age_s:null,oldest_runnable_s:null}]};
   return {rows:[]};
 },release:v=>releases.push(v)};
 return {db,calls,releases,run:()=>sampleUsSaasRuntimeWatchdog({connect:async()=>db},{expectedMode:mode})};
}
for(const [name,control] of [["missing",undefined],["null",null],["boolean",false],["numeric",0],["invalid Date",new Date(NaN)],["timezone missing","2026-11-28T06:00:00"],["calendar overflow","2026-02-30T00:00:00Z"]]){
 test("reject invalid control timestamp "+name,async()=>{
  const f=fixture(control,instant);
  await assert.rejects(f.run(),{message:"US_SAAS_MONITOR_INVALID"});
  assert.equal(f.calls.filter(s=>s.includes("billing_subscriptions")).length,0);
  assert.equal(f.calls.at(-1),"ROLLBACK");assert.deepEqual(f.releases,[true]);
 });
}
for(const mode of ["ACTIVE","HOLD"]){
 test("reject differing transaction instants in "+mode,async()=>{
  const f=fixture(instant,"2026-11-28T06:00:00.124Z",{mode});
  await assert.rejects(f.run(),{message:"US_SAAS_WATCHDOG_SNAPSHOT_MISMATCH"});
  assert.equal(f.calls.at(-1),"ROLLBACK");assert.deepEqual(f.releases,[true]);
 });
}
test("reject mismatch below millisecond when exact text is delivered",async()=>{
 const f=fixture("2026-11-28T06:00:00.123456Z","2026-11-28T06:00:00.123457Z");
 await assert.rejects(f.run(),{message:"US_SAAS_WATCHDOG_SNAPSHOT_MISMATCH"});
 assert.deepEqual(f.releases,[true]);
});
for(const [name,a,b] of [
 ["native Date",new Date(instant),new Date(instant)],
 ["equivalent offsets","2026-11-28 12:00:00.123456+06","2026-11-28T06:00:00.123456Z"],
 ["equivalent precision","2026-11-28T06:00:00.123000Z",instant],
 ["mixed Date and exact millisecond text",new Date(instant),instant]
]){
 test("accept same instant "+name,async()=>{
  const f=fixture(a,b);const x=await f.run();
  assert.equal(x.severity,"OK");assert.equal(x.health.sampled_at,instant);
  assert.equal(f.calls.at(-1),"ROLLBACK");assert.deepEqual(f.releases,[false]);
 });
}
test("direct caller retains existing independent statement clock semantics",async()=>{
 const f=fixture(undefined,instant);
 const x=await readUsSaasRuntimeWatchdog(f.db,{expectedMode:"ACTIVE"});
 assert.equal(x.severity,"OK");assert.equal(x.health.sampled_at,instant);
 assert.equal(f.calls.length,2);assert.ok(f.calls.every(s=>s.includes("statement_timestamp()")));
});
