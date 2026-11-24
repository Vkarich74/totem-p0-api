// G5 T6-G: OFF by default, existing PostgreSQL tick + advisory lock.
// No new external endpoint; durable operational cooldown, aggregate logs only.
import {performance} from "node:perf_hooks";
import {setTimeout as delay} from "node:timers/promises";
import {createUsOdooReadOnlyClient} from "./usOdooReadOnlyClient.js";
import {prepareUsPaidActivationEvidenceBatch} from "./usOdooBatchReadback.js";
import {reconcileUsSaasOpeningsBatch} from "./usSaasReconciliation.js";
import {readUsSaasRuntimeHealth} from "./usSaasRuntimeMonitoring.js";

const FLAGS=["TOTEM_US_ODOO_SAAS_RUNTIME_ENABLED","TOTEM_US_ODOO_SAAS_RUNTIME_RELEASE_APPROVED",
 "TOTEM_US_ODOO_SAAS_RECONCILIATION_ENABLED","TOTEM_US_ODOO_SAAS_BATCH_READBACK_ENABLED",
 "TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED","TOTEM_US_ODOO_SAAS_ACCESS_ENABLED"];
const CODES=new Set(["RATE_LIMIT","AUTH_REJECTED","HTTP_ERROR","RPC_ERROR","TIMEOUT","READBACK_ERROR","RPC_OK","AUTH_OK"]);
const nowMono=()=>performance.now();
const err=()=>Error("US_SAAS_RUNTIME_PROVIDER_STOP");
const safeLog=(logger,event,data)=>{try{logger(event,data);}catch{}};
const defaultLogger=(event,data)=>console.info(event,JSON.stringify(data));
export function usSaasRuntimeGate(env){
 if(!FLAGS.every(k=>env[k]==="true"))return "HOLD";
 let p,url;try{p=JSON.parse(env.TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON||"");url=new URL(env.TOTEM_US_ODOO_URL);}catch{return "CONFIG_INVALID";}
 if(url.origin!=="https://totem-platform.odoo.com"||url.pathname!=="/"||url.search||url.hash||url.username||url.password||
   env.TOTEM_US_ODOO_DB!=="totem-platform"||
   !["TOTEM_US_ODOO_USER","TOTEM_US_ODOO_API_KEY"].every(k=>typeof env[k]==="string"&&env[k].trim())||
   p?.approved!==true||!/^[A-Za-z0-9_.-]{1,40}$/.test(p.version||"")||
   p.companyId!==4||p.websiteId!==5||p.planId!==6||p.productTemplateId!==29||p.currencyId!==1||
   p.billingPeriodUnit!=="month"||p.billingPeriodValue!==1||p.allowDeferredRevenuePeriod!==true||
   !["manual","online"].includes(p.paymentChannel)||!Array.isArray(p.coveredOwnerTypes)||
   !p.coveredOwnerTypes.length||!p.coveredOwnerTypes.every(t=>["salon","master"].includes(t)))return "CONFIG_INVALID";
 return "READY";
}
// A single batch at a time under the existing advisory lock. Rolling rate
// ceiling is per runtime reconciliation lane, not an Odoo-wide SLA.
export function createUsSaasProviderGuard({fetchImpl=globalThis.fetch,signal,
 monotonic=nowMono,sleep=delay,wall=()=>Date.now()}={}){
 let starts=[],inFlight=0,peak=0,requests=0,stopped=false,retryAfterMs=0;
 const codes=Object.create(null);
 function observe(code){
   if(!CODES.has(code))return;
   codes[code]=(codes[code]||0)+1;
   if(!["RPC_OK","AUTH_OK"].includes(code))stopped=true;
 }
 function retryAfter(value){
   if(typeof value!=="string")return 60000;
   const ms=/^\d+$/.test(value)?Number(value)*1000:Date.parse(value)-wall();
   return Number.isFinite(ms)?Math.max(60000,ms):60000;
 }
 async function guarded(url,options){
   if(signal?.aborted||options.signal?.aborted||stopped)throw err();
   // The check and reservation have no await between them.
   while(true){
     if(signal?.aborted||options.signal?.aborted||stopped)throw err();
     const t=monotonic();starts=starts.filter(x=>t-x<1000);
     if(starts.length<4&&inFlight<4){starts.push(t);inFlight++;break;}
     const wait=starts.length>=4?Math.max(1,1000-(t-starts[0])):10;
     await sleep(Math.min(wait,1000));
   }
   requests++;peak=Math.max(peak,inFlight);
   const controller=new AbortController();
   const abort=()=>controller.abort();
   signal?.addEventListener("abort",abort,{once:true});
   options.signal?.addEventListener("abort",abort,{once:true});
   if(signal?.aborted||options.signal?.aborted)abort();
   try{
     const r=await fetchImpl(url,{...options,signal:controller.signal});
     if(r?.status===429){retryAfterMs=Math.max(retryAfterMs,retryAfter(r.headers?.get?.("retry-after")));observe("RATE_LIMIT");}
     else if(!r?.ok)observe(r?.status===401||r?.status===403?"AUTH_REJECTED":"HTTP_ERROR");
     // Hold the in-flight reservation through body parsing; consume once.
     const envelope=await r.json();
     return {ok:r.ok,status:r.status,json:async()=>envelope};
   }catch(e){observe("READBACK_ERROR");throw err();}
   finally{inFlight--;signal?.removeEventListener("abort",abort);options.signal?.removeEventListener("abort",abort);}
 }
 return {fetchImpl:guarded,observe,report:()=>({requests,peak,retryAfterMs,
  codes:{...codes},stopped})};
}
const outcome=(report,stats)=>{
 if(report.codes.RATE_LIMIT)return "RATE_LIMIT";
 if(report.codes.AUTH_REJECTED)return "AUTH_REJECTED";
 if(report.stopped||stats.provider_wait)return "PROVIDER_ERROR";
 if(stats.retried||stats.failed||stats.lost_lease)return "PARTIAL";
 return stats.claimed?"OK":"IDLE";
};
function cooldown(code,failures,retryAfterMs){
 if(code==="OK"||code==="IDLE")return 0;
 const base=code==="RATE_LIMIT"||code==="AUTH_REJECTED"?60000:code==="PARTIAL"?1000:15000;
 const cap=code==="PARTIAL"?10000:900000;
 return Math.max(Math.min(cap,base*2**Math.min(failures-1,10)),retryAfterMs||0);
}
const stateSQL="SELECT *,not_before>clock_timestamp() AS cooling FROM public.us_saas_runtime_control WHERE singleton=true";
export async function runUsSaasRuntimeOnce({db,env=process.env,tick,logger=defaultLogger,
 fetchImpl=globalThis.fetch,monotonic=nowMono}={}){
 const gate=usSaasRuntimeGate(env);
 if(gate!=="READY")return {status:gate};
 if(!db||typeof db.connect!=="function")throw Error("US_SAAS_RUNTIME_DB_REQUIRED");
 const runTick=tick??(await import("../../../jobs/usSaasReconciliationTick.js")).runUsSaasReconciliationTick;
 let guard,started=monotonic(),failures=0,health=null;
 const stats={claimed:0,done:0,retried:0,failed:0,lost_lease:0,paid:0,revoked:0,wait:0,provider_wait:0};
 function observeResults(results){
   for(const x of results){
     if(x?.status==="PAID_VERIFIED")stats.paid++;
     else if(x?.status==="REVOKED")stats.revoked++;
     else {stats.wait++;if(["US_ODOO_BATCH_INCOMPLETE","US_ODOO_PAID_READBACK_UNAVAILABLE",
       "ODOO_READBACK_UNAVAILABLE","US_SAAS_BATCH_RECEIPT_STALE"].includes(x?.reason))stats.provider_wait++;}
   }
 }
 async function finish(client,code){
   const report=guard?.report()??{requests:0,peak:0,retryAfterMs:0,codes:{},stopped:false};
   const consecutive=code==="OK"||code==="IDLE"?0:Math.min(20,failures+1);
   const wait=cooldown(code,consecutive,report.retryAfterMs);
   // Persist outcome/backoff before a different replica can acquire the lock.
   const metrics={...stats,rpc:report.requests,peak:report.peak,provider_codes:report.codes,
      elapsed_ms:Math.max(0,Math.round(monotonic()-started)),cooldown_ms:wait};
   await client.query(`UPDATE public.us_saas_runtime_control SET
    not_before=clock_timestamp()+($1::double precision*interval '1 millisecond'),
    consecutive_failures=$2,last_finished_at=clock_timestamp(),last_outcome=$3,last_metrics=$4::jsonb
    WHERE singleton=true`,[wait,consecutive,code,JSON.stringify(metrics)]);
   safeLog(logger,"US_SAAS_RUNTIME_OUTCOME",{outcome:code,...metrics});
   // Failure of monitoring never becomes fabricated zero or healthy.
   try{health=await readUsSaasRuntimeHealth(client);safeLog(logger,"US_SAAS_RUNTIME_HEALTH",health);}
   catch{safeLog(logger,"US_SAAS_RUNTIME_MONITOR_UNAVAILABLE",{severity:"CRITICAL"});}
 }
 const lifecycle={
   async before(client,{signal}){
     const state=await client.query(stateSQL);
     if(state.rows.length!==1)throw Error("US_SAAS_RUNTIME_STATE_MISSING");
     failures=Number(state.rows[0].consecutive_failures);
     if(state.rows[0].cooling){
       try{health=await readUsSaasRuntimeHealth(client);safeLog(logger,"US_SAAS_RUNTIME_HEALTH",health);}
       catch{safeLog(logger,"US_SAAS_RUNTIME_MONITOR_UNAVAILABLE",{severity:"CRITICAL"});}
       return {status:"COOLDOWN"};
     }
     if(usSaasRuntimeGate(env)!=="READY")return {status:"HOLD"};
     // Crash guard survives process termination. No provider I/O until this
     // durable write succeeds. Existing job leases recover abandoned work.
     await client.query(`UPDATE public.us_saas_runtime_control SET
       not_before=clock_timestamp()+interval '60 seconds',last_started_at=clock_timestamp(),
       last_outcome='RUNNING' WHERE singleton=true`);
     started=monotonic();guard=createUsSaasProviderGuard({fetchImpl,signal,monotonic});
     return {status:"READY"};
   },
   observeResults,
   async after(client,result){
     for(const w of result.workers)for(const k of ["claimed","done","retried","failed","lost_lease"])stats[k]+=w[k]||0;
     await finish(client,outcome(guard.report(),stats));
   },
   async failed(client){await finish(client,"TICK_ERROR");},
 };
 try{
   const result=await runTick({db,env,limit:50,concurrency:4,lifecycle,
     reconcileBatch:opts=>reconcileUsSaasOpeningsBatch({...opts,
       readback:(requests,options)=>prepareUsPaidActivationEvidenceBatch(requests,{...options,
         createClient:o=>createUsOdooReadOnlyClient({...o,fetchImpl:guard.fetchImpl,observe:guard.observe})})})});
   return {...result,health};
 }catch{
   safeLog(logger,"US_SAAS_RUNTIME_TICK_ERROR",{severity:"CRITICAL"});
   return {status:"TICK_ERROR",health};
 }
}
// Recursive awaited timeout, never setInterval overlap. Stop prevents new
// work, lets the bounded in-flight tick settle; lease recovery on hard exit.
export function startUsSaasRuntime({db,env=process.env,logger=defaultLogger,
 runOnce=runUsSaasRuntimeOnce,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const gate=usSaasRuntimeGate(env);
 if(gate!=="READY"){safeLog(logger,"US_SAAS_RUNTIME_"+gate,{});return {status:gate,stop:async()=>{}};}
 let stopped=false,timer=null,active=null;
 function arm(ms){if(stopped)return;timer=setTimer(()=>{
   timer=null;active=step();
 },ms);timer?.unref?.();}
 async function step(){
   let next=1000;
   try{
     if(usSaasRuntimeGate(env)!=="READY"){stopped=true;return;}
     const r=await runOnce({db,env,logger});
     if(r.status==="HOLD"||r.status==="CONFIG_INVALID"){stopped=true;return;}
     if(r.status==="BUSY"||r.status==="COOLDOWN"||r.status==="TICK_ERROR"||
        !r.workers?.some(w=>w.claimed))next=5000;
   }catch{safeLog(logger,"US_SAAS_RUNTIME_TICK_ERROR",{severity:"CRITICAL"});next=5000;}
   finally{active=null;arm(next);}
 }
 arm(1000);
 return {status:"ARMED",stop:async()=>{stopped=true;if(timer!==null)clearTimer(timer);timer=null;await active;}};
}
