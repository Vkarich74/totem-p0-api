import test from "node:test";
import assert from "node:assert/strict";
import { readUsPayC11Booking } from "./usPayC11ReadService.js";

// Entire row shape follows the staged SQL SELECT, not a browser response.
const row = Object.freeze({
  id: 500, client_id: 55, salon_id: 100, master_id: 200,
  service_id: 400, status: "reserved",
  market_id: "3", market_code: "US", market_currency: "USD",
  currency_code: "USD", salon_name: "SYNTHETIC_US_A",
  master_name: "SYNTHETIC_MASTER_US",
  us_price_booking_id: 500, us_price_market_id: "3",
  us_price_link_id: 300, us_amount_minor: "1050",
  us_price_currency: "USD", us_price_version: "1",
  price_service_link_id: 300, price_link_salon_id: 100,
  price_link_master_id: 200, price_link_service_pk: 400,
  price_link_currency: "USD",
  collector_booking_id: 500, collector_market_id: "3",
  collector_owner_type: "salon", collector_owner_id: 100,
  collector_selection_source: "owner_authorized",
  collector_selected_by_user_id: 900,
  collector_verification_status: "verified",
  collector_verified_at: new Date("2026-11-17T00:00:00Z"),
});

function mock(resultRow) {
  const queries = [];
  const db = {
    async query(sql, args) {
      queries.push({ sql, args });
      return { rows: resultRow ? [resultRow] : [] };
    },
  };
  return { db, queries };
}

const read = async (patch = {}) => {
  const { db } = mock({ ...row, ...patch });
  return (await readUsPayC11Booking(db, { clientId: 55, bookingId: 500 })).body;
};

test("authoritative USD cents / booking state / salon recipient", async () => {
  const { db, queries } = mock(row);
  const result = await readUsPayC11Booking(db, { clientId: 55, bookingId: 500 });
  assert.equal(result.status, 200);
  assert.equal(result.body.booking_id, 500);
  assert.equal(result.body.booking_status, "reserved");
  assert.deepEqual(result.body.price, {
    amount_minor: "1050", currency_code: "USD", source: "us_booking_price_snapshots",
  });
  assert.deepEqual(result.body.collector, {
    owner_type: "salon", display_name: "SYNTHETIC_US_A", verified: true,
  });
  assert.equal(result.body.payment.service_payment_status, "requires_review");
  assert.equal(result.body.payment_ready, false);
  assert.deepEqual(queries[0].args, [500, 55]);
  assert.match(queries[0].sql, /^SELECT/i);
  assert.match(queries[0].sql, /b\.client_id = \$2/);
  assert.match(queries[0].sql, /us_booking_price_snapshots/);
  assert.match(queries[0].sql, /us_booking_payment_collectors/);
  assert.doesNotMatch(queries[0].sql, /b\.price_snapshot|p\.status|payment_collection_anchors/);
  assert.equal(queries.length, 1);
});

test("master recipient is derived from booking owner, not client value", async () => {
  const result = await read({
    collector_owner_type: "master", collector_owner_id: 200,
  });
  assert.deepEqual(result.collector, {
    owner_type: "master", display_name: "SYNTHETIC_MASTER_US", verified: true,
  });
});

test("completed appointment does not imply paid", async () => {
  const result = await read({ status: "completed" });
  assert.equal(result.booking_status, "completed");
  assert.equal(result.payment.service_payment_status, "requires_review");
  assert.equal(result.payment_ready, false);
});

test("old snapshot is preserved as cents after current service price edit", async () => {
  const result = await read({ us_price_version: "1", us_amount_minor: "1050" });
  assert.equal(result.price.amount_minor, "1050");
});

test("missing or corrupted immutable cents are never replaced with legacy price", async () => {
  const changes = [
    { us_price_booking_id: null },
    { us_amount_minor: null },
    { us_amount_minor: "10.50" },
    { us_amount_minor: "0" },
    { us_price_market_id: "1" },
    { us_price_currency: "KGS" },
    { us_price_link_id: 999 },
    { price_link_service_pk: 401 },
    { price_link_master_id: 999 },
    { price_link_salon_id: 999 },
    { price_link_currency: "KGS" },
    { us_price_version: 0 },
  ];
  for (const change of changes) {
    const result = await read(change);
    assert.equal(result.price, null, JSON.stringify(change));
    assert.match(result.unavailable_reason, /US_PRICE_SNAPSHOT_UNAVAILABLE/);
  }
});

test("recipient remains hidden until verified and attached to actual booking", async () => {
  const changes = [
    { collector_booking_id: null },
    { collector_market_id: 1 },
    { collector_verification_status: "pending" },
    { collector_verification_status: "revoked" },
    { collector_verified_at: null },
    { collector_selection_source: "manual" },
    { collector_selected_by_user_id: null },
    { collector_owner_id: 999 },
    { collector_owner_type: "master", collector_owner_id: 100 },
    { salon_name: "" },
  ];
  for (const change of changes) {
    const result = await read(change);
    assert.equal(result.collector, null, JSON.stringify(change));
    assert.match(result.unavailable_reason, /US_VERIFIED_COLLECTOR_UNAVAILABLE/);
    assert.equal(result.payment_ready, false);
  }
});

test("invalid client or booking id rejected before querying", async () => {
  const { db, queries } = mock(row);
  for (const args of [
    {clientId:0,bookingId:500},
    {clientId:55,bookingId:"500 OR true"},
    {clientId:-1,bookingId:500},
    {clientId:55,bookingId:0},
    {clientId:55,bookingId:1.5},
  ]) assert.equal((await readUsPayC11Booking(db,args)).status,400);
  assert.equal(queries.length,0);
});

test("missing client-owned booking returns 404 without recipient data", async () => {
  const { db } = mock(null);
  assert.deepEqual(await readUsPayC11Booking(db,{clientId:55,bookingId:500}),
    {status:404,body:{ok:false,error:"US_BOOKING_NOT_FOUND"}});
});

test("KG/KZ bookings never appear in US endpoint", async () => {
  for (const market_code of ["KG", "KZ"]) {
    const { db } = mock({...row,market_code});
    assert.equal((await readUsPayC11Booking(db,{clientId:55,bookingId:500})).status,404);
  }
});

test("any USD mismatch blocks US response", async () => {
  for (const change of [{currency_code:"KGS"},{market_currency:"KGS"}]) {
    const { db }=mock({...row,...change});
    const result=await readUsPayC11Booking(db,{clientId:55,bookingId:500});
    assert.equal(result.status,409);
    assert.equal(result.body.error,"US_BOOKING_CURRENCY_MISMATCH");
  }
});
