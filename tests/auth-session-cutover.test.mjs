import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {readFile} from "node:fs/promises";
import legacy from "../src/routes/auth.js";
import {VERIFIED_SESSION_VERSION,isVerifiedSessionClaim,rejectUnprovenSession} from "../src/auth/verifiedSessionContract.js";
const secret="isolated-fixture-not-real";
const legacyClaim={user_id:42,role:"salon_admin",session_id:"fixture-session"};
const signed=(x)=>jwt.verify(jwt.sign(x,secret),secret);
test("all legacy session-bearing tokens require reauthentication, including admin",()=>{
 for(const role of ["salon_admin","master","admin"]){
  assert.equal(isVerifiedSessionClaim(signed({...legacyClaim,role})),false);
  assert.equal(isVerifiedSessionClaim(signed({...legacyClaim,role,auth_session_version:VERIFIED_SESSION_VERSION})),true);
 }
 assert.equal(isVerifiedSessionClaim(signed({...legacyClaim,auth_session_version:"2"})),false);
 assert.equal(isVerifiedSessionClaim(signed({...legacyClaim,auth_session_version:2,session_id:""})),false);
});
test("legacy route is closed with real HTTP; cookie alone grants no identity",async()=>{
 const app=express();app.use(express.json());app.use("/auth",legacy);
 const server=app.listen(0,"127.0.0.1");
 await new Promise(r=>server.once("listening",r));
 try{
  const base="http://127.0.0.1:"+server.address().port;
  for(const path of ["login","start","verify"]){
   const r=await fetch(base+"/auth/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"fixture@example.invalid"})});
   assert.equal(r.status,410);assert.equal((await r.json()).error,"LEGACY_AUTH_DISABLED");
   assert.equal(r.headers.get("set-cookie"),null);
  }
  const r=await fetch(base+"/auth/resolve",{headers:{cookie:"totem_session=fixture-session"}});
  assert.deepEqual(await r.json(),{role:"public"});
 }finally{await new Promise(r=>server.close(r));}
});
test("unproven signed session cannot enter protected route or leak through a reauth route",()=>{
 for(const path of ["/masters/fixture","/admin/open-owner/requests","/auth/set-password"]){
  let status=0,called=0;
  const res={status:n=>{status=n;return res;},json:()=>{}};
  assert.equal(rejectUnprovenSession({method:"POST",path,headers:{}},res,()=>called++,signed(legacyClaim)),true);
  assert.equal(status,401);assert.equal(called,0);
 }
 const req={method:"POST",path:"/auth/login",headers:{authorization:"Bearer fixture"}};
 let called=0;assert.equal(rejectUnprovenSession(req,{},()=>called++,signed(legacyClaim)),true);
 assert.equal(called,1);assert.equal(req.headers.authorization,undefined);
 assert.equal(rejectUnprovenSession({},{},()=>{},signed({user_id:1,role:"system"})),false);
});
test("canonical auth issuers and both admin verifiers use the cutover contract",async()=>{
 const file=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
 const s=await file("src/routes/internal.js");
 assert.equal((s.match(/auth_session_version: VERIFIED_SESSION_VERSION/g)||[]).length,2);
 assert.ok(s.includes("AUTH_VERIFIED_OWNER_CONTEXT_REQUIRED"));
 const m=await file("src/middleware/resolveAuth.js");assert.ok(m.includes("if(rejectUnprovenSession(req,res,next,payload))return;"));
 for(const p of ["src/routes/internal/adminAuth.js","src/middleware/AdminRuntimeGuard.js"])assert.ok((await file(p)).includes("isVerifiedSessionClaim(payload)?payload:null"));
});
