import test from "node:test";
import assert from "node:assert/strict";
import { validateUsdMinorAmount, buildUsPayC11ReadModel } from "./usPayC11ReadModel.js";

const booking = { id: 71, market_code: "US", currency_code: "USD", status: "reserved" };
const priceSnapshot = { booking_id: 71, market_code: "US", currency: "USD", amount_minor: "1050", immutable_verified: true };
const collector = { booking_id: 71, market_code: "US", currency_code: "USD", owner_type: "salon", owner_id: 32, display_name: "Sample Salon", verified: true };
const payment = { booking_id: 71, market_code: "US", currency_code: "USD", service_payment_status: "unpaid", verified_projection: true, merchant_binding_verified: true, mode: "TEST" };
const project = overrides => buildUsPayC11ReadModel({ booking, priceSnapshot, collector, payment, ...overrides });

test("strict positive integer minor units: cents intact", () => {
  for (const [input, expected] of [["1","1"], ["1050","1050"], ["1000","1000"]])
    assert.equal(validateUsdMinorAmount(input), expected);
  for (const input of [10.50, 0, "0", "-1", "10.50", "10.005", "1e3", " 1050", "9007199254740992"])
    assert.equal(validateUsdMinorAmount(input), null);
});
test("US booking price, recipient and payment independently sourced", () => {
  const x = project();
  assert.equal(x.price.amount_minor, "1050");
  assert.equal(x.booking_status, "reserved");
  assert.equal(x.payment.service_payment_status, "unpaid");
  assert.deepEqual(x.collector, { owner_type:"salon", display_name:"Sample Salon", verified:true });
  assert.equal(x.payment_ready, true);
});
test("missing immutable sidecar never fabricates historic USD", () => {
  const x = project({priceSnapshot:null});
  assert.equal(x.price, null); assert.equal(x.payment_ready, false);
});
test("unknown/conflicting recipient prevents checkout", () => {
  for (const c of [null, {...collector,conflicted:true}, {...collector,verified:false}, {...collector,booking_id:72}, {...collector,market_code:"KG"}]) {
    const x = project({collector:c}); assert.equal(x.collector,null); assert.equal(x.payment_ready,false);
  }
});
test("confirmed appointment never implies payment", () => {
  const x = project({booking:{...booking,status:"confirmed"},payment:null});
  assert.equal(x.booking_status,"confirmed");
  assert.equal(x.payment.service_payment_status,"requires_review");
  assert.equal(x.payment_ready,false);
});
test("paid/completed/canceled appointment cannot initiate checkout", () => {
  assert.equal(project({payment:{...payment,service_payment_status:"paid"}}).payment_ready,false);
  assert.equal(project({booking:{...booking,status:"completed"}}).payment_ready,false);
  assert.equal(project({booking:{...booking,status:"canceled"}}).payment_ready,false);
});
test("KG/KZ never projected as US", () => {
  for (const market of ["KG","KZ"])
    assert.throws(() => project({booking:{...booking,market_code:market}}),/MARKET_MISMATCH/);
});
test("unverified paid assertions never trusted", () => {
  const x = project({payment:{...payment,service_payment_status:"paid",verified_projection:false}});
  assert.equal(x.payment.service_payment_status,"requires_review");
});

test("unverified seller merchant binding prevents checkout", () => {
  assert.equal(project({payment:{...payment,merchant_binding_verified:false}}).payment_ready,false);
  assert.equal(project({payment:{...payment,mode:"UNKNOWN"}}).payment_ready,false);
});
