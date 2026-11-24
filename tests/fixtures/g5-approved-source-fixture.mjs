// Only synthetic approved source. No network, credentials or customer data.
const rel=id=>[id,"fixture"];
export function sourceFixture(){
 const lead={id:9001,active:true,type:"lead",company_id:rel(4),team_id:rel(8),stage_id:rel(82),
 partner_id:rel(20001),x_totem_us_source_partner_id:rel(20001),
 x_totem_us_source_key:"odoo-us-partner-20001",x_totem_us_source_marker:"totem_us_portal_approved_v1",
 x_totem_us_owner_type:"salon",x_totem_us_website_id:5,x_totem_us_slug_requested:"fixture-salon",
 x_totem_us_state_code:"NY",x_totem_us_postal_code:"10001",email_from:"fixture@example.invalid",
 phone:"+12125550123",street:"100 Fixture St",city:"New York",state_id:rel(33),zip:"10001",
 write_date:"2026-11-23 10:01:00"};
 const partner={id:20001,active:true,company_id:rel(4),website_id:rel(5),
 email:"fixture@example.invalid",name:"Fixture Owner",write_date:"2026-11-23 10:00:00",
 x_totem_us_profile_status:"approved",x_totem_us_account_kind:"salon",x_totem_us_master_entry_mode:false,
 x_totem_us_business_name:"Fixture Salon",x_totem_us_business_phone:"+12125550123",
 x_totem_us_business_street:"100 Fixture St",x_totem_us_business_city:"New York",
 x_totem_us_business_state_id:rel(33),x_totem_us_business_zip:"10001",
 x_totem_us_business_slug:"fixture-salon",x_totem_us_business_description:"fixture"};
 const state={id:33,country_id:rel(233),code:"NY"};
 return {lead,partner,state};
}
export function sourceEnv(){
 return {TOTEM_US_ODOO_INTAKE_ENABLED:"true",TOTEM_US_ODOO_INTAKE_RELEASE_APPROVED:"true",
 TOTEM_US_ADMIN_MANUAL_ACTIVATION:"true",ODOO_BRIDGE_TOKEN:"fixture-bridge-not-real",
 TOTEM_US_ODOO_URL:"https://totem-platform.odoo.com",TOTEM_US_ODOO_DB:"totem-platform",
 TOTEM_US_ODOO_USER:"fixture",TOTEM_US_ODOO_API_KEY:"fixture-not-real"};
}
export const sourceHint={_model:"crm.lead",_id:9001,market_code:"US"};
export const sourceHeaders={"x-odoo-bridge-token":"fixture-bridge-not-real"};
export function sourceTransport(f=sourceFixture(),{change}={}){
 const metrics={auth:0,reads:0,models:[]};
 const fetchImpl=async(url,options)=>{
  if(url.origin!=="https://totem-platform.odoo.com"||url.pathname!=="/jsonrpc")throw Error("FIXTURE_NETWORK_PROHIBITED");
  const p=JSON.parse(options.body).params;
  if(p.service==="common"&&p.method==="authenticate"){metrics.auth++;return {ok:true,json:async()=>({result:42})};}
  const args=p.args,model=args[3],domain=args[5][0],kw=args[6];
  if(p.service!=="object"||p.method!=="execute_kw"||args[4]!=="search_read"||
   kw.context.company_id!==4||kw.context.allowed_company_ids.join(",")!=="4"||
   kw.context.active_test!==false||kw.limit!==2||kw.order!=="id asc")throw Error("FIXTURE_SCOPE");
  if(!["crm.lead","res.partner","res.country.state"].includes(model))throw Error("FIXTURE_MODEL");
  if(model==="crm.lead"&&(!domain.some(d=>d.join(",")==="company_id,=,4")||!domain.some(d=>d.join(",")==="team_id,=,8")))throw Error("FIXTURE_CRM_SCOPE");
  if(model==="res.partner"&&(!domain.some(d=>d.join(",")==="company_id,=,4")||!domain.some(d=>d.join(",")==="website_id,=,5")))throw Error("FIXTURE_PARTNER_SCOPE");
  if(model==="res.country.state"&&!domain.some(d=>d.join(",")==="country_id,=,233"))throw Error("FIXTURE_COUNTRY_SCOPE");
  metrics.reads++;metrics.models.push(model);
  let rows=[model==="crm.lead"?f.lead:model==="res.partner"?f.partner:f.state]
   .filter(r=>domain.every(([key,op,v])=>op==="="&&(Array.isArray(r[key])?r[key][0]:r[key])===v))
   .map(r=>Object.fromEntries(kw.fields.map(k=>[k,structuredClone(r[k]??false)])));
  if(change)rows=change({model,domain,rows,metrics,fields:kw.fields});
  return {ok:true,json:async()=>({result:rows})};
 };
 return {fetchImpl,metrics};
}
