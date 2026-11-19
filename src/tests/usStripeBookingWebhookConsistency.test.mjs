// US booking/payment coherence: signed LIVE Stripe events replayed only against
// a fully in-memory SQL adapter. Never uses PostgreSQL, Stripe network or users.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import fs from "node:fs";
import {acceptSignedUsC11LivePaymentEvent} from
  "../services/usPayC11LivePaymentWebhook.service.js";

const SECRET="whsec_offline_only_123456789";
const ACCOUNT="acct_offlineABC123";
const PI="pi_offlineABC123";
const RESERVATION="11111111-1111-4111-8111-111111111111";

function signedEvent({type="payment_intent.succeeded",status="succeeded",
  amount=10500,eventId="evt_offlineABC123",created=Math.floor(Date.now()/1000)}={}){
  const o={object:"event",id:eventId,created,livemode:true,
    account:ACCOUNT,type,data:{object:{
      object:"payment_intent",id:PI,livemode:true,currency:"usd",
      amount,amount_received:amount,status,
      metadata:{totem_us_booking_id:"91",totem_us_reservation:RESERVATION,
        totem_market:"US"},
    }}};
  const rawBody=Buffer.from(JSON.stringify(o));
  const digest=createHmac("sha256",SECRET)
    .update(String(created)).update(".").update(rawBody).digest("hex");
  return {rawBody,stripeSignature:"t="+created+",v1="+digest,
    webhookSecret:SECRET};
}
class MemoryStripeBooking {
  constructor({bookingStatus="confirmed",amountMinor=10500,duplicate=false,
    haveBooking=true,eventCreated=null,paidStatus="processing"}={}){
    this.bookingStatus=bookingStatus;this.amountMinor=amountMinor;
    this.duplicate=duplicate;this.haveBooking=haveBooking;
    this.intentStatus=paidStatus;this.intentEventCreated=eventCreated;
    this.receipt=null;this.operations=[];this.isLocked=false;
    this.currentTx=false;
  }
  async connect(){return this;}
  release(){assert.equal(this.currentTx,false);}
  async query(sql,args=[]){
    const q=String(sql).replace(/\s+/g," ").trim();
    this.operations.push(q);
    if(q==="BEGIN"){this.currentTx=true;return {rows:[],rowCount:0};}
    if(q==="COMMIT"||q==="ROLLBACK"){
      this.currentTx=false;this.isLocked=false;
      return {rows:[],rowCount:0};
    }
    if(q.startsWith("SET LOCAL"))return {rows:[],rowCount:0};
    if(q.startsWith("SELECT 1 FROM public.us_stripe_live_payment_receipts")){
      return {rows:this.duplicate?[{one:1}]:[],rowCount:this.duplicate?1:0};
    }
    if(q.includes("FROM public.bookings b")&&q.includes("FOR UPDATE OF b")){
      assert.equal(this.currentTx,true);
      assert.ok(q.includes("m.code='US'"));
      this.isLocked=this.haveBooking;
      return {rows:this.haveBooking?[{id:91,status:this.bookingStatus}]:[],
        rowCount:this.haveBooking?1:0};
    }
    if(q.includes("FROM public.us_stripe_live_payment_intents")&&
       q.includes("FOR UPDATE")){
      if(this.haveBooking)assert.equal(this.isLocked,true,
        "must lock booking before LIVE Stripe attempt");
      return {rows:[{
        booking_id:91,market_id:3,collector_owner_type:"salon",
        collector_owner_id:712,collector_revision:2,
        reservation_token:RESERVATION,stripe_account_id:ACCOUNT,
        stripe_payment_intent_id:null,status:this.intentStatus,
        stripe_event_created:this.intentEventCreated,
        amount_minor:this.amountMinor,currency_code:"USD",
      }],rowCount:1};
    }
    if(q.includes("FROM public.us_booking_service_tax_snapshots tq")){
      return {rows:[{
        market_id:3,payment_purpose:"beauty_service",
        collector_owner_type:"salon",collector_owner_id:712,
        collector_revision:2,currency_code:"USD",
        base_minor:"10000",tax_minor:"500",total_minor:"10500",
        authoritative_base:"10000",live_owner_type:"salon",
        live_owner_id:712,live_revision:2,
      }],rowCount:1};
    }
    if(q.startsWith("INSERT INTO public.us_stripe_live_payment_receipts")){
      assert.equal(this.currentTx,true);
      this.receipt={eventId:args[0],bookingId:args[1],result:args[7]};
      return {rows:[{stripe_event_id:args[0]}],rowCount:1};
    }
    if(q.startsWith("UPDATE public.us_stripe_live_payment_intents")){
      assert.equal(this.isLocked,true);
      assert.equal(args[0],91);assert.equal(args[5],ACCOUNT);
      this.intentStatus=args[2];this.intentEventCreated=args[3];
      return {rows:[{booking_id:91}],rowCount:1};
    }
    throw Error("UNEXPECTED_OFFLINE_QUERY:"+q.slice(0,180));
  }
}
const accept=(db,event=signedEvent())=>acceptSignedUsC11LivePaymentEvent({
  pool:db,...event,
});

test("signed succeeded on live US booking is accepted while preserving booking",async()=>{
  const db=new MemoryStripeBooking();
  const x=await accept(db);
  assert.equal(x.status,200);
  assert.equal(x.body.result,"accepted");
  assert.equal(x.body.payment_status_updated,true);
  assert.equal(x.body.reconciliation_required,false);
  assert.equal(db.intentStatus,"succeeded");
  assert.equal(db.bookingStatus,"confirmed");
  assert.equal(db.receipt.result,"accepted");
  const booking=db.operations.findIndex(q=>q.includes("FROM public.bookings b"));
  const intent=db.operations.findIndex(q=>
    q.includes("FROM public.us_stripe_live_payment_intents"));
  assert.ok(booking>=0 && intent>booking);
});

test("signed succeeded AFTER canceled US booking keeps financial truth and flags review",async()=>{
  const db=new MemoryStripeBooking({bookingStatus:"cancelled"});
  const x=await accept(db);
  assert.equal(x.status,200);
  assert.equal(x.body.result,"accepted");
  assert.equal(x.body.reconciliation_required,true);
  assert.equal(db.intentStatus,"succeeded");
  assert.equal(db.receipt.result,"accepted");
  assert.equal(db.bookingStatus,"cancelled");
  assert.equal(db.operations.some(q=>q.includes("UPDATE public.bookings")),false);
  assert.equal(db.operations.some(q=>q.includes("UPDATE public.calendar_slots")),false);
});

test("signed processing AFTER cancellation is observable but never booked again",async()=>{
  const db=new MemoryStripeBooking({bookingStatus:"cancelled"});
  const x=await accept(db,signedEvent({
    type:"payment_intent.processing",status:"processing"
  }));
  assert.equal(x.status,200);
  assert.equal(x.body.reconciliation_required,true);
  assert.equal(db.intentStatus,"processing");
  assert.equal(db.bookingStatus,"cancelled");
});

test("invalid signature fails before opening any transaction",async()=>{
  const db=new MemoryStripeBooking();
  const e=signedEvent();
  e.stripeSignature="t=1,v1="+"0".repeat(64);
  const x=await accept(db,e);
  assert.equal(x.status,400);
  assert.equal(x.body.error,"US_C11_LIVE_PAYMENT_SIGNATURE_INVALID");
  assert.deepEqual(db.operations,[]);
});

test("wrong Stripe amount records signed rejected mismatch without payment update",async()=>{
  const db=new MemoryStripeBooking({amountMinor:11700});
  const x=await accept(db);
  assert.equal(x.status,200);
  assert.equal(x.body.result,"rejected_mismatch");
  assert.equal(x.body.payment_status_updated,false);
  assert.equal(db.receipt.result,"rejected_mismatch");
  assert.equal(db.intentStatus,"processing");
});

test("older Stripe event stays stale; signed truth not overwritten",async()=>{
  const db=new MemoryStripeBooking({eventCreated:Math.floor(Date.now()/1000)+5});
  const x=await accept(db);
  assert.equal(x.status,200);
  assert.equal(x.body.result,"stale");
  assert.equal(db.intentStatus,"processing");
});

test("duplicate signed event returns idempotent success without writes",async()=>{
  const db=new MemoryStripeBooking({duplicate:true});
  const x=await accept(db);
  assert.equal(x.status,200);
  assert.equal(x.body.result,"duplicate");
  assert.equal(db.receipt,null);
  assert.equal(db.operations.some(q=>q.startsWith("UPDATE")),false);
});

test("orphan/non-US signed event cannot update US intent",async()=>{
  const db=new MemoryStripeBooking({haveBooking:false});
  const x=await accept(db);
  assert.equal(x.status,200);
  assert.equal(x.body.result,"rejected_mismatch");
  assert.equal(db.intentStatus,"processing");
  assert.equal(db.receipt.bookingId,null);
});

test("LIVE direct charge second transaction locks booking before intent and credential response",()=>{
  const s=fs.readFileSync(new URL("../services/usPayC11LiveDirectCharge.service.js",import.meta.url),"utf8");
  const second=s.slice(s.indexOf("const committed=await tx(pool,async db=>{"));
  assert.ok(second.length>1000);
  const booking=second.indexOf("SELECT id,status FROM public.bookings");
  const intent=second.indexOf("SELECT * FROM public.us_stripe_live_payment_intents");
  const secret=second.indexOf("publicLiveStripePaymentCredentials(");
  assert.ok(booking>0 && intent>booking && secret>intent);
  assert.ok(second.includes('US_C11_LIVE_BOOKING_CHANGED_RECONCILIATION_REQUIRED'));
  assert.ok(second.includes('["reserved","confirmed"].includes(currentBooking.rows[0].status)'));
});

test("US cancellation rejects active Stripe intent without touching payment or slot",()=>{
  const s=fs.readFileSync(new URL("../routes/publicLifecycle.js",import.meta.url),"utf8");
  const from=s.slice(s.indexOf("export async function executeUsLifecycleTransaction"));
  const intent=from.indexOf("SELECT status,stripe_payment_intent_id");
  const payment=from.indexOf("UPDATE public.payments");
  const slot=from.indexOf("releaseCalendarSlotForBooking(tx");
  assert.ok(intent>0 && payment>intent && slot>payment);
  assert.ok(from.includes("US_LIFECYCLE_STRIPE_RECONCILIATION_REQUIRED"));
  assert.ok(from.includes("FOR UPDATE OF b"));
  assert.ok(from.includes("FOR UPDATE"));
});
