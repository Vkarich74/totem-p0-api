// Final C11 isolated staging HTTP server. STRICTLY synthetic test data.
// C11 endpoint and client cabinet token verification use real Backend code.
// Only the unrelated legacy cabinet list/notification feed is minimized here.
// Never bind to public interface or connect to Production/Railway.
import express from "express";
import pg from "pg";
import {
  verifyClientCabinetAccess,
} from "../src/services/clientCabinetTokenAccess.js";
import { buildPublicUsPayC11Router } from "../src/routes/publicUsPayC11.js";

const connectionString = process.env.US_PAY_C11_TEST_DATABASE_URL || "";
if (!/^postgres:\/\/[^@]+@127\.0\.0\.1:55432\/us_pay_c11_staging$/.test(connectionString)) {
  throw new Error("US_C11_STAGE_PRODUCTION_DATABASE_REFUSED");
}
const port = Number(process.env.US_PAY_C11_STAGE_PORT || 4123);
if (port !== 4123) throw new Error("US_C11_STAGE_PORT_INVALID");

const pool = new pg.Pool({ connectionString, max: 5 });
const app = express();
const stageOrigin = "http://127.0.0.1:4173";

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.headers.origin === stageOrigin) {
    res.set("Access-Control-Allow-Origin", stageOrigin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Accept,Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});

app.get("/stage/health", async (_req, res) => {
  try {
    const check = await pool.query("SELECT current_database() AS db");
    if (check.rows[0]?.db !== "us_pay_c11_staging") throw new Error("DB_MISMATCH");
    return res.json({ ok: true, market: "US", mode: "synthetic-only" });
  } catch {
    return res.status(503).json({ ok: false });
  }
});

// Actual US-PAY-C11 router + production token verifier + real PG17 sidecars.
app.use("/public", buildPublicUsPayC11Router({
  pool, verifyClientCabinetAccess,
}));

async function withClientToken(req, res, execute) {
  let db;
  try {
    const clientId = Number(req.params.clientId);
    const token = String(req.params.token || "");
    db = await pool.connect();
    await db.query("BEGIN READ ONLY");
    await db.query("SET LOCAL statement_timeout = '3000ms'");
    const access = await verifyClientCabinetAccess(db, clientId, token);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });
    return await execute(db, clientId, token);
  } catch {
    return res.status(503).json({ ok: false, error: "US_C11_STAGE_BASE_UNAVAILABLE" });
  } finally {
    if (db) {
      try { await db.query("ROLLBACK"); db.release(); }
      catch (error) { db.release(error); }
    }
  }
}

// Test-only base cabinet list, sourced from synthetic PG17 bookings.
// This endpoint is NOT claimed as a test of the production base cabinet SQL.
app.get("/public/clients/:clientId/:token", (req, res) =>
  withClientToken(req, res, async (db, clientId, token) => {
    const rows = await db.query(`
      SELECT b.id, b.status, b.price_snapshot, b.currency_code,
             b.start_at, b.end_at, b.created_at,
             b.salon_id, b.master_id, b.service_id,
             m.code AS market_code,
             salon.name AS salon_name,
             master.name AS master_name
      FROM public.bookings b
      JOIN public.tenant_market_settings t ON t.salon_id = b.salon_id
      JOIN public.markets m ON m.id = t.market_id
      LEFT JOIN public.salons salon ON salon.id = b.salon_id
      LEFT JOIN public.masters master ON master.id = b.master_id
      WHERE b.client_id = $1
      ORDER BY b.id DESC
    `, [clientId]);
    const bookings = rows.rows.map(x => ({
      ...x,
      salon_slug: "synthetic-salon",
      service_name: "Synthetic service",
      booking_timezone: "America/New_York",
      payment_provider: "xpay",  // deliberate legacy false-positive fixture
      payment_status: "confirmed", // must NOT show as paid in US
      payment_label_ru: "Оплата получена",
    }));
    const marketCode = bookings[0]?.market_code || "KG";
    return res.json({
      ok: true,
      client: {
        id: clientId,
        name: "Synthetic Client",
        phone: "+12135550155",
        email: "synthetic@example.invalid",
        market_code: marketCode,
        currency_code: marketCode === "US" ? "USD" : "KGS",
      },
      bookings,
      stats: {
        bookings_total: bookings.length,
        active_bookings: bookings.filter(b => ["reserved", "confirmed"].includes(b.status)).length,
        completed_bookings: bookings.filter(b => b.status === "completed").length,
      },
      personal_link: `#/client/${clientId}/${token}`,
    });
  })
);

app.get("/public/clients/:clientId/:token/notifications", (req, res) =>
  withClientToken(req, res, async (_db, _clientId, _token) =>
    res.json({ ok: true, notifications: [], unread_count: 0 }))
);

const server = app.listen(port, "127.0.0.1", () => {
  console.log("US_C11_STAGE_API_READY");
});
async function stop() {
  server.close();
  await pool.end();
}
process.on("SIGTERM", () => { void stop(); });
process.on("SIGINT", () => { void stop(); });
