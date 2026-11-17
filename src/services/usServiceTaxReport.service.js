// TOTEM USA / TAX-07 — owner-scoped, READ-ONLY service tax reconciliation.
// Revenue/tax report is a current verified booking-cohort snapshot, NOT a
// state/local filing, Stripe tax remittance or seller payout report.
// No new booking, seller, charge or refund is ever created by this module.
import { verifyUsLiveSellerOwnerScope } from "./usPayC11LiveSellerOnboarding.service.js";
import {
  allocateUsServiceTaxRefunds,verifiedUsServiceTaxBasis,
} from "./usServiceTaxLedger.math.js";

const MAX_ROWS=500;
function reject(status,error){return {status,body:{ok:false,error}};}
function ownerId(raw){
  const s=String(raw??"");
  if(!/^[1-9]\d*$/.test(s))return null;
  const n=Number(s);
  return Number.isSafeInteger(n)?n:null;
}
function money(acc,n){return acc+BigInt(n);}
function assertIntegrity(valid,code){
  if(!valid){
    const error=new Error(code);
    error.code=code;
    throw error;
  }
}
const isPositiveMinor=v=>typeof v==="string" && /^[1-9]\d*$/.test(v);

function paymentIsVerified(row){
  const identity=row.intent_booking_id!=null &&
    String(row.intent_booking_id)===String(row.booking_id) &&
    String(row.intent_market_id)===String(row.market_id) &&
    row.intent_owner_type===row.collector_owner_type &&
    String(row.intent_owner_id)===String(row.collector_owner_id) &&
    String(row.intent_revision)===String(row.collector_revision) &&
    row.intent_currency==="USD" &&
    String(row.intent_amount_minor)===String(row.charge_total_minor) &&
    typeof row.intent_account==="string" &&
    /^acct_[a-zA-Z0-9]{8,}$/.test(row.intent_account) &&
    typeof row.intent_payment_id==="string" &&
    /^pi_[A-Za-z0-9_]{8,}$/.test(row.intent_payment_id);
  const captured=identity && row.signed_capture===true &&
    ["succeeded","refunded","disputed"].includes(row.intent_status);
  return {identity,captured};
}

export async function readUsServiceTaxReport(pool,{
  auth,ownerType,ownerId:rawOwnerId,
}={}){
  const id=ownerId(rawOwnerId);
  if(!id||!["salon","master"].includes(ownerType)){
    return reject(400,"US_TAX07_OWNER_ID_INVALID");
  }
  if(!pool||typeof pool.connect!=="function"){
    return reject(503,"US_TAX07_DB_REQUIRED");
  }
  const db=await pool.connect();
  let tx=false;
  try{
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    tx=true;
    await db.query("SET LOCAL statement_timeout='7500ms'");
    await db.query("SET LOCAL lock_timeout='2000ms'");
    const scope=await verifyUsLiveSellerOwnerScope(db,{
      auth,ownerType,ownerId:id,
    });
    if(!scope)return reject(404,"US_TAX07_OWNER_NOT_AUTHORIZED");
    const response=await db.query(
      `SELECT q.booking_id,q.market_id,q.payment_purpose,
              q.collector_owner_type,q.collector_owner_id,
              q.collector_revision,q.tax_setting_revision,q.rate_bps,
              q.service_base_minor::text AS service_base_minor,
              q.service_tax_minor::text AS service_tax_minor,
              q.charge_total_minor::text AS charge_total_minor,
              q.currency_code,q.created_at AS quoted_at,
              bp.amount_minor::text AS original_base_minor,
              b.salon_id,b.master_id,
              pi.booking_id AS intent_booking_id,
              pi.market_id AS intent_market_id,
              pi.collector_owner_type AS intent_owner_type,
              pi.collector_owner_id AS intent_owner_id,
              pi.collector_revision AS intent_revision,
              pi.currency_code AS intent_currency,
              pi.amount_minor::text AS intent_amount_minor,
              pi.status AS intent_status,
              pi.stripe_account_id AS intent_account,
              pi.stripe_payment_intent_id AS intent_payment_id,
              pi.created_at AS intent_created_at,
              EXISTS (
                SELECT 1 FROM public.us_stripe_live_payment_receipts pr
                 WHERE pr.booking_id=q.booking_id
                   AND pr.stripe_payment_intent_id=pi.stripe_payment_intent_id
                   AND pr.stripe_account_id=pi.stripe_account_id
                   AND pr.event_type='payment_intent.succeeded'
                   AND pr.signature_verified IS TRUE
                   AND pr.result='accepted'
              ) AS signed_capture
         FROM public.us_booking_service_tax_snapshots q
         JOIN public.us_booking_price_snapshots bp
           ON bp.booking_id=q.booking_id AND bp.market_id=q.market_id
         JOIN public.bookings b ON b.id=q.booking_id
         LEFT JOIN public.us_stripe_live_payment_intents pi
           ON pi.booking_id=q.booking_id
        WHERE q.payment_purpose='beauty_service'
          AND q.currency_code='USD' AND q.market_id=$1
          AND q.collector_owner_type=$2 AND q.collector_owner_id=$3
        ORDER BY q.booking_id ASC
        LIMIT $4`,
      [scope.marketId,ownerType,id,MAX_ROWS+1]
    );
    if(response.rows.length>MAX_ROWS){
      return reject(409,"US_TAX07_REPORT_OVER_LIMIT_REQUIRES_PAGINATION");
    }
    const ids=response.rows.map(x=>Number(x.booking_id));
    let refundRows=[],requestRows=[],disputeRows=[];
    if(ids.length){
      const refs=await db.query(
        `SELECT rf.booking_id,rf.stripe_refund_id,rf.status,
                rf.amount_minor::text AS amount_minor,
                rf.stripe_account_id,rf.stripe_payment_intent_id,
                rf.recorded_at,
                (fr.signature_verified IS TRUE AND fr.result='observed'
                 AND fr.stripe_account_id=rf.stripe_account_id
                 AND fr.object_id=rf.stripe_refund_id
                 AND fr.booking_id=rf.booking_id
                 AND fr.event_type LIKE 'refund.%') AS signed_observation,
                (ra.request_id IS NOT NULL AND
                 ra.stripe_account_id=rf.stripe_account_id AND
                 ra.stripe_payment_intent_id=rf.stripe_payment_intent_id AND
                 ra.amount_minor=rf.amount_minor AND
                 ra.booking_id=rf.booking_id) AS authorized_by_owner
           FROM public.us_c11_live_refunds rf
           LEFT JOIN public.us_c11_live_financial_receipts fr
             ON fr.stripe_event_id=rf.last_event_id
           LEFT JOIN public.us_c11_live_refund_requests ra
             ON ra.stripe_refund_id=rf.stripe_refund_id
          WHERE rf.booking_id=ANY($1::integer[])
          ORDER BY rf.booking_id,rf.recorded_at,rf.stripe_refund_id`,
        [ids]
      );
      refundRows=refs.rows;
      const requests=await db.query(
        `SELECT booking_id,COALESCE(SUM(amount_minor),0)::text AS outstanding_minor,
                count(*)::integer AS outstanding_count
           FROM public.us_c11_live_refund_requests
          WHERE booking_id=ANY($1::integer[])
            AND state IN ('reserved','submitted','requires_review')
          GROUP BY booking_id`,[ids]
      );
      requestRows=requests.rows;
      const disputes=await db.query(
        `SELECT booking_id,COALESCE(bool_or(status IN
              ('needs_response','under_review','lost',
               'warning_needs_response','warning_under_review')),false)
              AS blocking_dispute
           FROM public.us_c11_live_disputes
          WHERE booking_id=ANY($1::integer[])
          GROUP BY booking_id`,[ids]
      );
      disputeRows=disputes.rows;
    }
    const groupedRefunds=new Map();
    for(const rf of refundRows){
      const key=String(rf.booking_id);
      const list=groupedRefunds.get(key)||[];
      list.push(rf);
      groupedRefunds.set(key,list);
    }
    const requests=new Map(requestRows.map(x=>[String(x.booking_id),x]));
    const disputes=new Map(disputeRows.map(x=>[String(x.booking_id),x]));
    const totals={
      quoted_service_base_minor:0n,quoted_service_tax_minor:0n,
      quoted_gross_minor:0n,
      captured_service_base_minor:0n,captured_service_tax_minor:0n,
      captured_gross_minor:0n,
      refunded_service_base_minor:0n,refunded_service_tax_minor:0n,
      refunded_gross_minor:0n,
      net_service_base_minor:0n,net_service_tax_minor:0n,
      net_gross_minor:0n,
      outstanding_refund_requests_minor:0n,
    };
    const items=[];
    for(const row of response.rows){
      assertIntegrity(
        String(row.original_base_minor)===String(row.service_base_minor) &&
        String(row.currency_code)==="USD" &&
        String(row.market_id)===String(scope.marketId) &&
        row.payment_purpose==="beauty_service" &&
        ((ownerType==="salon"&&String(row.salon_id)===String(id)) ||
         (ownerType==="master"&&String(row.master_id)===String(id))),
        "US_TAX07_BOOKING_QUOTE_INTEGRITY_CONFLICT"
      );
      const basis=verifiedUsServiceTaxBasis(row);
      const payment=paymentIsVerified(row);
      if(row.intent_booking_id!=null){
        assertIntegrity(payment.identity,
          "US_TAX07_PAYMENT_QUOTE_INTEGRITY_CONFLICT");
      }
      const rawRefunds=groupedRefunds.get(String(row.booking_id))||[];
      assertIntegrity(!rawRefunds.length || payment.captured,
        "US_TAX07_REFUND_WITHOUT_SIGNED_CAPTURE");
      for(const refund of rawRefunds){
        assertIntegrity(refund.signed_observation===true &&
          refund.stripe_account_id===row.intent_account &&
          refund.stripe_payment_intent_id===row.intent_payment_id,
          "US_TAX07_UNSIGNED_OR_MISLINKED_REFUND");
      }
      const allocations=allocateUsServiceTaxRefunds(basis,rawRefunds);
      const outstanding=BigInt(
        requests.get(String(row.booking_id))?.outstanding_minor || "0"
      );
      assertIntegrity(
        (outstanding===0n||payment.captured) &&
        outstanding+BigInt(allocations.refunded_gross_minor)<=
          BigInt(basis.charge_total_minor),
        "US_TAX07_OUTSTANDING_REFUND_EXCEEDS_CAPTURE"
      );
      const dispute=disputes.get(String(row.booking_id))?.blocking_dispute===true;
      let status="quote_frozen";
      if(row.intent_booking_id!=null && !payment.captured){
        status="payment_unverified";
      }else if(payment.captured){
        status=dispute?"disputed":
          BigInt(allocations.net_gross_minor)===0n?"refunded_full":
          BigInt(allocations.refunded_gross_minor)>0n?"refunded_partial":"captured";
      }
      totals.quoted_service_base_minor=money(totals.quoted_service_base_minor,
        basis.service_base_minor);
      totals.quoted_service_tax_minor=money(totals.quoted_service_tax_minor,
        basis.service_tax_minor);
      totals.quoted_gross_minor=money(totals.quoted_gross_minor,
        basis.charge_total_minor);
      if(payment.captured){
        for(const [key,value] of Object.entries({
          captured_service_base_minor:basis.service_base_minor,
          captured_service_tax_minor:basis.service_tax_minor,
          captured_gross_minor:basis.charge_total_minor,
          refunded_service_base_minor:allocations.refunded_service_base_minor,
          refunded_service_tax_minor:allocations.refunded_service_tax_minor,
          refunded_gross_minor:allocations.refunded_gross_minor,
          net_service_base_minor:allocations.net_service_base_minor,
          net_service_tax_minor:allocations.net_service_tax_minor,
          net_gross_minor:allocations.net_gross_minor,
        })){
          totals[key]=money(totals[key],value);
        }
      }
      totals.outstanding_refund_requests_minor+=outstanding;
      items.push({
        booking_id:Number(row.booking_id),
        collector_owner_type:ownerType,collector_owner_id:id,
        payment_purpose:"beauty_service",currency_code:"USD",
        quoted_at:new Date(row.quoted_at).toISOString(),
        quote:{
          ...basis,
          tax_setting_revision:Number(row.tax_setting_revision),
          collector_revision:Number(row.collector_revision),
        },
        reconciliation_status:status,
        signed_payment_captured:payment.captured,
        refunded:allocations,
        outstanding_refund_requests_minor:outstanding.toString(),
        blocking_dispute:dispute,
        payout_attributed_to_booking:false,
      });
    }
    const now=await db.query("SELECT transaction_timestamp() AS as_of");
    const body={
      ok:true,contract_version:"US-SERVICE-TAX-report-v1",
      market_code:"US",currency_code:"USD",
      payment_purpose:"beauty_service",
      owner_type:ownerType,owner_id:id,
      as_of:new Date(now.rows[0].as_of).toISOString(),
      report_basis:"lifetime_current_state_by_frozen_booking",
      allocation_policy:"cumulative_proportional_half_up_v1",
      tax_remittance_claim:false,
      tax_filing_ready:false,
      stripe_payouts_are_seller_aggregate:true,
      items,
      totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v.toString()])),
      booking_count:items.length,
    };
    await db.query("COMMIT");
    tx=false;
    return {status:200,body};
  }catch(error){
    if(String(error?.code||"").startsWith("US_TAX07_")){
      return reject(409,error.code);
    }
    console.error("US_TAX07_REPORT_UNAVAILABLE",String(error?.code||"UNKNOWN"));
    return reject(503,"US_TAX07_REPORT_UNAVAILABLE");
  }finally{
    if(tx){try{await db.query("ROLLBACK");}catch{}}
    db.release();
  }
}
