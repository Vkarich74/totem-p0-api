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

// POST /payments/webhook
router.post("/webhook", async (req, res) => {
  const { payment_id, status } = req.body;

  if (!payment_id || !["succeeded", "failed"].includes(status)) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const client = getClient();

  try {
    await client.connect();

    // финализируем ТОЛЬКО активный pending
    const result = await client.query(
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

    // ничего не обновили → либо не существует, либо уже обработан
    if (result.rowCount === 0) {
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
