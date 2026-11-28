import test from "node:test";
import assert from "node:assert/strict";
import {readUsSaasRuntimeWatchdog,US_SAAS_RUNTIME_HEALTH_SQL} from "../src/services/billing/usSaasRuntimeMonitoring.js";

const counters=["total","orphaned","due","at_risk","stale","expired_active","active","blocked","pending","runnable","processing","lease_expired","recent_failed","recent_done"];
const health=()=>({sampled_at:new Date("2026-11-28T03:00:00Z"),...Object.fromEntries(counters.map(k=>[k,"0"])),max_active_age_s:null,oldest_runnable_s:null});
const errors=["PARTIAL","RATE_LIMIT","AUTH_REJECTED","PROVIDER_ERROR","TICK_ERROR"];
function fixture(outcome,failures,expectedMode="ACTIVE",patch={}){
 let calls=0;
 const db={query:async sql=>{
   calls++;
   if(sql===US_SAAS_RUNTIME_HEALTH_SQL)return {rows:[health()]};
   assert.match(sql,/FROM public\.us_saas_runtime_control/);
   return {rows:[{last_outcome:outcome,consecutive_failures:failures,heartbeat_age_s:outcome==="NEVER"?null:"1",cooling:false,...patch}]};
 }};
 return {read:()=>readUsSaasRuntimeWatchdog(db,{expectedMode}),calls:()=>calls};
}
for(const mode of ["ACTIVE","HOLD"]){
 for(const outcome of ["OK",...errors]){
  test("outcome consistency rejects "+outcome+" in "+mode,async()=>{
   const invalid=outcome==="OK"?[1,20]:[0];
   for(const count of invalid){
    const f=fixture(outcome,String(count),mode);
    await assert.rejects(f.read(),{message:"US_SAAS_WATCHDOG_INCONSISTENT"});
    assert.equal(f.calls(),1,"contradictory control state must not reach aggregate read");
   }
  });
 }
}
for(const outcome of ["OK","IDLE","RUNNING",...errors]){
 test("outcome consistency preserves valid "+outcome+" states",async()=>{
  const counts=outcome==="OK"?[0]:errors.includes(outcome)?Array.from({length:20},(_,i)=>i+1):Array.from({length:21},(_,i)=>i);
  for(const count of counts){
   for(const cooling of errors.includes(outcome)||outcome==="RUNNING"?[false,true]:[false]){
    const f=fixture(outcome,String(count),"ACTIVE",{cooling});
    const result=await f.read();
    const expected=["AUTH_REJECTED","TICK_ERROR"].includes(outcome)?"CRITICAL":count>0?"WARN":"OK";
    assert.equal(result.severity,expected);
    assert.equal(result.runtime_health_ok,expected==="OK");
    assert.equal(result.consecutive_failures,count);
    assert.equal(result.last_outcome,outcome);
    assert.equal(f.calls(),2);
   }
   const hold=await fixture(outcome,count,"HOLD").read();
   assert.equal(hold.severity,"CRITICAL");
   assert.equal(hold.runtime_health_ok,false);
   assert.equal(hold.reason,"UNEXPECTED_ACTIVITY_OR_STATE_DURING_HOLD");
  }
 });
}
test("outcome consistency preserves initial NEVER and HOLD behavior",async()=>{
 const pristine=await fixture("NEVER",0,"HOLD").read();
 assert.equal(pristine.reason,"EXPECTED_INITIAL_HOLD");
 assert.equal(pristine.runtime_health_ok,false);
 const active=await fixture("NEVER",0,"ACTIVE").read();
 assert.equal(active.severity,"CRITICAL");
 assert.equal(active.reason,"HEARTBEAT_MISSING_OR_STALE");
 const nonpristine=await fixture("NEVER",1,"HOLD").read();
 assert.equal(nonpristine.severity,"CRITICAL");
 assert.equal(nonpristine.reason,"UNEXPECTED_ACTIVITY_OR_STATE_DURING_HOLD");
});
