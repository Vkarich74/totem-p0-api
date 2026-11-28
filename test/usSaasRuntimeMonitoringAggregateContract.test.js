import test from "node:test";
import assert from "node:assert/strict";
import {readUsSaasRuntimeHealth,readUsSaasRuntimeWatchdog} from "../src/services/billing/usSaasRuntimeMonitoring.js";

const keys=["total","orphaned","due","at_risk","stale","expired_active","active","blocked","pending","runnable","processing","lease_expired","recent_failed","recent_done"];
const row=patch=>({sampled_at:new Date("2026-11-28T03:00:00Z"),
 ...Object.fromEntries(keys.map(k=>[k,"0"])),max_active_age_s:null,oldest_runnable_s:null,...patch});
const health=patch=>readUsSaasRuntimeHealth({query:async()=>({rows:[row(patch)]})});
const watchdog=patch=>{
 let n=0;
 return readUsSaasRuntimeWatchdog({query:async()=>({rows:[n++===0?
 {last_outcome:"NEVER",consecutive_failures:"0",heartbeat_age_s:null,cooling:false}:row(patch)]})},{expectedMode:"HOLD"});
};

test("consistent aggregate subsets and disjoint statuses are preserved",async()=>{
 const h=await health({total:"5",active:"3",blocked:"2",orphaned:"1",due:"4",at_risk:"2",stale:"1",expired_active:"1",max_active_age_s:"301",pending:"4",runnable:"3",oldest_runnable_s:"1",processing:"2",lease_expired:"1",recent_done:"9"});
 assert.equal(h.total,5);assert.equal(h.active,3);assert.equal(h.blocked,2);assert.equal(h.severity,"CRITICAL");
});
test("future stale evidence need not be due, and empty HOLD remains valid",async()=>{
 const h=await health({total:"1",active:"1",at_risk:"1",stale:"1",due:"0",max_active_age_s:"-2.1"});
 assert.equal(h.severity,"CRITICAL");
 const w=await watchdog({});assert.equal(w.reason,"EXPECTED_INITIAL_HOLD");assert.equal(w.runtime_health_ok,false);
});
for(const [name,patch] of [
 ["orphaned beyond total",{total:"1",orphaned:"2"}],
 ["due beyond total",{total:"1",due:"2"}],
 ["active beyond total",{total:"1",active:"2"}],
 ["blocked beyond total",{total:"1",blocked:"2"}],
 ["disjoint statuses beyond total",{total:"2",active:"2",blocked:"1"}],
 ["at risk beyond active",{total:"2",active:"1",at_risk:"2"}],
 ["stale beyond at risk",{total:"2",active:"2",at_risk:"1",stale:"2"}],
 ["expired beyond active",{total:"2",active:"1",expired_active:"2"}],
 ["runnable beyond pending",{pending:"1",runnable:"2"}],
 ["expired leases beyond processing",{processing:"1",lease_expired:"2"}]
]){
 test("reject inconsistent aggregate: "+name,async()=>{
  await assert.rejects(health(patch),/US_SAAS_MONITOR_INCONSISTENT/);
 });
}
test("an impossible nonzero active count cannot be reported as pristine HOLD",async()=>{
 await assert.rejects(watchdog({active:"1"}),/US_SAAS_MONITOR_INCONSISTENT/);
});

for(const [name,patch] of [
 ["ready jobs without age",{pending:"1",runnable:"1"}],
 ["zero ready jobs with zero age",{oldest_runnable_s:"0"}],
 ["zero ready jobs with positive age",{pending:"2",oldest_runnable_s:"61"}],
 ["negative ready age",{pending:"1",runnable:"1",oldest_runnable_s:"-1"}],
 ["negative age hidden by rounding",{pending:"1",runnable:"1",oldest_runnable_s:"-0.000001"}]
]){
 test("queue age rejects "+name,async()=>{
  await assert.rejects(health(patch),{message:"US_SAAS_MONITOR_INCONSISTENT"});
 });
}
test("queue age cannot produce pristine HOLD from a non-null empty queue age",async()=>{
 await assert.rejects(watchdog({oldest_runnable_s:"0"}),{message:"US_SAAS_MONITOR_INCONSISTENT"});
});
test("queue age cannot produce healthy ACTIVE from ready jobs without age",async()=>{
 let n=0;
 const db={query:async()=>({rows:[n++===0?
 {last_outcome:"OK",consecutive_failures:"0",heartbeat_age_s:"1",cooling:false}:
 row({pending:"1",runnable:"1"})]})};
 await assert.rejects(readUsSaasRuntimeWatchdog(db,{expectedMode:"ACTIVE"}),{message:"US_SAAS_MONITOR_INCONSISTENT"});
});
for(const [name,patch,expectedAge,severity] of [
 ["empty queue",{},null,"OK"],
 ["pending not ready",{pending:"2"},null,"OK"],
 ["ready exactly now",{pending:"1",runnable:"1",oldest_runnable_s:"0"},0,"OK"],
 ["warning boundary",{pending:"1",runnable:"1",oldest_runnable_s:60},60,"OK"],
 ["above warning boundary",{pending:"2",runnable:"2",oldest_runnable_s:"60.001"},60.001,"WARN"]
]){
 test("queue age preserves "+name,async()=>{
  const result=await health(patch);
  assert.equal(result.oldest_runnable_s,expectedAge);
  assert.equal(result.severity,severity);
 });
}
