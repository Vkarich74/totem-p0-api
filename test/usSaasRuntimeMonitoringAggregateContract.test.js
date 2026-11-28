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
 const h=await health({total:"5",active:"3",blocked:"2",orphaned:"1",due:"4",at_risk:"2",stale:"1",expired_active:"1",pending:"4",runnable:"3",processing:"2",lease_expired:"1",recent_done:"9"});
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
