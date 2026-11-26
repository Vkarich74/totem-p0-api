import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../services/billing/usOdooReadOnlyClient.js",import.meta.url),"utf8");
async function module(){
 const m=new vm.SourceTextModule(source,{context:vm.createContext({URL,AbortController,setTimeout,clearTimeout})});
 await m.link(()=>{throw Error("unexpected import")});await m.evaluate();return m.namespace;
}
test("unapproved Billing binding fails before transport or credential use",async()=>{
 const m=await module();let calls=0;
 const opts={baseUrl:"https://example.invalid",database:"fixture",username:"fixture",apiKey:"fixture",fetchImpl:async()=>{calls++;throw Error("unexpected network")}};
 for(const supplied of [undefined,null,1,2,37,"37"]){
  assert.throws(()=>m.createUsOdooReadOnlyClient({...opts,expectedUid:supplied,approved:true}),/US_ODOO_BILLING_READER_APPROVAL_HOLD/);
 }
 assert.equal(calls,0);
});
test("UID pin accepts only exact positive safe integer greater than two",async()=>{
 const m=await module(),f=m.assertUsOdooBillingReaderUid;
 assert.equal(f(37,37),37);
 for(const [expected,actual] of [[37,38],[37,1],[37,2],[37,"37"],[37,true],[37,37.5],[37,null],[null,37],[1,1],[2,2],["37",37],[Number.MAX_SAFE_INTEGER+1,Number.MAX_SAFE_INTEGER+1]]){
  assert.throws(()=>f(expected,actual),/US_ODOO_BILLING_READER_UID_MISMATCH/);
 }
});
test("separate approved-source client retains exact reader check with synthetic transport",async()=>{
 const m=await module();const calls=[];
 const c=m.createUsOdooApprovedSourceClient({baseUrl:"https://example.invalid",database:"fixture",username:"fixture",apiKey:"fixture",fetchImpl:async(_url,req)=>{
  const x=JSON.parse(req.body);calls.push(x.params.method);
  return {ok:true,json:async()=>({result:37})};
 }});
 await c.assertReader(37);
 await assert.rejects(c.assertReader(38),/US_ODOO_SOURCE_READER_INVALID/);
 assert.deepEqual(calls,["authenticate"]);
 assert.equal(typeof c.searchRead,"undefined");
});
