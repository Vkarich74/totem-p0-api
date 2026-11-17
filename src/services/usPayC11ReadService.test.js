import test from "node:test";
import assert from "node:assert/strict";
import { readUsPayC11Booking } from "./usPayC11ReadService.js";

function mock(row) {
  const queries = [];
  const db = {
    async query(sql, args) {
      queries.push({ sql, args });
      return { rows: row ? [row] : [] };
    },
  };
  return { db, queries };
}
const us = { id: 77, market_code: "US", market_currency: "USD",
  currency_code: "USD", status: "reserved" };

test("valid US booking: read-only, no unverified USD/recipient/payments", async () => {
  const { db, queries } = mock(us);
  const result = await readUsPayC11Booking(db, { clientId: 11, bookingId: 77 });
  assert.equal(result.status, 200);
  assert.equal(result.body.booking_id, 77);
  assert.equal(result.body.booking_status, "reserved");
  assert.equal(result.body.price, null);
  assert.equal(result.body.collector, null);
  assert.equal(result.body.payment.service_payment_status, "requires_review");
  assert.equal(result.body.payment_ready, false);
  assert.deepEqual(queries[0].args, [77, 11]);
  assert.match(queries[0].sql, /b\.client_id = \$2/);
  assert.match(queries[0].sql, /^SELECT/i);
  assert.equal(queries.length, 1);
});
test("invalid IDs are rejected before querying database", async () => {
  const { db, queries } = mock(us);
  for (const [clientId, bookingId] of [[0,77],[1,"77 OR 1=1"],[-1,77],[1,0],[1,1.5]]) {
    assert.equal((await readUsPayC11Booking(db,{clientId,bookingId})).status, 400);
  }
  assert.equal(queries.length, 0);
});
test("foreign or missing booking never discloses details", async () => {
  const { db } = mock(null);
  const result = await readUsPayC11Booking(db,{clientId:11,bookingId:77});
  assert.deepEqual(result,{status:404,body:{ok:false,error:"US_BOOKING_NOT_FOUND"}});
});
test("KG/KZ rows are not exposed in US API", async () => {
  for (const m of ["KG","KZ"]) {
    const { db } = mock({...us,market_code:m});
    assert.equal((await readUsPayC11Booking(db,{clientId:11,bookingId:77})).status,404);
  }
});
test("USD mismatch fails closed", async () => {
  for (const row of [{...us,currency_code:"KGS"},{...us,market_currency:"KGS"}]) {
    const { db } = mock(row);
    const result = await readUsPayC11Booking(db,{clientId:11,bookingId:77});
    assert.equal(result.status,409);
    assert.equal(result.body.error,"US_BOOKING_CURRENCY_MISMATCH");
  }
});
test("appointment completed never implies paid", async () => {
  const { db }=mock({...us,status:"completed"});
  const r=await readUsPayC11Booking(db,{clientId:11,bookingId:77});
  assert.equal(r.body.booking_status,"completed");
  assert.equal(r.body.payment.service_payment_status,"requires_review");
  assert.equal(r.body.payment_ready,false);
});
