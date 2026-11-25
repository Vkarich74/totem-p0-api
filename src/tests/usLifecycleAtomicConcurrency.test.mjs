// US-only lifecycle concurrency: actual transactional function with a
// serializing PostgreSQL row-lock adapter IN MEMORY. No network, real users,
// real bookings, payments, DB credentials or production writes.
import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
// Test-only source substitution for the hypothetical released commercial
// path. The production export is separately exercised with its real HOLD
// by lifecycleServerAuthority.test.mjs. Existing ownership check stays real.
const routeUrl=new URL("../routes/publicLifecycle.js",import.meta.url);
const source=fs.readFileSync(routeUrl,"utf8");
const start=source.indexOf("async function authorizeLifecycleWrite(");
const end=source.indexOf("// Historical exported name retained.",start);
assert.ok(start>=0&&end>start);
const synthetic=source.slice(0,start)+
  'async function authorizeLifecycleWrite(db,auth,booking){ const ownership=await authorizeUsLifecycleActor(db,auth,booking.salon_id,booking.master_id); return ownership.ok?null:denied(ownership.error,ownership.status); }\n'+source.slice(end);
const absolute=synthetic.replace(/from "([^"]+)";/g,(all,spec)=>spec.startsWith(".")?'from "'+new URL(spec,routeUrl).href+'";':all);
const {executeUsLifecycleTransaction}=await import("data:text/javascript;base64,"+Buffer.from(absolute).toString("base64"));

const auth={source:"session",session_id:"offline-only",role:"salon_admin",user_id:81};
class OfflinePostgres {
  constructor({status="reserved",pendingCash=false,owner=true,casConflict=false,liveIntent=null}={}){
    this.row={id:91,salon_id:734,salon_slug:"offline-us",master_id:46,
      master_slug:"offline-master",client_id:52,service_id:18,
      start_at:"2027-04-01T14:00:00.000Z",end_at:"2027-04-01T14:30:00.000Z",
      price_snapshot:45,status,calendar_slot_id:56};
    this.slot={id:56,status:"reserved"};
    this.payment={id:23,status:pendingCash?"pending":"confirmed",is_active:pendingCash};
    this.owner=owner;
    this.casConflict=casConflict;
    this.liveIntent=liveIntent;
    this.events=[];this.lastLock=Promise.resolve();
  }
  async connect(){
    const db=this;
    let inTx=false,unlock=null,snapshot=null;
    const query=async (sql,args=[])=>{
      const q=String(sql).replace(/\s+/g," ").trim();
      db.events.push(q);
      if(q==="BEGIN"){inTx=true;return {rowCount:0,rows:[]};}
      if(q.startsWith("SET LOCAL ")){assert.equal(inTx,true);return {rowCount:0,rows:[]};}
      if(q==="COMMIT" || q==="ROLLBACK"){
        if(q==="ROLLBACK" && snapshot){
          db.row={...snapshot.row};db.slot={...snapshot.slot};
          db.payment={...snapshot.payment};
        }
        if(unlock){unlock();unlock=null;}
        inTx=false;
        return {rowCount:0,rows:[]};
      }
      if(q.includes("FROM public.bookings b") && q.includes("FOR UPDATE OF b")){
        assert.equal(inTx,true,"US FOR UPDATE requires same transaction");
        const previous=db.lastLock;
        db.lastLock=new Promise(resolve=>{unlock=resolve;});
        await previous;
        snapshot={row:{...db.row},slot:{...db.slot},payment:{...db.payment}};
        const same=db.row.id===args[0] && db.row.salon_id===args[1];
        return {rows:same?[{...db.row}]:[],rowCount:same?1:0};
      }
      if(q.includes("FROM public.auth_users u")){
        return {rows:db.owner?[{granted:true}]:[],rowCount:db.owner?1:0};
      }
      if(q.includes("FROM public.us_stripe_live_payment_intents") && q.startsWith("SELECT")){
        assert.equal(inTx,true,"Stripe intent check must share booking transaction");
        assert.ok(q.includes("FOR UPDATE"),"Stripe intent check must lock row");
        return {rows:db.liveIntent?[{...db.liveIntent}]:[],rowCount:db.liveIntent?1:0};
      }
      if(q.includes("FROM public.payments") && q.startsWith("SELECT")){
        return {rows:db.payment.status==="pending" && db.payment.is_active
          ?[{...db.payment,provider:"direct"}]:[],rowCount:db.payment.status==="pending"?1:0};
      }
      if(q.startsWith("UPDATE public.bookings")){
        assert.equal(inTx,true,"write must remain in transaction");
        const match=db.row.id===args[0] && db.row.salon_id===args[1] &&
          db.row.status===args[2] && !db.casConflict;
        if(!match)return {rows:[],rowCount:0};
        const confirmed=q.includes("confirmed_at=NOW()");
        db.row.status=confirmed?"confirmed":args[3];
        return {rows:[{id:db.row.id}],rowCount:1};
      }
      if(q.startsWith("UPDATE public.payments")){
        assert.equal(inTx,true);
        if(db.payment.status==="pending" && db.payment.is_active){
          db.payment.status="rejected";db.payment.is_active=false;
          return {rows:[],rowCount:1};
        }
        return {rows:[],rowCount:0};
      }
      if(q.startsWith("SELECT id, calendar_slot_id")&&q.includes("FROM public.bookings")){
        assert.equal(inTx,true);
        return {rows:[{id:db.row.id,calendar_slot_id:db.row.calendar_slot_id}],rowCount:1};
      }
      if(q.startsWith("SELECT id, status") && q.includes("FROM public.calendar_slots")){
        assert.equal(inTx,true);
        return {rows:[{...db.slot}],rowCount:1};
      }
      if(q.startsWith("UPDATE public.calendar_slots")){
        assert.equal(inTx,true);
        if(db.slot.status==="cancelled")return {rows:[],rowCount:0};
        db.slot.status="cancelled";
        return {rows:[{status:"cancelled"}],rowCount:1};
      }
      throw new Error("OFFLINE_UNRECOGNIZED_SQL:"+q.slice(0,170));
    };
    return {query,release(){if(unlock)throw Error("TRANSACTION_LOCK_LEAK");}};
  }
}

function execute(db,action,overrides={}){
  return executeUsLifecycleTransaction(db,{
    auth,salonId:734,bookingId:91,action,...overrides
  });
}

test("US confirm holds row lock and uses status compare-and-swap",async()=>{
  const db=new OfflinePostgres();
  const first=await execute(db,"confirm");
  assert.deepEqual(first.body,{ok:true,status:"confirmed"});
  assert.equal(first.notify,false);
  assert.equal(db.row.status,"confirmed");
  assert.ok(db.events.some(s=>s.includes("FOR UPDATE OF b")));
  assert.ok(db.events.some(s=>s.includes("AND status IS NOT DISTINCT FROM $3 RETURNING id")));
  assert.equal(db.events.filter(s=>s==="COMMIT").length,1);
});

test("simultaneous complete vs cancel cannot both win after confirmed",async()=>{
  const db=new OfflinePostgres({status:"confirmed"});
  const results=await Promise.all([execute(db,"complete"),execute(db,"cancel")]);
  assert.equal(results.filter(x=>x.http===200).length,1);
  assert.equal(results.filter(x=>x.http===409).length,1);
  assert.ok(["completed","cancelled"].includes(db.row.status));
  assert.equal(db.slot.status,db.row.status==="cancelled"?"cancelled":"reserved");
  assert.equal(db.events.filter(s=>s.startsWith("UPDATE public.bookings")).length,1);
});

test("repeat confirm and repeat cancel never create a second mutation",async()=>{
  const a=new OfflinePostgres();
  const confirmed=await Promise.all([execute(a,"confirm"),execute(a,"confirm")]);
  assert.deepEqual(new Set(confirmed.map(x=>x.body.status)),
    new Set(["confirmed","already_confirmed"]));
  assert.equal(a.events.filter(s=>s.startsWith("UPDATE public.bookings")).length,1);
  const b=new OfflinePostgres();
  const cancelled=await Promise.all([execute(b,"cancel"),execute(b,"cancel")]);
  assert.deepEqual(new Set(cancelled.map(x=>x.body.status)),
    new Set(["cancelled","already_cancelled"]));
  assert.equal(b.events.filter(s=>s.startsWith("UPDATE public.bookings")).length,1);
  assert.equal(b.events.filter(s=>s.startsWith("UPDATE public.calendar_slots")).length,1);
  assert.equal(b.slot.status,"cancelled");
});

test("completion before confirmation is rejected without payment or slot write",async()=>{
  const db=new OfflinePostgres();
  const response=await execute(db,"complete");
  assert.equal(response.http,409);
  assert.equal(response.body.error,"BOOKING_PAYMENT_REQUIRED");
  assert.equal(db.row.status,"reserved");
  assert.equal(db.events.filter(s=>s.startsWith("UPDATE")).length,0);
});

test("pending direct cash blocks US completion inside the row lock",async()=>{
  const db=new OfflinePostgres({status:"confirmed",pendingCash:true});
  const response=await execute(db,"complete");
  assert.equal(response.http,409);
  assert.equal(response.body.error,"CASH_PAYMENT_PENDING_CONFIRMATION");
  assert.equal(db.row.status,"confirmed");
  assert.equal(db.payment.status,"pending");
  assert.equal(db.events.filter(s=>s.startsWith("UPDATE")).length,0);
});

test("unauthorized US salon returns 403 before any mutation",async()=>{
  const db=new OfflinePostgres({owner:false});
  const result=await execute(db,"cancel");
  assert.equal(result.http,403);
  assert.equal(result.body.error,"US_LIFECYCLE_OWNER_FORBIDDEN");
  assert.equal(db.events.filter(s=>s.startsWith("UPDATE")).length,0);
});

test("other salon booking id cannot be updated or release slot",async()=>{
  const db=new OfflinePostgres();
  const result=await execute(db,"cancel",{salonId:730});
  assert.equal(result.http,404);
  assert.equal(db.row.status,"reserved");
  assert.equal(db.slot.status,"reserved");
  assert.equal(db.events.filter(s=>s.startsWith("UPDATE")).length,0);
});

test("failed CAS rolls back and does not release slot or reject payment",async()=>{
  const db=new OfflinePostgres({status:"confirmed",pendingCash:true,casConflict:true});
  // Confirm attempt uses authorized booking but concurrent CAS mismatch.
  const result=await execute(db,"cancel");
  assert.equal(result.http,409);
  assert.equal(result.body.error,"US_LIFECYCLE_STATUS_CONFLICT");
  assert.equal(db.row.status,"confirmed");
  assert.equal(db.payment.status,"pending");
  assert.equal(db.slot.status,"reserved");
  assert.equal(db.events.filter(s=>s.startsWith("UPDATE public.payments")).length,0);
});

test("US cancellation atomically updates booking, cash and slot",async()=>{
  const db=new OfflinePostgres({status:"confirmed",pendingCash:true});
  const r=await execute(db,"cancel");
  assert.equal(r.http,200);
  assert.equal(r.notify,true);
  assert.equal(db.row.status,"cancelled");
  assert.equal(db.payment.status,"rejected");
  assert.equal(db.slot.status,"cancelled");
  const commit=db.events.findIndex(s=>s==="COMMIT");
  assert.ok(commit>db.events.findIndex(s=>s.startsWith("UPDATE public.calendar_slots")));
});

test("confirm after cancellation and cancel after completion fail closed",async()=>{
  for(const [status,action] of [["cancelled","confirm"],["completed","cancel"]]){
    const db=new OfflinePostgres({status});
    const r=await execute(db,action);
    assert.equal(r.http,409);
    assert.equal(db.events.filter(s=>s.startsWith("UPDATE")).length,0);
    assert.equal(db.row.status,status);
  }
});

test("all markets use existing transaction and notify only after commit",()=>{
  const s=fs.readFileSync(new URL("../routes/publicLifecycle.js",import.meta.url),"utf8");
  const route=s.slice(s.indexOf("export async function publicLifecycle("));
  assert.match(route,/executeUsLifecycleTransaction\(pool/);
  assert.match(route,/marketCode,marketId/);
  assert.match(s,/FOR UPDATE OF b/);
  assert.match(s,/WHERE id=\$1 AND salon_id=\$2 AND status IS NOT DISTINCT FROM \$3 RETURNING id/);
  assert.match(s,/if\(result.notify\)/);
  assert.match(s,/notifyUsLifecycleAfterCommit\(result.booking,result.action\)/);
});


test("US cancel fails closed for every LIVE Stripe attempt status",async()=>{
  for(const status of ["creating","requires_payment_method","requires_action",
    "processing","succeeded","refunded","disputed","canceled","failed",
    "requires_review","unknown_future_state"]){
    const db=new OfflinePostgres({status:"confirmed",liveIntent:{status,
      stripe_payment_intent_id:status==="creating"?null:"pi_offline123456"}});
    const res=await execute(db,"cancel");
    assert.equal(res.http,409,status);
    assert.equal(res.body.error,"US_LIFECYCLE_STRIPE_RECONCILIATION_REQUIRED",status);
    assert.equal(db.row.status,"confirmed",status);
    assert.equal(db.slot.status,"reserved",status);
    assert.equal(db.events.filter(s=>s.startsWith("UPDATE")).length,0,status);
    const bookingLock=db.events.findIndex(s=>s.includes("FOR UPDATE OF b"));
    const stripeLock=db.events.findIndex(s=>s.includes("FROM public.us_stripe_live_payment_intents"));
    assert.ok(bookingLock>=0 && stripeLock>bookingLock,status);
  }
});

test("US cancel without LIVE intent keeps original atomic cash and slot semantics",async()=>{
  const db=new OfflinePostgres({status:"confirmed",pendingCash:true,liveIntent:null});
  const res=await execute(db,"cancel");
  assert.equal(res.http,200);
  assert.equal(db.row.status,"cancelled");
  assert.equal(db.payment.status,"rejected");
  assert.equal(db.slot.status,"cancelled");
});
