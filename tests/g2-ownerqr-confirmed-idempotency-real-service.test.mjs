// G2: actual unmodified complete Owner-QR payment service; isolated SQL and HTTP-free tests.
// Regression: a completed payment must not disclose payment/obligation details or mutate anchors
// to an unauthenticated or foreign caller through the idempotent confirmation path.
import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import vm from "node:vm";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const source=readFileSync(join(root,"src/money-core/ownerQrPayments.service.js"),"utf8");
const context=vm.createContext({Date,Number,String,Math,JSON,Boolean,console,Buffer,Set,Map});
let anchorCalls=0;
const imports={
  "config.js":{assertMoneyCoreWriteAllowed:()=>{}},
  "paymentCollectionAnchors.service.js":{upsertPaymentCollectionAnchorForPayment:async()=>{anchorCalls++;}},
  "BusinessContext.js":{requireCurrencyCode:(x)=>x||"KGS"}
};
const mod=new vm.SourceTextModule(source,{context,identifier:"full-owner-qr-payment-service.js"});
await mod.link((path)=>{
  const key=String(path).split("/").at(-1);
  if(!imports[key])throw Error("STOP_UNEXPECTED_SERVICE_IMPORT_"+path);
  const d=imports[key],names=Object.keys(d);
  return new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,d[name])},{context});
});
await mod.evaluate();
const {confirmOwnerQrPayment}=mod.namespace;
assert.equal(typeof confirmOwnerQrPayment,"function");
function createDb(paymentOverrides={}){
 const calls=[];
 const row={id:81,booking_id:77,amount:1000,currency_code:"KGS",provider:"owner_qr",
  method:"owner_qr",confirmation_mode:"owner_confirmation",status:"confirmed",collector_owner_type:"salon",
  collector_owner_id:10,qr_destination_id:5,money_core_source_uid:"owner_qr:payment:81",
  money_core_ingested_at:new Date().toISOString(),is_active:true,...paymentOverrides};
 const db={
  async query(sql) {
   const q=String(sql); calls.push(q);
   if(["BEGIN","COMMIT","ROLLBACK"].includes(q))return {rows:[]};
   if(q.includes("FROM public.payments"))return {rows:[row]};
   if(q.includes("FROM public.bookings"))return {rows:[{id:77,salon_id:10,master_id:22,price_snapshot:1000,currency_code:"KGS",status:"confirmed"}]};
   if(q.includes("FROM public.salons"))return {rows:[{slug:"salon-10"}]};
   if(q.includes("FROM public.masters"))return {rows:[{slug:"master-22"}]};
   if(q.includes("FROM public.money_owner_obligations"))return {rows:[]};
   throw Error("STOP_UNEXPECTED_SQL_"+q.slice(0,140));
  },
  release(){}
 };
 return {pool:{connect:async()=>db},calls};
}
const future=new Date(Date.now()+3600000).toISOString();
const past=new Date(Date.now()-3600000).toISOString();
const verified=(id,role,ownership)=>({
 actorUserId:id,
 actorContext:{
  auth:{user_id:id,role,source:"session",session_id:"verified-"+id,session_expires_at:future,idle_timeout_at:future},
  identity:{user_id:id,role,ownership}
 }
});
const scenarios=[
  {name:"anonymous",actor:{actorUserId:null,actorContext:{}}},
  {name:"foreign owner",actor:verified(77,"salon_admin",[{owner_type:"salon",owner_id:99}])},
  {name:"master acting as salon",actor:verified(23,"master",[{owner_type:"master",owner_id:22}])},
  {name:"legacy token with forged salon ownership",actor:{actorUserId:12,actorContext:{auth:{user_id:12,role:"salon_admin",source:"jwt_legacy"},identity:{user_id:12,role:"salon_admin",ownership:[{owner_type:"salon",owner_id:10}]}}}},
  {name:"forged master role with salon ownership",actor:verified(23,"master",[{owner_type:"salon",owner_id:10}])}
];
for(const {name,actor} of scenarios){
 test("G2 confirmed OwnerQR "+name+" denied without private result, write or COMMIT",async()=>{
  anchorCalls=0;
  const {pool,calls}=createDb();
  await assert.rejects(confirmOwnerQrPayment({pool,paymentId:81,...actor}),e=>e.code==="OWNER_QR_FORBIDDEN");
  assert.equal(anchorCalls,0);
  assert.equal(calls.includes("COMMIT"),false);
  assert.equal(calls.at(-1),"ROLLBACK");
 });
}
test("G2 verified exact salon owner can idempotently confirm own settled payment",async()=>{
 anchorCalls=0;
 const {pool,calls}=createDb();
 const result=await confirmOwnerQrPayment({pool,paymentId:81,...verified(12,"salon_admin",[{owner_type:"salon",owner_id:10}])});
 assert.equal(result.ok,true);
 assert.equal(result.reused,true);
 assert.equal(result.idempotent,true);
 assert.equal(result.payment.id,81);
 assert.equal(anchorCalls,1);
 assert.equal(calls.includes("COMMIT"),true);
});

test("G2 verified exact master can idempotently confirm its own settled payment",async()=>{
 anchorCalls=0;
 const {pool,calls}=createDb({collector_owner_type:"master",collector_owner_id:22});
 const result=await confirmOwnerQrPayment({pool,paymentId:81,...verified(23,"master",[{owner_type:"master",owner_id:22}])});
 assert.equal(result.ok,true);
 assert.equal(result.reused,true);
 assert.equal(anchorCalls,1);
 assert.equal(calls.includes("COMMIT"),true);
});
test("G2 payment collector mismatching booking owner is rejected despite ownership array",async()=>{
 anchorCalls=0;
 const {pool,calls}=createDb({collector_owner_type:"salon",collector_owner_id:99});
 await assert.rejects(confirmOwnerQrPayment({pool,paymentId:81,...verified(12,"salon_admin",[{owner_type:"salon",owner_id:99}])}),e=>e.code==="OWNER_QR_FORBIDDEN");
 assert.equal(anchorCalls,0);
 assert.equal(calls.includes("COMMIT"),false);
});
test("G2 expired verified-owner session cannot reuse a confirmed payment",async()=>{
 anchorCalls=0;
 const {pool,calls}=createDb();
 const actor=verified(12,"salon_admin",[{owner_type:"salon",owner_id:10}]);
 actor.actorContext.auth.session_expires_at=past;
 await assert.rejects(confirmOwnerQrPayment({pool,paymentId:81,...actor}),e=>e.code==="OWNER_QR_FORBIDDEN");
 assert.equal(anchorCalls,0);
 assert.equal(calls.includes("COMMIT"),false);
});
