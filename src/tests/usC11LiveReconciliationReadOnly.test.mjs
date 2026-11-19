// US-only exception-state/read-only reviewer contract.
// All principals, money, and SQL rows in memory; no PostgreSQL or Stripe.
import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import {
  classifyUsC11LiveReconciliation,
  readUsC11LiveReconciliation,
} from "../services/usPayC11LiveReconciliation.service.js";

const uuid="11111111-1111-4111-8111-111111111111";
const salonAuth={role:"salon_admin",source:"session",session_id:uuid,user_id:81};
const base=Object.freeze({
  booking_id:91,booking_status:"confirmed",
  intent_booking_id:91,intent_status:"processing",
  intent_payment_intent_id:"pi_offlineABC123",intent_account_id:"acct_offlineABC123",
  collector_owner_type:"salon",collector_owner_id:32,
  amount_minor:"10500",authoritative_total_minor:"10500",quote_currency:"USD",
  last_receipt_booking_id:91,last_receipt_intent_id:"pi_offlineABC123",
  last_receipt_account_id:"acct_offlineABC123",
  last_signature_verified:true,last_receipt_result:"accepted",
  last_event_type:"payment_intent.processing",
  accepted_success_events:0,succeeded_refund_minor:"0",dispute_count:0,
});
const classify=(patch={},opts={})=>classifyUsC11LiveReconciliation(
  {...base,...patch},{ownerType:"salon",ownerId:32,...opts}
);
function offlinePool({owner=true,booking=true,role="salon_admin",row=base}={}){
  const queries=[];
  const pool={queries,async connect(){
    let open=false;
    return {
      async query(sql,args=[]){
        const q=String(sql).replace(/\s+/g," ").trim();
        queries.push({sql:q,args});
        if(/^(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)/i.test(q))
          throw Error("PRODUCTION_MUTATION_FORBIDDEN");
        if(q==="BEGIN READ ONLY"){open=true;return {rows:[]};}
        if(q==="ROLLBACK"){open=false;return {rows:[]};}
        if(q.startsWith("SET LOCAL"))return {rows:[]};
        if(q.includes("FROM public.auth_sessions sess")){
          return {rows:owner?[{one:1}]:[]};
        }
        if(q.includes("FROM public.salons s")&&q.includes("JOIN public.owner_salon os")){
          return {rows:owner?[{market_id:3,slug:"offline-us"}]:[]};
        }
        if(q.includes("FROM public.masters mas")&&q.includes("JOIN public.master_salon ms")){
          return {rows:owner?[{market_id:3,slug:"offline-us"}]:[]};
        }
        if(q.includes("FROM public.bookings b")){
          assert.match(q,/m\.code='US'/);
          assert.match(q,/m\.default_currency='USD'/);
          assert.match(q,/b\.currency_code='USD'/);
          assert.match(q,/b\.id=\$1/);
          assert.deepEqual(args.slice(0,2),[91,role==="master"?"master":"salon"]);
          return {rows:booking?[row]:[]};
        }
        throw Error("UNEXPECTED_READONLY_SQL:"+q.slice(0,130));
      },
      release(){assert.equal(open,false,"READ ONLY transaction must ROLLBACK");},
    };
  }};
  return pool;
}

test("no US live intent: no fabricated money or reviewer resolution",()=>{
  const result=classify({
    intent_booking_id:null,intent_status:null,intent_payment_intent_id:null
  });
  assert.equal(result.case_status,"no_live_attempt");
  assert.equal(result.manual_review_required,false);
  assert.equal(result.stripe_payment_intent_reference,undefined);
  assert.equal(result.review_closed,false);
  assert.equal(result.safe_to_cancel_via_reconciliation,false);
});

test("creating/processing/action/unknown states fail closed without refund",()=>{
  for(const status of [
    "creating","processing","requires_action","requires_confirmation",
    "requires_payment_method","requires_review","unknown_future_state",
  ]){
    const r=classify({intent_status:status});
    assert.equal(r.case_status,"manual_review",status);
    assert.equal(r.manual_review_required,true,status);
    assert.equal(r.automatic_refund_allowed,false,status);
    assert.equal(r.safe_to_cancel_via_reconciliation,false,status);
    assert.equal(r.review_closed,false,status);
  }
});

test("signed paid after US booking cancellation is never hidden or auto-refunded",()=>{
  const r=classify({
    booking_status:"cancelled",intent_status:"succeeded",
    accepted_success_events:1,last_event_type:"payment_intent.succeeded",
  });
  assert.equal(r.reason_code,"US_C11_CANCELLED_WITH_FUNDS_OR_DISPUTE");
  assert.equal(r.signed_success_observed,true);
  assert.equal(r.verified_signed_evidence,true);
  assert.equal(r.automatic_refund_allowed,false);
  assert.equal(r.review_closed,false);
});

test("signed refunded/disputed remains auditable and requires owner verification",()=>{
  for(const [s,counts] of [
    ["refunded",{succeeded_refund_minor:"10500"}],
    ["disputed",{dispute_count:1}],
  ]){
    const r=classify({intent_status:s,...counts});
    assert.equal(r.reason_code,"US_C11_FINANCIAL_SETTLEMENT_REQUIRES_REVIEW");
    assert.equal(r.manual_review_required,true);
    assert.equal(r.review_closed,false);
  }
});

test("signed terminal canceled still needs external Stripe verification",()=>{
  const r=classify({
    intent_status:"canceled",last_event_type:"payment_intent.canceled"
  });
  assert.equal(r.reason_code,"US_C11_TERMINAL_EVIDENCE_NEEDS_OWNER_VERIFICATION");
  assert.equal(r.verified_signed_evidence,true);
  assert.equal(r.safe_to_cancel_via_reconciliation,false);
});

test("terminal canceled/failed with previous paid receipt is never automatically cleared",()=>{
  const r=classify({
    intent_status:"canceled",last_event_type:"payment_intent.canceled",
    accepted_success_events:1,
  });
  assert.equal(r.reason_code,"US_C11_FINANCIAL_SETTLEMENT_REQUIRES_REVIEW");
  assert.equal(r.signed_success_observed,true);
  assert.equal(r.review_closed,false);
});

test("forged/unlinked last receipt is not verified financial evidence",()=>{
  for(const patch of [
    {last_signature_verified:false},
    {last_receipt_result:"rejected_mismatch"},
    {last_receipt_intent_id:"pi_otherABC123"},
    {last_receipt_account_id:"acct_otherABC123"},
    {last_receipt_booking_id:100},
    {quote_currency:"KGS"},
    {authoritative_total_minor:"99999"},
  ]){
    const r=classify(patch);
    assert.equal(r.verified_signed_evidence,false);
    assert.equal(r.manual_review_required,true);
  }
});

test("other collector cannot receive Stripe PI id or USD amount",()=>{
  const r=classify({collector_owner_type:"master",collector_owner_id:47});
  assert.equal(r.connected_seller_is_reviewer,false);
  assert.equal(r.stripe_payment_intent_reference,null);
  assert.equal(r.next_steps[0],"CONTACT_VERIFIED_PAYMENT_COLLECTOR");
});

test("actual authenticated owner read uses BEGIN READ ONLY and no financial writes",async()=>{
  const pool=offlinePool();
  const r=await readUsC11LiveReconciliation(pool,{
    auth:salonAuth,ownerType:"salon",ownerId:32,bookingId:91,
  });
  assert.equal(r.status,200);
  assert.equal(r.body.ok,true);
  assert.equal(r.body.read_only,true);
  assert.equal(r.body.persistent_review_acknowledgment,false);
  assert.equal(r.body.financial_operation_performed,false);
  assert.equal(r.body.reconciliation.payment_intent_status,"processing");
  assert.equal(r.body.reconciliation.manual_review_required,true);
  assert.equal(r.body.reconciliation.stripe_payment_intent_reference,
    "pi_offlineABC123");
  assert.equal(r.body.amount_minor,"10500");
  assert.equal(pool.queries[0].sql,"BEGIN READ ONLY");
  assert.equal(pool.queries.at(-1).sql,"ROLLBACK");
  assert.ok(pool.queries.every(q=>!/^\s*(UPDATE|INSERT|DELETE)/i.test(q.sql)));
});

test("session that is invalid, revoked or wrong role cannot get any payment evidence",async()=>{
  const invalid=[
    {...salonAuth,role:"admin"},
    {...salonAuth,role:"master"},
    {...salonAuth,source:"jwt_legacy"},
    {...salonAuth,session_id:"bad"},
  ];
  for(const auth of invalid){
    const pool=offlinePool();
    const r=await readUsC11LiveReconciliation(pool,{
      auth,ownerType:"salon",ownerId:32,bookingId:91,
    });
    assert.equal(r.status,404);
    assert.equal(pool.queries.some(q=>q.sql.includes("FROM public.bookings b")),false);
  }
  const pool=offlinePool({owner:false});
  const r=await readUsC11LiveReconciliation(pool,{
    auth:salonAuth,ownerType:"salon",ownerId:32,bookingId:91,
  });
  assert.equal(r.status,404);
  assert.equal(pool.queries.some(q=>q.sql.includes("FROM public.bookings b")),false);
});

test("foreign booking and invalid IDs fail closed without financial evidence",async()=>{
  const pool=offlinePool({booking:false});
  const missing=await readUsC11LiveReconciliation(pool,{
    auth:salonAuth,ownerType:"salon",ownerId:32,bookingId:91,
  });
  assert.equal(missing.status,404);
  const invalid=await readUsC11LiveReconciliation(pool,{
    auth:salonAuth,ownerType:"salon",ownerId:32,bookingId:"-1",
  });
  assert.equal(invalid.status,400);
});

test("existing owner router exposes only authenticated no-store GET, not review-close POST",()=>{
  const s=fs.readFileSync(new URL(
    "../routes/internalUsPayC11LiveRefund.js",import.meta.url),"utf8");
  const route=s.slice(s.indexOf("  // Read-only manual reconciliation"));
  const stop=route.indexOf('"/us-pay-c11/live-connect/:ownerType/:ownerId/bookings/:bookingId/refund/quote"');
  assert.ok(stop>0);
  const review=route.slice(0,stop);
  assert.match(review,/router\.get\(/);
  assert.match(review,/requireAuth/);
  assert.match(review,/Cache-Control","private, no-store"/);
  assert.match(review,/readUsC11LiveReconciliation\(pool/);
  assert.doesNotMatch(review,/router\.post|router\.put|router\.patch|stripeRefu(nd|ndCreate)/i);
});

test("reviewer instructions contain no implicit cancellation or financial movement",()=>{
  const r=classify();
  assert.ok(r.next_steps.includes("VERIFY_CONNECTED_STRIPE_ACCOUNT_AND_INTENT_IN_SELLER_DASHBOARD"));
  assert.ok(r.next_steps.includes("DOCUMENT_EXTERNAL_REVIEW_BEFORE_AUTHORIZED_SEPARATE_ACTION"));
  assert.equal(r.review_closed,false);
  assert.equal(r.automatic_refund_allowed,false);
});
