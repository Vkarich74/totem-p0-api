import test from "node:test";
import assert from "node:assert/strict";
import {readUsSaasRuntimeHealth,sampleUsSaasRuntimeWatchdog} from "../src/services/billing/usSaasRuntimeMonitoring.js";
const keys=["total","orphaned","due","at_risk","stale","expired_active","active","blocked","pending","runnable","processing","lease_expired","recent_failed","recent_done"];
const row=sampled_at=>({sampled_at,...Object.fromEntries(keys.map(k=>[k,"0"])),max_active_age_s:null,oldest_runnable_s:null});
const health=value=>readUsSaasRuntimeHealth({query:async()=>({rows:[row(value)]})});
for(const [name,v] of [["false",false],["true",true],["numeric epoch",0],["numeric milliseconds",1795824000000],["array",["2026-11-28T00:00:00Z"]],["coercible object",{valueOf:()=>1795824000000}],["date only","2026-11-28"],["local time","2026-11-28T00:00:00"],["overflow day","2026-02-30T00:00:00Z"],["non-leap day","2026-02-29T00:00:00Z"],["24-hour overflow","2026-11-28T24:00:00Z"],["numeric text","0"]]){
 test("reject malformed sampled_at: "+name,async()=>{await assert.rejects(health(v),{message:"US_SAAS_MONITOR_INVALID"});});
}
test("invalid Date and missing values still fail closed",async()=>{
 for(const v of [new Date(NaN),null,undefined,"not a date"])await assert.rejects(health(v),{message:"US_SAAS_MONITOR_INVALID"});
});
test("native pg Date and explicit offset text normalize to UTC",async()=>{
 for(const v of [new Date("2026-11-28T00:00:00.123Z"),"2026-11-28T00:00:00.123Z","2026-11-28T06:00:00.123+06:00","2026-11-27T19:00:00.123-05:00"]){
  const x=await health(v);assert.equal(x.sampled_at,"2026-11-28T00:00:00.123Z");assert.equal(x.severity,"OK");
 }
});
test("PostgreSQL timestamp text preserves supported microseconds and short offset",async()=>{
 const x=await health("2026-11-28 06:00:00.123456+06");assert.equal(x.sampled_at,"2026-11-28T00:00:00.123Z");
});
test("calendar and offset validation preserves actual leap day",async()=>{
 const x=await health("2024-02-29T00:00:00Z");assert.equal(x.sampled_at,"2024-02-29T00:00:00.000Z");
});
test("malformed aggregate timestamp cannot produce expected HOLD; rollback and discard",async()=>{
 const calls=[],releases=[];
 const db={query:async sql=>{
   calls.push(sql);
   if(sql==="SHOW transaction_read_only")return {rows:[{transaction_read_only:"on"}]};
   if(sql.includes("us_saas_runtime_control"))return {rows:[{sampled_at:new Date("2026-11-28T00:00:00Z"),last_outcome:"NEVER",consecutive_failures:0,heartbeat_age_s:null,cooling:false}]};
   if(sql.includes("billing_subscriptions"))return {rows:[row(false)]};
   return {rows:[]};
 },release:v=>releases.push(v)};
 await assert.rejects(sampleUsSaasRuntimeWatchdog({connect:async()=>db},{expectedMode:"HOLD"}),{message:"US_SAAS_MONITOR_INVALID"});
 assert.equal(calls.at(-1),"ROLLBACK");assert.deepEqual(releases,[true]);
});
