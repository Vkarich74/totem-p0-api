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

// POST /payments/flow
router.post("/flow", async (req, res) => {
  const { booking_id, service_price, marketplace } = req.body || {};

  if (!Number.isInteger(booking_id) || !Number.isInteger(service_price) || service_price <= 0) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const client = getClient();

  try {
    await client.connect();

    const provider = marketplace?.enabled ? "marketplace" : "direct";

    // TRY INSERT (may fail on unique guard)
    const ins = await client.query(
      `
      INSERT INTO payments (booking_id, provider, amount, status, is_active)
      VALUES ($1, $2, $3, 'pending', true)
      RETURNING id, booking_id, amount, status, provider
      `,
      [booking_id, provider, service_price]
    );

    const p = ins.rows[0];

    return res.json({
      ok: true,
      flow: {
        booking_id: p.booking_id,
        intent: {
          booking_id: p.booking_id,
          amount_total: p.amount,
          type: p.provider,
          commission_amount: 0,
          provider_amount: p.amount,
          marketplace_amount: 0,
          status: "intent_created"
        },
        payment: {
          payment_id: p.id,
          booking_id: p.booking_id,
          amount: p.amount,
          type: p.provider,
          status: p.status
        }
      }
    });
  } catch (e) {
    // UNIQUE VIOLATION: active payment exists
    if (e.code === "23505") {
      try {
        const r = await client.query(
          `
          SELECT id
          FROM payments
          WHERE booking_id = $1 AND is_active = true
          LIMIT 1
          `,
          [booking_id]
        );

        if (r.rows.length > 0) {
          return res.status(409).json({
            error: "active_payment_exists",
            payment_id: r.rows[0].id
          });
        }
      } catch (_) {}
    }

    return res.status(500).json({ error: "internal_error" });
  } finally {
    await client.end();
  }
});

export default router;
