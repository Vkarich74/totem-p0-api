import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {startUsSaasRuntime,runUsSaasRuntimeOnce,usSaasRuntimeGate,createUsSaasProviderGuard} from "../src/services/billing/usSaasRuntime.js";
import {createUsOdooReadOnlyClient} from "../src/services/billing/usOdooReadOnlyClient.js";
import {readUsSaasRuntimeHealth} from "../src/services/billing/usSaasRuntimeMonitoring.js";
import {fixtureEnv} from "./fixtures/g5-odoo-batch-fixture.mjs";
const env=()=>({...fixtureEnv(),TOTEM_US_ODOO_URL:"https://totem-platform.odoo.com",TOTEM_US_ODOO_DB:"totem-platform",
 TOTEM_US_ODOO_SAAS_RUNTIME_ENABLED:"true",TOTEM_US_ODOO_SAAS_RUNTIME_RELEASE_APPROVED:"true"});
const ok=(result,status=200)=>({ok:status===200,status,headers:{get:()=>null},json:async()=>({result})});
const opts=()=>({signal:new AbortController().signal});
const no=()=>{throw Error("UNEXPECTED_SIDE_EFFECT");};
test("default HOLD: zero timers, DB, network, no tick, even with existing four flags",async()=>{
 for(const flags of [{},fixtureEnv(),{...env(),TOTEM_US_ODOO_SAAS_RUNTIME_RELEASE_APPROVED:"false"}]){
  assert.equal(startUsSaasRuntime({env:flags,db:{connect:no},setTimer:no,runOnce:no,logger:()=>{}}).status,"HOLD");
  assert.deepEqual(await runUsSaasRuntimeOnce({env:flags,db:{connect:no},tick:no,fetchImpl:no}),{status:"HOLD"});
 }
});
test("configuration must match exact existing Odoo billing scope and approval",()=>{
 assert.equal(usSaasRuntimeGate(env()),"READY");
 for(const patch of [{TOTEM_US_ODOO_URL:"https://other.example"},{TOTEM_US_ODOO_DB:"other"},
 {TOTEM_US_ODOO_API_KEY:" "},{TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON:"{}"},
 {TOTEM_US_ODOO_SAAS_BATCH_READBACK_ENABLED:"false"}]){
  assert.notEqual(usSaasRuntimeGate({...env(),...patch}),"READY");
 }
});
test("app runtime is dynamically imported only with exact opt-in",async()=>{
 const app=await readFile(new URL("../src/app.js",import.meta.url),"utf8");
 assert.match(app,/if \(process\.env\.TOTEM_US_ODOO_SAAS_RUNTIME_ENABLED === "true"\) \{\s*import\("\.\/services\/billing\/usSaasRuntime\.js"\)/);
 assert.doesNotMatch(app,/^import .*usSaasRuntime/m);
});
test("rolling 4 starts per 1000ms and no more than four in flight",async()=>{
 let time=0;const starts=[];
 const guard=createUsSaasProviderGuard({monotonic:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async()=>{starts.push(time);return ok([]);}});
 for(let i=0;i<12;i++)await guard.fetchImpl(new URL("https://fixture.invalid"),opts());
 assert.deepEqual(starts,[0,0,0,0,1000,1000,1000,1000,2000,2000,2000,2000]);
 assert.equal(guard.report().requests,12);
});
test("parallel body reads count as in flight and cannot exceed four",async()=>{
 let peak=0,active=0;
 const guard=createUsSaasProviderGuard({fetchImpl:async()=>({ok:true,status:200,json:async()=>{
  active++;peak=Math.max(active,peak);await new Promise(r=>setTimeout(r,15));active--;return {result:[]};
 }})});
 await Promise.all(Array.from({length:8},()=>guard.fetchImpl(new URL("https://fixture.invalid"),opts())));
 assert.equal(peak,4);assert.equal(guard.report().peak,4);
});
test("429 honors Retry-After and stops further starts",async()=>{
 let n=0;
 const guard=createUsSaasProviderGuard({fetchImpl:async()=>{n++;return {ok:false,status:429,headers:{get:()=>"120"},json:async()=>({error:"secret"})};}});
 await guard.fetchImpl(new URL("https://fixture.invalid"),opts());
 await assert.rejects(()=>guard.fetchImpl(new URL("https://fixture.invalid"),opts()),/PROVIDER_STOP/);
 assert.equal(n,1);assert.equal(guard.report().retryAfterMs,120000);assert.ok(guard.report().codes.RATE_LIMIT);
 assert.doesNotMatch(JSON.stringify(guard.report()),/secret/);
});
test("sanitized RPC error and application auth rejection stop lane",async()=>{
 for(const result of [{result:false},{error:{data:{secret:"PRIVATE"}}}]){
  let n=0;const guard=createUsSaasProviderGuard({fetchImpl:async()=>{n++;return {ok:true,status:200,json:async()=>result};}});
  const c=createUsOdooReadOnlyClient({baseUrl:"https://fixture.invalid",database:"x",username:"x",apiKey:"x",
   fetchImpl:guard.fetchImpl,observe:guard.observe});
  await assert.rejects(()=>c.authenticate());
  assert.equal(guard.report().stopped,true);assert.equal(n,1);
  assert.doesNotMatch(JSON.stringify(guard.report()),/PRIVATE/);
 }
});
test("lost advisory-lock signal cancels transport and prevents another start",async()=>{
 const fence=new AbortController();let n=0;
 const guard=createUsSaasProviderGuard({signal:fence.signal,fetchImpl:async(url,o)=>{
  n++;return new Promise((resolve,reject)=>o.signal.addEventListener("abort",()=>reject(Error("cancelled")),{once:true}));
 }});
 const pending=guard.fetchImpl(new URL("https://fixture.invalid"),opts());fence.abort();
 await assert.rejects(()=>pending);await assert.rejects(()=>guard.fetchImpl(new URL("https://fixture.invalid"),opts()));
 assert.equal(n,1);
});
test("recursive timer never overlaps; stop waits for current tick",async()=>{
 let scheduled=[],resolve,entered=0;
 const runtime=startUsSaasRuntime({env:env(),db:{},logger:()=>{},
  setTimer:(fn,ms)=>{const x={fn,ms};scheduled.push(x);return x;},clearTimer:x=>{scheduled=scheduled.filter(y=>y!==x);},
  runOnce:()=>{entered++;return new Promise(r=>{resolve=r;});}});
 assert.equal(runtime.status,"ARMED");assert.equal(scheduled.length,1);
 scheduled.shift().fn();assert.equal(entered,1);assert.equal(scheduled.length,0);
 const stopped=runtime.stop();resolve({status:"RAN",workers:[{claimed:50}]});await stopped;
 assert.equal(scheduled.length,0);assert.equal(entered,1);
});
test("monitor missing rows or malformed fields are errors, never fake zero",async()=>{
 await assert.rejects(()=>readUsSaasRuntimeHealth({query:async()=>({rows:[]})}),/MONITOR_INVALID/);
 await assert.rejects(()=>readUsSaasRuntimeHealth({query:async()=>({rows:[{sampled_at:new Date()}]})}),/MONITOR_INVALID/);
});
