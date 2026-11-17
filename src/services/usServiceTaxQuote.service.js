// TOTEM USA — TAX-04: an immutable tax-inclusive quote for a VERIFIED
// US beauty-service booking collector. No Stripe calls or payment writes.
// TAX-05 must enforce that every charged amount matches this exact snapshot.
// A changed or revoked collector is NEVER payable through this quote.
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const MAX_MINOR = 99999999n;
const BPS_DENOMINATOR = 10000n;

function fail(status, error) {
  return { status, body: { ok: false, error } };
}
function id(raw, allowZero = false) {
  const s = String(raw ?? "");
  if (!(allowZero ? /^(0|[1-9]\d*)$/ : /^[1-9]\d*$/).test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}
function actorFrom(auth, identity) {
  const userId = id(auth?.user_id);
  if (auth?.role !== "salon_admin" || auth?.source !== "session" ||
      !userId || typeof auth.session_id !== "string" ||
      !UUID.test(auth.session_id) ||
      (identity?.user_id != null && String(identity.user_id) !== String(userId))) {
    return null;
  }
  for (const deadline of [auth.session_expires_at, auth.idle_timeout_at]) {
    if (deadline != null &&
        (!Number.isFinite(new Date(deadline).getTime()) ||
         new Date(deadline).getTime() <= Date.now())) return null;
  }
  return { userId, sessionId: auth.session_id };
}
function saveBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, "expected_collector_revision") ||
      !Object.hasOwn(body, "expected_tax_setting_revision")) return null;
  const collector = body.expected_collector_revision;
  const tax = body.expected_tax_setting_revision;
  if (typeof collector !== "number" || !Number.isSafeInteger(collector) ||
      collector < 1 || typeof tax !== "number" ||
      !Number.isSafeInteger(tax) || tax < 0) return null;
  return { collector, tax };
}

export function calculateUsServiceTaxCents(baseMinor, rateBps) {
  const s = String(baseMinor ?? "");
  if (!/^[1-9]\d*$/.test(s) ||
      typeof rateBps !== "number" ||
      !Number.isSafeInteger(rateBps) ||
      rateBps < 0 || rateBps > 10000) {
    throw Object.assign(new Error("US_TAX_QUOTE_AMOUNT_INVALID"), {
      code: "US_TAX_QUOTE_AMOUNT_INVALID", statusCode: 409,
    });
  }
  const base = BigInt(s);
  if (base > MAX_MINOR) {
    throw Object.assign(new Error("US_TAX_QUOTE_AMOUNT_INVALID"), {
      code: "US_TAX_QUOTE_AMOUNT_INVALID", statusCode: 409,
    });
  }
  // Round half-up at exactly one USD cent, no floating point.
  const tax = (base * BigInt(rateBps) + 5000n) / BPS_DENOMINATOR;
  const total = base + tax;
  if (total > MAX_MINOR) {
    throw Object.assign(new Error("US_TAX_QUOTE_TOTAL_TOO_LARGE"), {
      code: "US_TAX_QUOTE_TOTAL_TOO_LARGE", statusCode: 409,
    });
  }
  return {
    service_base_minor: base.toString(),
    rate_bps: rateBps,
    service_tax_minor: tax.toString(),
    charge_total_minor: total.toString(),
    currency_code: "USD",
  };
}
function quotePayload(row) {
  if (!row) return null;
  return {
    booking_id: Number(row.booking_id),
    payment_purpose: "beauty_service",
    collector_owner_type: row.collector_owner_type,
    collector_owner_id: Number(row.collector_owner_id),
    collector_revision: Number(row.collector_revision),
    tax_setting_revision: Number(row.tax_setting_revision),
    service_base_minor: String(row.service_base_minor),
    rate_bps: Number(row.rate_bps),
    service_tax_minor: String(row.service_tax_minor),
    charge_total_minor: String(row.charge_total_minor),
    currency_code: "USD",
    immutable: true,
    created_at: new Date(row.created_at).toISOString(),
  };
}
async function inTransaction(pool, write, work) {
  const db = await pool.connect();
  let open = false, releaseError = null;
  try {
    await db.query(write ? "BEGIN" : "BEGIN READ ONLY");
    open = true;
    await db.query("SET LOCAL statement_timeout = '5000ms'");
    await db.query("SET LOCAL lock_timeout = '2000ms'");
    const answer = await work(db);
    if (write && answer.status >= 200 && answer.status < 300) {
      await db.query("COMMIT");
      open = false;
    }
    return answer;
  } finally {
    if (open) {
      try { await db.query("ROLLBACK"); }
      catch (e) { releaseError = e; }
    }
    db.release(releaseError || undefined);
  }
}
async function ownerSession(db, actor, write) {
  const response = await db.query(
    `SELECT 1 FROM public.auth_sessions sess
       JOIN public.auth_users u ON u.id=sess.user_id
      WHERE sess.id=$1 AND sess.user_id=$2
        AND sess.revoked_at IS NULL AND sess.expires_at>now()
        AND sess.last_seen_at>now()-interval '24 hours'
        AND u.enabled IS TRUE AND u.role='salon_admin'
      LIMIT 1${write ? " FOR SHARE OF sess,u" : ""}`,
    [actor.sessionId, actor.userId]
  );
  return response.rows.length === 1;
}
async function ownerBooking(db, bookingId, actor, write) {
  const result = await db.query(
    `SELECT b.id,b.status,b.salon_id,b.master_id,
            b.currency_code,m.id AS market_id,m.code AS market_code
       FROM public.bookings b
       JOIN public.salons s ON s.id=b.salon_id
       JOIN public.owner_salon os ON os.salon_id=b.salon_id
        AND os.owner_id=$2::text AND os.status='active'
       JOIN public.tenant_market_settings tm ON tm.salon_id=b.salon_id
       JOIN public.markets m ON m.id=tm.market_id
      WHERE b.id=$1 AND s.enabled IS TRUE AND s.status='active'
        AND m.code='US' AND m.country_code='US'
        AND m.active IS TRUE AND m.default_currency='USD'
        AND b.currency_code='USD'
      LIMIT 1${write ? " FOR UPDATE OF b" : ""}`,
    [bookingId, String(actor.userId)]
  );
  return result.rows[0] || null;
}
async function selectedCollector(db, booking, write) {
  const result = await db.query(
    `SELECT c.market_id,c.collector_owner_type,c.collector_owner_id,
            c.revision,c.verification_status,c.verified_at,
            c.selection_source,c.selected_by_user_id
       FROM public.us_booking_payment_collectors c
      WHERE c.booking_id=$1
      LIMIT 1${write ? " FOR SHARE" : ""}`,
    [booking.id]
  );
  const row = result.rows[0];
  if (!row || row.verification_status !== "verified" ||
      row.verified_at == null || row.selection_source !== "owner_authorized" ||
      !id(row.selected_by_user_id) ||
      String(row.market_id) !== String(booking.market_id) ||
      !(
        (row.collector_owner_type === "salon" &&
         String(row.collector_owner_id) === String(booking.salon_id)) ||
        (row.collector_owner_type === "master" &&
         String(row.collector_owner_id) === String(booking.master_id))
      )) return null;
  return row;
}
async function snapshotBasePrice(db, booking, write) {
  const result = await db.query(
    `SELECT p.amount_minor::text AS amount_minor
       FROM public.us_booking_price_snapshots p
      WHERE p.booking_id=$1 AND p.market_id=$2
        AND p.currency_code='USD'
      LIMIT 1${write ? " FOR SHARE" : ""}`,
    [booking.id,booking.market_id]
  );
  return result.rows[0] || null;
}
async function currentTaxSetting(db, marketId, collector, write) {
  const result = await db.query(
    `SELECT rate_bps,revision
       FROM public.us_owner_service_tax_settings
      WHERE market_id=$1 AND owner_type=$2 AND owner_id=$3
      LIMIT 1${write ? " FOR SHARE" : ""}`,
    [marketId,collector.collector_owner_type,collector.collector_owner_id]
  );
  const row = result.rows[0];
  return row ? { rate_bps: Number(row.rate_bps),
                 revision: Number(row.revision) } :
               { rate_bps: 0, revision: 0 };
}
async function existingQuote(db, bookingId) {
  const response = await db.query(
    `SELECT booking_id,market_id,payment_purpose,
            collector_owner_type,collector_owner_id,collector_revision,
            tax_setting_revision,service_base_minor::text,rate_bps,
            service_tax_minor::text,charge_total_minor::text,currency_code,
            created_at
       FROM public.us_booking_service_tax_snapshots
      WHERE booking_id=$1 LIMIT 1`, [bookingId]
  );
  return response.rows[0] || null;
}
function matchingCollector(quote, collector, marketId) {
  return Boolean(quote && collector &&
    String(quote.market_id) === String(marketId) &&
    quote.payment_purpose === "beauty_service" &&
    quote.currency_code === "USD" &&
    quote.collector_owner_type === collector.collector_owner_type &&
    String(quote.collector_owner_id) ===
      String(collector.collector_owner_id) &&
    String(quote.collector_revision) === String(collector.revision));
}

function rejectInputs({ bookingId, auth, identity, body, write }) {
  const booking = id(bookingId);
  if (!booking) return { error: fail(400, "US_TAX_QUOTE_BOOKING_ID_INVALID") };
  const actor = actorFrom(auth, identity);
  if (!actor) return { error: fail(403, "US_TAX_QUOTE_OWNER_SESSION_REQUIRED") };
  if (write) {
    const expected = saveBody(body);
    if (!expected) return { error: fail(400, "US_TAX_QUOTE_EXPECTED_REVISIONS_INVALID") };
    return { booking, actor, expected };
  }
  return { booking, actor };
}

export async function readUsBookingServiceTaxQuote(pool, options = {}) {
  const input = rejectInputs({ ...options, write: false });
  if (input.error) return input.error;
  return inTransaction(pool, false, async db => {
    if (!await ownerSession(db, input.actor, false)) {
      return fail(403, "US_TAX_QUOTE_OWNER_SESSION_INVALID");
    }
    const booking = await ownerBooking(db,input.booking,input.actor,false);
    if (!booking) return fail(404,"US_TAX_QUOTE_BOOKING_NOT_FOUND");
    const quote = await existingQuote(db,input.booking);
    const collector = await selectedCollector(db,booking,false);
    const verified = matchingCollector(quote,collector,booking.market_id);
    return {
      status: 200,
      body: {
        ok: true,booking_id:input.booking,market_code:"US",
        quote:quotePayload(quote),
        quote_exists:Boolean(quote),
        current_verified_collector: collector ? {
          owner_type:collector.collector_owner_type,
          owner_id:Number(collector.collector_owner_id),
          revision:Number(collector.revision),
        } : null,
        quote_matches_current_collector:verified,
        payment_ready:false,
      },
    };
  });
}

export async function createUsBookingServiceTaxQuote(pool, options = {}) {
  const input=rejectInputs({ ...options, write:true });
  if (input.error) return input.error;
  return inTransaction(pool,true,async db=>{
    if(!await ownerSession(db,input.actor,true)){
      return fail(403,"US_TAX_QUOTE_OWNER_SESSION_INVALID");
    }
    const booking=await ownerBooking(db,input.booking,input.actor,true);
    if(!booking)return fail(404,"US_TAX_QUOTE_BOOKING_NOT_FOUND");
    if(!["reserved","confirmed"].includes(booking.status)){
      return fail(409,"US_TAX_QUOTE_BOOKING_NOT_ELIGIBLE");
    }
    const collector=await selectedCollector(db,booking,true);
    if(!collector)return fail(409,"US_TAX_QUOTE_VERIFIED_COLLECTOR_REQUIRED");
    if(Number(collector.revision)!==input.expected.collector){
      return fail(409,"US_TAX_QUOTE_COLLECTOR_REVISION_CONFLICT");
    }
    const price=await snapshotBasePrice(db,booking,true);
    if(!price)return fail(409,"US_TAX_QUOTE_BASE_PRICE_REQUIRED");
    const previous=await existingQuote(db,input.booking);
    if(previous){
      if (!matchingCollector(previous,collector,booking.market_id) ||
          Number(previous.tax_setting_revision)!==input.expected.tax) {
        return fail(409,"US_TAX_QUOTE_ALREADY_FROZEN");
      }
      return {status:200,body:{
        ok:true,quote:quotePayload(previous),created:false,
        payment_ready:false,
      }};
    }
    const setting=await currentTaxSetting(db,booking.market_id,collector,true);
    if(setting.revision!==input.expected.tax){
      return fail(409,"US_TAX_QUOTE_TAX_REVISION_CONFLICT");
    }
    const money=calculateUsServiceTaxCents(price.amount_minor,setting.rate_bps);
    const inserted=await db.query(
      `INSERT INTO public.us_booking_service_tax_snapshots
         (booking_id,market_id,payment_purpose,
          collector_owner_type,collector_owner_id,collector_revision,
          tax_setting_revision,service_base_minor,rate_bps,
          service_tax_minor,charge_total_minor,currency_code)
       VALUES ($1,$2,'beauty_service',$3,$4,$5,$6,$7,$8,$9,$10,'USD')
       RETURNING booking_id,market_id,payment_purpose,
         collector_owner_type,collector_owner_id,collector_revision,
         tax_setting_revision,service_base_minor::text,rate_bps,
         service_tax_minor::text,charge_total_minor::text,currency_code,
         created_at`,
      [
        input.booking,booking.market_id,collector.collector_owner_type,
        collector.collector_owner_id,collector.revision,
        setting.revision,money.service_base_minor,money.rate_bps,
        money.service_tax_minor,money.charge_total_minor,
      ]
    );
    if(inserted.rows.length!==1){
      return fail(409,"US_TAX_QUOTE_SNAPSHOT_NOT_CREATED");
    }
    return {status:201,body:{
      ok:true,quote:quotePayload(inserted.rows[0]),created:true,
      payment_ready:false,
    }};
  });
}
export function usServiceTaxQuoteErrorResponse(error) {
  if(typeof error?.code==="string" && error.code.startsWith("US_TAX_QUOTE_")
     && Number.isInteger(error.statusCode)){
    return fail(error.statusCode,error.code);
  }
  if(["23503","23505","23514","40001","40P01","55P03"].includes(error?.code)){
    return fail(409,"US_TAX_QUOTE_INTEGRITY_CONFLICT");
  }
  console.error("US_TAX_QUOTE_STORAGE_FAILURE",String(error?.code||"UNKNOWN"));
  return fail(503,"US_TAX_QUOTE_UNAVAILABLE");
}
