// TOTEM USA / TAX-07 — deterministic USD-cent tax allocation for ONLY
// beauty-service charges. Presentation/accounting allocation, NOT a claim
// that Stripe remitted taxes or an automatic state/local tax filing.
// All monetary inputs are exact minor-unit integer STRINGS; no float math.
const MAX=99999999n;

function invalid(code){
  const error=new Error(code);
  error.code=code;
  return error;
}
function cents(value,{zero=false}={}){
  if(typeof value!=="string" ||
     !(zero?/^\d+$/:/^[1-9]\d*$/).test(value))throw invalid("US_TAX07_CENTS_INVALID");
  const n=BigInt(value);
  if(n>MAX||(!zero&&n===0n))throw invalid("US_TAX07_CENTS_INVALID");
  return n;
}

export function verifiedUsServiceTaxBasis({
  service_base_minor,service_tax_minor,charge_total_minor,rate_bps,
}={}){
  const base=cents(service_base_minor);
  const tax=cents(service_tax_minor,{zero:true});
  const total=cents(charge_total_minor);
  if(!Number.isSafeInteger(rate_bps)||rate_bps<0||rate_bps>10000 ||
     (base*BigInt(rate_bps)+5000n)/10000n!==tax ||
     base+tax!==total)throw invalid("US_TAX07_QUOTE_INVALID");
  return Object.freeze({
    service_base_minor:base.toString(),
    service_tax_minor:tax.toString(),
    charge_total_minor:total.toString(),
    rate_bps,
  });
}

// A proportional cumulative partition, half-up to one USD cent. The
// DIFFERENCE between cumulative allocations is used for each refund, so
// consecutive partial refunds reconcile EXACTLY to the frozen full amount.
// A final full refund always returns the whole original service tax amount.
function cumulativeTax(refundedGross,basis){
  return (refundedGross*BigInt(basis.service_tax_minor)+
    BigInt(basis.charge_total_minor)/2n)/BigInt(basis.charge_total_minor);
}

export function allocateUsServiceTaxRefunds(basisInput,refunds=[]){
  const basis=verifiedUsServiceTaxBasis(basisInput);
  if(!Array.isArray(refunds))throw invalid("US_TAX07_REFUNDS_INVALID");
  let aggregate=0n,previousTax=0n;
  const ids=new Set();
  const sorted=[...refunds].sort((a,b)=>{
    const time=String(a.recorded_at||"").localeCompare(String(b.recorded_at||""));
    return time || String(a.stripe_refund_id).localeCompare(String(b.stripe_refund_id));
  });
  const items=sorted.map(refund=>{
    const id=refund?.stripe_refund_id;
    if(typeof id!=="string" || !/^re_[a-zA-Z0-9_]{8,}$/.test(id) ||
       ids.has(id))throw invalid("US_TAX07_REFUND_ID_INVALID");
    ids.add(id);
    const amount=cents(refund.amount_minor);
    const status=refund.status;
    if(!["pending","requires_action","succeeded","failed","canceled"].includes(status)){
      throw invalid("US_TAX07_REFUND_STATUS_INVALID");
    }
    let base=0n,tax=0n;
    if(status==="succeeded"){
      aggregate+=amount;
      if(aggregate>BigInt(basis.charge_total_minor)){
        throw invalid("US_TAX07_REFUNDS_EXCEED_CAPTURE");
      }
      const cumulative=cumulativeTax(aggregate,basis);
      tax=cumulative-previousTax;
      base=amount-tax;
      previousTax=cumulative;
      if(tax<0n||base<0n)throw invalid("US_TAX07_REFUND_ALLOCATION_INVALID");
    }
    return Object.freeze({
      stripe_refund_id:id,
      status,
      amount_minor:amount.toString(),
      refunded_service_base_minor:base.toString(),
      refunded_service_tax_minor:tax.toString(),
      counted_as_refunded:status==="succeeded",
      recorded_at:refund.recorded_at,
      authorized_by_owner:refund.authorized_by_owner===true,
    });
  });
  const refundedBase=aggregate-previousTax;
  const gross=BigInt(basis.charge_total_minor);
  const remaining=gross-aggregate;
  return Object.freeze({
    refunds:items,
    refunded_gross_minor:aggregate.toString(),
    refunded_service_base_minor:refundedBase.toString(),
    refunded_service_tax_minor:previousTax.toString(),
    net_gross_minor:remaining.toString(),
    net_service_base_minor:(BigInt(basis.service_base_minor)-refundedBase).toString(),
    net_service_tax_minor:(BigInt(basis.service_tax_minor)-previousTax).toString(),
  });
}

export function previewUsServiceTaxRefund(basisInput,alreadyRefundedMinor,proposedMinor){
  const basis=verifiedUsServiceTaxBasis(basisInput);
  const gross=BigInt(basis.charge_total_minor);
  const already=cents(alreadyRefundedMinor,{zero:true});
  const proposed=cents(proposedMinor);
  if(already>gross||proposed>gross-already){
    throw invalid("US_TAX07_REFUND_PREVIEW_EXCEEDS_REMAINING");
  }
  const taxBefore=cumulativeTax(already,basis);
  const taxAfter=cumulativeTax(already+proposed,basis);
  const tax=taxAfter-taxBefore;
  return Object.freeze({
    requested_gross_minor:proposed.toString(),
    refundable_service_base_minor:(proposed-tax).toString(),
    refundable_service_tax_minor:tax.toString(),
    allocation_policy:"cumulative_proportional_half_up_v1",
    note:"accounting_allocation_not_tax_filing",
  });
}
