// Synthetic Odoo dataset. No customer data or network access.
import {setTimeout as delay} from "node:timers/promises";
const rel=id=>[id,"fixture"];
export const fixturePolicy={approved:true,version:"qa_v1",companyId:4,websiteId:5,
 productTemplateId:29,planId:6,currencyId:1,billingPeriodUnit:"month",billingPeriodValue:1,
 allowDeferredRevenuePeriod:true,paymentChannel:"manual",coveredOwnerTypes:["salon","master"]};
export function fixtureEnv(change={}){
 return {TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED:"true",TOTEM_US_ODOO_SAAS_ACCESS_ENABLED:"true",
 TOTEM_US_ODOO_SAAS_RECONCILIATION_ENABLED:"true",TOTEM_US_ODOO_SAAS_BATCH_READBACK_ENABLED:"true",
 TOTEM_US_ODOO_URL:"https://fixture.invalid",TOTEM_US_ODOO_DB:"fixture",
 TOTEM_US_ODOO_USER:"fixture",TOTEM_US_ODOO_API_KEY:"fixture-not-a-secret",
 TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON:JSON.stringify({...fixturePolicy,...change})};
}
export function fixtureData(n=1,at=new Date()){
 const clock=new Date(at),start=new Date(Date.UTC(clock.getUTCFullYear(),clock.getUTCMonth(),1)),
 end=new Date(Date.UTC(clock.getUTCFullYear(),clock.getUTCMonth()+1,0));
 const day=d=>d.toISOString().slice(0,10);
 const data={"sale.order":[],"sale.order.line":[],"sale.subscription.plan":[{id:6,company_id:rel(4),billing_period_unit:"month",billing_period_value:1}],
 "product.product":[{id:301,company_id:rel(4),product_tmpl_id:rel(29),recurring_invoice:true}],
 "account.move":[],"account.move.line":[],"account.payment":[],"payment.transaction":[]};
 const requests=[];
 for(let i=1;i<=n;i++){
  const partner=i+20000,order=i+30000,invoice=i+40000,line=i+50000,payment=i+60000,invline=i+70000;
  requests.push({id:i,owner_type:"salon",status:"activated",created_owner_id:i,created_auth_user_id:i+10000,
   source_namespace:"odoo_online",source_company_id:4,source_website_id:5,source_partner_id:partner,source_request_id:"fixture-"+i});
  data["sale.order"].push({id:order,company_id:rel(4),website_id:rel(5),partner_id:rel(partner),currency_id:rel(1),
   is_subscription:true,state:"sale",subscription_state:"3_progress",plan_id:rel(6),payment_exception:false,pending_transaction:false,
   order_line:[line],invoice_ids:[invoice],subscription_id:false,start_date:day(start),end_date:false,next_invoice_date:false});
  data["sale.order.line"].push({id:line,company_id:rel(4),order_id:rel(order),product_id:rel(301),recurring_invoice:true,price_unit:100});
  data["account.move"].push({id:invoice,company_id:rel(4),partner_id:rel(partner),currency_id:rel(1),move_type:"out_invoice",state:"posted",payment_state:"paid",
   amount_total:100,amount_residual:0,invoice_date:day(start),invoice_line_ids:[invline],payment_ids:[payment],reversal_move_ids:[],reversed_entry_id:false});
  data["account.move.line"].push({id:invline,move_id:rel(invoice),company_id:rel(4),product_id:rel(301),subscription_id:rel(order),
   sale_line_ids:[line],deferred_start_date:day(start),deferred_end_date:day(end),price_subtotal:100});
  data["account.payment"].push({id:payment,state:"paid",company_id:rel(4),partner_id:rel(partner),currency_id:rel(1),payment_type:"inbound",invoice_ids:[invoice]});
  data["payment.transaction"].push({id:i+80000,state:"done",company_id:rel(4),partner_id:rel(partner),currency_id:rel(1),invoice_ids:[invoice]});
 }
 return {data,requests};
}
const scalar=x=>Array.isArray(x)?x[0]:x;
function match(row,[field,op,value]){
 const x=row[field];
 if(op==="=")return scalar(x)===value;
 if(op===">")return x>value;
 if(op==="in")return field==="invoice_ids"?Array.isArray(x)&&x.some(y=>value.includes(y)):value.includes(scalar(x));
 throw Error("FIXTURE_UNKNOWN_OPERATOR");
}
// Test through the actual JSON-RPC client, including auth, ordering, limit and scope.
export function fixtureTransport(data,{latency=()=>0,mutate,afterRead}={}){
 const metrics={auth:0,reads:0,active:0,peak:0,models:{},domains:[]};
 const fetchImpl=async(url,opts)=>{
  if(url.origin!=="https://fixture.invalid")throw Error("FIXTURE_NETWORK_PROHIBITED");
  const p=JSON.parse(opts.body).params;metrics.active++;metrics.peak=Math.max(metrics.peak,metrics.active);
  try{
   if(p.service==="common"&&p.method==="authenticate"){
    metrics.auth++;const ms=latency("auth",metrics.auth);if(ms)await delay(ms);
    return {ok:true,json:async()=>({result:42})};
   }
   if(p.service!=="object"||p.method!=="execute_kw"||p.args[4]!=="search_read"||
     p.args[6].context.company_id!==4||p.args[6].context.allowed_company_ids.join(",")!=="4"||p.args[6].order!=="id asc")
      throw Error("FIXTURE_SCOPE_OR_ORDER_INVALID");
   const model=p.args[3],domain=p.args[5][0],{fields,limit}=p.args[6];
   metrics.reads++;metrics.models[model]=(metrics.models[model]||0)+1;
   metrics.domains.push({model,domain});
   const ms=latency(model,metrics.reads);if(ms)await delay(ms);
   let rows=(data[model]||[]).filter(r=>domain.every(d=>match(r,d))).sort((a,b)=>a.id-b.id).slice(0,limit)
     .map(r=>Object.fromEntries(fields.map(f=>[f,structuredClone(r[f]??false)])));
   if(mutate)rows=mutate({model,domain,rows,fields,limit,metrics});
   if(afterRead)await afterRead({model,domain,rows,metrics});
   return {ok:true,json:async()=>({result:rows})};
  }finally{metrics.active--;}
 };
 return {metrics,fetchImpl};
}
