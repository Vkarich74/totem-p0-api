// US-PAY-C11-PAYEE-AUTH: owner-authenticated selection of booking collector.
// IMPORTANT: this selects the proposed recipient; merchant verification and
// Stripe Connect onboarding are a later, independent contract.
// Selection is persisted as PENDING, never auto-verified and never payable.
// No trust in req.identity.salons (which may include master_salon relations).
const ALLOWED_ROLES = new Set(["salon_admin"]);
const ALLOWED_OWNER_TYPES = new Set(["salon", "master"]);

function id(value, allowZero = false) {
  const s = String(value ?? "");
  if (!(allowZero ? /^(0|[1-9]\d*)$/ : /^[1-9]\d*$/).test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export function authenticatedOwnerActor(auth) {
  if (!auth || !ALLOWED_ROLES.has(auth.role) ||
      auth.source !== "session" || !auth.session_id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auth.session_id) ||
      !id(auth.user_id)) {
    return null;
  }
  return { userId: id(auth.user_id), sessionId: auth.session_id };
}

function result(status, error, details = {}) {
  return { status, body: { ok: false, error, ...details } };
}

async function checkLiveOwnerSession(db, actor, write) {
  const session = await db.query(
    `SELECT s.id
       FROM public.auth_sessions s
       JOIN public.auth_users u ON u.id = s.user_id
      WHERE s.id::text = $1
        AND s.user_id = $2
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.last_seen_at > now() - interval '24 hours'
        AND u.enabled = true
        AND u.role = 'salon_admin'
      LIMIT 1${write ? " FOR SHARE OF s, u" : ""}`,
    [actor.sessionId, actor.userId]
  );
  return session.rows.length === 1;
}

async function readOwnerScopedBooking(db, bookingId, userId, lock) {
  const query = await db.query(
    `SELECT b.id, b.salon_id, b.master_id, b.status,
            m.id AS market_id, m.code AS market_code,
            b.currency_code
       FROM public.bookings b
       JOIN public.owner_salon os
         ON os.salon_id = b.salon_id AND os.owner_id::text = $2::text
       JOIN public.tenant_market_settings tms ON tms.salon_id = b.salon_id
       JOIN public.markets m ON m.id = tms.market_id
      WHERE b.id = $1
        AND m.code = 'US' AND m.active = TRUE
        AND m.default_currency = 'USD'
        AND b.currency_code = 'USD'
      LIMIT 1${lock ? " FOR UPDATE OF b" : ""}`,
    [bookingId, String(userId)]
  );
  return query.rows[0] || null;
}

async function currentCollector(db, bookingId, lock) {
  const selection = await db.query(
    `SELECT booking_id, market_id, collector_owner_type, collector_owner_id,
            verification_status, revision, selected_by_user_id
       FROM public.us_booking_payment_collectors
      WHERE booking_id = $1
      LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [bookingId]
  );
  return selection.rows[0] || null;
}

async function ownerSnapshotPrice(db, bookingId, marketId) {
  const price = await db.query(
    `SELECT amount_minor::text AS amount_minor
       FROM public.us_booking_price_snapshots
      WHERE booking_id = $1 AND market_id = $2 AND currency_code = 'USD'
      LIMIT 1`,
    [bookingId, marketId]
  );
  return price.rows[0] ? {
    amount_minor: price.rows[0].amount_minor,
    currency_code: "USD",
    source: "us_booking_price_snapshots",
  } : null;
}

async function isMasterActiveAtBookingSalon(db, booking) {
  const relation = await db.query(
    `SELECT 1 FROM public.master_salon
      WHERE salon_id = $1 AND master_id = $2 AND status = 'active'
      LIMIT 1`,
    [booking.salon_id, booking.master_id]
  );
  return relation.rows.length === 1;
}

async function withOwnerTransaction(pool, work, readOnly) {
  const db = await pool.connect();
  let open = false;
  let releaseError = null;
  try {
    await db.query(readOnly ? "BEGIN READ ONLY" : "BEGIN");
    open = true;
    await db.query("SET LOCAL statement_timeout = '4000ms'");
    await db.query("SET LOCAL lock_timeout = '2000ms'");
    const answer = await work(db);
    if (!readOnly && answer.status >= 200 && answer.status < 300) {
      await db.query("COMMIT");
      open = false;
    }
    return answer;
  } finally {
    if (open) {
      try { await db.query("ROLLBACK"); }
      catch (error) { releaseError = error; }
    }
    db.release(releaseError || undefined);
  }
}

function publicCollector(row) {
  return row ? {
    collector_owner_type: row.collector_owner_type,
    collector_owner_id: Number(row.collector_owner_id),
    verification_status: row.verification_status,
    revision: Number(row.revision),
    payment_ready: false,
  } : null;
}

/** Owner-scoped GET: read-only, exposes no seller bank/Stripe identifiers. */
export async function readUsC11OwnerCollector(pool, { bookingId, auth } = {}) {
  const actor = authenticatedOwnerActor(auth);
  if (!actor) return result(403, "US_COLLECTOR_OWNER_SESSION_REQUIRED");
  const booking = id(bookingId);
  if (!booking) return result(400, "US_COLLECTOR_BOOKING_ID_INVALID");

  return withOwnerTransaction(pool, async db => {
    if (!await checkLiveOwnerSession(db, actor, false)) {
      return result(403, "US_COLLECTOR_OWNER_SESSION_INVALID");
    }
    const scope = await readOwnerScopedBooking(db, booking, actor.userId, false);
    if (!scope) return result(404, "US_COLLECTOR_BOOKING_NOT_FOUND");
    const current = await currentCollector(db, booking, false);
    return {
      status: 200,
      body: {
        ok: true,
        contract_version: "US-PAY-C11-payee-selection-v1",
        booking_id: booking,
        market_code: "US",
        collector: publicCollector(current),
        price: await ownerSnapshotPrice(db, booking, scope.market_id),
        payment_ready: false,
      },
    };
  }, true);
}

/**
 * PUT must be called after resolveAuth + requireAuth middleware.
 * Caller supplies only collector_owner_type and expected_revision.
 * Recipient ID and real actor ID are always derived from locked DB rows.
 */
export async function chooseUsC11OwnerCollector(pool, {
  bookingId, auth, body,
} = {}) {
  const actor = authenticatedOwnerActor(auth);
  if (!actor) return result(403, "US_COLLECTOR_OWNER_SESSION_REQUIRED");
  const booking = id(bookingId);
  if (!booking) return result(400, "US_COLLECTOR_BOOKING_ID_INVALID");

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, "collector_owner_type") ||
      !Object.hasOwn(body, "expected_revision") ||
      !ALLOWED_OWNER_TYPES.has(body.collector_owner_type)) {
    return result(400, "US_COLLECTOR_SELECTION_BODY_INVALID");
  }
  const expected = id(body.expected_revision, true);
  if (expected === null) {
    return result(400, "US_COLLECTOR_REVISION_INVALID");
  }

  return withOwnerTransaction(pool, async db => {
    if (!await checkLiveOwnerSession(db, actor, true)) {
      return result(403, "US_COLLECTOR_OWNER_SESSION_INVALID");
    }
    const scope = await readOwnerScopedBooking(db, booking, actor.userId, true);
    if (!scope) return result(404, "US_COLLECTOR_BOOKING_NOT_FOUND");
    if (!["reserved", "confirmed"].includes(String(scope.status))) {
      return result(409, "US_COLLECTOR_BOOKING_NOT_SELECTABLE");
    }

    const current = await currentCollector(db, booking, true);
    if (current && current.verification_status !== "pending") {
      // Verified or revoked recipients require separate adjudication flow.
      return result(409, "US_COLLECTOR_SELECTION_LOCKED");
    }
    const currentRevision = current ? Number(current.revision) : 0;
    if (currentRevision !== expected) {
      return result(409, "US_COLLECTOR_REVISION_CONFLICT", {
        current_revision: currentRevision,
      });
    }

    const price = await ownerSnapshotPrice(db, booking, scope.market_id);
    if (!price) {
      return result(409, "US_COLLECTOR_PRICE_SNAPSHOT_REQUIRED");
    }
    if (body.collector_owner_type === "master" &&
        !await isMasterActiveAtBookingSalon(db, scope)) {
      return result(409, "US_COLLECTOR_MASTER_NOT_ACTIVE_IN_SALON");
    }

    const selectedOwnerId = body.collector_owner_type === "salon"
      ? Number(scope.salon_id) : Number(scope.master_id);

    const values = [
      booking, scope.market_id, body.collector_owner_type,
      selectedOwnerId, actor.userId,
    ];
    let newRow;
    if (!current) {
      const inserted = await db.query(
        `INSERT INTO public.us_booking_payment_collectors (
          booking_id, market_id, collector_owner_type, collector_owner_id,
          selection_source, selected_by_user_id, verification_status, verified_at
        ) VALUES ($1, $2, $3, $4, 'owner_authorized', $5, 'pending', NULL)
        RETURNING booking_id, market_id, collector_owner_type, collector_owner_id,
                  verification_status, revision`,
        values
      );
      newRow = inserted.rows[0];
    } else {
      const updated = await db.query(
        `UPDATE public.us_booking_payment_collectors
            SET collector_owner_type = $3,
                collector_owner_id = $4,
                selection_source = 'owner_authorized',
                selected_by_user_id = $5,
                verification_status = 'pending',
                verified_at = NULL
          WHERE booking_id = $1 AND market_id = $2
            AND revision = $6 AND verification_status = 'pending'
        RETURNING booking_id, market_id, collector_owner_type, collector_owner_id,
                  verification_status, revision`,
        [...values, expected]
      );
      if (updated.rows.length !== 1) {
        return result(409, "US_COLLECTOR_REVISION_CONFLICT");
      }
      newRow = updated.rows[0];
    }

    const audit = await db.query(
      `INSERT INTO public.us_booking_collector_selection_events (
        booking_id, market_id, actor_user_id,
        previous_owner_type, previous_owner_id,
        selected_owner_type, selected_owner_id, revision
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        booking, scope.market_id, actor.userId,
        current?.collector_owner_type || null,
        current?.collector_owner_id || null,
        body.collector_owner_type, selectedOwnerId, newRow.revision,
      ]
    );

    return {
      status: current ? 200 : 201,
      body: {
        ok: true,
        contract_version: "US-PAY-C11-payee-selection-v1",
        booking_id: booking,
        market_code: "US",
        collector: publicCollector(newRow),
        price,
        selection_event_id: String(audit.rows[0].id),
        payment_ready: false,
        verification_pending: true,
      },
    };
  }, false);
}
