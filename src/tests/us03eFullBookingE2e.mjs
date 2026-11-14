// TOTEM US-03E: real HTTP handlers -> local PostgreSQL -> in-app notifications.
// Guarded LOCAL ONLY. No Production, Odoo, SMTP, SMS, push or remote network.
import assert from "node:assert/strict";
import net from "node:net";

assert.equal(process.env.TOTEM_US03E_LOCAL_ONLY, "1");
const port = Number(process.env.TOTEM_US03E_PG_PORT);
assert.ok(Number.isSafeInteger(port) && port > 1024 && port <= 65535);
const expectedUrl = `postgresql://postgres@127.0.0.1:${port}/totem_us03e_isolated`;
const allowedPorts = new Set([port]);
assert.equal(process.env.DATABASE_URL, expectedUrl);
const E2E_SALON_ID = Number(process.env.TOTEM_US03E_SALON_ID);
const E2E_MASTER_ID = Number(process.env.TOTEM_US03E_MASTER_ID);
const E2E_SERVICE_ID = Number(process.env.TOTEM_US03E_SERVICE_ID);
const E2E_SLUG = "us03e-local-test-only";
for (const id of [E2E_SALON_ID, E2E_MASTER_ID, E2E_SERVICE_ID]) {
  assert.ok(Number.isSafeInteger(id) && id > 10000);
}

// Deny ALL outbound TCP except the self-contained local PostgreSQL server.
// The real notification service is exercised; no external delivery possible.
const priorConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const first = args[0];
  let host = null;
  let requestedPort = null;
  if (typeof first === "object" && first !== null && !Array.isArray(first)) {
    host = first.host ?? first.hostname ?? "localhost";
    requestedPort = first.port;
  } else if (typeof first === "number") {
    requestedPort = first;
    host = typeof args[1] === "string" ? args[1] : "localhost";
  }
  if (host != null && (!["127.0.0.1", "::1", "localhost"].includes(String(host)) ||
      !allowedPorts.has(Number(requestedPort)))) {
    throw new Error("US03E_OUTBOUND_SOCKET_FORBIDDEN");
  }
  return priorConnect.apply(this, args);
};

const { default: express } = await import("express");
const { pool } = await import("../db.js");
const { resolveMarketContext } = await import("../market-context/MarketContextResolver.js");
const { publicMasterAvailability } = await import("../routes/publicAvailability.js");
const { publicCreateBooking } = await import("../routes/publicCreateBooking.js");

const originalLog = console.info;
console.info = (...args) => {
  // Only mask notification delivery diagnostic chatter; data writes remain real.
  if (String(args[0]).startsWith("PUSH_DELIVERY_")) return;
  originalLog(...args);
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "30kb" }));
app.use((req, res, next) => {
  if (req.ip !== "127.0.0.1" && req.ip !== "::ffff:127.0.0.1") {
    return res.status(403).json({ ok: false, error: "LOCAL_ONLY" });
  }
  next();
});
async function marketMiddleware(req, res, next) {
  try {
    if (req.params.slug !== E2E_SLUG) {
      return res.status(404).json({ ok: false, error: "TEST_TENANT_ONLY" });
    }
    const marketContext = await resolveMarketContext({
      db: pool, salonId: E2E_SALON_ID, requestedLocale: "en-US",
    });
    assert.equal(marketContext.market_code, "US");
    assert.equal(marketContext.currency_code, "USD");
    assert.equal(marketContext.locale, "en-US");
    req.tenant = { salon_id: E2E_SALON_ID };
    req.market_context = marketContext;
    next();
  } catch (err) {
    next(err);
  }
}
app.get("/e2e/salons/:slug/masters/:master_id/availability",
  marketMiddleware, publicMasterAvailability);
app.post("/e2e/salons/:slug/bookings",
  marketMiddleware, publicCreateBooking);
app.use((err, req, res, next) => {
  console.error("US03E_HTTP_MIDDLEWARE_ERROR", String(err?.code || err?.message || "UNKNOWN"));
  res.status(500).json({ ok: false, error: "E2E_HTTP_ERROR" });
});

const listen = app.listen(0, "127.0.0.1");
await new Promise((resolve, reject) => {
  listen.once("listening", resolve);
  listen.once("error", reject);
});
const httpPort = listen.address().port;
allowedPorts.add(httpPort);
const base = `http://127.0.0.1:${httpPort}/e2e/salons/${E2E_SLUG}`;
const safeFetch = async (path, { method = "GET", key = null, body = null } = {}) => {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(key ? { "idempotency-key": key } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const parsed = await response.json();
  return { status: response.status, body: parsed };
};
function expectResponse(actual, code, error) {
  assert.equal(actual.status, code, JSON.stringify({ expected: code, got: actual }));
  if (error) assert.equal(actual.body.error, error, JSON.stringify(actual.body));
}
const availablePath = (location, date) =>
  `/masters/${E2E_MASTER_ID}/availability?service_id=${E2E_SERVICE_ID}&date=${date}` +
  (location ? `&location_code=${location}` : "");
const testResult = {
  status: "HOLD",
  http_port: httpPort,
  database: "totem_us03e_isolated",
  production_network_connections: 0,
  external_notifications_sent: 0,
  tests: {},
};
try {
  // Before a local booking, resolve the physical salon location and active
  // master schedule through the REAL API backed by the restored database.
  const requiredLoc = await safeFetch(availablePath("", "2027-01-18"));
  expectResponse(requiredLoc, 400, "US_LOCATION_CODE_REQUIRED");
  testResult.tests.location_required = "PASS";

  const ny = await safeFetch(availablePath("ny", "2027-01-18"));
  expectResponse(ny, 200);
  assert.equal(ny.body.timezone, "America/New_York");
  assert.equal(ny.body.location_code, "ny");
  const appointment = ny.body.slots.find(slot =>
    slot.local_time === "11:00" && slot.start_at === "2027-01-18T16:00:00.000Z");
  assert.ok(appointment, "US03E_11AM_NY_SLOT_MISSING");
  assert.equal(appointment.end_at, "2027-01-18T16:30:00.000Z");
  testResult.tests.http_ny_availability = "PASS";

  const az = await safeFetch(availablePath("az", "2027-01-18"));
  expectResponse(az, 200);
  assert.equal(az.body.timezone, "America/Phoenix");
  assert.ok(az.body.slots.some(slot =>
    slot.local_time === "09:00" && slot.start_at === appointment.start_at));
  testResult.tests.http_multizone_az = "PASS";

  const requestKey = "US03E_ISOLATED_BOOKING_KEY_ONLY";
  const bookingBody = {
    master_id: E2E_MASTER_ID,
    service_id: E2E_SERVICE_ID,
    location_code: "ny",
    date: "2027-01-18",
    time: "11:00",
    start_at: appointment.start_at,
    client_payload: {
      name: "US03E Test Client",
      phone: "+12133734253",
    },
  };
  const booked = await safeFetch("/bookings", {
    method: "POST", key: requestKey, body: bookingBody,
  });
  expectResponse(booked, 201);
  assert.equal(booked.body.ok, true);
  assert.equal(booked.body.status, "reserved");
  const bookingId = Number(booked.body.booking_id);
  const clientId = Number(booked.body.client?.id);
  assert.ok(bookingId > 0 && clientId > 0);
  assert.equal(booked.body.client?.phone, "+12133734253");
  assert.ok(String(booked.body.client_cabinet?.url || "").startsWith("#/client/"));
  // Never include cabinet access token in the report/log.
  testResult.tests.http_booking_creation = "PASS";

  // Real DB verification, not a mock: booking, location, currency, client,
  // calendar slot, idempotency and three in-app notification records.
  const q = await pool.query(
    `SELECT b.id, b.salon_id, b.master_id, b.start_at, b.end_at,
            b.currency_code, b.status, b.client_id, b.calendar_slot_id,
            link.location_id, l.location_code, l.timezone_name,
            c.phone AS client_phone, cs.status AS calendar_slot_status
       FROM public.bookings b
       JOIN public.us_booking_location_links link ON link.booking_id=b.id
       JOIN public.us_salon_locations l ON l.id=link.location_id
       JOIN public.clients c ON c.id=b.client_id
       JOIN public.calendar_slots cs ON cs.id=b.calendar_slot_id
       WHERE b.id=$1`,
    [bookingId]
  );
  assert.equal(q.rows.length, 1);
  const record = q.rows[0];
  assert.equal(Number(record.salon_id), E2E_SALON_ID);
  assert.equal(Number(record.master_id), E2E_MASTER_ID);
  assert.equal(Number(record.client_id), clientId);
  assert.equal(record.location_code, "ny");
  assert.equal(record.timezone_name, "America/New_York");
  assert.equal(record.currency_code, "USD");
  assert.equal(record.status, "reserved");
  assert.equal(record.calendar_slot_status, "reserved");
  assert.equal(new Date(record.start_at).toISOString(), appointment.start_at);
  assert.equal(new Date(record.end_at).toISOString(), appointment.end_at);
  assert.equal(record.client_phone, "+12133734253");
  const notes = await pool.query(
    `SELECT target_type, channel, status, title_en, body_en, payload_json
       FROM public.app_notifications
       WHERE payload_json->>'booking_id'=$1
       ORDER BY target_type`,
    [String(bookingId)]
  );
  assert.equal(notes.rows.length, 3);
  assert.deepEqual(notes.rows.map(x => x.target_type).sort(),
    ["client", "master", "salon"]);
  assert.ok(notes.rows.every(x =>
    x.channel === "in_app" && x.status === "sent" &&
    x.title_en && x.body_en &&
    x.payload_json.currency_code === "USD" &&
    x.payload_json.start_at === appointment.start_at));
  testResult.tests.real_postgres_atomic_booking_link = "PASS";
  testResult.tests.real_postgres_three_in_app_notifications = "PASS";

  const retry = await safeFetch("/bookings", {
    method: "POST", key: requestKey, body: bookingBody,
  });
  expectResponse(retry, 201);
  assert.equal(Number(retry.body.booking_id), bookingId);
  testResult.tests.idempotency_replay = "PASS";

  const after = await safeFetch(availablePath("ny", "2027-01-18"));
  expectResponse(after, 200);
  assert.ok(!after.body.slots.some(slot => slot.start_at === appointment.start_at));
  testResult.tests.booked_slot_now_busy = "PASS";

  const conflict = await safeFetch("/bookings", {
    method: "POST", key: "US03E_NEW_KEY_CONFLICT_1",
    body: { ...bookingBody },
  });
  expectResponse(conflict, 409, "US_SLOT_UNAVAILABLE");
  testResult.tests.same_slot_conflict = "PASS";

  const azAfter = await safeFetch(availablePath("az", "2027-01-18"));
  expectResponse(azAfter, 200);
  assert.ok(!azAfter.body.slots.some(slot => slot.start_at === appointment.start_at));
  testResult.tests.cross_location_master_conflict = "PASS";

  const missingLocation = await safeFetch(availablePath("not-a-location", "2027-01-18"));
  expectResponse(missingLocation, 404, "US_LOCATION_NOT_FOUND");
  testResult.tests.location_not_found = "PASS";

  const gap = await safeFetch("/bookings", {
    method:"POST", key:"US03E_GAP_KEY",
    body:{ ...bookingBody,
      date:"2027-03-14",time:"02:30",start_at:null },
  });
  expectResponse(gap, 409, "US_DST_GAP");
  testResult.tests.spring_dst_gap_rejected = "PASS";

  const fold = await safeFetch("/bookings", {
    method:"POST",key:"US03E_FOLD_KEY",
    body:{ ...bookingBody,
      date:"2027-11-07",time:"01:30",start_at:null },
  });
  expectResponse(fold, 409, "US_DST_FOLD");
  testResult.tests.autumn_dst_fold_rejected = "PASS";

  // Notifications were saved to the database; external push/email/SMS/WA
  // are intentionally not sent from this isolated localhost process.
  const totals = await pool.query(
    `SELECT
       (SELECT count(*)::integer FROM public.bookings WHERE salon_id=$1) AS bookings,
       (SELECT count(*)::integer FROM public.us_booking_location_links link
        JOIN public.bookings b ON b.id=link.booking_id WHERE b.salon_id=$1) AS links,
       (SELECT count(*)::integer FROM public.app_notifications
        WHERE payload_json->>'booking_id'=$2) AS notifications`,
    [E2E_SALON_ID,String(bookingId)]
  );
  assert.deepEqual(totals.rows[0], { bookings:1, links:1, notifications:3 });
  testResult.tests.single_booking_and_single_location_link = "PASS";

  testResult.status = "PASS";
  testResult.case_count = Object.keys(testResult.tests).length;
  testResult.booking_id_local_only = bookingId;
  testResult.start_at = appointment.start_at;
  testResult.currency = "USD";
  testResult.external_notifications_sent = 0;
  console.log("US03E_REAL_HTTP_POSTGRES_BOOKING_PASS", JSON.stringify(testResult));
} catch (error) {
  testResult.status = "HOLD";
  testResult.error = String(error?.stack || error).slice(0, 1400);
  console.error("US03E_REAL_HTTP_BOOKING_STOP", testResult.error);
} finally {
  await pool.end();
  await new Promise(resolve => listen.close(resolve));
}
if (testResult.status !== "PASS") process.exitCode = 2;
