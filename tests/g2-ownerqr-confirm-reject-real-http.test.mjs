// G2 routes: real full payments.js + real requireAuth.js, synthetic service and SQL.
// Confirm/reject must deny unverified actors before touching money services.
// Anonymous booking payment selection/creation endpoints must not acquire a blanket session gate.
import assert from "node:assert/strict";
import {test,after} from "node:test";
import {readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import express from "express";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const ctx=vm.createContext({Date,Number,String,Boolean,Math,console,Buffer,process,setTimeout,clearTimeout});
const paymentModule=new vm.SourceTextModule(readFileSync(join(root,"src/routes/internal/payments.js"),"utf8"),{context:ctx,identifier:"real-payments.js"});
const authModule=new vm.SourceTextModule(readFileSync(join(root,"src/middleware/requireAuth.js"),"utf8"),{context:ctx,identifier:"real-requireAuth.js"});
const calls=[];
const imports={
 express:{Router:express.Router},
 "BusinessContext.js":{requireCurrencyCode:(v)=>v||"KGS"},
 "notificationService.js":{createNotification:async()=>null},
 "notificationTemplates.js":{buildCashConfirmNotificationTemplate:()=>({})},
 "ownerQrPayments.service.js":{
   createPendingOwnerQrPayment:async(input)=>{calls.push(["pending",input]);return {payment:{id:80},qr_destination:{id:5}};},
   confirmOwnerQrPayment:async(input)=>{calls.push(["confirm",input]);return {payment:{id:81},obligations:[]};},
   rejectOwnerQrPayment:async(input)=>{calls.push(["reject",input]);return {payment:{id:81},obligations:[]};},
   getOwnerQrPaymentOptions:async(input)=>{calls.push(["options",input]);return {booking_id:77,destinations:[{id:5}]}},
 },
 "directCashObligations.service.js":{createDirectCashObligationsForConfirmedPayment:async()=>({status:"skipped"})},
 "paymentCollectionAnchors.service.js":{upsertPaymentCollectionAnchorForPayment:async()=>null},
 "clientCabinetTokenAccess.js":{hashClientCabinetToken:(token)=>String(token||"")}
};
const moduleCache=new Map();
function getDep(specifier){
 if(specifier.endsWith("requireAuth.js"))return authModule;
 const key=specifier==="express"?"express":specifier.split("/").at(-1);
 if(!imports[key])throw Error("STOP_UNKNOWN_IMPORT_"+specifier);
 if(moduleCache.has(key))return moduleCache.get(key);
 const x=imports[key],names=Object.keys(x);
 const m=new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,x[name])},{context:ctx});
 moduleCache.set(key,m);
 return m;
}
await authModule.link(()=>{throw Error("STOP_UNEXPECTED_REQUIREAUTH_IMPORT")});
await authModule.evaluate();
await paymentModule.link(getDep);
await paymentModule.evaluate();
const buildPaymentsRouter=paymentModule.namespace.default;
assert.equal(typeof buildPaymentsRouter,"function");
const pool={
 async query(){throw Error("STOP_PRIVATE_SQL_READ")},
 async connect(){throw Error("STOP_FINANCIAL_DB_WRITE")}
};
const future=new Date(Date.now()+3600000).toISOString();
const past=new Date(Date.now()-3600000).toISOString();
const verified={user_id:12,role:"salon_admin",source:"session",session_id:"session-12",session_expires_at:future,idle_timeout_at:future};
const authProfiles={
 legacy:{auth:{user_id:12,role:"salon_admin",source:"jwt_legacy"},identity:{user_id:12,role:"salon_admin",ownership:[{owner_type:"salon",owner_id:10}]}},
 expired:{auth:{...verified,session_expires_at:past},identity:{user_id:12,role:"salon_admin",ownership:[{owner_type:"salon",owner_id:10}]}},
 owner:{auth:verified,identity:{user_id:12,role:"salon_admin",ownership:[{owner_type:"salon",owner_id:10}]}}
};
const app=express();
app.use(express.json());
app.use((req,res,next)=>{
 const actor=authProfiles[req.headers["x-g2-test-actor"]]||null;
 if(actor){req.auth=actor.auth;req.identity=actor.identity;}
 next();
});
app.use(buildPaymentsRouter({pool,getSalonWalletId:()=>null,getSystemWalletId:()=>null,setBookingConfirmedIfNeeded:async()=>null}));
const srv=await new Promise((resolve,reject)=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));s.once("error",reject)});
after(()=>new Promise(resolve=>srv.close(resolve)));
async function request(path,actor,method="POST",body={}) {
 calls.length=0;
 const res=await fetch("http://127.0.0.1:"+srv.address().port+path,{
   method,headers:{"content-type":"application/json","x-g2-test-actor":actor},
   ...(method==="GET"?{}:{body:JSON.stringify(body)})
 });
 return {status:res.status,data:await res.json(),calls:calls.slice()};
}
for(const action of ["confirm","reject"]){
 const path="/payments/owner-qr/81/"+action;
 test("G2 "+action+" reject anonymous, legacy, expired before money service",async()=>{
  for(const actor of ["anonymous","legacy","expired"]){
   const r=await request(path,actor);
   assert.equal(r.status,401,actor+" status");
   assert.equal(r.calls.length,0,actor+" must not touch payment");
  }
 });
 test("G2 "+action+" valid verified salon owner reaches money service with direct identity",async()=>{
  const r=await request(path,"owner");
  assert.equal(r.status,200);
  assert.equal(r.calls.length,1);
  assert.equal(r.calls[0][0],action);
  assert.equal(r.calls[0][1].actorContext.auth.source,"session");
  assert.deepEqual(JSON.parse(JSON.stringify(r.calls[0][1].actorContext.identity.ownership)),[{owner_type:"salon",owner_id:10}]);
 });
}
test("G2 public booking ownerQR selection GET remains callable without owner session",async()=>{
 const r=await request("/payments/owner-qr/options?booking_id=77","anonymous","GET");
 assert.equal(r.status,200);
 assert.equal(r.data.booking_id,77);
 assert.equal(r.calls[0][0],"options");
});
test("G2 public booking ownerQR pending POST remains callable without owner session",async()=>{
 const r=await request("/payments/owner-qr/pending","anonymous","POST",{booking_id:77,qr_destination_id:5});
 assert.equal(r.status,200);
 assert.equal(r.data.payment.id,80);
 assert.equal(r.calls[0][0],"pending");
});
