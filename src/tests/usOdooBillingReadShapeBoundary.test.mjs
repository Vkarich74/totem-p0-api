import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../services/billing/usOdooReadOnlyClient.js",import.meta.url),"utf8");
const verifier=readFileSync(new URL("../services/billing/usOdooPaidEntitlement.js",import.meta.url),"utf8");
const gate=readFileSync(new URL("../services/provision/usPaidOwnerOpeningGate.js",import.meta.url),"utf8");
async function graph(){
 const m=new vm.SourceTextModule(source,{context:vm.createContext({URL,AbortController,setTimeout,clearTimeout})});
 await m.link(()=>{throw Error("unexpected import")});await m.evaluate();return m.namespace;
}
const fs=s=>s.split(" "),single=[["id","=",501]],set=[["id","in",[501,502]]];
const shapes=[
 ["R01","sale.order",[["company_id","=",4],["website_id","=",5],["partner_id","=",501],["is_subscription","=",true],["subscription_state","=","3_progress"],["plan_id","=",6]],["id"],100],
 ["R02","sale.order",single,fs("id company_id website_id partner_id subscription_id"),2],
 ["R03","sale.order",single,fs("id company_id website_id partner_id currency_id is_subscription state subscription_state plan_id order_line invoice_ids payment_exception pending_transaction subscription_id start_date end_date next_invoice_date"),2],
 ["R04","sale.subscription.plan",[["id","=",6]],fs("id company_id billing_period_unit billing_period_value"),2],
 ["R05","sale.order.line",set,fs("id company_id order_id product_id recurring_invoice price_unit price_subtotal discount product_uom_qty product_uom_id currency_id"),100],
 ["R06","product.product",set,fs("id company_id product_tmpl_id recurring_invoice"),100],
 ["R07","account.move",set,fs("id company_id partner_id currency_id move_type state payment_state amount_total amount_residual invoice_date invoice_line_ids payment_ids reversal_move_ids"),100],
 ["R08","account.move",[["reversed_entry_id","=",501],["move_type","=","out_refund"],["state","=","posted"],["company_id","=",4]],fs("id company_id reversed_entry_id state"),100],
 ["R09","account.move.line",set,fs("id move_id company_id product_id subscription_id sale_line_ids deferred_start_date deferred_end_date price_subtotal price_unit discount quantity product_uom_id currency_id"),100],
 ["R10","account.payment",set,fs("id state company_id partner_id currency_id payment_type invoice_ids amount"),100],
 ["R11","payment.transaction",[["invoice_ids","in",[501]]],fs("id state company_id partner_id currency_id invoice_ids amount operation source_transaction_id child_transaction_ids"),100],
];
const deny=/US_ODOO_BILLING_READ_SHAPE_DENIED/;
test("eleven exact current query shapes accepted by validator",async()=>{
 const m=await graph();
 for(const [id,model,domain,fields,limit] of shapes){
  const result=m.validateUsOdooBillingReadShape(model,domain,fields,limit);
  assert.equal(result.shapeId,id);
  assert.equal(JSON.stringify([result.model,result.domain,result.fields,result.limit]),JSON.stringify([model,domain,fields,limit]));
 }
});
test("every shape denies added/removed fields, extra clauses, operators, wrong limits and models",async()=>{
 const m=await graph(),f=m.validateUsOdooBillingReadShape;
 for(const [id,model,domain,fields,limit] of shapes){
  for(const args of [[model,domain,[...fields,"display_name"],limit],[model,domain,fields.slice(1),limit],[model,[...domain,["id","=",7]],fields,limit],[model,[],fields,limit],[model,["|",...domain],fields,limit],[model,domain,fields,limit===2?100:2],["res.partner",domain,fields,limit]]){
   assert.throws(()=>f(...args),deny,id);
  }
  const changed=structuredClone(domain);changed[0][1]="!=";
  assert.throws(()=>f(model,changed,fields,limit),deny,id);
 }
});
test("rejects malformed, duplicate, oversized and coerced IDs; fixed constants and retired reads",async()=>{
 const m=await graph(),f=m.validateUsOdooBillingReadShape;
 const [,model,domain,fields,limit]=shapes[4];
 for(const v of [[],[0],[-1],[1.1],[true],["501"],[NaN],[Infinity],[501,501],Array(101).fill(501),Array(1),[Number.MAX_SAFE_INTEGER+1]])assert.throws(()=>f(model,[["id","in",v]],fields,limit),deny);
 const [,m1,d1,f1,l1]=shapes[0];
 for(const [idx,val] of [[0,2],[1,1],[2,"501"],[3,1],[4,"4_paused"],[5,7]]){const d=structuredClone(d1);d[idx][2]=val;assert.throws(()=>f(m1,d,f1,l1),deny);}
 assert.throws(()=>f("sale.subscription.plan",[["id","=",7]],shapes[3][3],2),deny);
 assert.throws(()=>f("payment.transaction",[["invoice_ids","in",[501,502]]],shapes[10][3],100),deny);
 assert.throws(()=>f("account.move",single,fs("id company_id partner_id reversed_entry_id state"),2),deny);
});
test("query arrays are snapshotted, accessor and sparse arrays rejected",async()=>{
 const m=await graph(),f=m.validateUsOdooBillingReadShape;
 const [,model,domain,fields,limit]=shapes[4];
 const d=structuredClone(domain),ff=[...fields],r=f(model,d,ff,limit);
 d[0][2][0]=999;ff[0]="name";
 assert.equal(r.domain[0][2][0],501);assert.equal(r.fields[0],"id");
 const malicious=[...fields];Object.defineProperty(malicious,"0",{get(){throw Error("getter executed")}});
 assert.throws(()=>f(model,domain,malicious,limit),deny);
 const sparse=[...fields];delete sparse[0];assert.throws(()=>f(model,domain,sparse,limit),deny);
});
test("actual current caller field sequences covered; Billing check precedes transport; S01 remains closed",async()=>{
 const m=await graph();
 const literals=s=>s.match(/"[^"]+"/g)?.map(v=>JSON.parse(v))??[];
 // Compare exact field-list literals actually present at call sites.
 const lists=[...verifier.matchAll(/\[([^\[\]]+)\]/g),...gate.matchAll(/\[([^\[\]]+)\]/g)].map(x=>literals(x[1]));
 for(const [id,, ,fields] of shapes)assert.ok(lists.some(x=>JSON.stringify(x)===JSON.stringify(fields)),id);
 assert.match(source,/const q=validateUsOdooBillingReadShape\(model,domain,fields,limit\);\s*return c\.searchRead\(q\.model,q\.domain,q\.fields,q\.limit\)/);
 let calls=0;
 assert.throws(()=>m.createUsOdooReadOnlyClient({fetchImpl:()=>{calls++}}),/US_ODOO_BILLING_READER_APPROVAL_HOLD/);
 assert.equal(calls,0);
});
