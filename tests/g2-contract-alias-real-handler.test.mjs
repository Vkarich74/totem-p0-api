// G2 P0 direct tenant grant for legacy contract-creation alias. Full real router.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import express from "express";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const ctx=vm.createContext({console,Date,Number,String,process,Buffer,setTimeout,clearTimeout});
const routerModule=new vm.SourceTextModule(readFileSync(join(root,"src/routes/internal/contract-alias.js"),"utf8"),{context:ctx,identifier:"real-contract-alias.js"});
const authModule=new vm.SourceTextModule(readFileSync(join(root,"src/middleware/requireAuth.js"),"utf8"),{context:ctx,identifier:"requireAuth.js"});
const expressModule=new vm.SyntheticModule(["default"],function(){this.setExport("default",express)},{context:ctx});
await authModule.link(()=>{throw Error("STOP_UNEXPECTED_AUTH_IMPORT")});await authModule.evaluate();
await routerModule.link(spec=>{
 if(spec==="express")return expressModule;
 if(spec.endsWith("/requireAuth.js"))return authModule;
 throw Error("STOP_UNKNOWN_ALIAS_IMPORT_"+spec);
});
await routerModule.evaluate();
const build=routerModule.namespace.default;
const future=new Date(Date.now()+3600000).toISOString();
const past=new Date(Date.now()-3600000).toISOString();
const salonGrant={owner_type:"salon",owner_id:10};
const principals={
  anon:null,
  legacy:{auth:{user_id:100,role:"salon_admin",source:"jwt_legacy"},identity:{user_id:100,role:"salon_admin",ownership:[salonGrant]}},
  expired:{auth:{user_id:100,role:"salon_admin",source:"session",session_id:"expired",session_expires_at:past,idle_timeout_at:future},identity:{user_id:100,role:"salon_admin",ownership:[salonGrant]}},
  foreign:{auth:{user_id:101,role:"salon_admin",source:"session",session_id:"foreign",session_expires_at:future,idle_timeout_at:future},identity:{user_id:101,role:"salon_admin",ownership:[{owner_type:"salon",owner_id:99}]}},
  member:{auth:{user_id:200,role:"master",source:"session",session_id:"member",session_expires_at:future,idle_timeout_at:future},identity:{user_id:200,role:"master",salons:[10],ownership:[{owner_type:"master",owner_id:22}]}},
  spoofed:{auth:{user_id:200,role:"master",source:"session",session_id:"spoofed",session_expires_at:future,idle_timeout_at:future},identity:{user_id:200,role:"master",ownership:[salonGrant]}},
  mismatch:{auth:{user_id:100,role:"salon_admin",source:"session",session_id:"mismatch",session_expires_at:future,idle_timeout_at:future},identity:{user_id:999,role:"salon_admin",ownership:[salonGrant]}},
  owner:{auth:{user_id:100,role:"salon_admin",source:"session",session_id:"owner",session_expires_at:future,idle_timeout_at:future},identity:{user_id:100,role:"salon_admin",ownership:[salonGrant]}}
};
const sqlCalls=[];
let active=false;
const pool={
 async query(sql,args=[]){
  const text=String(sql);sqlCalls.push({sql:text,args});
  if(text.includes("FROM contracts")&&text.includes("status='active'"))return {rows:active?[{id:501}]:[]};
  if(text.includes("INSERT INTO contracts"))return {rows:[{id:502,status:"pending",salon_id:Number(args[0]),master_id:Number(args[1]),terms_json:args[2]}]};
  throw Error("STOP_UNEXPECTED_CONTRACT_SQL_"+text.slice(0,120));
 }
};
const app=express();app.use(express.json());app.use((req,res,next)=>{
 const who=principals[req.headers["x-test-actor"]||"anon"];
 if(who){req.auth=who.auth;req.identity=who.identity;}
 next();
});app.use(build(pool));
const server=await new Promise((resolve,reject)=>{const x=app.listen(0,"127.0.0.1",()=>resolve(x));x.once("error",reject)});
after(()=>new Promise(resolve=>server.close(resolve)));
async function request(actor,payload={salon_id:10,master_id:22,terms_json:{test:true}}){
 sqlCalls.length=0;
 const r=await fetch("http://127.0.0.1:"+server.address().port+"/contracts/create",{
  method:"POST",headers:{"content-type":"application/json","x-test-actor":actor},body:JSON.stringify(payload)
 });
 return {status:r.status,data:await r.json(),sql:sqlCalls.slice()};
}
for(const actor of ["anon","legacy","expired"]){
 test("G2 alias "+actor+" fails 401 before SQL",async()=>{
  const r=await request(actor);
  assert.equal(r.status,401);
  assert.equal(r.sql.length,0);
 });
}
for(const actor of ["foreign","member","spoofed","mismatch"]){
 test("G2 alias "+actor+" fails 403 before SQL",async()=>{
  const r=await request(actor);
  assert.equal(r.status,403);
  assert.equal(r.sql.length,0);
 });
}
test("G2 alias malformed owner/master IDs fail before SQL",async()=>{
 for(const invalid of ["10foo",0,-1,"1.2"]){
  const r=await request("owner",{salon_id:invalid,master_id:22});
  assert.equal(r.status,400);
  assert.equal(r.sql.length,0);
 }
});
test("G2 alias valid direct salon grant creates one pending contract",async()=>{
 active=false;
 const r=await request("owner");
 assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.ok,true);
 assert.equal(r.data.contract.salon_id,10);
 assert.equal(r.data.contract.master_id,22);
 assert.equal(r.sql.filter(x=>x.sql.includes("INSERT INTO contracts")).length,1);
});
test("G2 alias active duplicate denied before insert",async()=>{
 active=true;
 try{
  const r=await request("owner");
  assert.equal(r.status,409);
  assert.equal(r.sql.filter(x=>x.sql.includes("INSERT INTO contracts")).length,0);
 }finally{active=false;}
});
