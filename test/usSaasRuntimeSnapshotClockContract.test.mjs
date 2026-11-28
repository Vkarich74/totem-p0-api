import test from "node:test";
import assert from "node:assert/strict";
import {sampleUsSaasRuntimeWatchdog,readUsSaasRuntimeHealth,readUsSaasRuntimeWatchdog,US_SAAS_RUNTIME_HEALTH_SQL} from "../src/services/billing/usSaasRuntimeMonitoring.js";
const base=Date.parse("2026-11-28T00:00:00Z");
const stamp=t=>new Date(base+t*1000);
function fixture({heartbeat=43,queue=57,activeAge=null}={}){
 const reads=[],commands=[],releases=[];
 let n=0;
 const db={query:async sql=>{
   commands.push(sql);
   if(sql==="SHOW transaction_read_only")return {rows:[{transaction_read_only:"on"}]};
   if(sql.startsWith("BEGIN")||sql.startsWith("SET LOCAL")||sql==="ROLLBACK")return {rows:[]};
   const t=sql.includes("transaction_timestamp()")?0:(++n)*2;
   reads.push({sql,t});
   if(sql.includes("us_saas_runtime_control"))return {rows:[{sampled_at:stamp(t),last_outcome:"OK",consecutive_failures:0,heartbeat_age_s:heartbeat+t,cooling:false}]};
   if(sql.includes("billing_subscriptions")){
     const a=activeAge===null?null:activeAge+t, active=a===null?0:1;
     return {rows:[{sampled_at:stamp(t),total:active,orphaned:0,due:a>60?1:0,at_risk:a>240?1:0,stale:a>300?1:0,expired_active:0,active,blocked:0,pending:1,runnable:1,processing:0,lease_expired:0,recent_failed:0,recent_done:0,max_active_age_s:a,oldest_runnable_s:queue+t}]};
   }
   throw Error("UNEXPECTED_SQL");
 },release:x=>releases.push(x)};
 return {db,pool:{connect:async()=>db},reads,commands,releases};
}
test("standalone snapshot uses one stable DB clock, without false queue WARN",async()=>{
 const f=fixture();
 const x=await sampleUsSaasRuntimeWatchdog(f.pool,{expectedMode:"ACTIVE"});
 assert.equal(x.severity,"OK");assert.equal(x.heartbeat_age_s,43);assert.equal(x.health.oldest_runnable_s,57);
 assert.deepEqual(f.reads.map(r=>r.t),[0,0]);
 assert.equal(f.commands[0],"BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
 assert.equal(f.commands.at(-1),"ROLLBACK");assert.deepEqual(f.releases,[false]);
});
test("snapshot projection at-risk/stale uses the same instant as heartbeat",async()=>{
 const f=fixture({heartbeat:10,queue:10,activeAge:299});
 const x=await sampleUsSaasRuntimeWatchdog(f.pool,{expectedMode:"ACTIVE"});
 assert.equal(x.severity,"WARN");assert.equal(x.health.stale,0);assert.equal(x.health.at_risk,1);
 assert.equal(x.health.max_active_age_s,299);assert.equal(x.health.sampled_at,stamp(0).toISOString());
 assert.ok(f.reads.every(r=>r.sql.includes("transaction_timestamp()")&&!r.sql.includes("statement_timestamp()")));
});
test("direct aggregate and direct watchdog retain the prior statement-clock contract",async()=>{
 const f=fixture({queue:10});
 await readUsSaasRuntimeHealth(f.db);
 assert.equal(f.reads[0].sql,US_SAAS_RUNTIME_HEALTH_SQL);
 const g=fixture({queue:10});
 await readUsSaasRuntimeWatchdog(g.db,{expectedMode:"ACTIVE"});
 assert.equal(g.reads[1].sql,US_SAAS_RUNTIME_HEALTH_SQL);
 assert.ok(g.reads.every(r=>r.sql.includes("statement_timestamp()")&&!r.sql.includes("transaction_timestamp()")));
});
