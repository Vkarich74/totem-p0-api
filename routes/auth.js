// routes/auth.js
import express from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import db from "../db/index.js";

const router = express.Router();

const OTP_TTL_MINUTES = 30;
const OTP_MAX_ATTEMPTS = 5;
const OTP_BLOCK_MINUTES = 10;

function nowPlusMinutes(minutes){
  return new Date(Date.now() + minutes * 60 * 1000);
}

function sha256(value){
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function generateOtpCode(){
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeEmail(value){
  return String(value || "").trim().toLowerCase();
}

function isEmail(value){
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildTransport(){
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if(!host || !port || !user || !pass){
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    }
  });
}

async function sendOtpEmail({ to, code }){
  const transporter = buildTransport();

  if(!transporter){
    throw new Error("SMTP_NOT_CONFIGURED");
  }

  await transporter.sendMail({
    from: String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim(),
    to,
    subject: "Код входа TOTEM",
    html: `
      <div style="font-family:Arial,sans-serif;font-size:16px;color:#111827">
        <h2 style="margin:0 0 16px 0;">Код входа TOTEM</h2>
        <p style="margin:0 0 12px 0;">Ваш код подтверждения:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 16px 0;">${code}</div>
        <p style="margin:0;color:#4b5563;">Код действует ${OTP_TTL_MINUTES} минут.</p>
      </div>
    `
  });
}

async function findUserByLogin(login){
  const normalizedEmail = normalizeEmail(login);

  if(!isEmail(normalizedEmail)){
    return null;
  }

  return db.get(
    `SELECT id, email, role, salon_slug, master_slug, enabled
     FROM auth_users
     WHERE lower(email)=$1
     LIMIT 1`,
    [normalizedEmail]
  );
}

async function createSession(userId){
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.run(
    `
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES ($1,$2,$3)
    `,
    [sessionId, userId, expiresAt]
  );

  return sessionId;
}

router.post("/request", async (req, res) => {
  try{
    const login = String(req.body?.login || req.body?.email || "").trim();
    const purpose = String(req.body?.purpose || "login").trim() || "login";

    if(!login){
      return res.status(400).json({ ok:false, error:"LOGIN_REQUIRED" });
    }

    if(!isEmail(login)){
      return res.status(400).json({ ok:false, error:"EMAIL_ONLY_IN_THIS_ROUTE" });
    }

    const user = await findUserByLogin(login);

    if(!user || !user.enabled){
      return res.json({ ok:true });
    }

    const target = normalizeEmail(login);
    const code = generateOtpCode();
    const codeHash = sha256(code);

    await db.run(
      `
      UPDATE auth_otps
      SET consumed_at = NOW()
      WHERE target=$1
        AND purpose=$2
        AND consumed_at IS NULL
      `,
      [target, purpose]
    );

    await db.run(
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
        user.id,
        "email",
        target,
        purpose,
        codeHash,
        nowPlusMinutes(OTP_TTL_MINUTES),
        0,
        OTP_MAX_ATTEMPTS,
        null,
        nowPlusMinutes(1),
        null
      ]
    );

    await sendOtpEmail({ to: target, code });

    return res.json({ ok:true });
  }catch(e){
    console.error("[AUTH_REQUEST_ERROR]", e);
    return res.status(500).json({ ok:false, error:"AUTH_REQUEST_FAILED" });
  }
});

router.post("/verify-json", async (req, res) => {
  try{
    const login = String(req.body?.login || req.body?.email || "").trim();
    const code = String(req.body?.code || req.body?.token || "").trim();
    const purpose = String(req.body?.purpose || "login").trim() || "login";

    if(!login){
      return res.status(400).json({ ok:false, error:"LOGIN_REQUIRED" });
    }

    if(!code){
      return res.status(400).json({ ok:false, error:"CODE_REQUIRED" });
    }

    const target = normalizeEmail(login);

    const otp = await db.get(
      `
      SELECT id, user_id, target, purpose, code_hash, expires_at, attempts_used, max_attempts, blocked_until, consumed_at
      FROM auth_otps
      WHERE target=$1
        AND purpose=$2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [target, purpose]
    );

    if(!otp){
      return res.status(401).json({ ok:false, error:"OTP_NOT_FOUND" });
    }

    if(otp.consumed_at){
      return res.status(401).json({ ok:false, error:"OTP_ALREADY_USED" });
    }

    if(otp.blocked_until && new Date(otp.blocked_until).getTime() > Date.now()){
      return res.status(429).json({ ok:false, error:"OTP_BLOCKED" });
    }

    if(new Date(otp.expires_at).getTime() < Date.now()){
      return res.status(401).json({ ok:false, error:"OTP_EXPIRED" });
    }

    const incomingHash = sha256(code);

    if(incomingHash !== otp.code_hash){
      const nextAttempts = Number(otp.attempts_used || 0) + 1;
      const shouldBlock = nextAttempts >= Number(otp.max_attempts || OTP_MAX_ATTEMPTS);

      await db.run(
        `
        UPDATE auth_otps
        SET attempts_used=$2,
            blocked_until=$3
        WHERE id=$1
        `,
        [
          otp.id,
          nextAttempts,
          shouldBlock ? nowPlusMinutes(OTP_BLOCK_MINUTES) : null
        ]
      );

      return res.status(401).json({ ok:false, error:"OTP_INVALID" });
    }

    await db.run(
      `
      UPDATE auth_otps
      SET consumed_at=NOW()
      WHERE id=$1
      `,
      [otp.id]
    );

    const user = await db.get(
      `
      SELECT id, email, role, salon_slug, master_slug, enabled
      FROM auth_users
      WHERE id=$1
      LIMIT 1
      `,
      [otp.user_id]
    );

    if(!user || !user.enabled){
      return res.status(403).json({ ok:false, error:"USER_DISABLED" });
    }

    const sessionId = await createSession(user.id);

    res.cookie("totem_session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true
    });

    return res.json({
      ok: true,
      token: sessionId,
      role: user.role,
      salon_slug: user.salon_slug,
      master_slug: user.master_slug
    });
  }catch(e){
    console.error("[AUTH_VERIFY_JSON_ERROR]", e);
    return res.status(500).json({ ok:false, error:"AUTH_VERIFY_FAILED" });
  }
});

router.post("/session", (req, res) => {
  res.status(400).json({ error: "not implemented" });
});

export default router;
