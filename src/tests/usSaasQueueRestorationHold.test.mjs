import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const src=f=>readFileSync(new URL("../../"+f,import.meta.url),"utf8");
const env=Object.fromEntries(["RUNTIME_ENABLED","RUNTIME_RELEASE_APPROVED","BATCH_READBACK_ENABLED","RECONCILIATION_ENABLED","ACCESS_ENABLED","ACTIVATION_ENABLED"].map(k=>["TOTEM_US_ODOO_SAAS_"+k,"true"]));
const hold={status:"HOLD",reason:"US_SAAS_RESTORATION_AUTHORITY_HOLD"};
async function graph(){
 const context=vm.createContext({AbortController,AbortSignal});
 const synth=e=>new vm.SyntheticModule(Object.keys(e),function(){for(const [k,v] of Object.entries(e))this.setExport(k,v)},{context});
 const tick=new vm.SourceTextModule(src("jobs/usSaasReconciliationTick.js"),{context});
 const unused=()=>{throw Error("unexpected dependency")};
 const deps={"../utils/enqueueJob.js":synth({enqueueJob:unused}),"./queueWorker.js":synth({runQueueBatchWorker:unused}),"../src/services/provision/usCommercialWriterRelease.js":synth({commercialWriterRelease:()=>({projection_write:true})})};
 await tick.link(k=>deps[k]);await tick.evaluate();return tick.namespace;
}
test("both selectors exclude inactive, blocked and revoked rows",()=>{
 const tick=src("jobs/usSaasReconciliationTick.js"),recon=src("src/services/billing/usSaasReconciliation.js");
 for(const [s,a] of [[tick,"b"],[recon,"billing"]]){
  for(const clause of ["subscription_status='active'","blocked_at IS NULL","provider_revoked_at IS NULL"])assert.ok(s.includes(a+"."+clause),clause);
 }
 assert.match(recon,/if\(!renewable\(old\)\)return hold\(\)/);
 assert.match(recon,/if\(exact\(locked,current\)&&!renewable\(current\)\)\{\s*await db.query\("ROLLBACK"\);\s*return hold\(\)/);
});
test("leased tick acknowledges only explicit restoration HOLD, not transient WAIT or unknown HOLD",async()=>{
 const m=await graph();
 for(const [out,done] of [[hold,true],[{status:"WAIT",reason:"ODOO_READBACK_UNAVAILABLE"},false],[{status:"HOLD",reason:"OTHER"},false],[{status:"PAID_VERIFIED"},true]]){
  let ack,observed,queries=[];
  const client={async query(sql){queries.push(sql);if(sql.includes("pg_try_advisory_lock"))return {rows:[{acquired:true}]};if(sql.includes("pg_advisory_unlock"))return {rows:[{released:true}]};if(sql.includes("clock_timestamp() AS now"))return {rows:[{now:"2026-11-26T06:00:00Z"}]};return {rows:[]}},release(){}};
  const res=await m.runUsSaasReconciliationTick({db:{connect:async()=>client},env,enqueue:()=>{throw Error("unexpected enqueue")},batchWorker:async({handler})=>{ack=(await handler([{payload:{request_id:"1"},signal:new AbortController().signal,assertLease:async()=>{}}]))[0];return {done:ack===null?1:0}},lifecycle:{before:async()=>({status:"READY",enqueueLimit:1}),after:async()=>{},failed:async()=>{},reconcile:async()=>out,observeResults:x=>observed=x[0]}});
  assert.equal(ack===null,done);assert.equal(observed,out);assert.equal(res.status,"RAN");
  assert.ok(queries.some(s=>s.includes("b.blocked_at IS NULL")));
 }
});
test("HTTP HOLD is not success; runtime tracks held separately",()=>{
 const route=src("src/routes/internal/adminOpenOwner.js"),runtime=src("src/services/billing/usSaasRuntime.js");
 assert.ok(route.includes('const denied=result.status==="WAIT"||result.status==="HOLD"'));
 assert.ok(runtime.includes('else if(x?.status==="HOLD")stats.held++'));
 assert.ok(runtime.includes('if(stats.held===stats.claimed&&stats.claimed>0)return "IDLE"'));
});
