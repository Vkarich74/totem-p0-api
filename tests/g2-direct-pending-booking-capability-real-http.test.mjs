// G2 actual payments.js HTTP and SQL contract: KG public pending must not trust
// caller price or an enumerable booking id. Real router, deterministic in-memory SQL.
// No production writes, no real customer data.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import express from "express";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const ctx=vm.createContext({ Date, Number, String, Boolean, Math, console, Buffer, process, setTimeout, clearTimeout });
const mod=new vm.SourceTextModule(readFileSync(join(root,"src/routes/internal/payments.js"),"utf8"),{context:ctx,identifier:"real-payments.js"});
const authMod=new vm.SourceTextModule(readFileSync(join(root,"src/middleware/requireAuth.js"),"utf8"),{context:ctx,identifier:"real-requireAuth.js"});
const hashToken=(token)=>createHash("sha256").update(String(token||"")).digest("hex");
const tokenValid="a".repeat(64), tokenForeign="b".repeat(64);
const calls=[];
let state={};
function reset(next={}){state={ price:1375, currency:"KGS", status:"reserved", hasToken:true, clientId:51, bookingId:77, active:null, ...next };calls.length=0;}
reset();
const imports={
  express:{Router:express.Router},
  "BusinessContext.js":{requireCurrencyCode:(v)=>{if(!v)throw Error("NO_CURRENCY");return String(v)}},
  "notificationService.js":{createNotification:async()=>null},
  "notificationTemplates.js":{buildCashConfirmNotificationTemplate:()=>({})},
  "ownerQrPayments.service.js":{
    createPendingOwnerQrPayment:async()=>({payment:{id:10}}),
    confirmOwnerQrPayment:async()=>({payment:{id:11},obligations:[]}),
    rejectOwnerQrPayment:async()=>({payment:{id:11},obligations:[]}),
    getOwnerQrPaymentOptions:async()=>({booking_id:77,destinations:[]})
  },
  "directCashObligations.service.js":{createDirectCashObligationsForConfirmedPayment:async()=>({status:"skipped"})},
  "paymentCollectionAnchors.service.js":{upsertPaymentCollectionAnchorForPayment:async()=>null},
  "clientCabinetTokenAccess.js":{hashClientCabinetToken:hashToken}
};
const cache=new Map();
await authMod.link(()=>{throw Error("STOP_REQUIRE_AUTH_DEPENDENCY");});
await authMod.evaluate();
await mod.link((specifier)=>{
  if(specifier.endsWith("requireAuth.js"))return authMod;
  const key=specifier==="express"?"express":specifier.split("/").at(-1);
  if(!imports[key])throw Error("STOP_NEW_IMPORT_CONTRACT_"+specifier);
  if(cache.has(key))return cache.get(key);
  const data=imports[key],names=Object.keys(data);
  const child=new vm.SyntheticModule(names,function(){for(const key of names)this.setExport(key,data[key])},{context:ctx});
  cache.set(key,child);return child;
});
await mod.evaluate();
const Router=mod.namespace.default;
const db={
  async query(sql,values=[]){
    const t=String(sql); calls.push({sql:t,values});
    if(["BEGIN","COMMIT","ROLLBACK"].includes(t))return {rows:[],rowCount:0};
    if(t.includes("FROM public.bookings")||t.includes("FROM bookings b")){
      if(Number(values[0])!==state.bookingId||state.bookingMissing)return {rows:[],rowCount:0};
      return {rows:[{id:state.bookingId,client_id:state.clientId,salon_id:14,status:state.status,price_snapshot:state.price,currency_code:state.currency}],rowCount:1};
    }
    if(t.includes("FROM public.client_access_tokens")||t.includes("FROM client_access_tokens")){
      const arr=values.map(String);
      const ok=state.hasToken && arr.includes(hashToken(tokenValid)) &&
        arr.includes(String(state.bookingId)) && arr.includes(String(state.clientId));
      return {rows:ok?[{id:6}]:[],rowCount:ok?1:0};
    }
    if(t.includes("FROM payments")&&t.includes("is_active")){
      return {rows:state.active?[state.active]:[],rowCount:state.active?1:0};
    }
    if(t.includes("INSERT INTO public.payments")||t.includes("INSERT INTO payments")){
      state.inserted=(state.inserted||0)+1;state.insertParams=values;
      return {rows:[{id:81,booking_id:state.bookingId,amount:values[1],currency_code:values[2],provider:"direct",status:"pending"}],rowCount:1};
    }
    throw Error("STOP_UNKNOWN_SQL_"+t.slice(0,160));
  },
  release(){}
};
const app=express();
app.use(express.json());
app.use(Router({pool:{connect:async()=>db,query:()=>{throw Error("NO_POOL_READ")}},getSalonWalletId:()=>null,getSystemWalletId:()=>null,setBookingConfirmedIfNeeded:async()=>null}));
const srv=await new Promise((resolve,reject)=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));s.once("error",reject)});
after(()=>new Promise(resolve=>srv.close(resolve)));
async function call(body){
  const res=await fetch("http://127.0.0.1:"+srv.address().port+"/payments/direct/pending",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)
  });
  return {status:res.status,data:await res.json(),queries:calls.slice()};
}
const valid={booking_id:77,booking_token:tokenValid};

test("G2 pending: missing capability denied before any SQL/write",async()=>{
  reset();let r=await call({booking_id:77,service_price:1375});
  assert.equal(r.status,401);assert.equal(r.queries.length,0);
});
test("G2 pending: wrong booking capability rejects before payment lookup/write",async()=>{
  reset();let r=await call({...valid,booking_token:tokenForeign});
  assert.equal(r.status,403);assert.equal(state.inserted||0,0);
});
test("G2 pending: revoked booking capability rejects before payment lookup/write",async()=>{
  reset({hasToken:false});let r=await call(valid);
  assert.equal(r.status,403);assert.equal(state.inserted||0,0);
});
test("G2 pending: unrelated bookingId cannot reuse this client's token",async()=>{
  reset();let r=await call({...valid,booking_id:78});
  assert.notEqual(r.status,200);assert.equal(state.inserted||0,0);
});
test("G2 pending: tampered client-side service price cannot override snapshot",async()=>{
  reset();let r=await call({...valid,service_price:1});
  assert.equal(r.status,409);assert.equal(state.inserted||0,0);
});
test("G2 pending: missing client amount accepted using canonical booking snapshot",async()=>{
  reset();let r=await call(valid);
  assert.equal(r.status,200);assert.equal(r.data.payment.amount,1375);
  assert.equal(state.inserted,1);assert.equal(state.insertParams[1],1375);
});
test("G2 pending: matching legacy UI price is accepted but never used for INSERT",async()=>{
  reset();let r=await call({...valid,service_price:1375});
  assert.equal(r.status,200);assert.equal(state.insertParams[1],1375);
});
test("G2 pending: cancelled booking denies before active payment lookup and write",async()=>{
  reset({status:"cancelled"});let r=await call(valid);
  assert.equal(r.status,409);assert.equal(state.inserted||0,0);
});
test("G2 pending: null snapshot denies without mutation",async()=>{
  reset({price:null});let r=await call(valid);
  assert.equal(r.status,409);assert.equal(state.inserted||0,0);
});
test("G2 pending: USD booking never uses old legacy price snapshot",async()=>{
  reset({currency:"USD"});let r=await call(valid);
  assert.equal(r.status,409);assert.equal(state.inserted||0,0);
});
test("G2 pending: valid matching existing direct payment can be reused",async()=>{
  reset({active:{id:80,status:"pending",provider:"direct",amount:1375,currency_code:"KGS"}});
  let r=await call(valid);assert.equal(r.status,200);assert.equal(r.data.reused,true);assert.equal(state.inserted||0,0);
});
test("G2 pending: existing wrong-amount payment must not be returned as valid",async()=>{
  reset({active:{id:80,status:"pending",provider:"direct",amount:1,currency_code:"KGS"}});
  let r=await call(valid);assert.equal(r.status,409);assert.equal(state.inserted||0,0);
});
