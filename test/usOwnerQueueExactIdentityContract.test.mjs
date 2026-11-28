import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {ownerQueueScope} from "../src/services/provision/ownerOpeningQueueRead.js";
const source=readFileSync(process.env.QUEUE_ROUTE_SOURCE??new URL("../src/routes/internal/adminOpenOwner.js",import.meta.url),"utf8");
const section=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return source.slice(i,j)};
const routes=new Map(),calls=[];
let rowMode="exact";
const pool={query:async(sql,args)=>{
 calls.push({sql,args});
 if(sql.includes("FROM public.owner_opening_requests")){
  const value=sql.includes("id=$2")?args[1]:args[0];
  if(rowMode==="missing")return {rows:[]};
  if(rowMode==="mismatch")return {rows:[{id:"1"}]};
  return {rows:[{id:String(value),owner_type:"salon",status:"draft",slug_final:"fixture",created_owner_id:"12",precheck_result_json:{normalized:{market_code:"US"}}}]};
 }
 return {rows:[]};
}};
const helper=section("function ownerQueueMarketDispatch(","export default function buildAdminOpenOwnerRouter");
vm.runInNewContext(section("function normalizeRequestId(","function getAdminActor(")+helper+
 section('  r.get("/requests/:id/us-primary-location",','  r.post("/requests/:id/us-primary-location",')+
 section('  r.get("/requests/:id/audit",','  r.get("/requests",')+
 section('  r.get("/requests/:id",','  return r;'),
 {r:{get:(p,h)=>routes.set(p,h)},pool,ownerQueueScope,URLSearchParams,console:{error(){}},process:{env:{}},
 requestMarketCode:()=>"US",isScopedUsOdooRequest:()=>false,readUsSalon:async()=>({id:"12",market_code:"US",market_active:true,country_code:"US",currency_code:"USD"}),assertUsSalonLocationReady:async()=>{}});
async function run(path,id,scoped=true,mode="exact"){
 calls.length=0;rowMode=mode;let status=200,body;
 const res={status(n){status=n;return this},json(v){body=v;return this}};
 await routes.get(path)({params:{id},query:scoped?{market:"US"}:{},originalUrl:path.replace(":id",id)+(scoped?"?market=US":"")},res);
 return {status,body,calls:[...calls]};
}
const paths=["/requests/:id","/requests/:id/audit","/requests/:id/us-primary-location"];
for(const path of paths){
 for(const id of ["9007199254740993","9223372036854775807","42"]){
  test(path+" exact "+id,async()=>{
   const x=await run(path,id);assert.equal(x.status,200);
   assert.equal(x.calls[0].args[1],id);assert.equal(x.calls[0].args[0],"US");assert.match(x.calls[0].sql,/source_namespace/);
   assert.equal(path.endsWith(":id")?x.body.request.id:x.body.request_id,id);
  });
 }
 for(const id of ["9223372036854775808","1e3","01","0","-1","1.5"]){
  test(path+" invalid "+id,async()=>{const x=await run(path,id);assert.equal(x.status,400);assert.equal(x.calls.length,0)});
 }
 test(path+" missing never falls back",async()=>{const x=await run(path,"9007199254740993",true,"missing");assert.equal(x.status,404);assert.equal(x.calls.length,1)});
 test(path+" mismatched row fails closed",async()=>{const x=await run(path,"9007199254740993",true,"mismatch");assert.equal(x.status,500);assert.equal(x.calls.length,1)});
 test(path+" legacy unchanged",async()=>{const x=await run(path,"42",false);assert.equal(x.status,200);assert.equal(x.calls[0].args[0],42);assert.equal(x.calls[0].args.length,1)});
}
