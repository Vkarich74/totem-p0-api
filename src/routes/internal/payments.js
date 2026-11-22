import { Router } from "express";
import { hashClientCabinetToken } from "../../services/clientCabinetTokenAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireCurrencyCode } from "../../market-context/BusinessContext.js";
import { createNotification } from "../../services/notifications/notificationService.js";
import { buildCashConfirmNotificationTemplate } from "../../services/notifications/notificationTemplates.js";
import {
  createPendingOwnerQrPayment,
  confirmOwnerQrPayment,
  rejectOwnerQrPayment,
  getOwnerQrPaymentOptions
} from "../../money-core/ownerQrPayments.service.js";
import {
  createDirectCashObligationsForConfirmedPayment
} from "../../money-core/directCashObligations.service.js";
import {
  upsertPaymentCollectionAnchorForPayment
} from "../../services/paymentCollectionAnchors.service.js";

const SAFE_DIRECT_CASH_OBLIGATION_RESULTS = new Set([
  "NO_SHARE_DUE",
  "OBLIGATION_ALREADY_EXISTS",
  "PLATFORM_SHARE_NONZERO_UNSUPPORTED_C20C"
]);

function assertDirectCashObligationResult(result) {
  if (result?.status === "created" || result?.status === "exists") {
    return;
  }

  if (result?.status === "skipped" && SAFE_DIRECT_CASH_OBLIGATION_RESULTS.has(result?.reason)) {
    return;
  }

  const error = new Error(result?.reason || "DIRECT_CASH_OBLIGATION_FAILED");
  error.code = result?.reason || "DIRECT_CASH_OBLIGATION_FAILED";
  throw error;
}

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
    currency_code: row.currency_code || null,
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
SELECT id, booking_id, amount, currency_code, status, provider, created_at
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
 b.status,
 b.currency_code
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
 b.status,
 b.currency_code
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

  function resolveOwnerQrActor(req) {
    return {
      actorUserId: Number(req.auth?.user_id ?? req.user?.id ?? req.user?.user_id ?? null),
      actorContext: {
        auth: req.auth || null,
        identity: req.identity || null
      }
    };
  }

  function mapOwnerQrErrorStatus(code) {
    switch (code) {
      case "OWNER_QR_PAYMENT_NOT_FOUND":
      case "OWNER_QR_DESTINATION_NOT_FOUND":
      case "OWNER_QR_BOOKING_NOT_FOUND":
        return 404;
      case "OWNER_QR_FORBIDDEN":
      case "OWNER_QR_PAYMENT_ALREADY_CONFIRMED":
      case "OWNER_QR_PAYMENT_ALREADY_REJECTED":
      case "OWNER_QR_PAYMENT_INVALID_STATUS":
      case "OWNER_QR_DESTINATION_INACTIVE":
      case "OWNER_QR_DESTINATION_BOOKING_MISMATCH":
      case "OWNER_QR_ACTIVE_CONTRACT_REQUIRED":
      case "OWNER_QR_INVALID_CONTRACT_TERMS":
      case "OWNER_QR_PAYMENT_NOT_OWNER_QR":
      case "OWNER_QR_CONFIRM_WRITE_DISABLED":
        return 409;
      case "OWNER_QR_REJECTION_REASON_REQUIRED":
      case "OWNER_QR_PAYMENT_INVALID_PAYLOAD":
        return 400;
      default:
        return 409;
    }
  }

  r.get("/payments/owner-qr/options", async (req, res) => {
    const bookingId = Number(req.query?.booking_id ?? req.query?.bookingId ?? null);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ ok: false, error: "OWNER_QR_PAYMENT_INVALID_PAYLOAD" });
    }

    try {
      const result = await getOwnerQrPaymentOptions({
        pool,
        bookingId
      });

      return res.json({
        ok: true,
        booking_id: result.booking_id,
        destinations: result.destinations || []
      });
    } catch (error) {
      const code = error?.code || "OWNER_QR_PAYMENT_INVALID_PAYLOAD";
      const statusCode = mapOwnerQrErrorStatus(code);

      return res.status(statusCode).json({
        ok: false,
        error: code
      });
    }
  });

  // G2: only a verified direct owner grant can authorize a money mutation.
  // Never infer cash confirmation rights from master_salon memberships, URL
  // slugs, client booking tokens or legacy auth_users hints.
  function canonicalCashConfirmId(value){
    const text=String(value ?? "").trim();
    if(!/^[1-9][0-9]*$/.test(text))return null;
    const id=Number(text);
    return Number.isSafeInteger(id)?id:null;
  }

  function hasCashConfirmOwnerGrant(req, ownerType, ownerId){
    const auth=req?.auth || null;
    const identity=req?.identity || null;
    if(!auth || auth.source!=="session" || !identity
       || String(identity.user_id)!==String(auth.user_id)
       || String(identity.role)!==String(auth.role))return false;
    const id=canonicalCashConfirmId(ownerId);
    if(!id)return false;
    if(ownerType==="salon" && !["owner","salon_admin"].includes(String(auth.role)))return false;
    if(ownerType==="master" && String(auth.role)!=="master")return false;
    if(!["salon","master"].includes(ownerType))return false;
    return Array.isArray(identity.ownership) && identity.ownership.some(
      entry=>entry?.owner_type===ownerType && canonicalCashConfirmId(entry?.owner_id)===id
    );
  }

  async function authorizeDirectCashConfirmation(db, req, ownerType, body){
    const rawBooking=body?.booking_id ?? body?.bookingId;
    const rawPayment=body?.payment_id ?? body?.paymentId;
    const bookingId=canonicalCashConfirmId(rawBooking);
    const paymentId=canonicalCashConfirmId(rawPayment);
    if((rawBooking!=null && !bookingId)||(rawPayment!=null && !paymentId)){
      return {ok:false,status:400,error:"INVALID_PAYMENT_OR_BOOKING_ID"};
    }
    if(!bookingId && !paymentId){
      return {ok:false,status:400,error:"BOOKING_ID_REQUIRED"};
    }
    // If booking id exists, check direct owner first, before reading payment
    // rows or deriving settlement details.
    const booking=bookingId
      ? await db.query(
          `SELECT b.id,b.salon_id,b.master_id
           FROM public.bookings b WHERE b.id=$1 FOR UPDATE`,
          [bookingId]
        )
      : await db.query(
          `SELECT b.id,b.salon_id,b.master_id
           FROM public.bookings b JOIN public.payments p ON p.booking_id=b.id
           WHERE p.id=$1 FOR UPDATE OF b`,
          [paymentId]
        );
    if(!booking.rows.length){
      return {ok:false,status:404,error:"DIRECT_PENDING_PAYMENT_NOT_FOUND"};
    }
    const row=booking.rows[0];
    const ownerId=ownerType==="salon"?row.salon_id:row.master_id;
    if(!hasCashConfirmOwnerGrant(req,ownerType,ownerId)){
      return {ok:false,status:403,error:"FORBIDDEN"};
    }
    // Reject nested-ID tampering: owning booking 77 does not authorize payment
    // 81 unless that payment's stored booking_id is exactly 77.
    if(paymentId && bookingId){
      const link=await db.query(
        "SELECT booking_id FROM public.payments WHERE id=$1 LIMIT 1",
        [paymentId]
      );
      if(!link.rows.length ||
         canonicalCashConfirmId(link.rows[0].booking_id)!==canonicalCashConfirmId(row.id)){
        return {ok:false,status:403,error:"PAYMENT_BOOKING_MISMATCH"};
      }
    }
    return {ok:true,booking_id:row.id};
  }

  async function confirmDirectPendingCashPayment(db, input = {}) {
    const bookingId = Number(input.booking_id ?? input.bookingId ?? null);
    const paymentId = Number(input.payment_id ?? input.paymentId ?? null);
    const collectorOwnerType = String(input.collector_owner_type ?? input.collectorOwnerType ?? "").trim().toLowerCase();
    const confirmedByUserId = Number(input.confirmed_by_user_id ?? input.confirmedByUserId ?? null);

    if (collectorOwnerType && !["salon", "master"].includes(collectorOwnerType)) {
      return {
        ok: false,
        statusCode: 400,
        error: "INVALID_COLLECTOR_OWNER_TYPE"
      };
    }

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
collector_owner_type=$2,
collector_owner_id=$3,
confirmed_by_user_id=COALESCE($4, confirmed_by_user_id),
confirmed_at=COALESCE(confirmed_at, now()),
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
currency_code,
collector_owner_type,
collector_owner_id,
confirmed_by_user_id,
confirmed_at,
created_at
`,
      [
        paymentRow.id,
        collectorOwnerType || null,
        collectorOwnerType === "salon"
          ? Number.isInteger(bookingRow.salon_id) && bookingRow.salon_id > 0
            ? bookingRow.salon_id
            : null
          : collectorOwnerType === "master"
            ? Number.isInteger(bookingRow.master_id) && bookingRow.master_id > 0
              ? bookingRow.master_id
              : null
            : null,
        Number.isInteger(confirmedByUserId) && confirmedByUserId > 0 ? confirmedByUserId : null
      ]
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

    requireCurrencyCode(
      confirmedPayment.currency_code || bookingRow.currency_code,
      "PAYMENT_CURRENCY_REQUIRED"
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
    // KG public booking deliberately remains unauthenticated: possession of a
    // *booking-scoped* cabinet token is the only customer capability needed.
    // The token is issued by publicCreateBooking in the same transaction as
    // the immutable price snapshot. It is NOT a salon owner/session JWT.
    const bookingId = Number(req.body?.booking_id);
    const bookingToken = String(req.body?.booking_token || "").trim();

    if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ ok: false, error: "INVALID_BOOKING_ID" });
    }
    if (!bookingToken) {
      return res.status(401).json({ ok: false, code: "BOOKING_PAYMENT_TOKEN_REQUIRED", error: "Для безопасной оплаты обновите страницу TOTEM и повторите. Запись уже создана — не создавайте её повторно." });
    }
    if (!/^[a-f0-9]{64}$/i.test(bookingToken)) {
      return res.status(403).json({ ok: false, error: "BOOKING_PAYMENT_TOKEN_INVALID" });
    }

    // Never log or forward bookingToken; only its SHA-256 reaches PostgreSQL.
    const tokenHash = hashClientCabinetToken(bookingToken);
    const db = await pool.connect();

    try {
      await db.query("BEGIN");

      // Lock the real booking first; no payment rows are read before proof.
      const bookingResult = await db.query(
        `SELECT b.id, b.client_id, b.salon_id, b.status,
                b.price_snapshot, b.currency_code
           FROM public.bookings b
           WHERE b.id=$1
           FOR UPDATE`,
        [bookingId]
      );

      if (!bookingResult.rows.length) {
        await db.query("ROLLBACK");
        return res.status(403).json({ ok: false, error: "BOOKING_PAYMENT_FORBIDDEN" });
      }
      const booking = bookingResult.rows[0];

      const proof = await db.query(
        `SELECT id
           FROM public.client_access_tokens
           WHERE booking_id=$1
             AND client_id=$2
             AND token_hash=$3
             AND purpose='cabinet'
             AND revoked_at IS NULL
           LIMIT 1
           FOR SHARE`,
        [bookingId, booking.client_id, tokenHash]
      );
      if (!proof.rows.length) {
        await db.query("ROLLBACK");
        return res.status(403).json({ ok: false, error: "BOOKING_PAYMENT_FORBIDDEN" });
      }

      if (!booking.salon_id || !["reserved", "confirmed"].includes(String(booking.status))) {
        await db.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "BOOKING_NOT_PAYABLE" });
      }

      const currency = requireCurrencyCode(booking.currency_code, "PAYMENT_CURRENCY_REQUIRED");
      // US payments must use the immutable US cents/tax sidecar + C11, not
      // the legacy integer booking.price_snapshot and KG cash endpoint.
      if (currency === "USD") {
        await db.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "DIRECT_PENDING_UNSUPPORTED_CURRENCY" });
      }
      const amount = Number(booking.price_snapshot);
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        await db.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "BOOKING_PRICE_SNAPSHOT_INVALID" });
      }

      // Legacy callers may still send a displayed service_price, but cannot
      // alter the canonical frozen booking price or the resulting payment.
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "service_price")) {
        const hinted = Number(req.body.service_price);
        if (!Number.isSafeInteger(hinted) || hinted !== amount) {
          await db.query("ROLLBACK");
          return res.status(409).json({ ok: false, error: "BOOKING_PRICE_MISMATCH" });
        }
      }

      const activePayment = await findActivePaymentForBooking(db, bookingId);
      if (activePayment.rows.length) {
        const active = activePayment.rows[0];
        if (String(active.provider).toLowerCase() === "direct"
            && ["pending", "confirmed"].includes(String(active.status).toLowerCase())) {
          // Older pending records cannot be trusted if their amount was
          // created through the historical client-price path.
          if (Number(active.amount) !== amount || String(active.currency_code) !== currency) {
            await db.query("ROLLBACK");
            return res.status(409).json({ ok: false, error: "EXISTING_PAYMENT_PRICE_MISMATCH" });
          }
          await db.query("ROLLBACK");
          return res.json({ ok: true, reused: true, payment: normalizePaymentRow(active) });
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
        `INSERT INTO public.payments(
           booking_id, provider, amount, currency_code, status, is_active
         ) VALUES($1,'direct',$2,$3,'pending',true)
         RETURNING id,booking_id,amount,currency_code,status,provider,created_at`,
        [bookingId, amount, currency]
      );
      await db.query("COMMIT");
      return res.json({ ok: true, payment: normalizePaymentRow(payment.rows[0]) });
    } catch (err) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("DIRECT_PAYMENT_PENDING_ROLLBACK_ERROR", rollbackErr);
      }
      // Keep the booking capability out of logs.
      console.error("DIRECT_PAYMENT_PENDING_ERROR", { code: err?.code || "UNKNOWN" });
      return res.status(500).json({ ok: false, error: "DIRECT_PAYMENT_PENDING_FAILED" });
    } finally {
      db.release();
    }
  });

  r.post("/payments/owner-qr/pending", async (req, res) => {
    const body = req.body || {};
    const bookingId = Number(body.booking_id ?? body.bookingId ?? null);
    const qrDestinationId = Number(body.qr_destination_id ?? body.qrDestinationId ?? null);
    const createdByUserId = Number(req.user?.id ?? req.user?.user_id ?? null);

    if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isInteger(qrDestinationId) || qrDestinationId <= 0) {
      return res.status(400).json({ ok: false, error: "OWNER_QR_PAYMENT_INVALID_PAYLOAD" });
    }

    try {
      const result = await createPendingOwnerQrPayment({
        pool,
        bookingId,
        qrDestinationId,
        createdByUserId: Number.isInteger(createdByUserId) && createdByUserId > 0 ? createdByUserId : null
      });

      return res.json({
        ok: true,
        payment: result.payment,
        qr_destination: result.qr_destination
      });
    } catch (error) {
      const code = error?.code || "OWNER_QR_PAYMENT_INVALID_PAYLOAD";
      const statusCode = error?.statusCode || (
        code === "OWNER_QR_BOOKING_NOT_FOUND" ||
        code === "OWNER_QR_DESTINATION_NOT_FOUND" ? 404 : 409
      );

      return res.status(statusCode).json({
        ok: false,
        error: code
      });
    }
  });

  r.post("/payments/owner-qr/:id/confirm", requireAuth, async (req, res) => {
    const paymentId = Number(req.params.id ?? req.params.payment_id ?? null);
    const { actorUserId, actorContext } = resolveOwnerQrActor(req);

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return res.status(404).json({ ok: false, error: "OWNER_QR_PAYMENT_NOT_FOUND" });
    }

    try {
      const result = await confirmOwnerQrPayment({
        pool,
        paymentId,
        actorUserId: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
        actorContext
      });

      return res.json({
        ok: true,
        payment: result.payment,
        obligations: result.obligations || []
      });
    } catch (error) {
      const code = error?.code || "OWNER_QR_PAYMENT_INVALID_STATUS";
      const statusCode = mapOwnerQrErrorStatus(code);

      return res.status(statusCode).json({
        ok: false,
        error: code
      });
    }
  });

  r.post("/payments/owner-qr/:id/reject", requireAuth, async (req, res) => {
    const paymentId = Number(req.params.id ?? req.params.payment_id ?? null);
    const { actorUserId, actorContext } = resolveOwnerQrActor(req);
    const rejectionReason = req.body?.rejection_reason ?? req.body?.rejectionReason ?? null;

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return res.status(404).json({ ok: false, error: "OWNER_QR_PAYMENT_NOT_FOUND" });
    }

    try {
      const result = await rejectOwnerQrPayment({
        pool,
        paymentId,
        actorUserId: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
        actorContext,
        rejectionReason
      });

      return res.json({
        ok: true,
        payment: result.payment,
        obligations: result.obligations || []
      });
    } catch (error) {
      const code = error?.code || "OWNER_QR_PAYMENT_INVALID_STATUS";
      const statusCode = mapOwnerQrErrorStatus(code);

      return res.status(statusCode).json({
        ok: false,
        error: code
      });
    }
  });

  r.post("/payments/direct/salon/confirm-cash", requireAuth, async (req, res) => {
    const db = await pool.connect();
    let diagnosticStage = "start";

    try {
      diagnosticStage = "parse_request";
      await db.query("BEGIN");

      const body = req.body || {};
      diagnosticStage = "verify_direct_owner_before_money_write";
      const grant = await authorizeDirectCashConfirmation(db,req,"salon",body);
      if(!grant.ok){
        await db.query("ROLLBACK");
        return res.status(grant.status).json({ok:false,error:grant.error});
      }
      diagnosticStage = "load_payment_or_booking_context";
      const result = await confirmDirectPendingCashPayment(db, {
        ...body,
        collector_owner_type: "salon",
        confirmed_by_user_id: Number(req.auth?.user_id ?? req.user?.id ?? req.user?.user_id ?? null)
      });

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

      if (
        result.payment &&
        String(result.payment.provider || "").trim().toLowerCase() === "direct" &&
        String(result.payment.status || "").trim().toLowerCase() === "confirmed"
      ) {
        diagnosticStage = "payment_update_to_confirmed";
        diagnosticStage = "direct_cash_obligations";
        const directCashObligationResult = await createDirectCashObligationsForConfirmedPayment(db, {
          paymentId: Number(result.payment.id || result.payment.payment_id || body.payment_id || body.paymentId || 0) || null,
          actor: {
            type: req.user?.type ?? req.auth?.role ?? "system",
            user_id: Number(req.auth?.user_id ?? req.user?.id ?? req.user?.user_id ?? null)
          },
          reason: "direct_cash_confirm",
          route: "/payments/direct/salon/confirm-cash"
        });

        assertDirectCashObligationResult(directCashObligationResult);
      }

      if (
        result.confirmed &&
        result.payment &&
        String(result.payment.status || "").trim().toLowerCase() === "confirmed"
      ) {
        diagnosticStage = "payment_collection_anchor";
        try {
          await upsertPaymentCollectionAnchorForPayment(db, {
            paymentId: Number(result.payment.id || result.payment.payment_id || 0) || null,
            collectorOwnerType: "salon",
            collectorOwnerId: Number(result.booking?.salon_id || 0) || null,
            sourceType: "direct_cash_salon_confirm",
            sourceId: String(Number(result.payment.id || result.payment.payment_id || 0) || ""),
            metadata: {
              route: "/payments/direct/salon/confirm-cash"
            }
          });
        } catch (err) {
          console.error("C15_COLLECTION_ANCHOR_HOOK_FAILED", {
            flow: "direct_cash_salon_confirm",
            payment_id: Number(result.payment.id || result.payment.payment_id || 0) || null,
            booking_id: Number(result.booking?.id || result.booking?.booking_id || 0) || null
          }, err);
          throw err;
        }

        diagnosticStage = "cash_confirm_notifications";
        await emitCashConfirmNotifications(db, {
          booking: result.booking,
          payment: result.payment,
          confirmed_by: "salon",
          source: "confirm_cash"
        });
      }

      diagnosticStage = "commit";
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

  r.post("/payments/direct/master/confirm-cash", requireAuth, async (req, res) => {
    const db = await pool.connect();
    let diagnosticStage = "start";

    try {
      diagnosticStage = "parse_request";
      await db.query("BEGIN");

      const body = req.body || {};
      diagnosticStage = "verify_direct_owner_before_money_write";
      const grant = await authorizeDirectCashConfirmation(db,req,"master",body);
      if(!grant.ok){
        await db.query("ROLLBACK");
        return res.status(grant.status).json({ok:false,error:grant.error});
      }
      diagnosticStage = "load_payment_or_booking_context";
      const result = await confirmDirectPendingCashPayment(db, {
        ...body,
        collector_owner_type: "master",
        confirmed_by_user_id: Number(req.auth?.user_id ?? req.user?.id ?? req.user?.user_id ?? null)
      });

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

      if (
        result.payment &&
        String(result.payment.provider || "").trim().toLowerCase() === "direct" &&
        String(result.payment.status || "").trim().toLowerCase() === "confirmed"
      ) {
        diagnosticStage = "payment_update_to_confirmed";
        diagnosticStage = "direct_cash_obligations";
        const directCashObligationResult = await createDirectCashObligationsForConfirmedPayment(db, {
          paymentId: Number(result.payment.id || result.payment.payment_id || body.payment_id || body.paymentId || 0) || null,
          actor: {
            type: req.user?.type ?? req.auth?.role ?? "system",
            user_id: Number(req.auth?.user_id ?? req.user?.id ?? req.user?.user_id ?? null)
          },
          reason: "direct_cash_confirm",
          route: "/payments/direct/master/confirm-cash"
        });

        assertDirectCashObligationResult(directCashObligationResult);
      }

      if (
        result.confirmed &&
        result.payment &&
        String(result.payment.status || "").trim().toLowerCase() === "confirmed"
      ) {
        diagnosticStage = "payment_collection_anchor";
        try {
          await upsertPaymentCollectionAnchorForPayment(db, {
            paymentId: Number(result.payment.id || result.payment.payment_id || 0) || null,
            collectorOwnerType: "master",
            collectorOwnerId: Number(result.booking?.master_id || 0) || null,
            sourceType: "direct_cash_master_confirm",
            sourceId: String(Number(result.payment.id || result.payment.payment_id || 0) || ""),
            metadata: {
              route: "/payments/direct/master/confirm-cash"
            }
          });
        } catch (err) {
          console.error("C15_COLLECTION_ANCHOR_HOOK_FAILED", {
            flow: "direct_cash_master_confirm",
            payment_id: Number(result.payment.id || result.payment.payment_id || 0) || null,
            booking_id: Number(result.booking?.id || result.booking?.booking_id || 0) || null
          }, err);
          throw err;
        }

        diagnosticStage = "cash_confirm_notifications";
        await emitCashConfirmNotifications(db, {
          booking: result.booking,
          payment: result.payment,
          confirmed_by: "master",
          source: "confirm_cash"
        });
      }

      diagnosticStage = "commit";
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

  /* LEGACY PAYMENT FLOW — quarantined.
   * This endpoint used to create a confirmed direct payment without a
   * collector/obligation and wrote gross value into the legacy totem_test
   * wallet ledger. Canonical direct cash confirmation must go through the
   * salon/master confirm-cash endpoints instead.
   */
  r.post("/payments/flow", (req, res) => {
    return res.status(410).json({
      ok: false,
      error: "LEGACY_PAYMENT_FLOW_DISABLED",
      use: [
        "/payments/direct/salon/confirm-cash",
        "/payments/direct/master/confirm-cash"
      ]
    });
  });

  return r;
}
