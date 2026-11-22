// G2 P0: real full withdraws.js Express handler security, no production writes.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import express from "express";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const context=vm.createContext({console,process,Date,Buffer,setTimeout,clearTimeout});
const withdraws=new vm.SourceTextModule(readFileSync(join(root,"src/routes/internal/withdraws.js"),"utf8"),{context,identifier:"real-withdraws.js"});
const auth=new vm.SourceTextModule(readFileSync(join(root,"src/middleware/requireAuth.js"),"utf8"),{context,identifier:"real-requireAuth.js"});
const expressModule=new vm.SyntheticModule(["default"],function(){this.setExport("default",express);},{context});
await auth.link(()=>{throw Error("STOP_REQUIREAUTH_IMPORT");});
await auth.evaluate();
await withdraws.link(spec=>{
  if(spec==="express")return expressModule;
  if(spec.endsWith("/requireAuth.js"))return auth;
  throw Error("STOP_UNEXPECTED_WITHDRAW_IMPORT_"+spec);
});
await withdraws.evaluate();
const buildRouter=withdraws.namespace.default;
const existingId="11111111-1111-4111-8111-111111111111";
const future=new Date(Date.now()+3600000).toISOString();
const past=new Date(Date.now()-3600000).toISOString();
const calls=[];
let withdrawOwnerType="salon",withdrawOwnerId=10;
const database={
  async query(sql,params=[]){
    const q=String(sql);
    calls.push({sql:q,params});
    if(/SELECT id FROM salons WHERE slug=\$1/.test(q))return {rows:[{id:10}]};
    if(/FROM public.withdraws/.test(q)&&/WHERE id=\$1/.test(q))return {rows:[{
      id:existingId,owner_type:withdrawOwnerType,owner_id:withdrawOwnerId,
      status:"completed",amount:400,external_ref:"PRIVATE_BANK_REFERENCE",
      created_at:"2026-01-01T12:00:00.000Z",updated_at:"2026-01-02T12:00:00.000Z"
    }]};
    if(/FROM public.withdraws/.test(q)&&/COUNT\(\*\)/.test(q))return {rows:[{
      pending_count:1,processing_count:2,completed_count:3,failed_count:4,
      pending_amount:100,processing_amount:200,completed_amount:300,failed_amount:400
    }]};
    throw Error("STOP_UNEXPECTED_SQL_"+q.slice(0,140));
  }
};
const ownerGrant={owner_type:"salon",owner_id:10};
const profiles={
  anonymous:null,
  legacy:{auth:{user_id:101,role:"salon_admin",source:"jwt_legacy"},identity:{user_id:101,role:"salon_admin",ownership:[ownerGrant]}},
  expired:{auth:{user_id:101,role:"salon_admin",source:"session",session_id:"exp",session_expires_at:past,idle_timeout_at:future},identity:{user_id:101,role:"salon_admin",ownership:[ownerGrant]}},
  foreign:{auth:{user_id:102,role:"salon_admin",source:"session",session_id:"foreign",session_expires_at:future,idle_timeout_at:future},identity:{user_id:102,role:"salon_admin",ownership:[{owner_type:"salon",owner_id:99}]}},
  masterMember:{auth:{user_id:210,role:"master",source:"session",session_id:"member",session_expires_at:future,idle_timeout_at:future},identity:{user_id:210,role:"master",salons:[10],ownership:[{owner_type:"master",owner_id:22}]}},
  salonOwner:{auth:{user_id:101,role:"salon_admin",source:"session",session_id:"owner",session_expires_at:future,idle_timeout_at:future},identity:{user_id:101,role:"salon_admin",ownership:[ownerGrant]}},
  exactMaster:{auth:{user_id:210,role:"master",source:"session",session_id:"master",session_expires_at:future,idle_timeout_at:future},identity:{user_id:210,role:"master",ownership:[{owner_type:"master",owner_id:22}]}},
  spoofedRole:{auth:{user_id:210,role:"master",source:"session",session_id:"spoof",session_expires_at:future,idle_timeout_at:future},identity:{user_id:210,role:"master",salons:[10],ownership:[ownerGrant]}},
  mismatchedPrincipal:{auth:{user_id:101,role:"salon_admin",source:"session",session_id:"mix",session_expires_at:future,idle_timeout_at:future},identity:{user_id:444,role:"salon_admin",ownership:[ownerGrant]}}
};
const app=express();
app.use((req,res,next)=>{
  const principal=profiles[req.headers["x-test-actor"]||"anonymous"];
  if(principal){req.auth=principal.auth;req.identity=principal.identity;}
  next();
});
app.use(buildRouter(database,(req,res,next)=>next()));
const server=await new Promise((resolve,reject)=>{const x=app.listen(0,"127.0.0.1",()=>resolve(x));x.once("error",reject);});
after(()=>new Promise(resolve=>server.close(resolve)));
async function get(path,actor){
  calls.length=0;
  const r=await fetch("http://127.0.0.1:"+server.address().port+path,{headers:{"x-test-actor":actor}});
  return {status:r.status,data:await r.json(),sql:calls.slice()};
}
const summary="/salons/demo/withdraws/summary";
const timeline="/withdraws/"+existingId+"/timeline";
for(const path of [summary,timeline]){
 test("G2 withdraw "+path+" unauthorized no SQL",async()=>{
  for(const actor of ["anonymous","legacy","expired"]){
   const r=await get(path,actor);
   assert.equal(r.status,401,actor);
   assert.equal(r.sql.length,0,actor+" SQL");
  }
 });
 test("G2 withdraw "+path+" foreign owner no private details",async()=>{
  const r=await get(path,"foreign");
  assert.equal(r.status,403);
  assert.equal(JSON.stringify(r.data).includes("PRIVATE_BANK_REFERENCE"),false);
  assert.equal(r.sql.some(x=>/COUNT\(\*\)/.test(x.sql)),false);
 });
 test("G2 withdraw "+path+" master salon membership not admin grant",async()=>{
  const r=await get(path,"masterMember");
  assert.equal(r.status,403);
  assert.equal(JSON.stringify(r.data).includes("PRIVATE_BANK_REFERENCE"),false);
  assert.equal(r.sql.some(x=>/COUNT\(\*\)/.test(x.sql)),false);
 });
 test("G2 withdraw "+path+" legitimate direct salon owner PASS",async()=>{
  const r=await get(path,"salonOwner");
  assert.equal(r.status,200);
  assert.equal(r.data.ok,true);
 });
 test("G2 withdraw "+path+" spoofed role or mismatched principal denied",async()=>{
  for(const actor of ["spoofedRole","mismatchedPrincipal"]){
   const r=await get(path,actor);
   assert.equal(r.status,403,actor);
  }
 });
}
test("G2 withdraw timeline verified master only own master withdrawal",async()=>{
 withdrawOwnerType="master";withdrawOwnerId=22;
 try {
  const r=await get(timeline,"exactMaster");
  assert.equal(r.status,200);
  assert.equal(r.data.timeline.at(-1).external_ref,"PRIVATE_BANK_REFERENCE");
 }finally{withdrawOwnerType="salon";withdrawOwnerId=10;}
});
test("G2 withdraw timeline system-owned withdrawals inaccessible via owner credentials",async()=>{
 withdrawOwnerType="system";withdrawOwnerId=900001;
 try{
  const r=await get(timeline,"salonOwner");
  assert.equal(r.status,403);
 }finally{withdrawOwnerType="salon";withdrawOwnerId=10;}
});
test("G2 withdraw timeline invalid UUID denied before SQL",async()=>{
 const r=await get("/withdraws/not-a-uuid/timeline","salonOwner");
 assert.equal(r.status,400);
 assert.equal(r.sql.length,0);
});
