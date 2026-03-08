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
    await client.query("BEGIN");

    const provider = marketplace?.enabled ? "marketplace" : "direct";

    // create payment
    const ins = await client.query(
      `
      INSERT INTO payments (booking_id, provider, amount, status, is_active)
      VALUES ($1, $2, $3, 'pending', true)
      RETURNING id, booking_id, amount, status, provider
      `,
      [booking_id, provider, service_price]
    );

    const p = ins.rows[0];

    // find salon wallet
    const salonWallet = await client.query(
      `
      SELECT w.id
      FROM totem_test.wallets w
      JOIN bookings b ON b.salon_id = w.owner_id
      WHERE b.id = $1
      AND w.owner_type = 'salon'
      LIMIT 1
      `,
      [booking_id]
    );

    if (!salonWallet.rows.length) {
      throw new Error("SALON_WALLET_NOT_FOUND");
    }

    const salonWalletId = salonWallet.rows[0].id;

    // find system wallet
    const systemWallet = await client.query(
      `
      SELECT id
      FROM totem_test.system_wallets
      LIMIT 1
      `
    );

    if (!systemWallet.rows.length) {
      throw new Error("SYSTEM_WALLET_NOT_FOUND");
    }

    const systemWalletId = systemWallet.rows[0].id;

    const amountCents = service_price;

    // debit system wallet
    await client.query(
      `
      INSERT INTO totem_test.ledger_entries
      (wallet_id, direction, amount_cents, reference_type, reference_id)
      VALUES ($1, 'debit', $2, 'payment', $3)
      `,
      [systemWalletId, amountCents, p.id]
    );

    // credit salon wallet
    await client.query(
      `
      INSERT INTO totem_test.ledger_entries
      (wallet_id, direction, amount_cents, reference_type, reference_id)
      VALUES ($1, 'credit', $2, 'payment', $3)
      `,
      [salonWalletId, amountCents, p.id]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      build: "p5.3-ledger",
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

    try { await client.query("ROLLBACK"); } catch (_) {}

    if (e && e.code === "23505") {
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

    console.error("payments_flow_error", {
      code: e?.code,
      message: e?.message
    });

    return res.status(500).json({
      error: "internal_error",
      pg_code: e?.code || null
    });

  } finally {
    await client.end();
  }
});

export default router;