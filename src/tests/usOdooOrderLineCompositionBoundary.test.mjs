// Offline characterization of the existing verifier. Synthetic data only.
// No transport, database, account, or payment operations.
import {readFileSync} from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const source=readFileSync(new URL("../services/billing/usOdooPaidEntitlement.js",import.meta.url),"utf8");
const m=new vm.SourceTextModule(source,{context:vm.createContext({})});
await m.link(()=>{throw Error("unexpected import")});await m.evaluate();
const policy={approved:true,version:"offline-fixture",companyId:4,websiteId:5,planId:6,productTemplateId:29,currencyId:1,billingPeriodUnit:"month",billingPeriodValue:1,paymentChannel:"manual",allowDeferredRevenuePeriod:true,periodSource:"odoo_invoice_line_service_dates_v2"};
const order={id:601,company_id:4,website_id:5,partner_id:501,currency_id:1,is_subscription:true,state:"sale",subscription_state:"3_progress",plan_id:6,order_line:[701],invoice_ids:[901],payment_exception:false,pending_transaction:false,start_date:"2026-11-01"};
const line={id:701,company_id:4,order_id:601,product_id:801,recurring_invoice:true,price_unit:1,price_subtotal:1,discount:0,product_uom_qty:1,product_uom_id:1,currency_id:1};
const variant={id:801,company_id:4,product_tmpl_id:29,recurring_invoice:true};
const invoice={id:901,company_id:4,partner_id:501,currency_id:1,move_type:"out_invoice",state:"posted",payment_state:"paid",amount_total:1,amount_residual:0,invoice_line_ids:[1001],payment_ids:[1101],reversal_move_ids:[]};
const invoiceLine={id:1001,move_id:901,company_id:4,product_id:801,subscription_id:601,sale_line_ids:[701],deferred_start_date:"2026-11-01",deferred_end_date:"2026-11-30",price_subtotal:1,price_unit:1,discount:0,quantity:1,product_uom_id:1,currency_id:1};
const payment={id:1101,state:"paid",company_id:4,partner_id:501,currency_id:1,payment_type:"inbound",invoice_ids:[901],amount:1};

async function verify(lines){
 const reads=[];
 const client={async searchRead(model,domain,fields){
   reads.push(model);
   switch(model){
    case "sale.order":return [{...order,order_line:lines.map(l=>l.id)}];
    case "sale.subscription.plan":return [{id:6,company_id:4,billing_period_unit:"month",billing_period_value:1}];
    case "sale.order.line":return lines;
    case "product.product":return [variant];
    case "account.move":return fields.includes("reversed_entry_id")?[]:[invoice];
    case "account.move.line":return [invoiceLine];
    case "account.payment":return [payment];
    default:throw Error("unexpected read");
   }
 }};
 const result=await m.namespace.verifyUsOdooPaidEntitlement({client,sourcePartnerId:501,subscriptionOrderId:601,policy,now:"2026-11-15T00:00:00Z"});
 return {result,reads};
}
const cases=[
 ["unrelated_nonrecurring",[line,{...line,id:702,recurring_invoice:false,product_id:802}],"ODOO_ORDER_COMPOSITION_UNSUPPORTED"],
 ["foreign_company",[line,{...line,id:703,company_id:2}],"ODOO_ORDER_LINE_SCOPE_MISMATCH"],
 ["wrong_parent",[line,{...line,id:704,order_id:602}],"ODOO_ORDER_LINE_SCOPE_MISMATCH"],
 ["wrong_currency",[{...line,currency_id:2}],"ODOO_ORDER_LINE_SCOPE_MISMATCH"],
 ["two_recurring",[line,{...line,id:705}],"ODOO_ORDER_COMPOSITION_UNSUPPORTED"],
 ["sole_nonrecurring",[{...line,recurring_invoice:false}],"ODOO_SUBSCRIPTION_PRODUCT_UNVERIFIED"],
 ["zero_price",[{...line,price_unit:0,price_subtotal:0}],"ODOO_SUBSCRIPTION_PRODUCT_UNVERIFIED"],
 ["invalid_quantity",[{...line,product_uom_qty:0}],"ODOO_ORDER_COMPOSITION_UNSUPPORTED"],
 ["infinite_quantity",[{...line,product_uom_qty:Infinity}],"ODOO_ORDER_COMPOSITION_UNSUPPORTED"],
 ["invalid_uom",[{...line,product_uom_id:false}],"ODOO_ORDER_COMPOSITION_UNSUPPORTED"],
 ["invalid_discount",[{...line,discount:100}],"ODOO_ORDER_COMPOSITION_UNSUPPORTED"],
 ["duplicate_ids",[line,line],"ODOO_ORDER_LINES_MISSING"]
];
const results=[];
for(const [name,lines,reason] of cases){
 const {result,reads}=await verify(lines);
 assert.equal(result.status,"WAIT",name);
 assert.equal(result.canActivate,false,name);
 assert.equal(result.reason,reason,name);
 assert.ok(!reads.includes("product.product")&&!reads.includes("account.move"),name);
 results.push({name,status:"PASS",reason,downstream_reads:0});
}
const control=await verify([line]);
assert.equal(control.result.status,"PAID_VERIFIED");
results.push({name:"single_line_control",status:"PASS",synthetic_only:true});
console.log(JSON.stringify({status:"PASS_LOCAL_V05",checks:results,count:results.length,actual_odoo_calls:0,financial_operations:0},null,2));
