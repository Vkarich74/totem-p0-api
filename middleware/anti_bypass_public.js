// middleware/anti_bypass_public.js
// CONTRACT:
// - This middleware does NOT authenticate users
// - It ONLY validates static tokens for public / webhook access
// - No cookies, no sessions, no req.user logic

export function requirePublicToken(req, res, next) {
  const expected = process.env.PUBLIC_TOKEN || "";

  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_MISCONFIGURED",
      message: "PUBLIC_TOKEN is not set"
    });
  }

  const got =
    req.headers["x-public-token"] ||
    req.headers["X-Public-Token"] ||
    req.query.public_token ||
    "";

  if (!got || got !== expected) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  next();
}

export function requireWebhookToken(req, res, next) {
  const expected = process.env.PAYMENT_WEBHOOK_TOKEN || "";

  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_MISCONFIGURED",
      message: "PAYMENT_WEBHOOK_TOKEN is not set"
    });
  }

  const got =
    req.headers["x-webhook-token"] ||
    req.headers["X-Webhook-Token"] ||
    "";

  if (!got || got !== expected) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  next();
}
