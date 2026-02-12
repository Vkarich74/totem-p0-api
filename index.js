import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Pool } from "pg";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const app = express();
app.set("trust proxy", 1);

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "https://totem-platform.odoo.com";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET missing");
  process.exit(1);
}

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

let _pool = null;

function getPool() {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  return _pool;
}

/* ================= ACTOR HELPERS ================= */

function readActorFromHeaders(req) {
  const rawType =
    (req.headers["x-actor-type"] || req.headers["actor-type"] || "system")
      .toString()
      .trim()
      .toLowerCase();

  if (!["owner", "master", "system"].includes(rawType)) {
    return { ok: false, error: "INVALID_ACTOR_TYPE" };
  }

  const actorIdHeader = req.headers["x-actor-id"] || req.headers["actor-id"];
  const sourceHeader = req.headers["x-source"] || req.headers["source"];

  const actor_id = actorIdHeader ? actorIdHeader.toString().trim() : "";
  const source = sourceHeader ? sourceHeader.toString().trim() : "api";

  return {
    ok: true,
    actor_type: rawType,
    actor_id,
    source
  };
}

async function setActorLocals(client, actor) {
  const safeType = actor.actor_type.replace(/'/g, "");
  const safeId = (actor.actor_id || "").replace(/'/g, "");
  const safeSource = (actor.source || "api").replace(/'/g, "");

  await client.query(`SET LOCAL app.actor_type = '${safeType}'`);
  await client.query(`SET LOCAL app.actor_id = '${safeId}'`);
  await client.query(`SET LOCAL app.source = '${safeSource}'`);
}

/* ================= CONFIRM BOOKING ================= */

app.post("/bookings/:id/confirm", async (req, res) => {
  const pool = getPool();
  const bookingId = req.params.id;
  const idempotencyKey = req.headers["idempotency-key"];

  if (!idempotencyKey)
    return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });

  const actor = readActorFromHeaders(req);
  if (!actor.ok) return res.status(400).json({ ok: false, error: actor.error });

  const requestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(req.body || {}))
    .digest("hex");

  const client = await pool.connect();

  try {
    const existing = await client.query(
      `SELECT request_hash, response_code, response_body
       FROM public.api_idempotency_keys
       WHERE idempotency_key=$1
       LIMIT 1`,
      [idempotencyKey]
    );

    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.request_hash !== requestHash)
        return res.status(409).json({ ok: false, error: "IDEMPOTENCY_KEY_CONFLICT" });

      return res.status(row.response_code).json(row.response_body);
    }

    await client.query("BEGIN");
    await setActorLocals(client, actor);

    await client.query(
      `INSERT INTO public.api_idempotency_keys
       (idempotency_key, endpoint, request_hash)
       VALUES ($1,'confirm_booking',$2)`,
      [idempotencyKey, requestHash]
    );

    await client.query(
      `UPDATE public.bookings
       SET status='confirmed'
       WHERE id=$1`,
      [bookingId]
    );

    const response = { ok: true, status: "confirmed" };

    await client.query(
      `UPDATE public.api_idempotency_keys
       SET response_code=200, response_body=$2
       WHERE idempotency_key=$1`,
      [idempotencyKey, response]
    );

    await client.query("COMMIT");
    return res.json(response);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CONFIRM_ERROR:", err);
    return res.status(400).json({ ok: false, error: "CONFIRM_FAILED" });
  } finally {
    client.release();
  }
});

/* ================= CANCEL BOOKING ================= */

app.post("/bookings/:id/cancel", async (req, res) => {
  const pool = getPool();
  const bookingId = req.params.id;
  const idempotencyKey = req.headers["idempotency-key"];

  if (!idempotencyKey)
    return res.status(400).json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" });

  const actor = readActorFromHeaders(req);
  if (!actor.ok) return res.status(400).json({ ok: false, error: actor.error });

  const requestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(req.body || {}))
    .digest("hex");

  const client = await pool.connect();

  try {
    const existing = await client.query(
      `SELECT request_hash, response_code, response_body
       FROM public.api_idempotency_keys
       WHERE idempotency_key=$1
       LIMIT 1`,
      [idempotencyKey]
    );

    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.request_hash !== requestHash)
        return res.status(409).json({ ok: false, error: "IDEMPOTENCY_KEY_CONFLICT" });

      return res.status(row.response_code).json(row.response_body);
    }

    await client.query("BEGIN");
    await setActorLocals(client, actor);

    await client.query(
      `INSERT INTO public.api_idempotency_keys
       (idempotency_key, endpoint, request_hash)
       VALUES ($1,'cancel_booking',$2)`,
      [idempotencyKey, requestHash]
    );

    await client.query(
      `UPDATE public.bookings
       SET status='canceled'
       WHERE id=$1`,
      [bookingId]
    );

    const response = { ok: true, status: "canceled" };

    await client.query(
      `UPDATE public.api_idempotency_keys
       SET response_code=200, response_body=$2
       WHERE idempotency_key=$1`,
      [idempotencyKey, response]
    );

    await client.query("COMMIT");
    return res.json(response);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CANCEL_ERROR:", err);
    return res.status(400).json({ ok: false, error: "CANCEL_FAILED" });
  } finally {
    client.release();
  }
});

/* ================= HEALTH ================= */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server running on port:", PORT);
});
