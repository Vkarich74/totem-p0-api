import { Router } from "express";
import { createNotification } from "../../services/notifications/notificationService.js";
import { buildCashConfirmNotificationTemplate } from "../../services/notifications/notificationTemplates.js";

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

function normalizeBookingNotificationContext(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    salon_id: row.salon_id,
    salon_slug: row.salon_slug || null,
    master_id: row.master_id || null,
    master_slug: row.master_slug || null,
    client_id: row.client_id || null,
    status: row.status || null
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

async function findBookingConfirmationContext(db, bookingId, { lock = false } = {}) {
  const lockClause = lock ? " FOR UPDATE" : "";

  const bookingRes = await db.query(
    `
SELECT
 b.id,
 b.salon_id,
 b.master_id,
 b.client_id,
 b.status
FROM bookings b
WHERE b.id=$1
${lockClause}
LIMIT 1
`,
    [bookingId]
  );

  if (!bookingRes.rows.length) {
    return null;
  }

  const contextRes = await db.query(
    `
SELECT
 b.id,
 b.salon_id,
 s.slug AS salon_slug,
 b.master_id,
 m.slug AS master_slug,
 b.client_id,
 b.status
FROM bookings b
LEFT JOIN salons s ON s.id = b.salon_id
LEFT JOIN masters m ON m.id = b.master_id
WHERE b.id=$1
LIMIT 1
`,
    [bookingId]
  );

  return contextRes.rows[0] || bookingRes.rows[0];
}

function getDirectPaymentLabelRu(provider, status, hasPayment) {
  if (!hasPayment) {
    return "Оплата не выбрана";
  }

  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedStatus === "pending" && normalizedProvider === "direct") {
    return "Наличные ожидают подтверждения";
  }

  if (normalizedStatus === "confirmed" && normalizedProvider === "direct") {
    return "Оплата наличными подтверждена";
  }

  if (normalizedStatus === "failed") {
    return "Оплата не прошла";
  }

  if (normalizedStatus === "refunded") {
    return "Оплата возвращена";
  }

  if (normalizedStatus === "pending" && normalizedProvider === "xpay") {
    return "Ожидаем оплату XPAY";
  }

  if (normalizedStatus === "confirmed" && normalizedProvider === "xpay") {
    return "Оплата получена";
  }

  return "Оплата не выбрана";
}

export default function buildPaymentsRouter({
  pool,
  getSalonWalletId,
  getSystemWalletId,
  setBookingConfirmedIfNeeded
}) {
  const r = Router();

  async function confirmDirectPendingCashPayment(db, input = {}) {
    const bookingId = Number(input.booking_id ?? input.bookingId ?? null);
    const paymentId = Number(input.payment_id ?? input.paymentId ?? null);

    if (!Number.isInteger(bookingId) && !Number.isInteger(paymentId)) {
      return {
        ok: false,
        error: "BOOKING_ID_REQUIRED"
      };
    }

    let bookingRow = null;
    let paymentRow = null;

    if (Number.isInteger(paymentId)) {
      const paymentRes = await db.query(
        `
SELECT
id,
booking_id,
provider,
status,
amount,
is_active,
created_at
FROM payments
WHERE id=$1
FOR UPDATE
LIMIT 1
`,
        [paymentId]
      );

      if (!paymentRes.rows.length) {
        return {
          ok: false,
          error: "DIRECT_PENDING_PAYMENT_NOT_FOUND"
        };
      }

      paymentRow = paymentRes.rows[0];

      const bookingContext = await findBookingConfirmationContext(db, paymentRow.booking_id, {
        lock: true
      });

      if (!bookingContext) {
        return {
          ok: false,
          error: "DIRECT_PENDING_PAYMENT_NOT_FOUND"
        };
      }

      bookingRow = bookingContext;
    } else {
      const bookingContext = await findBookingConfirmationContext(db, bookingId, {
        lock: true
      });

      if (!bookingContext) {
        return {
          ok: false,
          error: "DIRECT_PENDING_PAYMENT_NOT_FOUND"
        };
      }

      bookingRow = bookingContext;

      const paymentRes = await db.query(
        `
SELECT
id,
booking_id,
provider,
status,
amount,
is_active,
created_at
FROM payments
WHERE booking_id=$1
AND is_active=true
ORDER BY updated_at DESC NULLS LAST, id DESC
FOR UPDATE
LIMIT 1
`,
        [bookingRow.id]
      );

      if (!paymentRes.rows.length) {
        return {
          ok: false,
          error: "DIRECT_PENDING_PAYMENT_NOT_FOUND"
        };
      }

      paymentRow = paymentRes.rows[0];
    }

    const activeProvider = String(paymentRow.provider || "").trim().toLowerCase();
    const activeStatus = String(paymentRow.status || "").trim().toLowerCase();

    if (activeProvider !== "direct") {
      return {
        ok: false,
        error: "ACTIVE_PAYMENT_NOT_DIRECT",
        payment: normalizePaymentRow(paymentRow)
      };
    }

    if (activeStatus === "confirmed") {
      return {
        ok: true,
        reused: true,
        idempotent: true,
        payment: normalizePaymentRow(paymentRow),
        booking: normalizeBookingNotificationContext(bookingRow),
        payment_label_ru: "Оплата наличными подтверждена"
      };
    }

    if (activeStatus !== "pending") {
      return {
        ok: false,
        error: "PAYMENT_NOT_CONFIRMABLE",
        payment: normalizePaymentRow(paymentRow)
      };
    }

    const updated = await db.query(
      `
UPDATE payments
SET
status='confirmed',
updated_at=now()
WHERE id=$1
AND provider='direct'
AND status='pending'
AND is_active=true
RETURNING
id,
booking_id,
provider,
status,
amount,
created_at
`,
      [paymentRow.id]
    );

    if (!updated.rows.length) {
      return {
        ok: false,
        error: "PAYMENT_NOT_CONFIRMABLE",
        payment: normalizePaymentRow(paymentRow)
      };
    }

    const confirmedPayment = updated.rows[0];
    const amountCents = parsePositiveAmount(confirmedPayment.amount);

    if (!amountCents) {
      return {
        ok: false,
        error: "PAYMENT_NOT_CONFIRMABLE",
        payment: normalizePaymentRow(confirmedPayment)
      };
    }

    const salonWallet = await getSalonWalletId(db, bookingRow.salon_id);
    const systemWalletId = await getSystemWalletId(db);

    /* force exact payment ledger state */
    await db.query(
      `
DELETE FROM totem_test.ledger_entries
WHERE reference_type='payment'
AND reference_id=$1
`,
      [String(confirmedPayment.id)]
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
      [systemWalletId, salonWallet, amountCents, String(confirmedPayment.id)]
    );

    await setBookingConfirmedIfNeeded(db, bookingRow.id);

    return {
      ok: true,
      confirmed: true,
      booking: normalizeBookingNotificationContext(bookingRow),
      payment: {
        ...confirmedPayment,
        amount: amountCents,
        is_active: true
      },
      payment_label_ru: "Оплата наличными подтверждена"
    };
  }

  async function emitCashConfirmNotifications(db, input = {}) {
    const booking = input.booking || null;
    const payment = input.payment || null;
    const confirmedBy = String(input.confirmed_by || "").trim().toLowerCase();
    const source = String(input.source || "confirm_cash").trim() || "confirm_cash";

    if (!booking || !payment) {
      return null;
    }

    const paymentProvider = String(payment.provider || "direct").trim().toLowerCase() || "direct";
    const paymentStatus = String(payment.status || "confirmed").trim().toLowerCase() || "confirmed";
    const amount = Number(payment.amount || 0);
    const paymentId = Number(payment.id || payment.payment_id || 0) || null;
    const bookingId = Number(booking.id || booking.booking_id || 0) || null;
    const salonId = Number(booking.salon_id || 0) || null;
    const masterId = Number(booking.master_id || 0) || null;
    const clientId = Number(booking.client_id || 0) || null;
    const salonSlug = String(booking.salon_slug || "").trim() || null;
    const masterSlug = String(booking.master_slug || "").trim() || null;

    const payloadJson = {
      booking_id: bookingId,
      payment_id: paymentId,
      payment_provider: paymentProvider,
      payment_status: paymentStatus,
      salon_id: salonId,
      salon_slug: salonSlug,
      master_id: masterId,
      master_slug: masterSlug,
      client_id: clientId,
      amount,
      source,
      confirmed_by: confirmedBy || null
    };

    const makeBody = (template, actionUrl, targetId) => ({
      target_type: null,
      target_id: targetId,
      owner_type: "salon",
      owner_id: salonId,
      channel: "in_app",
      ...template,
      action_url: actionUrl,
      status: "sent",
      payload_json: payloadJson
    });
    const clientCashConfirmTemplate = buildCashConfirmNotificationTemplate("client");
    const salonCashConfirmTemplate = buildCashConfirmNotificationTemplate("salon");
    const masterCashConfirmTemplate = buildCashConfirmNotificationTemplate("master");

    const notificationItems = [
      {
        ...makeBody(clientCashConfirmTemplate, null, String(clientId)),
        target_type: "client",
        owner_id: salonId
      },
      {
        ...makeBody(salonCashConfirmTemplate, salonSlug ? `#/salon/${salonSlug}/dashboard` : null, String(salonId)),
        target_type: "salon"
      },
      {
        ...makeBody(masterCashConfirmTemplate, masterSlug ? `#/master/${masterSlug}/dashboard` : null, String(masterId)),
        target_type: "master"
      }
    ];

    await db.query("SAVEPOINT cash_confirm_notifications");

    try {
      for (const item of notificationItems) {
        await createNotification(db, item);
      }

      await db.query("RELEASE SAVEPOINT cash_confirm_notifications");
      return true;
    } catch (error) {
      try {
        await db.query("ROLLBACK TO SAVEPOINT cash_confirm_notifications");
      } catch (rollbackError) {
        console.error("CASH_CONFIRM_NOTIFICATION_ROLLBACK_ERROR", rollbackError);
      }

      console.error("CASH_CONFIRM_NOTIFICATION_ERROR", {
        booking_id: bookingId,
        payment_id: paymentId,
        confirmed_by: confirmedBy,
        error: error?.message || error
      });

      return false;
    }
  }

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

  r.post("/payments/direct/salon/confirm-cash", async (req, res) => {
    const db = await pool.connect();

    try {
      await db.query("BEGIN");

      const body = req.body || {};
      const result = await confirmDirectPendingCashPayment(db, body);

      if (!result.ok) {
        await db.query("ROLLBACK");

        if (result.error === "BOOKING_ID_REQUIRED") {
          return res.status(400).json({ ok: false, error: result.error });
        }

        if (
          result.error === "DIRECT_PENDING_PAYMENT_NOT_FOUND" ||
          result.error === "ACTIVE_PAYMENT_NOT_DIRECT" ||
          result.error === "PAYMENT_NOT_CONFIRMABLE"
        ) {
          const statusCode = result.error === "DIRECT_PENDING_PAYMENT_NOT_FOUND" ? 404 : 409;
          return res.status(statusCode).json({ ok: false, error: result.error, payment: result.payment || null });
        }

        return res.status(400).json({ ok: false, error: result.error || "CONFIRM_CASH_FAILED" });
      }

      if (String(body.salon_slug || "").trim()) {
        const bookingId = Number(body.booking_id ?? body.bookingId ?? result.payment?.booking_id ?? null);
        if (Number.isInteger(bookingId) && bookingId > 0) {
          const salonCheck = await db.query(
            `
SELECT
b.id,
s.slug
FROM bookings b
JOIN salons s ON s.id=b.salon_id
WHERE b.id=$1
FOR UPDATE
LIMIT 1
`,
            [bookingId]
          );

          if (!salonCheck.rows.length) {
            await db.query("ROLLBACK");
            return res.status(404).json({ ok: false, error: "DIRECT_PENDING_PAYMENT_NOT_FOUND" });
          }

          if (String(salonCheck.rows[0].slug || "").trim() !== String(body.salon_slug || "").trim()) {
            await db.query("ROLLBACK");
            return res.status(403).json({ ok: false, error: "SALON_SLUG_MISMATCH" });
          }
        }
      }

      if (Boolean(result.confirmed)) {
        await emitCashConfirmNotifications(db, {
          booking: result.booking,
          payment: result.payment,
          confirmed_by: "salon",
          source: "confirm_cash"
        });
      }

      await db.query("COMMIT");

      return res.json({
        ok: true,
        owner_type: "salon",
        confirmed: Boolean(result.confirmed),
        reused: Boolean(result.reused),
        idempotent: Boolean(result.idempotent),
        payment: result.payment,
        payment_label_ru: result.payment_label_ru,
        cash_pending_alert: false
      });
    } catch (err) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("DIRECT_SALON_CONFIRM_CASH_ROLLBACK_ERROR", rollbackErr);
      }

      if (String(err?.message || "") === "SALON_WALLET_NOT_FOUND") {
        return res.status(400).json({ ok: false, error: "SALON_WALLET_NOT_FOUND" });
      }

      if (String(err?.message || "") === "SYSTEM_WALLET_NOT_FOUND") {
        return res.status(400).json({ ok: false, error: "SYSTEM_WALLET_NOT_FOUND" });
      }

      console.error("DIRECT_SALON_CONFIRM_CASH_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "DIRECT_SALON_CONFIRM_CASH_FAILED"
      });
    } finally {
      db.release();
    }
  });

  r.post("/payments/direct/master/confirm-cash", async (req, res) => {
    const db = await pool.connect();

    try {
      await db.query("BEGIN");

      const body = req.body || {};
      const result = await confirmDirectPendingCashPayment(db, body);

      if (!result.ok) {
        await db.query("ROLLBACK");

        if (result.error === "BOOKING_ID_REQUIRED") {
          return res.status(400).json({ ok: false, error: result.error });
        }

        if (result.error === "DIRECT_PENDING_PAYMENT_NOT_FOUND") {
          return res.status(404).json({ ok: false, error: result.error });
        }

        if (
          result.error === "ACTIVE_PAYMENT_NOT_DIRECT" ||
          result.error === "PAYMENT_NOT_CONFIRMABLE"
        ) {
          return res.status(409).json({ ok: false, error: result.error, payment: result.payment || null });
        }

        if (result.error === "MASTER_SLUG_MISMATCH") {
          return res.status(403).json({ ok: false, error: result.error });
        }

        if (
          result.error === "SALON_WALLET_NOT_FOUND" ||
          result.error === "SYSTEM_WALLET_NOT_FOUND"
        ) {
          return res.status(400).json({ ok: false, error: result.error });
        }

        return res.status(400).json({ ok: false, error: result.error || "CONFIRM_CASH_FAILED" });
      }

      if (String(body.master_slug || "").trim()) {
        const bookingId = Number(body.booking_id ?? body.bookingId ?? result.payment?.booking_id ?? null);
        if (Number.isInteger(bookingId) && bookingId > 0) {
          const masterCheck = await db.query(
            `
SELECT
b.id,
m.slug
FROM bookings b
JOIN masters m ON m.id=b.master_id
WHERE b.id=$1
FOR UPDATE
LIMIT 1
`,
            [bookingId]
          );

          if (!masterCheck.rows.length) {
            await db.query("ROLLBACK");
            return res.status(404).json({ ok: false, error: "DIRECT_PENDING_PAYMENT_NOT_FOUND" });
          }

          if (String(masterCheck.rows[0].slug || "").trim() !== String(body.master_slug || "").trim()) {
            await db.query("ROLLBACK");
            return res.status(403).json({ ok: false, error: "MASTER_SLUG_MISMATCH" });
          }
        }
      }

      if (Boolean(result.confirmed)) {
        await emitCashConfirmNotifications(db, {
          booking: result.booking,
          payment: result.payment,
          confirmed_by: "master",
          source: "confirm_cash"
        });
      }

      await db.query("COMMIT");

      return res.json({
        ok: true,
        owner_type: "master",
        confirmed: Boolean(result.confirmed),
        reused: Boolean(result.reused),
        idempotent: Boolean(result.idempotent),
        payment: result.payment,
        payment_label_ru: result.payment_label_ru,
        cash_pending_alert: false
      });
    } catch (err) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("DIRECT_MASTER_CONFIRM_CASH_ROLLBACK_ERROR", rollbackErr);
      }

      if (String(err?.message || "") === "SALON_WALLET_NOT_FOUND") {
        return res.status(400).json({ ok: false, error: "SALON_WALLET_NOT_FOUND" });
      }

      if (String(err?.message || "") === "SYSTEM_WALLET_NOT_FOUND") {
        return res.status(400).json({ ok: false, error: "SYSTEM_WALLET_NOT_FOUND" });
      }

      console.error("DIRECT_MASTER_CONFIRM_CASH_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "DIRECT_MASTER_CONFIRM_CASH_FAILED"
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
