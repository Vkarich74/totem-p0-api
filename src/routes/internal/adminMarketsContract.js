// Admin market contract B (19 Nov 2026).
// Additive, read-only scoped lists. No cross-currency arithmetic or market writes.
// Existing unscoped admin endpoints keep their historical SQL and response shape.
const SUPPORTED_OPERATIONAL = new Set(["KG", "US"]);

function fault(code, statusCode = 409) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  error.isAdminMarketError = true;
  return error;
}

export function parseAdminMarketCode(raw) {
  if (typeof raw !== "string" || raw !== raw.trim()) throw fault("ADMIN_MARKET_CODE_INVALID", 400);
  const code = raw.toUpperCase();
  if (code === "KZ") throw fault("ADMIN_MARKET_INACTIVE", 409);
  if (!SUPPORTED_OPERATIONAL.has(code)) throw fault("ADMIN_MARKET_CODE_UNSUPPORTED", 400);
  return code;
}

export async function listAdminMarkets(db) {
  const result = await db.query(
    [
      "SELECT code, country_code, active, default_locale,",
      "default_currency, default_timezone",
      "FROM public.markets",
      "ORDER BY CASE code WHEN 'KG' THEN 0 WHEN 'US' THEN 1",
      "WHEN 'KZ' THEN 2 ELSE 3 END, code ASC",
    ].join(" ")
  );
  return (result.rows || []).map(row => {
    const code = String(row.code || "").toUpperCase();
    const databaseActive = row.active === true;
    const operationEnabled = databaseActive && SUPPORTED_OPERATIONAL.has(code);
    return {
      market_code: code,
      country_code: row.country_code,
      database_active: databaseActive,
      admin_operation_enabled: operationEnabled,
      admin_status: code === "KZ" ? "inactive_policy" :
        operationEnabled ? "active" : "inactive",
      currency_code: row.default_currency,
      locale: row.default_locale,
      default_timezone: row.default_timezone,
      configuration_conflict: code === "KZ" && databaseActive,
    };
  });
}

export async function requireActiveAdminMarket(db, rawCode) {
  const code = parseAdminMarketCode(rawCode);
  const result = await db.query(
    "SELECT code, active FROM public.markets WHERE code=$1 LIMIT 1", [code]
  );
  if (!result.rows?.length) throw fault("ADMIN_MARKET_NOT_FOUND", 404);
  if (result.rows[0].active !== true) throw fault("ADMIN_MARKET_INACTIVE");
  return code;
}

// Fixed SQL expressions only: never interpolate a caller-supplied table or column.
// Master items are *active salon relations*, not free-floating master identities.
// This makes cross-market/multi-salon relationships visible without guessing a market.
const TENANT_JOIN = [
  "JOIN public.tenant_market_settings tms ON tms.salon_id=s.id",
  "JOIN public.markets market ON market.id=tms.market_id",
].join(" ");

const SOURCES = Object.freeze({
  salons: {
    from: "public.salons s " + TENANT_JOIN,
    select: [
      "s.id,s.name,s.slug,s.enabled,s.status,s.created_at",
      "market.code AS market_code,market.active AS market_active",
      "market.default_currency AS currency_code",
      "(SELECT COUNT(DISTINCT ms.master_id)::int FROM public.master_salon ms WHERE ms.salon_id=s.id) AS masters_total",
      "(SELECT COUNT(*)::int FROM public.clients c WHERE c.salon_id=s.id) AS clients_total",
      "(SELECT COUNT(*)::int FROM public.bookings b WHERE b.salon_id=s.id AND DATE(b.start_at)=CURRENT_DATE) AS bookings_today",
    ].join(", "),
    rank: "CASE WHEN s.enabled=true AND s.status='active' THEN 0 ELSE 1 END",
    time: "s.created_at",
    id: "s.id",
    secondary: "s.id",
  },
  masters: {
    from: [
      "public.masters master",
      "JOIN public.master_salon ms ON ms.master_id=master.id AND ms.status='active'",
      "JOIN public.salons s ON s.id=ms.salon_id",
      TENANT_JOIN,
    ].join(" "),
    select: [
      "master.id,master.name,master.slug,master.active,master.user_id",
      "ms.salon_id,ms.status AS relation_status",
      "s.slug AS salon_slug,s.name AS salon_name,s.enabled AS salon_enabled,s.status AS salon_status",
      "market.code AS market_code,market.active AS market_active",
      "market.default_currency AS currency_code",
      ["(SELECT COUNT(DISTINCT linked_market.code)::int",
      "FROM public.master_salon link",
      "JOIN public.salons linked_salon ON linked_salon.id=link.salon_id",
      "JOIN public.tenant_market_settings linked_tms ON linked_tms.salon_id=linked_salon.id",
      "JOIN public.markets linked_market ON linked_market.id=linked_tms.market_id",
      "WHERE link.master_id=master.id AND link.status='active') AS active_market_count"].join(" "),
    ].join(", "),
    rank: "CASE WHEN master.active=true AND s.enabled=true AND s.status='active' THEN 0 ELSE 1 END",
    time: "NULL::timestamptz",
    id: "master.id",
    secondary: "ms.salon_id",
  },
  clients: {
    from: [
      "public.clients c",
      "JOIN public.salons s ON s.id=c.salon_id",
      TENANT_JOIN,
    ].join(" "),
    select: [
      "c.id,c.name,c.phone,c.salon_id",
      "s.slug AS salon_slug,s.name AS salon_name",
      "market.code AS market_code,market.active AS market_active",
      "market.default_currency AS currency_code",
      "(SELECT COUNT(*)::int FROM public.bookings b WHERE b.client_id=c.id) AS bookings_total",
      "(SELECT MAX(b.start_at) FROM public.bookings b WHERE b.client_id=c.id) AS last_booking_at",
    ].join(", "),
    rank: "0",
    time: "NULL::timestamptz",
    id: "c.id",
    secondary: "c.id",
  },
  bookings: {
    from: [
      "public.bookings b",
      "JOIN public.salons s ON s.id=b.salon_id",
      TENANT_JOIN,
      "LEFT JOIN public.masters master ON master.id=b.master_id",
      "LEFT JOIN public.clients c ON c.id=b.client_id",
    ].join(" "),
    select: [
      "b.id,b.salon_id,s.slug AS salon_slug,s.name AS salon_name",
      "b.master_id,master.slug AS master_slug,master.name AS master_name",
      "c.name AS client_name,c.phone AS client_phone",
      "b.start_at,b.status",
      "market.code AS market_code,market.active AS market_active",
      "market.default_currency AS currency_code",
    ].join(", "),
    rank: "CASE WHEN b.status IN ('reserved','confirmed','pending') THEN 0 ELSE 1 END",
    time: "b.start_at",
    id: "b.id",
    secondary: "b.id",
  },
});

export async function readScopedAdminList(db, { kind, marketCode, limit, offset }) {
  const source = SOURCES[kind];
  if (!source) throw fault("ADMIN_MARKET_LIST_KIND_INVALID", 400);
  const code = await requireActiveAdminMarket(db, marketCode);
  const from = source.from;
  const where = "market.code=$1 AND market.active=true";
  const rank = source.rank;
  const time = source.time;
  const id = source.id;
  const secondary = source.secondary;
  const sql = [
    "SELECT (SELECT COUNT(*)::int FROM " + from + " WHERE " + where + ") AS total_count,",
    "COALESCE((SELECT jsonb_agg(to_jsonb(page) - '__rank' - '__time' - '__id' - '__secondary'",
    "ORDER BY page.__rank ASC,page.__time DESC NULLS LAST,page.__id DESC,page.__secondary DESC)",
    "FROM (SELECT " + source.select + ", " + rank + " AS __rank,",
    time + " AS __time," + id + " AS __id," + secondary + " AS __secondary",
    "FROM " + from + " WHERE " + where,
    "ORDER BY __rank ASC,__time DESC NULLS LAST,__id DESC,__secondary DESC",
    "LIMIT $2 OFFSET $3) page), '[]'::jsonb) AS items",
  ].join(" ");
  const result = await db.query(sql, [code, limit, offset]);
  const row = result.rows?.[0] || {};
  const items = Array.isArray(row.items) ? row.items : [];
  // Never expose a row from a different tenant market even if a join drifts.
  if (items.some(item => item.market_code !== code || item.market_active !== true)) {
    throw fault("ADMIN_MARKET_READBACK_MISMATCH");
  }
  return {
    items,
    pagination: { total: Number(row.total_count || 0), limit, offset },
    market_code: code,
    item_grain: kind === "masters" ? "active_master_salon_relation" : kind.slice(0, -1),
  };
}

// Invoke inside the same SQL transaction, AFTER locking the owner row and
// BEFORE UPDATE. Existing unbound legacy-KG operations stay unchanged when
// the caller supplies no market_code; an explicit market can NEVER be guessed.
export async function assertAdminOwnerActionMarket(db, { ownerType, ownerId, requestedMarketCode }) {
  const hasRequest = requestedMarketCode !== undefined && requestedMarketCode !== null;
  const requested = hasRequest ? parseAdminMarketCode(requestedMarketCode) : null;
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0 ||
      !["salon", "master"].includes(ownerType)) {
    throw fault("ADMIN_MARKET_OWNER_INVALID", 400);
  }
  let rows;
  if (ownerType === "salon") {
    const result = await db.query([
      "SELECT market.code AS market_code,market.active AS market_active,",
      "s.enabled AS salon_enabled,s.status AS salon_status",
      "FROM public.salons s",
      "LEFT JOIN public.tenant_market_settings tms ON tms.salon_id=s.id",
      "LEFT JOIN public.markets market ON market.id=tms.market_id",
      "WHERE s.id=$1",
    ].join(" "), [ownerId]);
    rows = result.rows || [];
  } else {
    const result = await db.query([
      "SELECT ms.salon_id,ms.status AS relation_status,",
      "s.enabled AS salon_enabled,s.status AS salon_status,",
      "market.code AS market_code,market.active AS market_active",
      "FROM public.master_salon ms",
      "JOIN public.salons s ON s.id=ms.salon_id",
      "LEFT JOIN public.tenant_market_settings tms ON tms.salon_id=s.id",
      "LEFT JOIN public.markets market ON market.id=tms.market_id",
      "WHERE ms.master_id=$1",
    ].join(" "), [ownerId]);
    rows = result.rows || [];
  }
  const codes = new Set(rows.map(row => row.market_code).filter(Boolean));
  if (codes.has("KZ") || rows.some(row => row.market_code && row.market_active !== true)) {
    throw fault("ADMIN_MARKET_INACTIVE");
  }
  if (codes.size > 1) throw fault("ADMIN_OWNER_MARKET_AMBIGUOUS");
  const boundCode = [...codes][0] || null;
  if (requested && (boundCode !== requested || rows.some(row => !row.market_code))) {
    throw fault("ADMIN_OWNER_MARKET_MISMATCH");
  }
  if (boundCode === "US") {
    if (requested !== "US") throw fault("ADMIN_US_EXPLICIT_MARKET_REQUIRED");
    const activeRows = rows.filter(row => ownerType === "salon" ||
      (row.relation_status === "active" && row.salon_enabled === true && row.salon_status === "active"));
    if (ownerType === "master" && activeRows.length !== 1) {
      throw fault("ADMIN_US_ACTIVE_SALON_REQUIRED");
    }
  } else if (requested && !boundCode) {
    throw fault("ADMIN_OWNER_MARKET_UNVERIFIED");
  }
  // No inferred KG assignment for a historically unbound owner: this only
  // preserves that owner's already-existing legacy action contract.
  return { market_code: boundCode, legacy_unclassified: !boundCode };
}
