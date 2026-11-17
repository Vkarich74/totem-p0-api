// TOTEM USA / TAX-03 — USD cents service-price authorization and booking snapshot.
// Never derive USD cents from legacy salon_master_services.price, services.price
// or bookings.price_snapshot. Service price is independent of tax or Stripe.
// Booking snapshot must be inserted INSIDE the same booking transaction.
import {
  actorFor, checkSession, ownerContext, transact,
} from "./usServiceTaxSettings.service.js";

const OWNER_TYPES = new Set(["salon", "master"]);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const MAX_USD_MINOR = 99_999_999;

function errorReply(status, code) {
  return { status, body: { ok: false, error: code } };
}

function positiveId(value) {
  const s = String(value ?? "");
  if (!/^[1-9]\d*$/.test(s)) return null;
  const id = Number(s);
  return Number.isSafeInteger(id) ? id : null;
}

function priceInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, "amount_minor") ||
      !Object.hasOwn(body, "expected_version")) return null;
  const amount = body.amount_minor;
  const version = body.expected_version;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) ||
      amount < 1 || amount > MAX_USD_MINOR ||
      typeof version !== "number" || !Number.isSafeInteger(version) ||
      version < 0) return null;
  return { amount, version };
}

function scopedPrice(ownerType, ownerSlug, serviceLinkId, marketId, row) {
  return {
    status: 200,
    body: {
      ok: true,
      owner_type: ownerType,
      owner_slug: ownerSlug,
      salon_master_service_id: serviceLinkId,
      market_code: "US",
      market_id: Number(marketId),
      currency_code: "USD",
      payment_purpose: "beauty_service",
      amount_minor: row ? String(row.amount_minor) : null,
      price_version: Number(row?.price_version ?? 0),
      configured: Boolean(row),
      source: "us_service_price_amounts",
    },
  };
}

function requestScope({ ownerType, ownerSlug, serviceLinkId, auth, identity, body, write }) {
  if (!OWNER_TYPES.has(ownerType) || typeof ownerSlug !== "string" ||
      !SLUG.test(ownerSlug)) return { failure: errorReply(400, "US_PRICE_OWNER_INVALID") };
  const id = positiveId(serviceLinkId);
  if (!id) return { failure: errorReply(400, "US_PRICE_SERVICE_LINK_ID_INVALID") };
  const actor = actorFor(auth, identity, ownerType);
  if (!actor) return { failure: errorReply(403, "US_PRICE_OWNER_SESSION_REQUIRED") };
  if (!write) return { actor, serviceLinkId: id };
  const input = priceInput(body);
  return input ? { actor, serviceLinkId: id, input } :
    { failure: errorReply(400, "US_PRICE_AMOUNT_OR_VERSION_INVALID") };
}

async function ownerServiceLink(db, ownerType, linkId, ownerId, marketId, write) {
  const query = await db.query(
    `SELECT sms.id
       FROM public.salon_master_services sms
       JOIN public.salons s ON s.id=sms.salon_id
       JOIN public.masters master ON master.id=sms.master_id
       JOIN public.master_salon ms ON ms.salon_id=sms.salon_id
         AND ms.master_id=sms.master_id AND ms.status='active'
       JOIN public.tenant_market_settings tm ON tm.salon_id=sms.salon_id
       JOIN public.markets market ON market.id=tm.market_id
      WHERE sms.id=$1 AND tm.market_id=$2
        AND sms.currency_code='USD' AND sms.active IS TRUE
        AND s.enabled IS TRUE AND s.status='active'
        AND master.active IS TRUE
        AND market.code='US' AND market.country_code='US'
        AND market.active IS TRUE AND market.default_currency='USD'
        AND (($3='salon' AND sms.salon_id=$4) OR
             ($3='master' AND sms.master_id=$4))
      LIMIT 1${write ? " FOR SHARE OF sms,s,master,ms,tm,market" : ""}`,
    [linkId, marketId, ownerType, ownerId]
  );
  return query.rows.length === 1;
}

async function currentPrice(db, linkId, marketId, lock) {
  const result = await db.query(
    `SELECT amount_minor::text AS amount_minor, price_version
       FROM public.us_service_price_amounts
      WHERE salon_master_service_id=$1 AND market_id=$2
        AND currency_code='USD'
      LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [linkId, marketId]
  );
  return result.rows[0] || null;
}

export async function readUsOwnerServicePrice(pool, options = {}) {
  const { ownerType, ownerSlug, serviceLinkId, auth, identity } = options;
  const request = requestScope({
    ownerType, ownerSlug, serviceLinkId, auth, identity, write: false,
  });
  if (request.failure) return request.failure;
  return transact(pool, false, async db => {
    if (!await checkSession(db, request.actor, false)) {
      return errorReply(403, "US_PRICE_OWNER_SESSION_INVALID");
    }
    const scope = await ownerContext(
      db, ownerType, ownerSlug, request.actor.userId, false
    );
    if (!scope || !await ownerServiceLink(
      db, ownerType, request.serviceLinkId, scope.owner_id, scope.market_id, false
    )) return errorReply(404, "US_PRICE_SERVICE_NOT_FOUND");
    return scopedPrice(ownerType, ownerSlug, request.serviceLinkId,
      scope.market_id,
      await currentPrice(db, request.serviceLinkId, scope.market_id, false));
  });
}

export async function saveUsOwnerServicePrice(pool, options = {}) {
  const { ownerType, ownerSlug, serviceLinkId, auth, identity, body } = options;
  const request = requestScope({
    ownerType, ownerSlug, serviceLinkId, auth, identity, body, write: true,
  });
  if (request.failure) return request.failure;
  return transact(pool, true, async db => {
    if (!await checkSession(db, request.actor, true)) {
      return errorReply(403, "US_PRICE_OWNER_SESSION_INVALID");
    }
    const scope = await ownerContext(
      db, ownerType, ownerSlug, request.actor.userId, true
    );
    if (!scope || !await ownerServiceLink(
      db, ownerType, request.serviceLinkId, scope.owner_id, scope.market_id, true
    )) return errorReply(404, "US_PRICE_SERVICE_NOT_FOUND");
    const previous = await currentPrice(
      db, request.serviceLinkId, scope.market_id, true
    );
    if (Number(previous?.price_version ?? 0) !== request.input.version) {
      return errorReply(409, "US_PRICE_VERSION_CONFLICT");
    }
    const result = previous
      ? await db.query(
          `UPDATE public.us_service_price_amounts
              SET amount_minor=$3
            WHERE salon_master_service_id=$1 AND market_id=$2
              AND price_version=$4
          RETURNING amount_minor::text AS amount_minor,price_version`,
          [request.serviceLinkId,scope.market_id,
            request.input.amount,request.input.version]
        )
      : await db.query(
          `INSERT INTO public.us_service_price_amounts
             (salon_master_service_id,market_id,amount_minor,currency_code)
           VALUES ($1,$2,$3,'USD')
           RETURNING amount_minor::text AS amount_minor,price_version`,
          [request.serviceLinkId,scope.market_id,request.input.amount]
        );
    if (result.rows.length !== 1) {
      return errorReply(409, "US_PRICE_VERSION_CONFLICT");
    }
    return scopedPrice(ownerType,ownerSlug,request.serviceLinkId,
      scope.market_id,result.rows[0]);
  });
}

function bookingPriceError(code, statusCode = 409) {
  return Object.assign(new Error(code), { code, statusCode });
}

// Call only for US bookings after the caller verified salon, active master
// and service link, while holding the same database transaction until COMMIT.
export async function resolveUsBookingServicePrice(db, {
  marketId, salonId, masterId, servicePk, serviceLinkId,
} = {}) {
  const ids = [marketId, salonId, masterId, servicePk, serviceLinkId]
    .map(positiveId);
  if (ids.some(id => id === null)) {
    throw bookingPriceError("US_SERVICE_PRICE_CONTEXT_INVALID", 409);
  }
  const [market, salon, master, service, link] = ids;
  const response = await db.query(
    `SELECT spa.amount_minor::text AS amount_minor,
            spa.price_version,spa.market_id,
            sms.id AS salon_master_service_id
       FROM public.us_service_price_amounts spa
       JOIN public.salon_master_services sms
         ON sms.id=spa.salon_master_service_id
       JOIN public.master_salon ms ON ms.salon_id=sms.salon_id
         AND ms.master_id=sms.master_id AND ms.status='active'
       JOIN public.masters m ON m.id=sms.master_id
       JOIN public.tenant_market_settings tm ON tm.salon_id=sms.salon_id
       JOIN public.markets mk ON mk.id=tm.market_id
      WHERE sms.id=$1 AND sms.salon_id=$2
        AND sms.master_id=$3 AND sms.service_pk=$4
        AND sms.active IS TRUE AND sms.currency_code='USD'
        AND spa.market_id=$5 AND spa.currency_code='USD'
        AND spa.amount_minor BETWEEN 1 AND 99999999
        AND spa.price_version>0 AND tm.market_id=$5
        AND mk.code='US' AND mk.country_code='US'
        AND mk.active IS TRUE AND mk.default_currency='USD'
        AND m.active IS TRUE
      LIMIT 1 FOR SHARE OF spa,sms,ms,tm,m,mk`,
    [link,salon,master,service,market]
  );
  if (response.rows.length !== 1) {
    throw bookingPriceError("US_SERVICE_PRICE_NOT_CONFIGURED", 409);
  }
  const row = response.rows[0];
  if (!/^[1-9]\d*$/.test(String(row.amount_minor)) ||
      !positiveId(row.price_version) ||
      Number(row.amount_minor) > MAX_USD_MINOR) {
    throw bookingPriceError("US_SERVICE_PRICE_INVALID", 409);
  }
  return {
    amount_minor: String(row.amount_minor),
    price_version: Number(row.price_version),
    salon_master_service_id: link,
    market_id: market,
    currency_code: "USD",
  };
}

export async function createUsBookingPriceSnapshot(db, {
  bookingId, price,
} = {}) {
  const booking = positiveId(bookingId);
  if (!booking || !price || !positiveId(price.market_id) ||
      !positiveId(price.salon_master_service_id) ||
      !positiveId(price.price_version) ||
      !/^[1-9]\d*$/.test(String(price.amount_minor)) ||
      Number(price.amount_minor) > MAX_USD_MINOR ||
      price.currency_code !== "USD") {
    throw bookingPriceError("US_BOOKING_PRICE_CONTEXT_INVALID", 409);
  }
  const result = await db.query(
    `INSERT INTO public.us_booking_price_snapshots
       (booking_id,market_id,salon_master_service_id,amount_minor,
        currency_code,service_price_version)
     VALUES ($1,$2,$3,$4,'USD',$5)
     RETURNING booking_id,amount_minor::text AS amount_minor,
               service_price_version,currency_code`,
    [booking, price.market_id, price.salon_master_service_id,
      price.amount_minor, price.price_version]
  );
  if (result.rows.length !== 1) {
    throw bookingPriceError("US_BOOKING_PRICE_SNAPSHOT_FAILED", 409);
  }
  return {
    booking_id: booking,
    amount_minor: String(result.rows[0].amount_minor),
    price_version: Number(result.rows[0].service_price_version),
    currency_code: "USD",
    source: "us_booking_price_snapshots",
    amount_type: "service_base_only",
  };
}

export function usServicePriceErrorResponse(error) {
  if (error?.code === "23505" || error?.code === "40001" ||
      error?.code === "40P01") {
    return errorReply(409, "US_PRICE_VERSION_CONFLICT");
  }
  if (error?.code === "23503" || error?.code === "23514") {
    return errorReply(409, "US_PRICE_INTEGRITY_REJECTED");
  }
  console.error("US_SERVICE_PRICE_STORAGE_ERROR",String(error?.code || "UNKNOWN"));
  return errorReply(503,"US_SERVICE_PRICE_UNAVAILABLE");
}
