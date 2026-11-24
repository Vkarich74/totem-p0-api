// G5 T6-F: coalesce only the canonical paid verifier's exact search_read shapes.
// All data is ephemeral within one batch. No provider writes, no cross-batch cache.
import {createUsOdooReadOnlyClient} from "./usOdooReadOnlyClient.js";
import {prepareUsPaidActivationEvidence} from "../provision/usPaidOwnerOpeningGate.js";
import {performance} from "node:perf_hooks";

export const US_ODOO_BATCH_MAX=50;
const PAGE=100, MAX_PAGES=20, MAX_RPC=80, MAX_MS=8000;
const wait=reason=>Object.freeze({status:"WAIT",canActivate:false,reason});
const num=x=>Array.isArray(x)?x[0]:x;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const fail=()=>Error("US_ODOO_BATCH_INCOMPLETE");
const specs=new Map([
 ["sale.order:partner_id",["company_id","website_id","is_subscription","subscription_state","plan_id"]],
 ["sale.order:id",[]],["sale.subscription.plan:id",[]],
 ["sale.order.line:id",[]],["product.product:id",[]],["account.move:id",[]],
 ["account.move:reversed_entry_id",["move_type","state","company_id"]],
 ["account.move.line:id",[]],["account.payment:id",[]],["payment.transaction:invoice_ids",[]],
]);
const allowedFields=new Map(Object.entries({
 "sale.order":"id company_id website_id partner_id currency_id is_subscription state subscription_state plan_id order_line invoice_ids payment_exception pending_transaction subscription_id start_date end_date next_invoice_date",
 "sale.subscription.plan":"id company_id billing_period_unit billing_period_value",
 "sale.order.line":"id company_id order_id product_id recurring_invoice price_unit",
 "product.product":"id company_id product_tmpl_id recurring_invoice",
 "account.move":"id company_id partner_id currency_id move_type state payment_state amount_total amount_residual invoice_date invoice_line_ids payment_ids reversal_move_ids reversed_entry_id",
 "account.move.line":"id move_id company_id product_id subscription_id sale_line_ids deferred_start_date deferred_end_date price_subtotal",
 "account.payment":"id state company_id partner_id currency_id payment_type invoice_ids",
 "payment.transaction":"id state company_id partner_id currency_id invoice_ids",
}).map(([m,s])=>[m,new Set(s.split(" "))]));
function shape(model,domain,fields,limit){
 if(!Array.isArray(domain)||!Array.isArray(fields)||!fields.includes("id")||
    !fields.every(f=>allowedFields.get(model)?.has(f))||
    !Number.isInteger(limit)||limit<1||limit>PAGE)throw fail();
 const varying=domain.filter(x=>Array.isArray(x)&&["id","partner_id","reversed_entry_id","invoice_ids"].includes(x[0]));
 if(varying.length!==1)throw fail();
 const [field,op,value]=varying[0],fixed=domain.filter(x=>x!==varying[0]);
 const required=specs.get(model+":"+field);
 if(!required||fixed.length!==required.length||
    !required.every(f=>fixed.filter(x=>x[0]===f&&x[1]==="=").length===1))throw fail();
 if(field==="partner_id"&&(!fixed.some(x=>x[0]==="company_id"&&x[2]===4)||
   !fixed.some(x=>x[0]==="website_id"&&x[2]===5)||
   !fixed.some(x=>x[0]==="is_subscription"&&x[2]===true)||
   !fixed.some(x=>x[0]==="subscription_state"&&x[2]==="3_progress")||
   !fixed.some(x=>x[0]==="plan_id"&&positive(x[2]))))throw fail();
 if(field==="reversed_entry_id"&&(!fixed.some(x=>x[0]==="company_id"&&x[2]===4)||
   !fixed.some(x=>x[0]==="move_type"&&x[2]==="out_refund")||
   !fixed.some(x=>x[0]==="state"&&x[2]==="posted")))throw fail();
 if(!["=","in"].includes(op))throw fail();
 const ids=op==="="? [value]:value;
 if(!Array.isArray(ids)||!ids.length||ids.length>PAGE||!ids.every(positive))throw fail();
 // Include filter fields for response validation, strip them before replay.
 const expanded=[...new Set([...fields,field,...fixed.map(x=>x[0])])];
 if(!expanded.every(f=>allowedFields.get(model)?.has(f)||model==="account.move"&&f==="reversed_entry_id"))throw fail();
 return {model,field,fixed,ids:new Set(ids),fields,expanded,limit,
   key:JSON.stringify([model,field,fixed,expanded])};
}
function matches(row,field,ids){
 if(field==="invoice_ids"){
   if(row[field]===false)return false;
   if(!Array.isArray(row[field])||!row[field].every(positive))throw fail();
   return row[field].some(x=>ids.has(x));
 }
 return ids.has(num(row[field]));
}
function makeCoalescer(client,started,clock){
 let pending=[],scheduled=false,broken=false,rpc=0;
 const check=()=>{if(broken||clock()-started>MAX_MS)throw fail();};
 async function flush(){
   scheduled=false;const items=pending;pending=[];
   const groups=new Map();
   for(const item of items){const g=groups.get(item.key)||[];g.push(item);groups.set(item.key,g);}
   try{
     const outputs=[];
     // Serial groups; one provider request in flight, no unbounded parallel fanout.
     for(const group of groups.values()){
       const sample=group[0],allIds=[...new Set(group.flatMap(x=>[...x.ids]))].sort((a,b)=>a-b);
       const collected=new Map();
       for(let offset=0;offset<allIds.length;offset+=PAGE){
         const ids=allIds.slice(offset,offset+PAGE),set=new Set(ids);
         let cursor=0,complete=false;
         for(let page=0;page<MAX_PAGES;page++){
           check();if(++rpc>MAX_RPC)throw fail();
           const domain=[[sample.field,"in",ids],...sample.fixed,["id",">",cursor]];
           const rows=await client.searchRead(sample.model,domain,sample.expanded,PAGE);
           check();
           if(!Array.isArray(rows)||rows.length>PAGE)throw fail();
           for(const row of rows){
             if(!row||!positive(row.id)||row.id<=cursor||
                !sample.expanded.every(f=>Object.hasOwn(row,f))||
                !matches(row,sample.field,set)||
                !sample.fixed.every(([f,,v])=>num(row[f])===v))throw fail();
             cursor=row.id;
             const old=collected.get(row.id);
             if(old&&JSON.stringify(old)!==JSON.stringify(row))throw fail();
             collected.set(row.id,row);
           }
           if(rows.length<PAGE){complete=true;break;}
         }
         if(!complete)throw fail();
       }
       const rows=[...collected.values()].sort((a,b)=>a.id-b.id);
       for(const item of group){
         const exact=rows.filter(row=>matches(row,item.field,item.ids));
         // Match the original single-read limit, except a saturated result is
         // uncertain and never a paid proof or a definitive revoke.
         if(exact.length>=item.limit&&item.limit===PAGE)throw fail();
         outputs.push([item,exact.slice(0,item.limit).map(row=>
           Object.fromEntries(item.fields.map(f=>[f,structuredClone(row[f])])))]);
       }
     }
     check();
     for(const [item,result] of outputs)item.resolve(result);
   }catch{
     broken=true;for(const item of items)item.reject(fail());
     for(const item of pending)item.reject(fail());pending=[];
   }
 }
 return {
   searchRead(model,domain,fields,limit=PAGE){
     try{check();const s=shape(model,domain,fields,limit);
       return new Promise((resolve,reject)=>{
         pending.push({...s,resolve,reject});
         if(!scheduled){scheduled=true;setImmediate(flush);}
       });
     }catch(e){broken=true;return Promise.reject(e);}
   },
   healthy(){return !broken&&clock()-started<=MAX_MS;},
 };
}
export async function prepareUsPaidActivationEvidenceBatch(requests,{
 env=process.env,createClient=createUsOdooReadOnlyClient,now=()=>new Date(),
 monotonic=()=>performance.now(),
}={}){
 if(!Array.isArray(requests)||requests.length<1||requests.length>US_ODOO_BATCH_MAX)
   throw Error("US_ODOO_BATCH_SIZE_INVALID");
 // Snapshot configuration so a single batch cannot mix commercial policies.
 const config={...env};const start=new Date(now()),started=monotonic();
 if(!Number.isFinite(start.getTime()))return requests.map(()=>wait("US_ODOO_CLOCK_INVALID"));
 let coalescer=null;
 const factory=options=>{
   if(!coalescer)coalescer=makeCoalescer(createClient(options),started,monotonic);
   return coalescer;
 };
 const results=await Promise.all(requests.map(request=>prepareUsPaidActivationEvidence(request,{
   env:config,createClient:factory,now,
 })));
 if(coalescer&&!coalescer.healthy())return requests.map(()=>wait("US_ODOO_BATCH_INCOMPLETE"));
 const end=new Date(now());
 if(!Number.isFinite(end.getTime())||end<start||end-start>MAX_MS)
   return requests.map(()=>wait("US_ODOO_BATCH_INCOMPLETE"));
 // Oldest possible observation, NOT time at end of the batch. Retain the
 // existing 10-second receipt bound at commit and the 300-second access TTL.
 return results.map(r=>Object.freeze({...r,
   ...(r.status==="PAID_VERIFIED"?{verifiedAtUtc:start.toISOString()}:{}),
   batchObservedAtUtc:start.toISOString(),
 }));
}
