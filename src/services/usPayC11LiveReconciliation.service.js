// Existing US-PAY-C11 seller-owner route: read-only, booking-scoped
// evidence for exceptional Stripe LIVE states. No Stripe calls, no DB writes,
// no new accounting authority or "reviewed" state fabrication.
import { verifyUsLiveSellerOwnerScope } from "./usPayC11LiveSellerOnboarding.service.js";

const POSITIVE=/^[1-9]\d*$/;
const LIVE_STATUSES=new Set([
  "creating","requires_payment_method","requires_confirmation",
  "requires_action","processing","succeeded","canceled","failed",
  "requires_review","refunded","disputed",
]);
const ACTIVE_BOOKINGS=new Set(["reserved","confirmed","completed"]);
function validId(value){
  const s=String(value??"");
  if(!POSITIVE.test(s))return null;
  const n=Number(s);
  return Number.isSafeInteger(n)?n:null;
}
function denied(status,error){
  return {status,body:{ok:false,error}};
}
function unsignedCount(value){
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=0?n:0;
}
function safeMinor(value){
  const s=String(value??"");
  return /^\d+$/.test(s)?s:null;
}

// This is a pure classification of existing data, NOT an authorization to
// cancel a payment, release a slot, issue a refund or resolve an audit case.
export function classifyUsC11LiveReconciliation(row,{ownerType,ownerId}={}){
  const status=String(row.booking_status||"").toLowerCase();
  const piPresent=validId(row.intent_booking_id)===validId(row.booking_id);
  const ownedSeller=piPresent && row.collector_owner_type===ownerType &&
    validId(row.collector_owner_id)===validId(ownerId);
  if(!piPresent){
    return {
      case_status:"no_live_attempt",reason_code:"US_C11_NO_LIVE_INTENT",
      manual_review_required:false,
      review_closed:false,
      safe_to_cancel_via_reconciliation:false,
      automatic_refund_allowed:false,
      payment_intent_status:null,verified_signed_evidence:false,
      signed_success_observed:false,
      next_steps:[],
    };
  }

  const intentStatus=String(row.intent_status||"").toLowerCase();
  const signedReceipt=Boolean(
    row.last_signature_verified===true &&
    row.last_receipt_result==="accepted" &&
    row.last_receipt_intent_id &&
    row.last_receipt_intent_id===row.intent_payment_intent_id &&
    row.last_receipt_account_id===row.intent_account_id &&
    row.last_receipt_booking_id!=null &&
    validId(row.last_receipt_booking_id)===validId(row.booking_id)
  );
  const quoteMatches=row.quote_currency==="USD" &&
    safeMinor(row.authoritative_total_minor)!==null &&
    safeMinor(row.authoritative_total_minor)===safeMinor(row.amount_minor);
  const signedSuccessObserved=unsignedCount(row.accepted_success_events)>0;
  const disputes=unsignedCount(row.dispute_count);
  const refunds=safeMinor(row.succeeded_refund_minor);
  const refundsReported=refunds!==null&&BigInt(refunds)>0n;
  const signedTerminal= signedReceipt && quoteMatches &&
    ((intentStatus==="canceled" && row.last_event_type==="payment_intent.canceled") ||
     (intentStatus==="requires_payment_method" &&
      row.last_event_type==="payment_intent.payment_failed"));

  let reason;
  if(!LIVE_STATUSES.has(intentStatus))reason="US_C11_UNKNOWN_STRIPE_STATE";
  else if(!ACTIVE_BOOKINGS.has(status))
    reason=signedSuccessObserved||intentStatus==="succeeded"||refundsReported||disputes
      ? "US_C11_CANCELLED_WITH_FUNDS_OR_DISPUTE"
      : "US_C11_BOOKING_STATUS_PAYMENT_CONFLICT";
  else if(intentStatus==="creating")reason="US_C11_STRIPE_CREATION_OUTCOME_UNKNOWN";
  else if(intentStatus==="processing")reason="US_C11_STRIPE_PAYMENT_PROCESSING";
  else if(intentStatus==="succeeded"||intentStatus==="refunded"||
          intentStatus==="disputed"||signedSuccessObserved||refundsReported||disputes)
    reason="US_C11_FINANCIAL_SETTLEMENT_REQUIRES_REVIEW";
  else if(intentStatus==="requires_review")
    reason="US_C11_STRIPE_MANUAL_REVIEW_REQUIRED";
  else if(signedTerminal && !signedSuccessObserved && !refundsReported && !disputes)
    reason="US_C11_TERMINAL_EVIDENCE_NEEDS_OWNER_VERIFICATION";
  else reason="US_C11_STRIPE_OUTCOME_NOT_FINAL";

  const steps=[
    "VERIFY_CONNECTED_STRIPE_ACCOUNT_AND_INTENT_IN_SELLER_DASHBOARD",
    "COMPARE_USD_AMOUNT_WITH_IMMUTABLE_BOOKING_QUOTE",
    "CHECK_SIGNED_EVENTS_REFUNDS_AND_DISPUTES",
    "DOCUMENT_EXTERNAL_REVIEW_BEFORE_AUTHORIZED_SEPARATE_ACTION",
  ];
  if(!ownedSeller){
    steps.unshift("CONTACT_VERIFIED_PAYMENT_COLLECTOR");
  }
  return {
    case_status:"manual_review",reason_code:reason,
    manual_review_required:true,review_closed:false,
    safe_to_cancel_via_reconciliation:false,
    automatic_refund_allowed:false,
    payment_intent_status:intentStatus,
    verified_signed_evidence:signedReceipt&&quoteMatches,
    signed_success_observed:signedSuccessObserved,
    succeeded_refund_minor:refunds,
    dispute_count:disputes,
    connected_seller_is_reviewer:ownedSeller,
    // IDs are disclosed ONLY to the verified receiving merchant.
    stripe_payment_intent_reference:ownedSeller?
      (row.intent_payment_intent_id||null):null,
    last_verified_event_type:signedReceipt?row.last_event_type:null,
    next_steps:steps,
  };
}

const REVIEW_SQL=[
  "SELECT b.id AS booking_id,b.status AS booking_status,",
  "  pi.booking_id AS intent_booking_id,pi.status AS intent_status,",
  "  pi.created_at AS intent_created_at,",
  "  pi.stripe_payment_intent_id AS intent_payment_intent_id,",
  "  pi.stripe_account_id AS intent_account_id,",
  "  pi.collector_owner_type,pi.collector_owner_id,",
  "  pi.amount_minor::text AS amount_minor,",
  "  tq.charge_total_minor::text AS authoritative_total_minor,",
  "  tq.currency_code AS quote_currency,",
  "  lr.booking_id AS last_receipt_booking_id,",
  "  lr.stripe_event_id AS last_receipt_event_id,",
  "  lr.stripe_payment_intent_id AS last_receipt_intent_id,",
  "  lr.stripe_account_id AS last_receipt_account_id,",
  "  lr.signature_verified AS last_signature_verified,",
  "  lr.result AS last_receipt_result,lr.event_type AS last_event_type,",
  "  COALESCE((SELECT COUNT(*) FROM public.us_stripe_live_payment_receipts ev",
  "    WHERE ev.booking_id=b.id AND ev.signature_verified IS TRUE",
  "      AND ev.result='accepted' AND ev.event_type='payment_intent.succeeded'",
  "      AND ev.stripe_payment_intent_id=pi.stripe_payment_intent_id",
  "      AND ev.stripe_account_id=pi.stripe_account_id),0)::int AS accepted_success_events,",
  "  COALESCE((SELECT SUM(rf.amount_minor) FROM public.us_c11_live_refunds rf",
  "    WHERE rf.booking_id=b.id AND rf.stripe_account_id=pi.stripe_account_id",
  "      AND rf.stripe_payment_intent_id=pi.stripe_payment_intent_id",
  "      AND rf.status='succeeded'),0)::text AS succeeded_refund_minor,",
  "  COALESCE((SELECT COUNT(*) FROM public.us_c11_live_disputes d",
  "    WHERE d.booking_id=b.id AND d.stripe_account_id=pi.stripe_account_id",
  "      AND d.stripe_payment_intent_id=pi.stripe_payment_intent_id),0)::int AS dispute_count",
  "FROM public.bookings b",
  "JOIN public.tenant_market_settings tms ON tms.salon_id=b.salon_id",
  "JOIN public.markets m ON m.id=tms.market_id",
  "LEFT JOIN public.us_stripe_live_payment_intents pi ON pi.booking_id=b.id",
  "  AND pi.market_id=m.id",
  "LEFT JOIN public.us_booking_service_tax_snapshots tq ON tq.booking_id=b.id",
  "  AND tq.market_id=m.id",
  "LEFT JOIN public.us_stripe_live_payment_receipts lr",
  "  ON lr.stripe_event_id=pi.last_event_id",
  "WHERE b.id=$1 AND m.code='US' AND m.active IS TRUE",
  "  AND m.default_currency='USD' AND b.currency_code='USD'",
  "  AND (",
  "    ($2='salon' AND b.salon_id=$3)",
  "    OR ($2='master' AND b.master_id=$3",
  "        AND pi.collector_owner_type='master'",
  "        AND pi.collector_owner_id=$3)",
  "  )",
  "LIMIT 1",
].join("\n");

export async function readUsC11LiveReconciliation(pool,{
  auth,ownerType,ownerId,bookingId,
}={}){
  const oid=validId(ownerId),booking=validId(bookingId);
  if(!["salon","master"].includes(ownerType)||!oid||!booking){
    return denied(400,"US_C11_RECONCILIATION_SCOPE_INVALID");
  }
  if(!pool||typeof pool.connect!=="function"){
    return denied(503,"US_C11_RECONCILIATION_DB_UNAVAILABLE");
  }
  const db=await pool.connect();
  let opened=false,releaseError=null;
  try{
    await db.query("BEGIN READ ONLY");
    opened=true;
    await db.query("SET LOCAL statement_timeout='5000ms'");
    const owner=await verifyUsLiveSellerOwnerScope(db,{
      auth,ownerType,ownerId:oid,
    });
    if(!owner){
      return denied(404,"US_C11_RECONCILIATION_NOT_FOUND");
    }
    const response=await db.query(REVIEW_SQL,[booking,ownerType,oid]);
    const row=response.rows?.[0]||null;
    if(!row){
      return denied(404,"US_C11_RECONCILIATION_NOT_FOUND");
    }
    const state=classifyUsC11LiveReconciliation(row,{ownerType,ownerId:oid});
    return {
      status:200,
      body:{
        ok:true,contract_version:"US-PAY-C11-reconciliation-read-v1",
        market_code:"US",currency_code:"USD",
        booking_id:booking,
        booking_status:String(row.booking_status||"").toLowerCase(),
        amount_minor:state.connected_seller_is_reviewer?row.amount_minor||null:null,
        reconciliation:state,
        read_only:true,persistent_review_acknowledgment:false,
        financial_operation_performed:false,
      },
    };
  }finally{
    if(opened){
      try{await db.query("ROLLBACK");}
      catch(error){releaseError=error; }
    }
    db.release(releaseError||undefined);
  }
}
