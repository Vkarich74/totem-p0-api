import test,{before,beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {readFile} from "node:fs/promises";
import {readKgSharedMasterBindings,readKgSharedMasterCandidate} from "../src/services/provision/kgSharedMasterIdentity.js";
import buildAdminOpenOwnerRouter from "../src/routes/internal/adminOpenOwner.js";
import {resolveAuth} from "../src/middleware/resolveAuth.js";
const url=process.env.KG_TEST_DATABASE_URL;
if(!url||process.env.DATABASE_URL||process.env.KG_SHARED_MASTER_ISOLATED!=="YES")throw Error("ISOLATED_DB_REQUIRED");
const u=new URL(url);if(u.hostname!=="127.0.0.1"||u.pathname!=="/kg_shared_master_test")throw Error("NONLOCAL_DB");
const db=new pg.Pool({connectionString:url,max:12});
const q=(s,a)=>db.query(s,a);
const env={TOTEM_KG_SHARED_MASTER_ENABLED:"true",TOTEM_KG_SHARED_MASTER_RELEASE_APPROVED:"true"};
Object.assign(process.env,env,{JWT_SECRET:"fixture-only-not-real"});
const password="fixture-password-not-real";
const hash=await bcrypt.hash(password,4);
const email="owner@example.invalid",phone="+996700000001";
const body={owner_type:"master",name:"Fixture master",slug:"fixture-own-master",email,phone,city:"Bishkek",work_mode:"attached_to_salon",salon_slug:"fixture-salon"};
const count=async table=>(await q("SELECT count(*)::int AS n FROM public."+table)).rows[0].n;
let server,origin;
const app=express();app.use(express.json());
let canonicalPool,realServer,realOrigin;
// Admin actor is a fixture; production AdminRuntimeGuard is unchanged here.
app.use("/admin", (req,res,next)=>{req.auth={user_id:900,role:"admin",email:"admin@example.invalid"};next();},buildAdminOpenOwnerRouter(db));
app.use("/internal",(req,res,next)=>resolveAuth(req,res,next,{withClient:async fn=>{
 const c=await db.connect();try{return await fn(c);}finally{c.release();}
}}));
// Exact resolver readback without mounting unrelated live payment routers.
app.get("/internal/auth/session/resolve",(req,res)=>res.json({auth:req.auth,identity:req.identity}));
app.get("/internal/masters/:slug",(req,res)=>res.json({auth:req.auth,identity:req.identity}));
app.get("/internal/salons/:slug",(req,res)=>res.json({auth:req.auth,identity:req.identity}));
before(async()=>{
 assert.equal((await q("SELECT current_database() AS db")).rows[0].db,"kg_shared_master_test");
 assert.equal((await q("SELECT to_regclass('public.auth_users') AS t")).rows[0].t,null);
 await q(await readFile(new URL("./sql/kg-shared-master-schema.sql",import.meta.url),"utf8"));
 server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));origin="http://127.0.0.1:"+server.address().port;
});
beforeEach(async()=>{
 Object.assign(process.env,env);
 await q("TRUNCATE public.auth_users,public.auth_sessions,public.auth_otps,public.salons,public.masters,public.owner_salon,public.master_salon,public.markets,public.tenant_market_settings,public.owner_opening_requests,public.moderation_cases,public.audit_events,public.slug_reservations,public.billing_subscriptions RESTART IDENTITY");
 await q(`INSERT INTO public.markets(id,code,country_code,default_locale,supported_locales,default_currency,supported_currencies,default_timezone,country_pack_code,country_pack_version,active)
 VALUES(1,'KG','KG','ru',ARRAY['ru'],'KGS',ARRAY['KGS'],'Asia/Bishkek','KG','1',true),
 (4,'US','US','en',ARRAY['en'],'USD',ARRAY['USD'],'America/New_York','US','1',true);
 INSERT INTO public.salons(id,slug,name,status,enabled) VALUES(32,'fixture-salon','Fixture','active',true),(33,'foreign-salon','Foreign','active',true),(34,'foreign-us','US','active',true);
 INSERT INTO public.owner_salon(id,owner_id,salon_id,status) VALUES(1,'100',32,'active');
 INSERT INTO public.tenant_market_settings(salon_id,market_id) VALUES(32,1),(33,1),(34,4);`);
 await q("INSERT INTO public.auth_users(id,email,role,salon_slug,salon_id,phone,enabled,password_hash,email_verified_at) VALUES(100,$1,'salon_admin','fixture-salon','32',$2,true,$3,now())",[email,phone,hash]);
 await q("INSERT INTO public.auth_sessions(id,user_id,expires_at,last_seen_at) VALUES('fixture-session',100,now()+interval '1 hour',now())");
});
after(async()=>{
 if(server)await new Promise(r=>server.close(r));
 if(realServer)await new Promise(r=>realServer.close(r));
 if(canonicalPool)await canonicalPool.end();
 await db.end();
});
async function post(path,data={}){
 const r=await fetch(origin+"/admin"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
 return {status:r.status,body:await r.json()};
}
async function open(){
 const a=await post("/requests",body);assert.equal(a.status,201,JSON.stringify(a.body));
 return Number(a.body.request.id);
}
async function provision(id){
 let a=await post("/requests/"+id+"/approve");assert.equal(a.status,200,JSON.stringify(a.body));
 a=await post("/requests/"+id+"/provision");assert.equal(a.status,200,JSON.stringify(a.body));return a.body.request;
}
test("production baseline rejects duplicate email when feature OFF, unrelated fresh email remains valid",async()=>{
 delete process.env.TOTEM_KG_SHARED_MASTER_RELEASE_APPROVED;
 const r=await post("/precheck",body);assert.equal(r.body.valid,false);assert.ok(r.body.errors.includes("EMAIL_ALREADY_EXISTS"));
 const fresh=await post("/precheck",{...body,email:"another@example.invalid",phone:"+996700000002"});
 assert.equal(fresh.body.valid,true);
 assert.equal(await count("owner_opening_requests"),0);
});
test("both manual precheck and create accept exact existing KG owner without trusting supplied principal",async()=>{
 const r=await post("/precheck",{...body,kg_shared_owner:{principal_auth_user_id:999}});
 assert.equal(r.body.valid,true,JSON.stringify(r.body));assert.equal(r.body.normalized.market_code,"KG");assert.equal(r.body.kg_shared_owner.principal_auth_user_id,100);
 const id=await open();assert.ok(id);assert.equal(await count("owner_opening_requests"),1);assert.equal(await count("auth_users"),1);
 const repeat=await post("/requests",body);assert.equal(repeat.status,400);assert.equal(await count("owner_opening_requests"),1);
});
test("same email is still blocked for wrong phone, independent master, foreign salon, non-KG and disabled owner",async()=>{
 for(const data of [{...body,phone:"+996700000002"},{...body,work_mode:"independent"},{...body,salon_slug:"foreign-salon"},{...body,salon_slug:"foreign-us"}]){
  const a=await post("/precheck",data);assert.equal(a.body.valid,false,JSON.stringify(a.body));assert.ok(a.body.errors.includes("EMAIL_ALREADY_EXISTS"));
 }
 await q("UPDATE public.auth_users SET enabled=false WHERE id=100");
 assert.equal((await post("/precheck",body)).body.valid,false);
});
test("concurrent manual creation makes one request, no duplicated account",async()=>{
 const all=await Promise.all(Array.from({length:5},()=>post("/requests",body)));
 assert.equal(all.filter(x=>x.status===201).length,1,JSON.stringify(all.map(x=>x.status)));
 assert.equal(await count("owner_opening_requests"),1);assert.equal(await count("auth_users"),1);
});
test("actual canonical Admin provision and activation reuse same principal; paid and phone contracts untouched",async()=>{
 const id=await open(),r=await provision(id);
 assert.equal(r.status,"provisioned");assert.equal(Number(r.created_auth_user_id),100);
 const m=(await q("SELECT * FROM public.masters")).rows[0];assert.equal(m.active,false);assert.equal(m.user_id,100);
 assert.equal(await count("master_salon"),1);assert.equal(await count("auth_users"),1);
 assert.equal((await readKgSharedMasterBindings(db,{target:{lookup:"email",value:email}})).length,0);
 const a=await post("/requests/"+id+"/activate");assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(a.body.request.status,"activated");
 const principal=(await q("SELECT role,phone,password_hash,master_slug FROM public.auth_users")).rows[0];
 assert.equal(principal.role,"salon_admin");assert.equal(principal.phone,phone);assert.equal(principal.password_hash,hash);assert.equal(principal.master_slug,null);
 assert.equal((await q("SELECT active FROM public.masters")).rows[0].active,true);
 const binding=await readKgSharedMasterBindings(db,{target:{lookup:"email",value:email},masterSlug:body.slug});
 assert.equal(binding.length,1);assert.equal(binding[0].id,100);assert.equal(binding[0].role,"master");
 assert.equal(binding[0].password_hash,hash);
 const token=jwt.sign({user_id:100,role:"master",session_id:"fixture-session",auth_session_version:2,kg_shared_master_request_id:id},process.env.JWT_SECRET);
 const read=async p=>fetch(origin+"/internal"+p,{headers:{Authorization:"Bearer "+token}});
 const rr=await read("/auth/session/resolve");assert.equal(rr.status,200);const b=await rr.json();
 assert.equal(b.auth.role,"master");assert.deepEqual(b.identity.masters,[Number(m.id)]);assert.deepEqual(b.identity.salons,[]);
 for(const p of ["/masters/another","/salons/fixture-salon"]){assert.equal((await read(p)).status,403);}
 await q("UPDATE public.owner_salon SET status='inactive'");assert.equal((await read("/auth/session/resolve")).status,403);
});
test("revoked or changed ownership blocks approved provision without creating master",async()=>{
 const id=await open();assert.equal((await post("/requests/"+id+"/approve")).status,200);
 await q("UPDATE public.owner_salon SET status='inactive'");
 const a=await post("/requests/"+id+"/provision");assert.equal(a.status,409,JSON.stringify(a.body));assert.equal(await count("masters"),0);assert.equal(await count("auth_users"),1);
});
test("canonical bind failure rolls back master, reservation and request state",async()=>{
 const id=await open();assert.equal((await post("/requests/"+id+"/approve")).status,200);
 await q("ALTER TABLE public.master_salon ADD CONSTRAINT fixture_no_bind CHECK(status<>'active')");
 try{const a=await post("/requests/"+id+"/provision");assert.ok(a.status>=400);assert.equal(await count("masters"),0);assert.equal(await count("master_salon"),0);assert.equal(await count("slug_reservations"),0);assert.equal((await q("SELECT status FROM public.owner_opening_requests WHERE id=$1",[id])).rows[0].status,"approved");}
 finally{await q("ALTER TABLE public.master_salon DROP CONSTRAINT fixture_no_bind");}
});

async function realApp(){
 if(realServer)return;
 // All real router modules share the existing pool. Replace only in this
 // isolated test process, after the non-production DB gate above.
 ({pool:canonicalPool}=await import("../src/db.js"));
 canonicalPool.query=db.query.bind(db);canonicalPool.connect=db.connect.bind(db);
 const {createInternalRouter}=await import("../src/routes/internal.js");
 const {default:legacy}=await import("../src/routes/auth.js");
 const app=express();app.use(express.json());app.use("/auth",legacy);
 app.use("/internal",(req,res,next)=>resolveAuth(req,res,next,{withClient:async fn=>{
  const c=await db.connect();try{return await fn(c);}finally{c.release();}
 }}),createInternalRouter({rlInternal:(_req,_res,next)=>next()}));
 realServer=app.listen(0,"127.0.0.1");await new Promise(r=>realServer.once("listening",r));realOrigin="http://127.0.0.1:"+realServer.address().port;
}
async function http(path,{method="GET",data,token}={}){
 const r=await fetch(realOrigin+path,{method,headers:{...(data?{"Content-Type":"application/json"}:{}),...(token?{Authorization:"Bearer "+token}:{})},...(data?{body:JSON.stringify(data)}:{})});
 return {status:r.status,body:await r.json()};
}
const login=(role,slug,pwd=password,token)=>http("/internal/auth/login",{method:"POST",data:{login:email,password:pwd,role,slug},token});
test("real internal password login, session resolution and Master profile use one principal; old token rejected",async()=>{
 await realApp();
 const id=await open();await provision(id);assert.equal((await post("/requests/"+id+"/activate")).status,200);
 const old=jwt.sign({user_id:100,role:"salon_admin",session_id:"fixture-session"},process.env.JWT_SECRET);
 assert.equal((await http("/internal/auth/session/resolve",{token:old})).status,401);
 const salon=await login("salon_admin","fixture-salon",password,old);assert.equal(salon.status,200,JSON.stringify(salon.body));
 const denied=await login("master",body.slug,"wrong-password");assert.equal(denied.status,401);
 const foreign=await login("master","foreign-master");assert.equal(foreign.status,401);
 const master=await login("master",body.slug);assert.equal(master.status,200,JSON.stringify(master.body));
 const payload=jwt.verify(master.body.access_token,process.env.JWT_SECRET);
 assert.equal(payload.user_id,100);assert.equal(payload.role,"master");assert.equal(payload.auth_session_version,2);assert.equal(payload.kg_shared_master_request_id,id);
 const resolved=await http("/internal/auth/session/resolve",{token:master.body.access_token});
 assert.equal(resolved.status,200,JSON.stringify(resolved.body));assert.equal(resolved.body.authenticated,true);assert.equal(resolved.body.role,"master");assert.equal(resolved.body.auth.master_slug,body.slug);assert.deepEqual(resolved.body.identity.salons,[]);
 const profile=await http("/internal/masters/"+body.slug,{token:master.body.access_token});
 assert.equal(profile.status,200,JSON.stringify(profile.body));assert.equal(profile.body.master.user_id,100);
 assert.equal((await http("/internal/salons/fixture-salon",{token:master.body.access_token})).status,403);
 assert.equal((await http("/internal/masters/foreign-master",{token:master.body.access_token})).status,403);
 const original=await http("/internal/auth/session/resolve",{token:salon.body.access_token});assert.equal(original.body.authenticated,true);assert.equal(original.body.role,"salon_admin");
 assert.equal(await count("auth_users"),1);
 assert.equal(await count("billing_subscriptions"),0);
});
test("actual owner OTP verification and password recovery share the principal; no external email or SMS",async()=>{
 await realApp();const id=await open();await provision(id);assert.equal((await post("/requests/"+id+"/activate")).status,200);
 const code="123456",otpHash=await bcrypt.hash(code,4);
 const issue=purpose=>q("INSERT INTO public.auth_otps(user_id,channel,target,purpose,code_hash,expires_at,resend_available_at) VALUES(100,'email',$1,$2,$3,now()+interval '10 minutes',now())",[email,purpose,otpHash]);
 const context={login:email,role:"master",slug:body.slug,channel:"email"};
 await issue("login_verify");
 const wrong=await http("/internal/auth/verify",{method:"POST",data:{...context,purpose:"login",code:"999999"}});assert.equal(wrong.status,401);
 const v=await http("/internal/auth/verify",{method:"POST",data:{...context,purpose:"login",code}});
 assert.equal(v.status,200,JSON.stringify(v.body));assert.equal(jwt.verify(v.body.access_token,process.env.JWT_SECRET).kg_shared_master_request_id,id);
 const replay=await http("/internal/auth/verify",{method:"POST",data:{...context,purpose:"login",code}});assert.equal(replay.status,401);
 await issue("password_reset");
 const nextPassword="fixture-new-password";
 const reset=await http("/internal/auth/password/reset/finish",{method:"POST",data:{...context,code,password:nextPassword}});
 assert.equal(reset.status,200,JSON.stringify(reset.body));
 assert.equal((await http("/internal/auth/session/resolve",{token:v.body.access_token})).status,403);
 assert.equal((await login("salon_admin","fixture-salon")).status,401);
 assert.equal((await login("salon_admin","fixture-salon",nextPassword)).status,200);
 assert.equal((await login("master",body.slug,nextPassword)).status,200);
 assert.equal(await count("auth_users"),1);
});
test("actual Admin password session and protected precheck authorize the request, not a master token",async()=>{
 await realApp();
 await q("INSERT INTO public.auth_users(id,email,role,enabled,password_hash) VALUES(900,'admin@example.invalid','admin',true,$1)",[hash]);
 const path="/internal/admin/open-owner/precheck";
 assert.equal((await http(path,{method:"POST",data:body})).status,401);
 const a=await http("/internal/admin/auth/login",{method:"POST",data:{email:"admin@example.invalid",password}});
 assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(jwt.verify(a.body.access_token,process.env.JWT_SECRET).auth_session_version,2);
 const check=await http(path,{method:"POST",data:body,token:a.body.access_token});assert.equal(check.status,200,JSON.stringify(check.body));assert.equal(check.body.valid,true);
 const created=await http("/internal/admin/open-owner/requests",{method:"POST",data:body,token:a.body.access_token});
 assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(Number(created.body.request.created_by_admin_id),900);
 const old=jwt.sign({user_id:900,role:"admin",session_id:a.body.auth.session_id},process.env.JWT_SECRET);
 assert.equal((await http(path,{method:"POST",data:body,token:old})).status,401);
});
