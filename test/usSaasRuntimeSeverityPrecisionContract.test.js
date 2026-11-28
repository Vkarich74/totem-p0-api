import test from "node:test";
import assert from "node:assert/strict";
import {readUsSaasRuntimeHealth,readUsSaasRuntimeWatchdog,US_SAAS_RUNTIME_HEALTH_SQL} from "../src/services/billing/usSaasRuntimeMonitoring.js";

const keys=["total","orphaned","due","at_risk","stale","expired_active","active","blocked","pending","runnable","processing","lease_expired","recent_failed","recent_done"];
const row=patch=>({sampled_at:new Date("2026-11-28T03:00:00Z"),...Object.fromEntries(keys.map(k=>[k,"0"])),max_active_age_s:null,oldest_runnable_s:null,...patch});
const health=patch=>readUsSaasRuntimeHealth({query:async sql=>{
 assert.equal(sql,US_SAAS_RUNTIME_HEALTH_SQL);
 return {rows:[row(patch)]};
}});
const watchdog=(heartbeat,patch={},control={},expectedMode="ACTIVE")=>readUsSaasRuntimeWatchdog({query:async sql=>({rows:[sql===US_SAAS_RUNTIME_HEALTH_SQL?row(patch):{
 last_outcome:"OK",consecutive_failures:"0",heartbeat_age_s:heartbeat,cooling:false,...control
}]})},{expectedMode});
const rounded=x=>x===null?null:Math.round(x*1000)/1000;
for(const [age,severity,reason] of [
 [-1.000001,"CRITICAL","HEARTBEAT_MISSING_OR_STALE"],
 [-1,"OK","HEALTHY"],[-0.999999,"OK","HEALTHY"],
 [44.999999,"OK","HEALTHY"],[45,"OK","HEALTHY"],[45.000001,"WARN","DEGRADED"],
 [59.999999,"WARN","DEGRADED"],[60,"WARN","DEGRADED"],[60.000001,"CRITICAL","HEARTBEAT_MISSING_OR_STALE"]
]){
 test("raw heartbeat boundary "+age,async()=>{
  for(const value of [age,age.toFixed(6)]){
   const w=await watchdog(value);
   assert.equal(w.severity,severity);
   assert.equal(w.reason,reason);
   assert.equal(w.runtime_health_ok,severity==="OK");
   assert.equal(w.heartbeat_age_s,rounded(age));
  }
 });
}
for(const [age,severity] of [[59.999999,"OK"],[60,"OK"],[60.000001,"WARN"]]){
 test("raw queue boundary "+age,async()=>{
  for(const value of [age,age.toFixed(6)]){
   const patch={pending:"1",runnable:"1",oldest_runnable_s:value};
   const h=await health(patch);
   assert.equal(h.severity,severity);
   assert.equal(h.oldest_runnable_s,rounded(age));
   const w=await watchdog("1",patch);
   assert.equal(w.severity,severity);
   assert.equal(w.reason,severity==="OK"?"HEALTHY":"DEGRADED");
   assert.equal(w.runtime_health_ok,severity==="OK");
   assert.equal(w.health.oldest_runnable_s,rounded(age));
  }
 });
}
test("raw age preserves critical precedence over queue and heartbeat warnings",async()=>{
 const patch={total:"1",orphaned:"1",pending:"1",runnable:"1",oldest_runnable_s:"60.000001"};
 const w=await watchdog("45.000001",patch);
 assert.equal(w.severity,"CRITICAL");assert.equal(w.reason,"DEGRADED");assert.equal(w.runtime_health_ok,false);
 for(const last_outcome of ["AUTH_REJECTED","TICK_ERROR"]){
  const v=await watchdog("45.000001",{pending:"1",runnable:"1",oldest_runnable_s:"60.000001"},{last_outcome,consecutive_failures:"1"});
  assert.equal(v.severity,"CRITICAL");assert.equal(v.reason,"DEGRADED");
 }
});
test("raw dead heartbeat takes precedence over other critical causes",async()=>{
 const w=await watchdog("60.000001",{total:"1",orphaned:"1"},{last_outcome:"TICK_ERROR",consecutive_failures:"1"});
 assert.equal(w.severity,"CRITICAL");assert.equal(w.reason,"HEARTBEAT_MISSING_OR_STALE");assert.equal(w.runtime_health_ok,false);
});
test("raw age preserves initial HOLD, missing heartbeat and empty queue",async()=>{
 const control={last_outcome:"NEVER"};
 const hold=await watchdog(null,{},control,"HOLD");
 assert.equal(hold.severity,"OK");assert.equal(hold.reason,"EXPECTED_INITIAL_HOLD");assert.equal(hold.runtime_health_ok,false);
 const missing=await watchdog(null);
 assert.equal(missing.severity,"CRITICAL");assert.equal(missing.reason,"HEARTBEAT_MISSING_OR_STALE");
 const empty=await health({});assert.equal(empty.oldest_runnable_s,null);assert.equal(empty.severity,"OK");
 const nonpristine=await watchdog("-1.000001",{},control,"HOLD");
 assert.equal(nonpristine.severity,"CRITICAL");assert.equal(nonpristine.reason,"UNEXPECTED_ACTIVITY_OR_STATE_DURING_HOLD");
});
test("raw age preserves validation before comparison and rejects negative queue ages",async()=>{
 for(const value of [false,""," ","0x10","1e1",undefined,1e308,Infinity,NaN]){
  await assert.rejects(watchdog(value),{message:"US_SAAS_MONITOR_INVALID"});
  await assert.rejects(health({pending:"1",runnable:"1",oldest_runnable_s:value}),{message:"US_SAAS_MONITOR_INVALID"});
 }
 await assert.rejects(health({pending:"1",runnable:"1",oldest_runnable_s:"-0.000001"}),{message:"US_SAAS_MONITOR_INCONSISTENT"});
});
