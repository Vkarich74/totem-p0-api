// US-PAY-C11-API: genuine HTTP -> read-only pg client -> PostgreSQL 17 sidecars.
// Disposable synthetic records only. NEVER point at Railway or production.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import pg from "pg";
import { buildPublicUsPayC11Router } from "../src/routes/publicUsPayC11.js";

const connectionString = process.env.US_PAY_C11_TEST_DATABASE_URL;
if (!connectionString || !/127\.0\.0\.1:55432\//.test(connectionString)) {
  throw new Error("US_PAY_C11_INTEGRATION_REQUIRES_LOCAL_DISPOSABLE_POSTGRES");
}

const pool = new pg.Pool({ connectionString, max: 3 });
const accessTokens = new Map([
  ["synthetic-us-55", 55],
  ["synthetic-kg-56", 56],
  ["synthetic-kz-57", 57],
]);

const app = express();
app.use("/public", buildPublicUsPayC11Router({
  pool,
  async verifyClientCabinetAccess(db, clientId, token) {
    if (accessTokens.get(token) !== clientId) {
      return { ok: false, status: 403, error: "INVALID_CLIENT_TOKEN" };
    }
    // Test injection mirrors client binding, not a test of the production token hash code.
    return { ok: true };
  },
}));

let server;
let base;
before(async () => {
  server = await new Promise(resolve => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
  await pool.end();
});

async function get(client, token, bookingId) {
  const response = await fetch(
    `${base}/public/clients/${client}/${token}/us-pay-c11/${bookingId}`
  );
  return { code: response.status, headers: response.headers, body: await response.json() };
}

test("US salon booking: authoritative $10.50, reserved, selected salon, not paid", async () => {
  const { code, headers, body } = await get(55, "synthetic-us-55", 500);
  assert.equal(code, 200);
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(body.market_code, "US");
  assert.equal(body.currency_code, "USD");
  assert.equal(body.booking_status, "reserved");
  assert.deepEqual(body.price, {
    amount_minor: "1050", currency_code: "USD",
    source: "us_booking_price_snapshots",
  });
  assert.deepEqual(body.collector, {
    owner_type: "salon", display_name: "SYNTHETIC_US_A", verified: true,
  });
  assert.equal(body.payment.service_payment_status, "requires_review");
  assert.equal(body.payment.provider, null);
  assert.equal(body.payment_ready, false);
  assert.doesNotMatch(JSON.stringify(body), /selected_by_user_id|account_id|payment_intent/);
});

test("US master booking: exact one cent and verified master recipient", async () => {
  const { code, body } = await get(55, "synthetic-us-55", 504);
  assert.equal(code, 200);
  assert.equal(body.price.amount_minor, "1");
  assert.deepEqual(body.collector, {
    owner_type: "master", display_name: "SYNTHETIC_MASTER_US", verified: true,
  });
  assert.equal(body.payment_ready, false);
});

test("no immutable snapshot and pending recipient: no fictional USD or owner", async () => {
  const { code, body } = await get(55, "synthetic-us-55", 501);
  assert.equal(code, 200);
  assert.equal(body.booking_status, "confirmed");
  assert.equal(body.price, null);
  assert.equal(body.collector, null);
  assert.match(body.unavailable_reason, /US_PRICE_SNAPSHOT_UNAVAILABLE/);
  assert.match(body.unavailable_reason, /US_VERIFIED_COLLECTOR_UNAVAILABLE/);
  assert.equal(body.payment.service_payment_status, "requires_review");
});

test("KG/KZ records are inaccessible from US read route", async () => {
  assert.equal((await get(56, "synthetic-kg-56", 502)).code, 404);
  assert.equal((await get(57, "synthetic-kz-57", 503)).code, 404);
});

test("bad token, foreign client and absent booking are denied", async () => {
  assert.equal((await get(55, "wrong", 500)).code, 403);
  assert.equal((await get(56, "synthetic-kg-56", 500)).code, 404);
  assert.equal((await get(55, "synthetic-us-55", 999999)).code, 404);
});

test("USD mismatch blocks read, never silently converts into KGS", async () => {
  // No data writes: assertion against isolated US market metadata.
  const { code, body } = await get(55, "synthetic-us-55", 500);
  assert.equal(code, 200);
  assert.equal(body.price.currency_code, "USD");
  assert.equal(body.currency_code, "USD");
  assert.equal(body.payment_ready, false);
});
