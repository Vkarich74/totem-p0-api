import express from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { pool } from "../db/index.js";

const router = express.Router();

const OTP_TTL_MINUTES = 10;

function signSession(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64");
  const secret = process.env.AUTH_SESSION_SECRET || "dev";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function nowPlusMinutes(m){
  return new Date(Date.now() + m * 60 * 1000);
}

function sha256(v){
  return crypto.createHash("sha256").update(String(v || "")).digest("hex");
}

function normalizeEmail(v){
  return String(v || "").trim().toLowerCase();
}

function isEmail(v){
  const e = normalizeEmail(v);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function buildTransport(){
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if(!host || !user || !pass){
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

async function sendOtpEmail({ to, code }){
  const transporter = buildTransport();
  if(!transporter) throw new Error("SMTP_NOT_CONFIGURED");

  await transporter.sendMail({
    from: String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim(),
    to,
    subject: "Код входа TOTEM",
    html: `
      <div style="font-family:Arial,sans-serif;font-size:16px;color:#111827">
        <h2>Код входа TOTEM</h2>
        <p>Ваш код:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</div>
        <p>Код действует ${OTP_TTL_MINUTES} минут.</p>
      </div>
    `
  });
}

/**
 * POST /auth/request
 * EMAIL OTP вместо magic link
 */
router.post("/request", async (req, res) => {
  const { email, role, salon_slug, master_slug } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  if(!isEmail(email)){
    return res.status(400).json({ error: "EMAIL_REQUIRED" });
  }

  if (role === "master" && !master_slug) {
    return res.status(400).json({ error: "MASTER_SLUG_REQUIRED" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const u = await client.query(
      `
      INSERT INTO auth_users (email, role, salon_slug, master_slug, enabled)
      VALUES ($1,$2,$3,$4,true)
      ON CONFLICT (email, role) DO UPDATE SET enabled=true
      RETURNING id
      `,
      [email, role, salon_slug || null, master_slug || null]
    );

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = sha256(code);
    const target = normalizeEmail(email);

    await client.query(
      `
      INSERT INTO auth_otps (
        id,
        user_id,
        channel,
        target,
        purpose,
        code_hash,
        expires_at,
        attempts_used,
        max_attempts,
        blocked_until,
        resend_available_at,
        consumed_at,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      `,
      [
        crypto.randomUUID(),
        u.rows[0].id,
        "email",
        target,
        "login",
        codeHash,
        nowPlusMinutes(OTP_TTL_MINUTES),
        0,
        5,
        null,
        nowPlusMinutes(1),
        null
      ]
    );

    await sendOtpEmail({ to: target, code });

    await client.query("COMMIT");
    return res.json({ ok: true });

  } catch (e) {
    await client.query("ROLLBACK");
    console.error("AUTH_REQUEST_ERROR", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * POST /auth/verify-json
 * Проверка OTP → session
 */
router.post("/verify-json", async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const target = normalizeEmail(email);

  const r = await pool.query(
    `
    SELECT o.*, u.id, u.role, u.salon_slug, u.master_slug
    FROM auth_otps o
    JOIN auth_users u ON u.id = o.user_id
    WHERE o.target = $1 AND o.purpose='login'
    ORDER BY o.created_at DESC
    LIMIT 1
    `,
    [target]
  );

  if (r.rowCount === 0) {
    return res.status(400).json({ error: "OTP_NOT_FOUND" });
  }

  const otp = r.rows[0];

  if (new Date(otp.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "OTP_EXPIRED" });
  }

  if (sha256(code) !== otp.code_hash) {
    return res.status(400).json({ error: "OTP_INVALID" });
  }

  const session = signSession({ v: 1, uid: otp.user_id, iat: Date.now() });

  return res.json({
    ok: true,
    session,
    role: otp.role,
    salon_slug: otp.salon_slug,
    master_slug: otp.master_slug
  });
});

/**
 * POST /auth/session
 */
router.post("/session", async (req, res) => {
  return res.status(400).json({ error: "USE_VERIFY_JSON" });
});

export default router;
