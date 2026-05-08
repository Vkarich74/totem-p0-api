import { Router } from "express";

function parsePositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function normalizePaymentRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    booking_id: row.booking_id,
    amount: row.amount,
    status: row.status,
    provider: row.provider,
    created_at: row.created_at
  };
}

async function findActivePaymentForBooking(db, bookingId) {
  return db.query(
    `
SELECT id, booking_id, amount, status, provider, created_at
FROM payments
WHERE booking_id=$1
AND is_active=true
FOR UPDATE
LIMIT 1
`,
    [bookingId]
  );
}

export default function buildPaymentsRouter({
  pool,
  getSalonWalletId,
  getSystemWalletId,
  setBookingConfirmedIfNeeded
}) {
  const r = Router();

  r.post("/payments/direct/pending", async (req, res) => {
    const { booking_id, service_price } = req.body || {};
    const amount = parsePositiveAmount(service_price);

    if (!booking_id || amount == null) {
      return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
    }

    const db = await pool.connect();

    try {
      await db.query("BEGIN");

      const bookingCheck = await db.query(
        `
SELECT
b.id,
b.salon_id,
b.status
FROM bookings b
WHERE b.id=$1
FOR UPDATE
LIMIT 1
`,
        [booking_id]
      );

      if (!bookingCheck.rows.length) {
        await db.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
      }

      const bookingRow = bookingCheck.rows[0];

      if (!bookingRow.salon_id) {
        await db.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "BOOKING_NOT_READY" });
      }

      const activePayment = await findActivePaymentForBooking(db, booking_id);

      if (activePayment.rows.length) {
        const active = activePayment.rows[0];
        const activeStatus = String(active.status || "").toLowerCase();
        const activeProvider = String(active.provider || "").toLowerCase();

        if (activeProvider === "direct" && ["pending", "confirmed"].includes(activeStatus)) {
          await db.query("ROLLBACK");
          return res.json({
            ok: true,
            reused: true,
            payment: normalizePaymentRow(active)
          });
        }

        await db.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "ACTIVE_PAYMENT_EXISTS",
          payment_id: active.id,
          payment: normalizePaymentRow(active)
        });
      }

      const payment = await db.query(
        `
INSERT INTO payments(
booking_id,
provider,
amount,
status,
is_active
)
VALUES($1,'direct',$2,'pending',true)
RETURNING id,booking_id,amount,status,provider,created_at
`,
        [booking_id, amount]
      );

      await db.query("COMMIT");

      return res.json({
        ok: true,
        payment: normalizePaymentRow(payment.rows[0])
      });
    } catch (err) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("DIRECT_PAYMENT_PENDING_ROLLBACK_ERROR", rollbackErr);
      }

      console.error("DIRECT_PAYMENT_PENDING_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "DIRECT_PAYMENT_PENDING_FAILED"
      });
    } finally {
      db.release();
    }
  });

  /* PAYMENT FLOW */
  r.post("/payments/flow", async (req, res) => {
    const { booking_id, service_price } = req.body;

    const db = await pool.connect();

    try {
      await db.query("BEGIN");

      const amount = parseInt(service_price, 10);
      const amountCents = amount;

      if (!booking_id || !service_price || Number.isNaN(amount) || amount <= 0) {
        await db.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
      }

      const bookingCheck = await db.query(
        `
SELECT
b.id,
b.salon_id,
b.status
FROM bookings b
WHERE b.id=$1
FOR UPDATE
LIMIT 1
`,
        [booking_id]
      );

      if (!bookingCheck.rows.length) {
        await db.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
      }

      const salonId = bookingCheck.rows[0].salon_id;

      const activePayment = await db.query(
        `
SELECT id, booking_id, amount, status, provider, created_at
FROM payments
WHERE booking_id=$1
AND is_active=true
FOR UPDATE
LIMIT 1
`,
        [booking_id]
      );

      if (activePayment.rows.length) {
        await db.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "ACTIVE_PAYMENT_EXISTS",
          payment_id: activePayment.rows[0].id,
          payment: activePayment.rows[0]
        });
      }

      const payment = await db.query(
        `
INSERT INTO payments(
booking_id,
provider,
amount,
status,
is_active
)
VALUES($1,'direct',$2,'confirmed',true)
RETURNING id,booking_id,amount,status,provider,created_at
`,
        [booking_id, amount]
      );

      const paymentId = payment.rows[0].id;
      const salonWallet = await getSalonWalletId(db, salonId);
      const systemWalletId = await getSystemWalletId(db);

      /* force exact payment ledger state */
      await db.query(
        `
DELETE FROM totem_test.ledger_entries
WHERE reference_type='payment'
AND reference_id=$1
`,
        [String(paymentId)]
      );

      await db.query(
        `
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id,
purpose
)
VALUES
($1,'debit',$3,'payment',$4,'main'),
($2,'credit',$3,'payment',$4,'main')
`,
        [systemWalletId, salonWallet, amountCents, String(paymentId)]
      );

      await setBookingConfirmedIfNeeded(db, booking_id);

      await db.query("COMMIT");

      res.json({
        ok: true,
        payment: payment.rows[0]
      });
    } catch (err) {
      try {
        await db.query("ROLLBACK");
      } catch (e) {}

      if (String(err?.message || "") === "SALON_WALLET_NOT_FOUND") {
        return res.status(400).json({ ok: false, error: "SALON_WALLET_NOT_FOUND" });
      }

      if (String(err?.message || "") === "SYSTEM_WALLET_NOT_FOUND") {
        return res.status(400).json({ ok: false, error: "SYSTEM_WALLET_NOT_FOUND" });
      }

      console.error("PAYMENT_FLOW_ERROR", err);

      res.status(500).json({
        ok: false,
        error: "PAYMENT_FLOW_FAILED"
      });
    } finally {
      db.release();
    }
  });

  return r;
}
