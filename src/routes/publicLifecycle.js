import { pool } from "../db.js";
import { createNotification } from "../services/notifications/notificationService.js";
import { buildBookingLifecycleNotificationTemplate } from "../services/notifications/notificationTemplates.js";
import { releaseCalendarSlotForBooking } from "../services/calendarSlots.service.js";

function getPublicLifecyclePaymentLabelRu(provider, status, hasPayment) {
  if (!hasPayment) {
    return "Оплата не выбрана";
  }

  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedProvider === "direct" && normalizedStatus === "pending") {
    return "Наличные ожидают подтверждения";
  }

  if (normalizedProvider === "direct" && normalizedStatus === "confirmed") {
    return "Оплата наличными подтверждена";
  }

  if (normalizedProvider === "xpay" && normalizedStatus === "pending") {
    return "Ожидаем оплату XPAY";
  }

  if (normalizedProvider === "xpay" && normalizedStatus === "confirmed") {
    return "Оплата получена";
  }

  if (normalizedStatus === "failed") {
    return "Оплата не прошла";
  }

  if (normalizedStatus === "refunded") {
    return "Оплата возвращена";
  }

  return "Оплата не выбрана";
}

function buildLifecycleActionUrl(booking, targetType) {
  const salonSlug = String(booking?.salon_slug || "").trim();
  const masterSlug = String(booking?.master_slug || "").trim();

  if (targetType === "salon" && salonSlug) {
    return `#/salon/${salonSlug}/dashboard`;
  }

  if (targetType === "master" && masterSlug) {
    return `#/master/${masterSlug}/dashboard`;
  }

  if (targetType === "client") {
    return null;
  }

  return null;
}

// Public US booking lifecycle is an OWNER action, not a client booking action.
// Only the existing valid owner session may act. Tenant and booking are
// selected by the canonical route; authorization is verified in PostgreSQL.
export function checkUsLifecycleSession(auth) {
  if(auth?.source!=="session" || !auth?.session_id ||
     !Number.isSafeInteger(Number(auth?.user_id)) || Number(auth.user_id)<1) {
    return {ok:false,status:401,error:"US_LIFECYCLE_SESSION_REQUIRED"};
  }
  if(auth.role!=="salon_admin" && auth.role!=="master") {
    return {ok:false,status:403,error:"US_LIFECYCLE_ROLE_FORBIDDEN"};
  }
  return {ok:true,user_id:Number(auth.user_id),role:auth.role};
}

// Shared owner-session guard. Public pages never authorize writes or
// personal booking reads merely because a salon is publicly bookable.
export function checkBookingOwnerSession(auth){
  const result=checkUsLifecycleSession(auth);
  if(result.ok)return result;
  return {...result,error:result.error.replace(/^US_LIFECYCLE_/,"BOOKING_OWNER_")};
}

// Legacy direct salon binding applies ONLY when a numeric owner_salon
// membership does not exist. Existing owners always require an ACTIVE row.
async function activeSalonAdminRelation(db,userId,salonId){
  return db.query(
    `SELECT 1
       FROM public.auth_users u
       JOIN public.salons s ON s.id=$2
      WHERE u.id=$1 AND u.enabled=true AND u.role='salon_admin'
        AND (
          EXISTS(
            SELECT 1 FROM public.owner_salon os
             WHERE os.owner_id=u.id::text
               AND os.salon_id=s.id AND os.status='active'
          ) OR (
            NOT EXISTS(
              SELECT 1 FROM public.owner_salon os
               WHERE os.owner_id=u.id::text
            )
            AND (u.salon_id=s.id::text OR u.salon_slug=s.slug)
          )
        )
      LIMIT 1`,
    [userId,salonId]
  );
}

// This resource contains real client names and booking prices; only a
// signed-in owner of THIS salon can list it. Master uses his own cabinet.
export async function authorizePublicSalonBookingReader(db,auth,salonId){
  const session=checkBookingOwnerSession(auth);
  if(!session.ok)return session;
  if(session.role!=="salon_admin"){
    return {ok:false,status:403,error:"BOOKING_OWNER_ROLE_FORBIDDEN"};
  }
  const salon=Number(salonId);
  if(!Number.isSafeInteger(salon)||salon<1){
    return {ok:false,status:403,error:"BOOKING_OWNER_SCOPE_INVALID"};
  }
  const relation=await activeSalonAdminRelation(db,session.user_id,salon);
  if(relation.rows?.length!==1){
    return {ok:false,status:403,error:"BOOKING_OWNER_FORBIDDEN"};
  }
  return {ok:true};
}

export async function authorizeUsLifecycleActor(db,auth,salonId,masterId) {
  const session=checkUsLifecycleSession(auth);
  if(!session.ok)return session;
  const salon=Number(salonId);
  const master=Number(masterId);
  if(!Number.isSafeInteger(salon)||salon<1 ||
     !Number.isSafeInteger(master)||master<1) {
    return {ok:false,status:403,error:"US_LIFECYCLE_SCOPE_INVALID"};
  }
  const relation=session.role==="salon_admin"
    ? await activeSalonAdminRelation(db,session.user_id,salon)
    : await db.query(
      `SELECT 1 FROM public.auth_users u
         JOIN public.masters m ON m.user_id=u.id
         JOIN public.master_salon ms ON ms.master_id=m.id
        WHERE u.id=$1 AND u.enabled=true AND u.role='master'
          AND m.id=$3 AND m.active=true
          AND ms.salon_id=$2 AND ms.status='active'
        LIMIT 1`,
      [session.user_id,salon,master]);
  if(relation.rows?.length!==1) {
    return {ok:false,status:403,error:"US_LIFECYCLE_OWNER_FORBIDDEN"};
  }
  return {ok:true};
}

export async function authorizeBookingLifecycleActor(db,auth,salonId,masterId){
  const session=checkBookingOwnerSession(auth);
  if(!session.ok)return session;
  const result=await authorizeUsLifecycleActor(db,auth,salonId,masterId);
  if(result.ok)return result;
  return {...result,error:result.error==="US_LIFECYCLE_OWNER_FORBIDDEN"
    ? "BOOKING_OWNER_FORBIDDEN"
    : result.error.replace(/^US_LIFECYCLE_/,"BOOKING_OWNER_")};
}

// US-only serializable booking lifecycle. Uses the SAME /public/.../lifecycle
// route and existing owner/tenant contract. KG/KZ keep their prior code path.
// The booking row lock is acquired before status check and retained through
// the slot/payment side effects, so simultaneous US lifecycle calls serialize.
export async function executeUsLifecycleTransaction(db, {auth, salonId, bookingId, action}) {
  const session=checkUsLifecycleSession(auth);
  if(!session.ok)return {http:session.status,body:{ok:false,error:session.error}};
  if(!Number.isSafeInteger(Number(salonId)) || Number(salonId)<1 ||
     !Number.isSafeInteger(Number(bookingId)) || Number(bookingId)<1 ||
     !["confirm","complete","cancel"].includes(action)) {
    return {http:400,body:{ok:false,error:"US_LIFECYCLE_REQUEST_INVALID"}};
  }
  const tx=await db.connect();
  let opened=false;
  try{
    await tx.query("BEGIN");
    opened=true;
    const selected=await tx.query(
      `SELECT b.id,b.status,b.salon_id,b.salon_slug,b.master_id,
              m.slug AS master_slug,b.client_id,b.service_id,
              b.start_at,b.end_at,b.price_snapshot
         FROM public.bookings b
         LEFT JOIN public.masters m ON m.id=b.master_id
        WHERE b.id=$1 AND b.salon_id=$2
        FOR UPDATE OF b`,
      [Number(bookingId),Number(salonId)]
    );
    const booking=selected.rows?.[0];
    if(!booking){
      await tx.query("ROLLBACK");opened=false;
      return {http:404,body:{ok:false,error:"BOOKING_NOT_FOUND"}};
    }
    const ownership=await authorizeUsLifecycleActor(tx,auth,salonId,booking.master_id);
    if(!ownership.ok){
      await tx.query("ROLLBACK");opened=false;
      return {http:ownership.status,body:{ok:false,error:ownership.error}};
    }
    const previous=String(booking.status||"").toLowerCase();
    if(action==="confirm" && previous==="confirmed"){
      await tx.query("COMMIT");opened=false;
      return {http:200,body:{ok:true,status:"already_confirmed"}};
    }
    if(action==="cancel" && (previous==="cancelled" || previous==="canceled")){
      await tx.query("COMMIT");opened=false;
      return {http:200,body:{ok:true,status:"already_cancelled"}};
    }
    if(action==="complete" && previous==="reserved"){
      await tx.query("ROLLBACK");opened=false;
      return {http:409,body:{ok:false,error:"BOOKING_PAYMENT_REQUIRED",status:booking.status}};
    }
    if(previous!=="reserved" && !(previous==="confirmed" &&
      (action==="complete" || action==="cancel"))){
      await tx.query("ROLLBACK");opened=false;
      const error=action==="cancel" && previous==="completed"
        ? "CANNOT_CANCEL_COMPLETED" : "INVALID_STATUS";
      return {http:409,body:{ok:false,error,status:booking.status}};
    }
    if(action==="cancel"){
      // A Stripe LIVE attempt has financial existence outside PostgreSQL.
      // Never release a US slot while a corresponding intent may be active,
      // settled, or still being created. Owner reconciliation is required;
      // do NOT initiate a Stripe cancel/refund or alter the payment sidecar.
      // Lock order for all US writers: bookings row -> LIVE intent row.
      const live=await tx.query(
        `SELECT status,stripe_payment_intent_id
           FROM public.us_stripe_live_payment_intents
          WHERE booking_id=$1 LIMIT 1 FOR UPDATE`,
        [Number(bookingId)]
      );
      if(live.rows?.length){
        await tx.query("ROLLBACK");opened=false;
        return {http:409,body:{
          ok:false,error:"US_LIFECYCLE_STRIPE_RECONCILIATION_REQUIRED",
        }};
      }
    }
    if(action==="complete"){
      // Check pending cash while the booking row remains locked.
      const payment=await tx.query(
        `SELECT id,provider,status,is_active
           FROM public.payments
          WHERE booking_id=$1 AND provider='direct'
            AND status='pending' AND is_active=true
          ORDER BY updated_at DESC NULLS LAST,id DESC LIMIT 1`,
        [Number(bookingId)]
      );
      if(payment.rows?.length){
        const p=payment.rows[0];
        await tx.query("ROLLBACK");opened=false;
        return {http:409,body:{
          ok:false,error:"CASH_PAYMENT_PENDING_CONFIRMATION",
          message_ru:"Нельзя завершить визит: наличные ожидают подтверждения.",
          payment_label_ru:getPublicLifecyclePaymentLabelRu(
            p.provider,p.status,Boolean(p.id)),
          cash_pending_alert:true,
        }};
      }
    }
    const next=action==="confirm"?"confirmed":
      action==="complete"?"completed":"cancelled";
    const update=action==="confirm"
      ? `UPDATE public.bookings SET status='confirmed',confirmed_at=NOW()
           WHERE id=$1 AND salon_id=$2 AND status=$3 RETURNING id`
      : `UPDATE public.bookings SET status=$4
           WHERE id=$1 AND salon_id=$2 AND status=$3 RETURNING id`;
    const parameters=action==="confirm"
      ? [Number(bookingId),Number(salonId),booking.status]
      : [Number(bookingId),Number(salonId),booking.status,next];
    const updated=await tx.query(update,parameters);
    if(updated.rowCount!==1){
      await tx.query("ROLLBACK");opened=false;
      return {http:409,body:{ok:false,error:"US_LIFECYCLE_STATUS_CONFLICT"}};
    }
    if(action==="cancel"){
      await tx.query(
        `UPDATE public.payments
            SET status='rejected',is_active=false,rejected_at=NOW(),
                rejection_reason='booking_cancelled',updated_at=NOW()
          WHERE booking_id=$1 AND provider='direct'
            AND status='pending' AND is_active=true`,
        [Number(bookingId)]
      );
      await releaseCalendarSlotForBooking(tx,Number(bookingId),"booking_cancelled");
    }
    await tx.query("COMMIT");opened=false;
    return {http:200,body:{ok:true,status:next},
      notify:action!=="confirm",booking,action};
  }catch(error){
    if(opened){
      try{await tx.query("ROLLBACK");}catch(rollbackError){
        console.error("US_LIFECYCLE_ROLLBACK_ERROR",rollbackError);
      }
    }
    throw error;
  }finally{
    tx.release();
  }
}

// Keep existing legacy KG/KZ notification path unmodified. For successful
// US completion/cancellation, notify only AFTER the transaction commits.
async function notifyUsLifecycleAfterCommit(booking,action) {
  const nextStatus=action==="complete"?"completed":"cancelled";
  const notificationAction=action==="complete"?"completed":"cancel";
  const payload={
    booking_id:Number(booking.id),
    salon_id:Number(booking.salon_id),
    salon_slug:String(booking.salon_slug||""),
    master_id:Number(booking.master_id),
    client_id:Number(booking.client_id),
    service_id:Number(booking.service_id),
    start_at:booking.start_at ? new Date(booking.start_at).toISOString() : null,
    end_at:booking.end_at ? new Date(booking.end_at).toISOString() : null,
    price:Number(booking.price_snapshot||0),
    lifecycle_action:action,next_status:nextStatus,
  };
  for(const targetType of ["client","master","salon"]){
    const targetId=targetType==="client"?String(booking.client_id):
      targetType==="master"?String(booking.master_id):String(booking.salon_id);
    const template=buildBookingLifecycleNotificationTemplate(
      notificationAction,targetType);
    await createNotification(pool,{
      target_type:targetType,target_id:targetId,
      owner_type:"salon",owner_id:booking.salon_id,channel:"in_app",
      ...template,action_url:buildLifecycleActionUrl(booking,targetType),
      status:"sent",payload_json:payload,
    });
  }
}

export async function publicLifecycle(req, res) {
  try {
    const { salon_id } = req.tenant;
    const bookingId = Number(req.params.id);
    const { action } = req.body || {};

    if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ ok: false, error: "BOOKING_ID_INVALID" });
    }

    if (!["confirm", "complete", "cancel"].includes(action)) {
      return res.status(400).json({ ok: false, error: "INVALID_ACTION" });
    }

    const isUsMarket=req.market_context?.market_code==="US";
    const session=isUsMarket
      ? checkUsLifecycleSession(req.auth)
      : checkBookingOwnerSession(req.auth);
    if(!session.ok){
      return res.status(session.status).json({ok:false,error:session.error});
    }

    if(isUsMarket){
      const result=await executeUsLifecycleTransaction(pool,{
        auth:req.auth,salonId:salon_id,bookingId,action,
      });
      if(result.notify){
        try{
          await notifyUsLifecycleAfterCommit(result.booking,result.action);
        }catch(error){
          console.error("US_LIFECYCLE_NOTIFICATION_ERROR",error);
        }
      }
      return res.status(result.http).json(result.body);
    }

    const { rows } = await pool.query(
      `
      SELECT
        b.id,
        b.status,
        b.salon_id,
        b.salon_slug,
        b.master_id,
        m.slug AS master_slug,
        b.client_id,
        b.service_id,
        b.start_at,
        b.end_at,
        b.price_snapshot
      FROM bookings b
      LEFT JOIN masters m ON m.id = b.master_id
      WHERE b.id = $1
        AND b.salon_id = $2
      `,
      [bookingId, salon_id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
    }

    // Both KG/KZ and US require an existing owner session scoped to this
    // immutable booking salon+master relation before any state/payment write.
    const ownership=isUsMarket
      ? await authorizeUsLifecycleActor(pool,req.auth,salon_id,rows[0].master_id)
      : await authorizeBookingLifecycleActor(pool,req.auth,salon_id,rows[0].master_id);
    if(!ownership.ok){
      return res.status(ownership.status).json({ok:false,error:ownership.error});
    }

    const currentStatus = rows[0].status;

    if (action === "confirm") {
      if (currentStatus === "confirmed") {
        return res.json({ ok: true, status: "already_confirmed" });
      }

      if (["completed", "cancelled", "canceled"].includes(String(currentStatus || "").toLowerCase())) {
        return res.status(409).json({
          ok: false,
          error: "INVALID_STATUS",
          status: currentStatus,
        });
      }

      await pool.query(
        `UPDATE bookings
            SET status = 'confirmed',
                confirmed_at = NOW()
          WHERE id = $1`,
        [bookingId]
      );

      return res.json({ ok: true, status: "confirmed" });
    }

    if (action === "complete") {
      const paymentRes = await pool.query(
        `
        SELECT
          id,
          provider,
          status,
          is_active
        FROM payments
        WHERE booking_id = $1
          AND provider = 'direct'
          AND status = 'pending'
          AND is_active = true
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
        `,
        [bookingId]
      );

      if (paymentRes.rows.length) {
        const paymentRow = paymentRes.rows[0];

        return res.status(409).json({
          ok: false,
          error: "CASH_PAYMENT_PENDING_CONFIRMATION",
          message_ru: "Нельзя завершить визит: наличные ожидают подтверждения.",
          payment_label_ru: getPublicLifecyclePaymentLabelRu(
            paymentRow.provider,
            paymentRow.status,
            Boolean(paymentRow.id)
          ),
          cash_pending_alert: true
        });
      }

      if (currentStatus === "reserved") {
        return res.status(409).json({
          ok: false,
          error: "BOOKING_PAYMENT_REQUIRED",
          status: currentStatus,
        });
      }

      if (currentStatus !== "confirmed") {
        return res.status(409).json({
          ok: false,
          error: "INVALID_STATUS",
          status: currentStatus,
        });
      }

      await pool.query(
        `UPDATE bookings SET status = 'completed' WHERE id = $1`,
        [bookingId]
      );

      try {
        const booking = rows[0];
        const notificationPayload = {
          booking_id: Number(booking.id),
          salon_id: Number(booking.salon_id),
          salon_slug: String(booking.salon_slug || ""),
          master_id: Number(booking.master_id),
          client_id: Number(booking.client_id),
          service_id: Number(booking.service_id),
          start_at: booking.start_at ? new Date(booking.start_at).toISOString() : null,
          end_at: booking.end_at ? new Date(booking.end_at).toISOString() : null,
          price: Number(booking.price_snapshot || 0),
          lifecycle_action: action,
          next_status: "completed",
        };
        const clientNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "completed",
          "client"
        );
        const masterNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "completed",
          "master"
        );
        const salonNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "completed",
          "salon"
        );

        await createNotification(pool, {
          target_type: "client",
          target_id: String(booking.client_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...clientNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "client"),
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "master",
          target_id: String(booking.master_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...masterNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "master"),
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "salon",
          target_id: String(booking.salon_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...salonNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "salon"),
          status: "sent",
          payload_json: notificationPayload,
        });
      } catch (error) {
        console.error("BOOKING_LIFECYCLE_NOTIFICATION_ERROR", error);
      }

      return res.json({ ok: true, status: "completed" });
    }

    if (action === "cancel") {
      if (currentStatus === "completed") {
        return res.status(409).json({
          ok: false,
          error: "CANNOT_CANCEL_COMPLETED",
        });
      }

      const cancelDb = await pool.connect();

      try {
        await cancelDb.query("BEGIN");

        await cancelDb.query(
          `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
          [bookingId]
        );

        await cancelDb.query(
          `
          UPDATE payments
             SET status = 'rejected',
                 is_active = false,
                 rejected_at = NOW(),
                 rejection_reason = 'booking_cancelled',
                 updated_at = NOW()
           WHERE booking_id = $1
             AND provider = 'direct'
             AND status = 'pending'
             AND is_active = true
          `,
          [bookingId]
        );

        await releaseCalendarSlotForBooking(cancelDb, bookingId, "booking_cancelled");

        await cancelDb.query("COMMIT");
      } catch (error) {
        try {
          await cancelDb.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("PUBLIC_LIFECYCLE_CANCEL_ROLLBACK_ERROR", rollbackError);
        }
        throw error;
      } finally {
        cancelDb.release();
      }

      try {
        const booking = rows[0];
        const notificationPayload = {
          booking_id: Number(booking.id),
          salon_id: Number(booking.salon_id),
          salon_slug: String(booking.salon_slug || ""),
          master_id: Number(booking.master_id),
          client_id: Number(booking.client_id),
          service_id: Number(booking.service_id),
          start_at: booking.start_at ? new Date(booking.start_at).toISOString() : null,
          end_at: booking.end_at ? new Date(booking.end_at).toISOString() : null,
          price: Number(booking.price_snapshot || 0),
          lifecycle_action: action,
          next_status: "cancelled",
        };
        const clientNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "cancel",
          "client"
        );
        const masterNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "cancel",
          "master"
        );
        const salonNotificationTemplate = buildBookingLifecycleNotificationTemplate(
          "cancel",
          "salon"
        );

        await createNotification(pool, {
          target_type: "client",
          target_id: String(booking.client_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...clientNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "client"),
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "master",
          target_id: String(booking.master_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...masterNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "master"),
          status: "sent",
          payload_json: notificationPayload,
        });

        await createNotification(pool, {
          target_type: "salon",
          target_id: String(booking.salon_id),
          owner_type: "salon",
          owner_id: booking.salon_id,
          channel: "in_app",
          ...salonNotificationTemplate,
          action_url: buildLifecycleActionUrl(booking, "salon"),
          status: "sent",
          payload_json: notificationPayload,
        });
      } catch (error) {
        console.error("BOOKING_LIFECYCLE_NOTIFICATION_ERROR", error);
      }

      return res.json({ ok: true, status: "cancelled" });
    }

  } catch (err) {
    console.error("PUBLIC_LIFECYCLE_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
