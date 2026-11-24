import test from "node:test";
import assert from "node:assert/strict";
import {createUsOdooReadOnlyClient} from "../src/services/billing/usOdooReadOnlyClient.js";
import {prepareUsPaidActivationEvidence} from "../src/services/provision/usPaidOwnerOpeningGate.js";
import {prepareUsPaidActivationEvidenceBatch} from "../src/services/billing/usOdooBatchReadback.js";
import {fixtureData,fixtureEnv,fixtureTransport} from "./fixtures/g5-odoo-batch-fixture.mjs";
const NOW=new Date("2026-11-24T08:00:00Z");
const fixed=()=>new Date(NOW);
const opts=(transport,change={})=>({env:fixtureEnv(change),now:fixed,
 createClient:o=>createUsOdooReadOnlyClient({...o,fetchImpl:transport.fetchImpl})});
const strip=({batchObservedAtUtc,...x})=>x;
async function parity({n=3,change=()=>{},policy={}}={}){
 const f=fixtureData(n,NOW);change(f);const single=fixtureTransport(f.data),batch=fixtureTransport(f.data);
 const expected=await Promise.all(f.requests.map(r=>prepareUsPaidActivationEvidence(r,opts(single,policy))));
 const actual=await prepareUsPaidActivationEvidenceBatch(f.requests,opts(batch,policy));
 assert.deepEqual(actual.map(strip),expected);
 return {actual,expected,single:single.metrics,batch:batch.metrics};
}
test("50 owners manual paid proof identical; one auth and <=11 object reads",async()=>{
 const r=await parity({n:50});
 assert.ok(r.actual.every(x=>x.status==="PAID_VERIFIED"));
 assert.equal(r.single.auth,50);assert.equal(r.single.reads,500);
 assert.equal(r.batch.auth,1);assert.equal(r.batch.reads,10);assert.ok(r.batch.peak<=4);
 console.log("G5_T6F_RPC_REDUCTION",JSON.stringify({owners:50,single:r.single.reads+r.single.auth,batch:r.batch.reads+r.batch.auth}));
});
test("online paid proof parity including shared product and exact invoice linkage",async()=>{
 const r=await parity({n:12,policy:{paymentChannel:"online"}});
 assert.ok(r.actual.every(x=>x.status==="PAID_VERIFIED"));assert.equal(r.batch.reads,10);
});
for(const [name,change,policy] of [
 ["wrong company",f=>{f.data["sale.order"][0].company_id=[2,"foreign"]}],
 ["wrong website",f=>{f.data["sale.order"][0].website_id=[4,"foreign"]}],
 ["foreign invoice partner",f=>{f.data["account.move"][0].partner_id=[20002,"foreign"]}],
 ["wrong line",f=>{f.data["account.move.line"][0].subscription_id=[30002,"foreign"]}],
 ["cross owner payment",f=>{f.data["account.payment"][0].invoice_ids=[40002]}],
 ["partial payment",f=>{f.data["account.move"][0].payment_state="partial"}],
 ["refund relation",f=>{f.data["account.move"][0].reversal_move_ids=[99999]}],
 ["posted refund",f=>{f.data["account.move"].push({id:99999,company_id:[4,"fixture"],move_type:"out_refund",state:"posted",reversed_entry_id:[40001,"fixture"]})}],
 ["paused",f=>{f.data["sale.order"][0].subscription_state="4_paused"}],
 ["payment exception",f=>{f.data["sale.order"][0].payment_exception=true}],
 ["wrong plan",f=>{f.data["sale.order"][0].plan_id=[7,"foreign"]}],
 ["expired period",f=>{f.data["account.move.line"][0].deferred_start_date="2026-10-01";f.data["account.move.line"][0].deferred_end_date="2026-10-31";f.data["sale.order"][0].start_date="2026-10-01"}],
 ["ambiguous orders",f=>{f.data["sale.order"].push({...f.data["sale.order"][0],id:99999})}],
 ["missing invoice",f=>{f.data["account.move"].shift()}],
 ["missing line",f=>{f.data["account.move.line"].shift()}],
 ["unapproved policy",()=>{},{approved:false}],
 ["unapproved deferred period",()=>{},{allowDeferredRevenuePeriod:false}],
 ["unapproved role",f=>{f.requests[0].owner_type="master"},{coveredOwnerTypes:["salon"]}],
 ["zero service amount",f=>{f.data["account.move.line"][0].price_subtotal=0}],
 ["online foreign transaction",f=>{f.data["payment.transaction"][0].partner_id=[20002,"foreign"]},{paymentChannel:"online"}],
]){
 test("parity: "+name,async()=>{const r=await parity({change,policy});assert.equal(r.actual[0].status,"WAIT");});
}
test("renewal lineage stays tied to exact order and source",async()=>{
 const r=await parity({change:f=>{f.data["sale.order"][0].subscription_id=[10001,"parent"]}});
 assert.equal(r.actual[0].renewedFromOrderId,10001);
});
test("foreign Core source cannot trigger Odoo read",async()=>{
 const f=fixtureData(1,NOW);f.requests[0].source_company_id=2;
 const transport=fixtureTransport(f.data);
 const r=await prepareUsPaidActivationEvidenceBatch(f.requests,opts(transport));
 assert.equal(r[0].reason,"US_ODOO_TRUSTED_SOURCE_REQUIRED");assert.equal(transport.metrics.auth,0);
});
test("keyset pagination with 150 linked line records keeps per-owner proof",async()=>{
 const r=await parity({n:50,change:f=>{
  for(let i=0;i<50;i++)for(let j=0;j<2;j++){
   const orig=f.data["sale.order.line"][i],id=100000+i*2+j;
   f.data["sale.order.line"].push({...orig,id});
   f.data["sale.order"][i].order_line.push(id);
  }
 }});
 assert.ok(r.actual.every(x=>x.status==="PAID_VERIFIED"));
 assert.ok(r.batch.reads>10&&r.batch.reads<20);
});
test("duplicate, out-of-order, foreign or missing field results fail the whole batch",async()=>{
 for(const variant of ["duplicate","out-of-order","foreign","missing-field"]){
  const f=fixtureData(3,NOW);
  const t=fixtureTransport(f.data,{mutate:({model,rows})=>{
   if(model!=="sale.order"||rows.length<2)return rows;
   if(variant==="duplicate")return [rows[0],rows[0]];
   if(variant==="out-of-order")return [...rows].reverse();
   if(variant==="foreign")return [{...rows[0],partner_id:[999,"foreign"]},...rows.slice(1)];
   const {partner_id,...rest}=rows[0];return [rest,...rows.slice(1)];
  }});
  const r=await prepareUsPaidActivationEvidenceBatch(f.requests,opts(t));
  assert.ok(r.every(x=>x.reason==="US_ODOO_BATCH_INCOMPLETE"),variant);
 }
});
test("saturated per-owner transaction set cannot become evidence",async()=>{
 const f=fixtureData(2,NOW),orig=f.data["payment.transaction"][0];
 for(let i=0;i<99;i++)f.data["payment.transaction"].push({...orig,id:90000+i});
 const t=fixtureTransport(f.data),r=await prepareUsPaidActivationEvidenceBatch(f.requests,opts(t,{paymentChannel:"online"}));
 assert.ok(r.every(x=>x.reason==="US_ODOO_BATCH_INCOMPLETE"));
});
test("provider failure stops the batch and does not grant or definitively revoke",async()=>{
 const f=fixtureData(4,NOW),t=fixtureTransport(f.data,{mutate:({model,rows})=>{
  if(model==="account.move")throw Error("SECRET_PROVIDER_ERROR");return rows;
 }});
 const r=await prepareUsPaidActivationEvidenceBatch(f.requests,opts(t));
 assert.ok(r.every(x=>x.reason==="US_ODOO_BATCH_INCOMPLETE"));
 assert.ok(!JSON.stringify(r).includes("SECRET"));
});
test("batch freshness uses earliest time and hard deadline",async()=>{
 const f=fixtureData(2,NOW),t=fixtureTransport(f.data);
 let elapsed=0;
 const r=await prepareUsPaidActivationEvidenceBatch(f.requests,{...opts(t),now:()=>new Date(+NOW+elapsed++*100)});
 assert.ok(r.every(x=>x.verifiedAtUtc===NOW.toISOString()&&x.batchObservedAtUtc===NOW.toISOString()));
 let n=0;const late=await prepareUsPaidActivationEvidenceBatch(f.requests,{...opts(t),monotonic:()=>n++*10000});
 assert.ok(late.every(x=>x.reason==="US_ODOO_BATCH_INCOMPLETE"));
});
test("HOLD never instantiates a provider; batch size enforced",async()=>{
 const f=fixtureData(2,NOW);
 const r=await prepareUsPaidActivationEvidenceBatch(f.requests,{env:{},now:fixed,createClient:()=>{throw Error("MUST_NOT_CALL")}});
 assert.ok(r.every(x=>x.reason==="US_ODOO_SAAS_ACTIVATION_HOLD"));
 await assert.rejects(()=>prepareUsPaidActivationEvidenceBatch([]),/BATCH_SIZE_INVALID/);
 await assert.rejects(()=>prepareUsPaidActivationEvidenceBatch(fixtureData(51,NOW).requests),/BATCH_SIZE_INVALID/);
});

function addSecondInvoice(f,{refund=false,old=false}={}){
 const invoice={...f.data["account.move"][0],id:90001,invoice_line_ids:[90002],payment_ids:[90003],
 reversal_move_ids:refund?[90004]:[]};
 const line={...f.data["account.move.line"][0],id:90002,move_id:[90001,"fixture"]};
 if(old){line.deferred_start_date="2026-10-01";line.deferred_end_date="2026-10-31";f.data["sale.order"][0].start_date="2026-10-01";}
 f.data["account.move"].push(invoice);f.data["account.move.line"].push(line);
 f.data["account.payment"].push({...f.data["account.payment"][0],id:90003,invoice_ids:[90001]});
 f.data["sale.order"][0].invoice_ids.push(90001);
}
test("all linked invoices are checked: later reversal cannot be hidden by earlier paid proof",async()=>{
 const r=await parity({change:f=>addSecondInvoice(f,{refund:true})});
 assert.equal(r.actual[0].reason,"ODOO_INVOICE_REVERSED");
});
test("multiple current invoices are ambiguous, older valid invoice can coexist",async()=>{
 const a=await parity({change:f=>addSecondInvoice(f)});
 assert.equal(a.actual[0].reason,"ODOO_MULTIPLE_CURRENT_PAID_INVOICES");
 const b=await parity({change:f=>addSecondInvoice(f,{old:true})});
 assert.equal(b.actual[0].status,"PAID_VERIFIED");assert.equal(b.actual[0].invoiceId,40001);
});

test("authentication happens before observation, not counted as billing data freshness",async()=>{
 const f=fixtureData(2,NOW),t=fixtureTransport(f.data);
 let clock=0;
 const result=await prepareUsPaidActivationEvidenceBatch(f.requests,{...opts(t),monotonic:()=>clock,
  createClient:o=>{
   const c=createUsOdooReadOnlyClient({...o,fetchImpl:t.fetchImpl});
   return {...c,authenticate:async()=>{clock+=7275;return c.authenticate();}};
  }});
 assert.ok(result.every(x=>x.status==="PAID_VERIFIED"));
});
test("three paid invoice periods per owner coalesce into bounded independent groups",async()=>{
 const r=await parity({n:50,change:f=>{
   for(let i=0;i<50;i++){
     for(let j=1;j<=2;j++){
       const inv=100000+i*10+j,ln=200000+i*10+j,pay=300000+i*10+j;
       const start=j===1?"2026-10-01":"2026-09-01",end=j===1?"2026-10-31":"2026-09-30";
       f.data["sale.order"][i].start_date="2026-09-01";f.data["sale.order"][i].invoice_ids.push(inv);
       f.data["account.move"].push({...f.data["account.move"][i],id:inv,invoice_line_ids:[ln],payment_ids:[pay]});
       f.data["account.move.line"].push({...f.data["account.move.line"][i],id:ln,move_id:[inv,"fixture"],deferred_start_date:start,deferred_end_date:end});
       f.data["account.payment"].push({...f.data["account.payment"][i],id:pay,invoice_ids:[inv]});
     }
   }
 }});
 assert.ok(r.actual.every(x=>x.status==="PAID_VERIFIED"));
 assert.ok(r.batch.reads<=15,JSON.stringify(r.batch.models));assert.ok(r.batch.peak<=4);
 console.log("G5_T6F_HISTORY_RPC",JSON.stringify({owners:50,invoices:150,single:r.single.reads+r.single.auth,batch:r.batch.reads+r.batch.auth,peak:r.batch.peak}));
});
