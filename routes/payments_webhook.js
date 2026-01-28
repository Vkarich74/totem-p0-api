import express from "express";
import pg from "pg";

const router = express.Router();
const { Client } = pg;

function getClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

function isUuid(v) {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// POST /payments/webhook
// body: { payment_id, status } status = succeeded | failed
router.post("/webhook", async (req, res) => {
  const { payment_id, status } = req.body || {};

  if (!isUuid(payment_id) || !["succeeded", "failed"].includes(status)) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const client = getClient();

  try {
    await client.connect();

    const r = await client.query(
      `
      UPDATE payments
      SET status = $2,
          is_active = false
      WHERE id = $1
        AND is_active = true
        AND status = 'pending'
      `,
      [payment_id, status]
    );

    if (r.rowCount === 0) {
      return res.status(409).json({ error: "payment_not_active" });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "internal_error" });
  } finally {
    await client.end();
  }
});

export default router;
