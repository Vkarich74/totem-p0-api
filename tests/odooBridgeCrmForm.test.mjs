import test from "node:test";
import assert from "node:assert/strict";
import { mapOdooBridgeCrmForm } from "../src/services/odooBridgeCrmForm.js";
function event(role = "salon", extra = "") {
  return {_model:"crm.lead", _id:12345, company_id:1, team_id:7, stage_id:80, name:"Example", email_from:"OWNER@example.invalid", phone:"+996555123456", city:"Bishkek", street:"Example street", description:`<p>Service description<br/>Other Information:<br/>___________<br/><br/>owner_type : ${role}<br/>work_mode : independent<br/>bridge_source : totem_bridge_v1<br/>market_code : KG<br/>${extra}</p>`};
}
test("salon maps fields and clears master-specific values",()=>{
 const result=mapOdooBridgeCrmForm(event("salon"));
 assert.equal(result.payload.owner_type,"salon"); assert.equal(result.payload.name,"Example");
 assert.equal(result.payload.email,"owner@example.invalid"); assert.equal(result.payload.address,"Example street");
 assert.equal(result.payload.market_code,"KG"); assert.equal(result.payload.work_mode,null);
 assert.equal(result.payload.description,"Service description");
});
test("master independent and attached modes are retained",()=>{
 assert.equal(mapOdooBridgeCrmForm(event("master")).payload.work_mode,"independent");
 const e=event("master","salon_slug : salon-example");
 e.description=e.description.replace("work_mode : independent","work_mode : attached_to_salon");
 assert.equal(mapOdooBridgeCrmForm(e).payload.salon_slug,"salon-example");
});
test("role is explicit and cannot silently become master",()=>{
 const e=event(); e.description=e.description.replace("owner_type : salon","owner_type : ");
 assert.equal(mapOdooBridgeCrmForm(e).error.code,"ODOO_BRIDGE_FORM_OWNER_TYPE_REQUIRED");
});
test("rejects other company, team, stage, model and marker",()=>{
 for(const [key,value] of [["company_id",2],["team_id",5],["stage_id",54],["_model","res.partner"]]){
  const e=event();e[key]=value; assert.ok(mapOdooBridgeCrmForm(e).error);
 }
 const e=event();e.description=e.description.replace("totem_bridge_v1","unknown");assert.ok(mapOdooBridgeCrmForm(e).error);
});
test("supports RPC relation tuples and stable retry ID",()=>{
 const e=event();for(const k of ["company_id","team_id","stage_id"])e[k]=[e[k],"label"];
 assert.equal(mapOdooBridgeCrmForm(e).payload.odoo_request_id,"odoo-crm-lead-12345");
 assert.deepEqual(mapOdooBridgeCrmForm(e),mapOdooBridgeCrmForm(e));
});
test("rejects duplicate metadata, missing metadata, incomplete attachment and unsupported market",()=>{
 assert.equal(mapOdooBridgeCrmForm(event("salon","owner_type : master")).error.code,"ODOO_BRIDGE_FORM_METADATA_DUPLICATE");
 const e=event("master");e.description=e.description.replace("work_mode : independent","work_mode : attached_to_salon");assert.ok(mapOdooBridgeCrmForm(e).error);
 const m=event();m.description=m.description.replace("market_code : KG","market_code : MX");assert.ok(mapOdooBridgeCrmForm(m).error);
 const n=event();n.description="no metadata";assert.ok(mapOdooBridgeCrmForm(n).error);
});
