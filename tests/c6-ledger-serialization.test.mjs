// Only disposable PG17 synthetic obligations. No bank, Stripe, Odoo, or mail.
import test,{before,after,mock} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {randomUUID} from "node:crypto";
mock.module(new URL("../src/services/notifications/notificationService.js",import.meta.url),{namedExports:{createNotification:async()=>({id:1})}});
const {createMoneyLedgerMovement:move,rebuildOwnerBalanceFromLedger:rebuild}=await import("../src/money-core/ledger.service.js");
const {createWithdrawRequest:withdraw}=await import("../src/money-core/withdrawRequests.service.js");
const {createPayoutExecution,submitManualPayoutExecution,completePayoutExecution,failPayoutExecution}=await import("../src/money-core/payoutExecutions.service.js");
const {createSettlementSplitAllocations}=await import("../src/money-core/split.service.js");
const {createLedgerEntriesForXpaySettlement:bridge}=await import("../src/money-core/xpayLedgerBridge.service.js");
const {confirmBankReceived}=await import("../src/money-core/settlements.service.js");
const url=new URL(process.env.G5_TEST_DATABASE_URL||"");
assert.equal(process.env.C6_LEDGER_ISOLATED,"YES");assert.equal(process.env.DATABASE_URL||"","");
assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"55432");assert.equal(url.pathname,"/c6_ledger");
const db=new pg.Pool({connectionString:url.href,max:24,statement_timeout:15000});
const q=(s,a)=>db.query(s,a);
const actor={user_type:"owner",user_id:11};
const admin={user_type:"admin",user_id:12};
const tx=async fn=>{const c=await db.connect();try{await c.query("BEGIN");const r=await fn(c);await c.query("COMMIT");return r;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}};
let sequence=0;
const o=(id,currency="USD",type="salon")=>({owner_type:type,owner_id:id,currency});
const entry=(owner,amount,direction="credit",zone="available")=>({...owner,amount,direction,money_zone:zone,source_type:"ci_fixture",source_id:++sequence});
const credit=(owner,amount)=>move(db,{...entry(owner,amount),allow_single_entry:true},actor);
const request=(owner,amount,key)=>withdraw(db,owner.owner_type,owner.owner_id,{amount,currency:owner.currency,idempotency_key:key},actor);
async function check(owner,available,locked=0,paid=0){
 const a=[owner.owner_type,owner.owner_id,owner.currency];
 const b=(await q("SELECT available,locked,paid_out FROM public.money_owner_balances WHERE owner_type=$1 AND owner_id=$2 AND currency=$3",a)).rows[0];
 assert.ok(b);
 assert.deepEqual([Number(b.available),Number(b.locked),Number(b.paid_out)],[available,locked,paid]);
 const l=(await q("SELECT money_zone,sum(CASE WHEN direction='credit' THEN amount ELSE -amount END) AS n FROM public.money_ledger_entries WHERE owner_type=$1 AND owner_id=$2 AND currency=$3 GROUP BY money_zone",a)).rows;
 const z=Object.fromEntries(l.map(r=>[r.money_zone,Number(r.n)]));
 assert.deepEqual([z.available||0,z.locked||0,z.paid_out||0],[available,locked,paid]);
}
before(async()=>{
 assert.equal((await q("SELECT current_database() AS n")).rows[0].n,"c6_ledger");
 assert.equal(Math.floor(Number((await q("SHOW server_version_num")).rows[0].server_version_num)/10000),17);
});
after(async()=>db.end());
test("12 concurrent ledger credits create one balance from absent row, no lost funds",async()=>{
 const owner=o(101);await Promise.all(Array.from({length:12},()=>credit(owner,10)));
 await check(owner,120);
 assert.equal(Number((await q("SELECT count(*) AS n FROM public.money_owner_balances WHERE owner_id=101")).rows[0].n),1);
});
test("rebuild and withdrawal and direct credits share exact owner currency lock",async()=>{
 const owner=o(102);await credit(owner,100);
 await Promise.all([request(owner,70,"ci-mixed"),credit(owner,40),rebuild(db,"salon",102,"USD",actor),credit(owner,20)]);
 await check(owner,90,70);
});
test("concurrent debit and withdrawal cannot overdraw even across different writers",async()=>{
 const owner=o(103);await credit(owner,100);
 const r=await Promise.allSettled([request(owner,80,"ci-overdraw"),move(db,{...entry(owner,80,"debit"),allow_single_entry:true},actor)]);
 assert.equal(r.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(r.filter(x=>x.status==="rejected").length,1);
 const v=r[0].status==="fulfilled"?80:0;
 await check(owner,20,v);
});
test("reverse multi-owner transfers serialize deterministically, preserve currencies",async()=>{
 const a=o(104),b=o(105);await credit(a,100);await credit(b,100);await credit(o(104,"KGS"),25);
 await Promise.all(Array.from({length:10},(_,i)=>move(db,{entries:i%2?[entry(a,3,"debit"),entry(b,3)]:[entry(b,3,"debit"),entry(a,3)]},actor)));
 await check(a,100);await check(b,100);await check(o(104,"KGS"),25);
});
test("payout completion races with ledger credit and withdrawal, one terminal result",async()=>{
 const owner=o(106);await credit(owner,200);
 const w=await request(owner,50,"ci-payout");
 const p=await createPayoutExecution(db,{withdraw_request_id:Number(w.request.id)},admin);
 await submitManualPayoutExecution(db,Number(p.id),{},admin);
 const r=await Promise.allSettled([completePayoutExecution(db,Number(p.id),{external_ref:"ci-ref"},admin),failPayoutExecution(db,Number(p.id),{failure_reason:"ci"},admin),credit(owner,10),request(owner,20,"ci-payout-new")]);
 assert.equal(r.slice(0,2).filter(x=>x.status==="fulfilled").length,1);
 assert.equal(r.slice(0,2).filter(x=>x.status==="rejected"&&x.reason.code==="PAYOUT_ALREADY_TERMINAL").length,1);
 assert.equal(r[2].status,"fulfilled");assert.equal(r[3].status,"fulfilled");
 await check(owner,r[0].status==="fulfilled"?140:190,20,r[0].status==="fulfilled"?50:0);
});
test("failed payout restores locked funds and missing payout does not leak transaction",async()=>{
 const owner=o(107);await credit(owner,100);
 const w=await request(owner,60,"ci-fail");
 const p=await createPayoutExecution(db,{withdraw_request_id:Number(w.request.id)},admin);
 await submitManualPayoutExecution(db,Number(p.id),{},admin);
 await Promise.all([failPayoutExecution(db,Number(p.id),{failure_reason:"ci"},admin),credit(owner,15)]);
 await check(owner,115);
 for(const fn of [submitManualPayoutExecution,completePayoutExecution,failPayoutExecution])assert.equal(await fn(db,999999,{},admin),null);
 const r=await q("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'");
 assert.equal(Number(r.rows[0].n),0);
});
async function settlement(status="bank_received"){
 return Number((await q("INSERT INTO public.provider_settlements(provider_code,settlement_source,status,amount_gross,amount_net,currency) VALUES('xpay','manual',$1,100,100,'KGS') RETURNING id",[status])).rows[0].id);
}
async function splitFixture(id,owner,amount,paymentId){
 await q("INSERT INTO public.provider_settlement_items(provider_settlement_id,payment_id,amount_gross,amount_net,currency) VALUES($1,$2,$3,$3,'KGS')",[id,paymentId,amount]);
 return Number((await q("INSERT INTO public.money_split_allocations(provider_settlement_id,payment_id,owner_type,owner_id,role_in_split,gross_amount,owner_net_amount,currency,status) VALUES($1,$2,$3,$4,$3,$5,$5,'KGS','draft') RETURNING id",[id,paymentId,owner.owner_type,owner.owner_id,amount])).rows[0].id);
}
test("XPay actual settlement bridge credits salon/master/platform 0 exactly once; concurrent withdrawal safe",async()=>{
 const id=await settlement("draft"),a=o(108,"KGS"),b=o(109,"KGS","master"),platform=o(0,"KGS","platform");
 await credit(a,100);await splitFixture(id,a,50,801);await splitFixture(id,b,40,802);await splitFixture(id,platform,10,803);
 await Promise.all([confirmBankReceived(db,id,{},admin),request(a,70,"ci-xpay-withdraw")]);
 await Promise.all(Array.from({length:6},()=>tx(c=>bridge(c,{providerSettlementId:id,actor:admin}))));
 await check(a,80,70);await check(b,40);await check(platform,10);
 const count=await q("SELECT count(*) AS n FROM public.money_ledger_entries WHERE source_type='xpay_split_allocation'");
 assert.equal(Number(count.rows[0].n),3);
 // Generic API remains closed to platform id zero.
 await assert.rejects(()=>rebuild(db,"platform",0,"KGS",admin),e=>e.code==="MONEY_LEDGER_OWNER_INVALID");
});
test("XPay allocation amount mismatch on replay rolls back, no silent conflicting credit",async()=>{
 const id=await settlement(),a=o(110,"KGS"),allocation=await splitFixture(id,a,20,804);
 await tx(c=>bridge(c,{providerSettlementId:id,actor:admin}));await check(a,20);
 await q("UPDATE public.money_split_allocations SET owner_net_amount=21 WHERE id=$1",[allocation]);
 await assert.rejects(()=>tx(c=>bridge(c,{providerSettlementId:id,actor:admin})),e=>e.code==="XPAY_LEDGER_REPLAY_CONFLICT");
 await check(a,20);
});
test("parallel first split application creates one set; existing settlement row serializes",async()=>{
 const id=await settlement("draft");
 const input={allocations:[{payment_id:805,owner_type:"salon",owner_id:111,role_in_split:"salon",gross_amount:30,owner_net_amount:30,currency:"KGS"}]};
 const r=await Promise.all(Array.from({length:8},()=>createSettlementSplitAllocations(db,id,input,admin)));
 assert.equal(r.filter(x=>!x.already_exists).length,1);
 assert.equal(Number((await q("SELECT count(*) AS n FROM public.money_split_allocations WHERE provider_settlement_id=$1",[id])).rows[0].n),1);
});
