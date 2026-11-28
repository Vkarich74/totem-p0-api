import test from "node:test";
import assert from "node:assert/strict";
import {readUsSaasRuntimeHealth,readUsSaasRuntimeWatchdog,US_SAAS_RUNTIME_HEALTH_SQL} from "../src/services/billing/usSaasRuntimeMonitoring.js";

const keys=["total","orphaned","due","at_risk","stale","expired_active","active","blocked","pending","runnable","processing","lease_expired","recent_failed","recent_done"];
const row=patch=>({sampled_at:new Date("2026-11-28T03:00:00Z"),...Object.fromEntries(keys.map(k=>[k,"0"])),max_active_age_s:null,oldest_runnable_s:null,...patch});
const health=patch=>readUsSaasRuntimeHealth({query:async sql=>{
 assert.equal(sql,US_SAAS_RUNTIME_HEALTH_SQL);
 return {rows:[row(patch)]};
}});
const watchdog=(patch,expectedMode)=>readUsSaasRuntimeWatchdog({query:async sql=>({rows:[sql===US_SAAS_RUNTIME_HEALTH_SQL?row(patch):{
 last_outcome:expectedMode==="HOLD"?"NEVER":"OK",consecutive_failures:"0",heartbeat_age_s:expectedMode==="HOLD"?null:"1",cooling:false
}]})},{expectedMode});

for(const [name,patch] of [
 ["empty active scope with zero age",{max_active_age_s:"0"}],
 ["blocked-only scope with positive age",{total:"1",blocked:"1",max_active_age_s:15}],
 ["empty active scope with negative age",{max_active_age_s:"-0.1255"}],
 ["all-null active verification without incidents",{total:"1",active:"1"}],
 ["all-null active verification with insufficient at-risk and stale",{total:"2",active:"2",at_risk:"1",stale:"1",due:"2"}],
 ["all-null active verification with insufficient stale",{total:"2",active:"2",at_risk:"2",stale:"1",due:"2"}],
 ["all-null active verification with insufficient due",{total:"2",active:"2",at_risk:"2",stale:"2",due:"1"}]
]){
 test("active age rejects "+name,async()=>{
  await assert.rejects(health(patch),{message:"US_SAAS_MONITOR_INCONSISTENT"});
 });
}
test("active age cannot produce pristine HOLD with an empty active scope and non-null age",async()=>{
 await assert.rejects(watchdog({max_active_age_s:"0"},"HOLD"),{message:"US_SAAS_MONITOR_INCONSISTENT"});
});
test("active age cannot produce healthy ACTIVE when all active verification times are missing",async()=>{
 await assert.rejects(watchdog({total:"1",active:"1"},"ACTIVE"),{message:"US_SAAS_MONITOR_INCONSISTENT"});
});
for(const [name,patch,expectedAge,severity] of [
 ["empty scope",{},null,"OK"],
 ["blocked-only scope",{total:"1",blocked:"1",due:"1"},null,"OK"],
 ["all-null active verification",{total:"2",active:"2",at_risk:"2",stale:"2",due:"2"},null,"CRITICAL"],
 ["all-null active verification plus other due",{total:"3",active:"2",blocked:"1",at_risk:"2",stale:"2",due:"3"},null,"CRITICAL"],
 ["mixed null and non-null verification",{total:"2",active:"2",at_risk:"1",stale:"1",due:"1",max_active_age_s:"0"},0,"CRITICAL"],
 ["future age within tolerance",{total:"1",active:"1",max_active_age_s:"-0.1255"},-0.125,"OK"],
 ["future age outside tolerance",{total:"1",active:"1",at_risk:"1",stale:"1",max_active_age_s:"-2.1"},-2.1,"CRITICAL"],
 ["fresh verified subscription",{total:"1",active:"1",max_active_age_s:60},60,"OK"]
]){
 test("active age preserves "+name,async()=>{
  const h=await health(patch);
  assert.equal(h.max_active_age_s,expectedAge);
  assert.equal(h.severity,severity);
 });
}
test("active age preserves valid all-null ACTIVE critical status and empty HOLD",async()=>{
 const active=await watchdog({total:"2",active:"2",stale:"2",at_risk:"2",due:"2"},"ACTIVE");
 assert.equal(active.severity,"CRITICAL");
 assert.equal(active.runtime_health_ok,false);
 const hold=await watchdog({},"HOLD");
 assert.equal(hold.reason,"EXPECTED_INITIAL_HOLD");
 assert.equal(hold.runtime_health_ok,false);
});
