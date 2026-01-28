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
    await client.query("BEGIN");

    const p = await client.query(
      `
      SELECT id, booking_id, status, is_active
      FROM payments
      WHERE id = $1
      FOR UPDATE
      `,
      [payment_id]
    );

    if (p.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "payment_not_found" });
    }

    const row = p.rows[0];

    if (!row.is_active || row.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "payment_not_active" });
    }

    await client.query(
      `
      UPDATE payments
      SET status = $2,
          is_active = false,
          updated_at = now()
      WHERE id = $1
      `,
      [payment_id, status]
    );

    await client.query(
      `
      INSERT INTO reconciliations
        (payment_id, booking_id, expected_status, actual_status, result)
      VALUES
        ($1, $2, 'pending', $3, 'ok')
      `,
      [payment_id, row.booking_id, status]
    );

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "internal_error" });
  } finally {
    await client.end();
  }
});

export default router;
