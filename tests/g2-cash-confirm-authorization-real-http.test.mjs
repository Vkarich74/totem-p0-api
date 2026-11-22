// G2 actual full payments.js cash confirmation: financial writes must require
// verified owner sessions and direct booking ownership. Isolated Express + SQL.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import express from "express";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const context=vm.createContext({Date,Number,String,Boolean,Math,Buffer,console,process,setTimeout,clearTimeout});
const payments=new vm.SourceTextModule(readFileSync(join(root,"src/routes/internal/payments.js"),"utf8"),{context,identifier:"real-g2-payments.js"});
const auth=new vm.SourceTextModule(readFileSync(join(root,"src/middleware/requireAuth.js"),"utf8"),{context,identifier:"real-g2-requireAuth.js"});
let obligations=0;
const imports={
  express:{Router:express.Router},
  "BusinessContext.js":{requireCurrencyCode:(v)=>v||"KGS"},
  "clientCabinetTokenAccess.js":{hashClientCabinetToken:(v)=>String(v)},
  "notificationService.js":{createNotification:async()=>null},
  "notificationTemplates.js":{buildCashConfirmNotificationTemplate:()=>({})},
  "ownerQrPayments.service.js":{
    createPendingOwnerQrPayment:async()=>({}),confirmOwnerQrPayment:async()=>({}),
    rejectOwnerQrPayment:async()=>({}),getOwnerQrPaymentOptions:async()=>({})
  },
  "directCashObligations.service.js":{createDirectCashObligationsForConfirmedPayment:async()=>{obligations++;return {status:"skipped",reason:"NO_SHARE_DUE"};}},
  "paymentCollectionAnchors.service.js":{upsertPaymentCollectionAnchorForPayment:async()=>null}
};
const modules=new Map();
await auth.link(()=>{throw Error("STOP_REQUIRE_AUTH_DEPENDENCY")});await auth.evaluate();
await payments.link(spec=>{
  if(spec.endsWith("/requireAuth.js"))return auth;
  const key=spec==="express"?"express":spec.split("/").at(-1);
  if(!imports[key])throw Error("STOP_UNKNOWN_PAYMENT_IMPORT_"+spec);
  if(modules.has(key))return modules.get(key);
  const data=imports[key],keys=Object.keys(data);
  const m=new vm.SyntheticModule(keys,function(){for(const name of keys)this.setExport(name,data[name]);},{context});
  modules.set(key,m);return m;
});
await payments.evaluate();
const Router=payments.namespace.default;
const now=Date.now(),future=new Date(now+3600000).toISOString(),past=new Date(now-3600000).toISOString();
const salonGrant={owner_type:"salon",owner_id:10},masterGrant={owner_type:"master",owner_id:22};
const principals={
  anonymous:null,
  legacy:{auth:{user_id:100,role:"salon_admin",source:"jwt_legacy"},identity:{user_id:100,role:"salon_admin",ownership:[salonGrant]}},
  expired:{auth:{user_id:100,role:"salon_admin",source:"session",session_id:"expired",session_expires_at:past,idle_timeout_at:future},identity:{user_id:100,role:"salon_admin",ownership:[salonGrant]}},
  salon:{auth:{user_id:100,role:"salon_admin",source:"session",session_id:"salon-session",session_expires_at:future,idle_timeout_at:future},identity:{user_id:100,role:"salon_admin",ownership:[salonGrant]}},
  master:{auth:{user_id:200,role:"master",source:"session",session_id:"master-session",session_expires_at:future,idle_timeout_at:future},identity:{user_id:200,role:"master",ownership:[masterGrant],salons:[10]}},
  foreign:{auth:{user_id:333,role:"salon_admin",source:"session",session_id:"foreign",session_expires_at:future,idle_timeout_at:future},identity:{user_id:333,role:"salon_admin",ownership:[{owner_type:"salon",owner_id:99}]}},
  spoofedRole:{auth:{user_id:200,role:"master",source:"session",session_id:"spoof",session_expires_at:future,idle_timeout_at:future},identity:{user_id:200,role:"master",salons:[10],ownership:[salonGrant]}},
  mismatch:{auth:{user_id:100,role:"salon_admin",source:"session",session_id:"mismatch",session_expires_at:future,idle_timeout_at:future},identity:{user_id:999,role:"salon_admin",ownership:[salonGrant]}}
};
const callLog=[];
let paymentBookingId=77;
const client={
  async query(sql,args=[]){
    const q=String(sql);callLog.push({sql:q,args});
    if(["BEGIN","ROLLBACK","COMMIT"].includes(q))return {rows:[]};
    if(q.includes("JOIN salons s ON s.id=b.salon_id")){
      return {rows:[{id:77,slug:"demo-salon"}]};
    }
    if(q.includes("JOIN masters m ON m.id=b.master_id")){
      return {rows:[{id:77,slug:"demo-master"}]};
    }
    if((q.includes("FROM payments")||q.includes("FROM public.payments"))&&q.includes("WHERE id=$1")){
      return {rows:[{id:81,booking_id:paymentBookingId,provider:"direct",status:"confirmed",amount:500,is_active:true,created_at:future}]};
    }
    if(q.includes("FROM bookings b")&&q.includes("LEFT JOIN salons s")){
      return {rows:[{id:77,salon_id:10,master_id:22,client_id:51,status:"reserved",currency_code:"KGS",salon_slug:"demo-salon",master_slug:"demo-master"}]};
    }
    if((q.includes("FROM bookings b")||q.includes("FROM public.bookings b"))&&q.includes("WHERE b.id=$1")){
      return {rows:[{id:Number(args[0]),salon_id:10,master_id:22,client_id:51,status:"reserved",currency_code:"KGS"}]};
    }
    throw Error("STOP_UNEXPECTED_CONFIRM_SQL_"+q.slice(0,150));
  },
  release(){}
};
const pool={connect:async()=>{callLog.push({sql:"POOL_CONNECT"});return client;}};
const app=express();app.use(express.json());app.use((req,res,next)=>{
  const actor=principals[req.headers["x-test-actor"]||"anonymous"]||null;
  if(actor){req.auth=actor.auth;req.identity=actor.identity;}
  next();
});app.use(Router({pool,getSalonWalletId:()=>null,getSystemWalletId:()=>null,setBookingConfirmedIfNeeded:async()=>null}));
const server=await new Promise((resolve,reject)=>{const x=app.listen(0,"127.0.0.1",()=>resolve(x));x.once("error",reject)});
after(()=>new Promise(resolve=>server.close(resolve)));
async function request(owner,actor,body){
  callLog.length=0;obligations=0;
  const r=await fetch("http://127.0.0.1:"+server.address().port+"/payments/direct/"+owner+"/confirm-cash",{
    method:"POST",headers:{"content-type":"application/json","x-test-actor":actor},
    body:JSON.stringify(body||{booking_id:77,payment_id:81})
  });
  return {status:r.status,data:await r.json(),sql:callLog.slice(),obligations};
}
for(const owner of ["salon","master"]){
  for(const actor of ["anonymous","legacy","expired"]){
    test("G2 "+owner+" cash confirm "+actor+" denies before DB connect",async()=>{
      const r=await request(owner,actor);
      assert.equal(r.status,401,actor+" status");
      assert.equal(r.sql.length,0,"no database actions");
      assert.equal(r.obligations,0);
    });
  }
  test("G2 "+owner+" cash confirm unrelated salon owner denied before payment read",async()=>{
    const r=await request(owner,"foreign");
    assert.equal(r.status,403);
    assert.equal(r.sql.some(x=>x.sql.includes("UPDATE payments")||x.sql.includes("FROM payments")),false);
    assert.equal(r.obligations,0);
    assert.equal(r.sql.some(x=>x.sql==="COMMIT"),false);
  });
  test("G2 "+owner+" cash confirm master membership cannot impersonate salon",async()=>{
    const r=await request(owner,"spoofedRole");
    assert.equal(r.status,403);
    assert.equal(r.sql.some(x=>x.sql==="COMMIT"),false);
    assert.equal(r.obligations,0);
  });
  test("G2 "+owner+" cash confirm mismatched authenticated identity denied",async()=>{
    const r=await request(owner,"mismatch");
    assert.equal(r.status,403);
    assert.equal(r.obligations,0);
  });
  test("G2 "+owner+" cash confirm valid same-object owner uses idempotent service",async()=>{
    const actor=owner==="salon"?"salon":"master";
    const r=await request(owner,actor,{booking_id:77,payment_id:81,[owner+"_slug"]:owner==="salon"?"demo-salon":"demo-master"});
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.data.ok,true);
    assert.equal(r.data.idempotent,true);
    assert.equal(r.obligations,1);
    assert.equal(r.sql.some(x=>x.sql==="COMMIT"),true);
  });
  test("G2 "+owner+" cash confirm nested payment booking ID mismatch fails before financial action",async()=>{
    paymentBookingId=88;
    try{
      const actor=owner==="salon"?"salon":"master";
      const r=await request(owner,actor,{booking_id:77,payment_id:81});
      assert.equal(r.status,403);
      assert.equal(r.sql.some(x=>x.sql==="COMMIT"),false);
      assert.equal(r.obligations,0);
    }finally{paymentBookingId=77;}
  });
}
