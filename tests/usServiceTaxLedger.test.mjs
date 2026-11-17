// TOTEM USA TAX-07: exact cents, partial/full signed refund allocation.
// Pure tests: zero production data, zero network.
import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateUsServiceTaxRefunds,previewUsServiceTaxRefund,
  verifiedUsServiceTaxBasis,
} from "../src/services/usServiceTaxLedger.math.js";
const basis={
  service_base_minor:"10005",
  rate_bps:725,
  service_tax_minor:"725",
  charge_total_minor:"10730",
};
const refund=(id,amount,status,recorded_at)=>({
  stripe_refund_id:id,amount_minor:amount,status,
  recorded_at,
});

test("TAX-07 valid service-only rate and exact gross formula",()=>{
  assert.deepEqual(verifiedUsServiceTaxBasis(basis),basis);
  for(const input of [
    {...basis,service_base_minor:"10004"},
    {...basis,service_tax_minor:"724"},
    {...basis,charge_total_minor:"10729"},
    {...basis,rate_bps:7.25},
    {...basis,rate_bps:10001},
    {...basis,service_base_minor:"100.05"},
  ])assert.throws(()=>verifiedUsServiceTaxBasis(input),/US_TAX07_/);
  const zero=verifiedUsServiceTaxBasis({
    service_base_minor:"1",service_tax_minor:"0",
    charge_total_minor:"1",rate_bps:0,
  });
  assert.equal(zero.charge_total_minor,"1");
});

test("TAX-07 2500+8230 partial/full refunds allocate EXACTLY tax 725, base 10005",()=>{
  const result=allocateUsServiceTaxRefunds(basis,[
    refund("re_TAX07SECONDPART","8230","succeeded","2026-11-17T12:40:00Z"),
    refund("re_TAX07FIRSTPART","2500","succeeded","2026-11-17T12:30:00Z"),
  ]);
  assert.equal(result.refunds[0].stripe_refund_id,"re_TAX07FIRSTPART");
  assert.equal(result.refunds[0].refunded_service_tax_minor,"169");
  assert.equal(result.refunds[0].refunded_service_base_minor,"2331");
  assert.equal(result.refunds[1].refunded_service_tax_minor,"556");
  assert.equal(result.refunds[1].refunded_service_base_minor,"7674");
  assert.equal(result.refunded_service_tax_minor,"725");
  assert.equal(result.refunded_service_base_minor,"10005");
  assert.equal(result.refunded_gross_minor,"10730");
  assert.equal(result.net_gross_minor,"0");
  assert.equal(result.net_service_tax_minor,"0");
  assert.equal(result.net_service_base_minor,"0");
});

test("TAX-07 failed, canceled or pending refunds do not reduce paid tax",()=>{
  const allocations=allocateUsServiceTaxRefunds(basis,[
    refund("re_TAX07PENDINGPART","8230","pending","2026-11-17T12:29:00Z"),
    refund("re_TAX07FIRSTPART","2500","succeeded","2026-11-17T12:30:00Z"),
    refund("re_TAX07FAILEDPART","500","failed","2026-11-17T12:31:00Z"),
    refund("re_TAX07CANCELEDPART","100","canceled","2026-11-17T12:32:00Z"),
  ]);
  assert.equal(allocations.refunded_gross_minor,"2500");
  assert.equal(allocations.refunded_service_tax_minor,"169");
  assert.equal(allocations.refunds[0].refunded_service_tax_minor,"0");
  assert.equal(allocations.refunds.at(-1).refunded_service_base_minor,"0");
  assert.equal(allocations.net_gross_minor,"8230");
  assert.equal(allocations.net_service_tax_minor,"556");
});

test("TAX-07 high-precision half-up, one-cent, 0% and 100%",()=>{
  const a={service_base_minor:"1",service_tax_minor:"1",
    charge_total_minor:"2",rate_bps:10000};
  const result=allocateUsServiceTaxRefunds(a,[
    refund("re_TAX07ONECENT001","1","succeeded","2026-11-17T12:10:00Z"),
    refund("re_TAX07ONECENT002","1","succeeded","2026-11-17T12:20:00Z"),
  ]);
  assert.equal(result.refunds[0].refunded_service_tax_minor,"1");
  assert.equal(result.refunds[1].refunded_service_tax_minor,"0");
  assert.equal(result.refunded_service_tax_minor,"1");
  assert.equal(result.net_gross_minor,"0");
  const z=allocateUsServiceTaxRefunds({
    service_base_minor:"10",service_tax_minor:"0",
    charge_total_minor:"10",rate_bps:0,
  },[refund("re_TAX07ZERO00001","5","succeeded","2026-11-17T12:00:00Z")]);
  assert.equal(z.refunded_service_tax_minor,"0");
  assert.equal(z.refunded_service_base_minor,"5");
});

test("TAX-07 no over-refund or duplicate Stripe refund id",()=>{
  assert.throws(()=>allocateUsServiceTaxRefunds(basis,[
    refund("re_TAX07OVERGROSS1","10730","succeeded","2026-11-17T12:00:00Z"),
    refund("re_TAX07OVERGROSS2","1","succeeded","2026-11-17T12:01:00Z"),
  ]),/US_TAX07_REFUNDS_EXCEED_CAPTURE/);
  assert.throws(()=>allocateUsServiceTaxRefunds(basis,[
    refund("re_TAX07DUPLICATE","500","succeeded","2026-11-17T12:00:00Z"),
    refund("re_TAX07DUPLICATE","500","succeeded","2026-11-17T12:01:00Z"),
  ]),/US_TAX07_REFUND_ID_INVALID/);
});

test("TAX-07 quote full and partial remaining refund from signed history",()=>{
  assert.deepEqual(previewUsServiceTaxRefund(basis,"0","10730"),{
    requested_gross_minor:"10730",
    refundable_service_base_minor:"10005",
    refundable_service_tax_minor:"725",
    allocation_policy:"cumulative_proportional_half_up_v1",
    note:"accounting_allocation_not_tax_filing",
  });
  const part=previewUsServiceTaxRefund(basis,"0","2500");
  assert.equal(part.refundable_service_base_minor,"2331");
  assert.equal(part.refundable_service_tax_minor,"169");
  const rest=previewUsServiceTaxRefund(basis,"2500","8230");
  assert.equal(rest.refundable_service_base_minor,"7674");
  assert.equal(rest.refundable_service_tax_minor,"556");
  assert.throws(()=>previewUsServiceTaxRefund(basis,"2500","8231"),
    /US_TAX07_REFUND_PREVIEW_EXCEEDS_REMAINING/);
  assert.throws(()=>previewUsServiceTaxRefund(basis,"10730","1"),
    /US_TAX07_REFUND_PREVIEW_EXCEEDS_REMAINING/);
});
