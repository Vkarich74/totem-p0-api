// CI only: real selected money tables, synthetic balances, no external transfers.
import test,{before,after,mock} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import pg from "pg";
mock.module(new URL("../src/services/notifications/notificationService.js",import.meta.url),{namedExports:{createNotification:async()=>({id:1})}});
const {createWithdrawRequest}=await import("../src/money-core/withdrawRequests.service.js");
const url=new URL(process.env.G5_TEST_DATABASE_URL||"");
assert.equal(process.env.C6_WITHDRAW_ISOLATED,"YES");assert.equal(process.env.DATABASE_URL||"","");
assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"55432");assert.equal(url.pathname,"/c6_withdraw");
const db=new pg.Pool({connectionString:url.href,max:20,statement_timeout:10000});
const q=(s,a)=>db.query(s,a);
const actor={user_type:"owner",user_id:11};
const request=(owner,amount,key,extra={})=>createWithdrawRequest(db,owner.type,owner.id,{amount,currency:owner.currency,idempotency_key:key,...extra},actor);
const salon=id=>({type:"salon",id,currency:"USD"});
const kg={type:"master",id:201,currency:"KGS"};
async function seed(o,amount=100){
 await q("INSERT INTO public.money_owner_balances(owner_type,owner_id,currency,available) VALUES($1,$2,$3,$4)",[o.type,o.id,o.currency,amount]);
 await q("INSERT INTO public.money_ledger_entries(entry_group_id,owner_type,owner_id,currency,money_zone,direction,amount,source_type,source_id) VALUES($1,$2,$3,$4,'available','credit',$5,'ci_fixture',1)",[randomUUID(),o.type,o.id,o.currency,amount]);
}
async function state(o){
 const b=(await q("SELECT available,locked FROM public.money_owner_balances WHERE owner_type=$1 AND owner_id=$2 AND currency=$3",[o.type,o.id,o.currency])).rows[0];
 const counts=(await q("SELECT (SELECT count(*) FROM public.withdraw_requests WHERE owner_type=$1 AND owner_id=$2 AND currency=$3)::int AS requests,(SELECT count(*) FROM public.money_ledger_entries WHERE owner_type=$1 AND owner_id=$2 AND currency=$3 AND source_type='withdraw_request')::int AS entries,(SELECT count(*) FROM public.money_audit_events WHERE owner_type=$1 AND owner_id=$2 AND currency=$3 AND event_type='withdraw_request_locked')::int AS audits",[o.type,o.id,o.currency])).rows[0];
 return {...counts,available:Number(b?.available||0),locked:Number(b?.locked||0)};
}
const conflict=e=>e?.code==="WITHDRAW_REQUEST_IDEMPOTENCY_CONFLICT"&&e.statusCode===409;
const insufficient=e=>e?.code==="INSUFFICIENT_AVAILABLE_BALANCE";
before(async()=>{
 assert.equal((await q("SELECT current_database() AS n")).rows[0].n,"c6_withdraw");
 assert.equal(Math.floor(Number((await q("SHOW server_version_num")).rows[0].server_version_num)/10000),17);
 for(const o of [salon(101),salon(102),salon(103),salon(104),salon(105),salon(106),salon(107),kg])await seed(o);
});
after(async()=>db.end());
test("12 concurrent exact replays: one request, one ledger pair, one audit",async()=>{
 const results=await Promise.all(Array.from({length:12},()=>request(salon(101),30,"ci-repeat")));
 assert.equal(results.filter(x=>!x.already_exists).length,1);
 assert.equal(new Set(results.map(x=>String(x.request.id))).size,1);
 assert.deepEqual(await state(salon(101)),{requests:1,entries:2,audits:1,available:70,locked:30});
});
test("foreign owner, role, currency, amount, mode and destination cannot replay a key",async()=>{
 const original=await state(salon(101));
 for(const [o,n,extra] of [[salon(102),30,{}],[{type:"master",id:101,currency:"USD"},30,{}],[{...salon(101),currency:"KGS"},30,{}],[salon(101),31,{}],[salon(101),30,{creation_mode:"scheduled"}],[salon(101),30,{destination_id:999}]]){
  await assert.rejects(()=>request(o,n,"ci-repeat",extra),conflict);
 }
 assert.deepEqual(await state(salon(101)),original);
 assert.deepEqual(await state(salon(102)),{requests:0,entries:0,audits:0,available:100,locked:0});
});
test("different owners racing for identical new key: one winner, no foreign response",async()=>{
 const results=await Promise.allSettled([request(salon(102),40,"ci-cross"),request(salon(103),40,"ci-cross")]);
 assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(results.filter(x=>x.status==="rejected"&&conflict(x.reason)).length,1);
 for(let i=0;i<2;i++){
  const o=salon(102+i);
  if(results[i].status==="fulfilled"){assert.equal(Number(results[i].value.request.owner_id),o.id);assert.deepEqual(await state(o),{requests:1,entries:2,audits:1,available:60,locked:40});}
  else assert.deepEqual(await state(o),{requests:0,entries:0,audits:0,available:100,locked:0});
 }
});
test("two distinct withdrawal keys cannot overspend the same available balance",async()=>{
 const o=salon(104),results=await Promise.allSettled([request(o,80,"ci-spend-a"),request(o,80,"ci-spend-b")]);
 assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(results.filter(x=>x.status==="rejected"&&insufficient(x.reason)).length,1);
 assert.deepEqual(await state(o),{requests:1,entries:2,audits:1,available:20,locked:80});
});
test("row lock waits for concurrent balance change and uses newly committed amount",async()=>{
 const o=salon(105),c=await db.connect();let pending;
 try{
  await c.query("BEGIN");
  await c.query("SELECT id FROM public.money_owner_balances WHERE owner_type='salon' AND owner_id=105 AND currency='USD' FOR UPDATE");
  pending=request(o,80,"ci-wait").then(value=>({value}),error=>({error}));
  let waiting=false;
  for(let i=0;i<50;i++){
   const r=await q("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM public.money_owner_balances%'");
   if(r.rows[0].n>0){waiting=true;break;}await sleep(40);
  }
  assert.equal(waiting,true,"withdrawal must actually wait on balance row lock");
  await c.query("UPDATE public.money_owner_balances SET available=10 WHERE owner_type='salon' AND owner_id=105 AND currency='USD'");
  await c.query("INSERT INTO public.money_ledger_entries(entry_group_id,owner_type,owner_id,currency,money_zone,direction,amount,source_type,source_id) VALUES($1,'salon',105,'USD','available','debit',90,'ci_fixture',2)",[randomUUID()]);
  await c.query("COMMIT");
  assert.ok(insufficient((await pending).error));
 }finally{await c.query("ROLLBACK").catch(()=>{});c.release();if(pending)await pending;}
 assert.deepEqual(await state(o),{requests:0,entries:0,audits:0,available:10,locked:0});
});
test("rollback releases key and balance locks and leaves no partial financial records",async()=>{
 const o=salon(106);
 await q("ALTER TABLE public.money_audit_events ADD CONSTRAINT ci_fail_audit CHECK (owner_id<>106)");
 await assert.rejects(()=>request(o,50,"ci-rollback"),e=>e.code==="23514");
 assert.deepEqual(await state(o),{requests:0,entries:0,audits:0,available:100,locked:0});
 await q("ALTER TABLE public.money_audit_events DROP CONSTRAINT ci_fail_audit");
 await request(o,50,"ci-rollback");
 assert.deepEqual(await state(o),{requests:1,entries:2,audits:1,available:50,locked:50});
});
test("null key still serializes withdrawals; insufficient missing balance creates nothing",async()=>{
 const o=salon(107);
 const rs=await Promise.allSettled([request(o,60,null),request(o,60,null)]);
 assert.equal(rs.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(rs.filter(x=>x.status==="rejected"&&insufficient(x.reason)).length,1);
 assert.deepEqual(await state(o),{requests:1,entries:2,audits:1,available:40,locked:60});
 await assert.rejects(()=>request(salon(999),1,"ci-missing"),insufficient);
 assert.deepEqual(await state(salon(999)),{requests:0,entries:0,audits:0,available:0,locked:0});
});
test("KG obligations preserve existing authority, currency, amount, ledger and audit",async()=>{
 await request(kg,25,"ci-kg");
 assert.deepEqual(await state(kg),{requests:1,entries:2,audits:1,available:75,locked:25});
 const prior=process.env.MONEY_CORE_WRITE_ENABLED;
 process.env.MONEY_CORE_WRITE_ENABLED="false";
 try{await assert.rejects(()=>request(kg,1,"ci-disabled"),e=>e.code==="MONEY_CORE_WRITE_DISABLED");}
 finally{process.env.MONEY_CORE_WRITE_ENABLED=prior;}
 assert.deepEqual(await state(kg),{requests:1,entries:2,audits:1,available:75,locked:25});
});
