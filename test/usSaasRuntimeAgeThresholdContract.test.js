import test from "node:test";
import assert from "node:assert/strict";
import {readUsSaasRuntimeHealth,readUsSaasRuntimeWatchdog,US_SAAS_RUNTIME_HEALTH_SQL} from "../src/services/billing/usSaasRuntimeMonitoring.js";

const keys=["total","orphaned","due","at_risk","stale","expired_active","active","blocked","pending","runnable","processing","lease_expired","recent_failed","recent_done"];
const row=patch=>({sampled_at:new Date("2026-11-28T03:00:00Z"),...Object.fromEntries(keys.map(k=>[k,"0"])),max_active_age_s:null,oldest_runnable_s:null,...patch});
const health=patch=>readUsSaasRuntimeHealth({query:async sql=>{
 assert.equal(sql,US_SAAS_RUNTIME_HEALTH_SQL);
 return {rows:[row(patch)]};
}});
const watchdog=patch=>readUsSaasRuntimeWatchdog({query:async sql=>({rows:[sql===US_SAAS_RUNTIME_HEALTH_SQL?row(patch):{
 last_outcome:"OK",consecutive_failures:"0",heartbeat_age_s:"1",cooling:false
}]})},{expectedMode:"ACTIVE"});

// Independent finite SQL-predicate model: force a witness for MAX and
// enumerate representatives of every possible remaining age category,
// including NULL. Non-active rows contribute only to due.
function feasible(max,active,other){
 const ages=[null,max,...[-2,0,61,241,301].filter(x=>x<=max)];
 const tuples=new Set();
 function visit(values){
  if(values.length<active){
   for(const a of ages)visit([...values,a]);
   return;
  }
  const due=values.filter(a=>a===null||a>60).length;
  const risk=values.filter(a=>a===null||a>240||a< -1).length;
  const stale=values.filter(a=>a===null||a>300||a< -1).length;
  for(let n=0;n<=other;n++)tuples.add([due+n,risk,stale].join(","));
 }
 visit([max]);
 return tuples;
}
const boundaries=[-1.000001,-1,-0.999999,59.999999,60,60.000001,239.999999,240,240.000001,299.999999,300,300.000001];
for(const max of boundaries){
 for(const valid of [true,false]){
  test("threshold model "+max+" "+(valid?"accepts all feasible":"rejects all impossible"),async()=>{
   let checked=0;
   for(let a=1;a<=3;a++)for(let b=0;b<=2;b++){
    const possible=feasible(max,a,b),total=a+b;
    for(let d=0;d<=total;d++)for(let r=0;r<=a;r++)for(let s=0;s<=r;s++){
     if(possible.has([d,r,s].join(","))!==valid)continue;
     const patch={total:String(total),active:String(a),blocked:String(b),due:String(d),at_risk:String(r),stale:String(s),max_active_age_s:checked%2===0?max.toFixed(6):max};
     if(valid){
      const h=await health(patch);
      assert.equal(h.max_active_age_s,Math.round(max*1000)/1000);
      assert.equal(h.severity,s?"CRITICAL":r?"WARN":"OK");
     }else{
      await assert.rejects(health(patch),{message:"US_SAAS_MONITOR_INCONSISTENT"},JSON.stringify(patch));
     }
     checked++;
    }
   }
   assert.ok(checked>0);
  });
 }
}
for(const max of [-1.000001,60.000001,240.000001,300.000001]){
 test("threshold false HEALTHY rejected for "+max,async()=>{
  await assert.rejects(watchdog({total:"1",active:"1",max_active_age_s:max.toFixed(6)}),{message:"US_SAAS_MONITOR_INCONSISTENT"});
 });
}
