// core/publicTokens.js
import crypto from "crypto";

/**
 * Public token model:
 * - raw token (одноразово показываем при выпуске)
 * - в БД храним только hash (sha256)
 * - token привязан к tenant_id (+ опционально salon_id)
 * - scopes: "public:read", "public:book"
 */

export function randomToken() {
  // 32 bytes -> base64url (browser-safe, без + / =)
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw), "utf8").digest("hex");
}

export function normalizeScopes(input) {
  const allowed = new Set(["public:read", "public:book"]);
  const arr = Array.isArray(input) ? input : [];
  const cleaned = [...new Set(arr.map(String))].filter((s) => allowed.has(s));
  // по умолчанию минимальный read
  if (cleaned.length === 0) return ["public:read"];
  return cleaned;
}

export function computeExpiry(expires_in_days) {
  // default 30 days, max 365 days
  let days = Number.isFinite(Number(expires_in_days)) ? Number(expires_in_days) : 30;
  if (days < 1) days = 1;
  if (days > 365) days = 365;
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

export function ensurePublicTokensTable(db) {
  // SQLite: TEXT timestamps ISO8601
  db.exec(`
    CREATE TABLE IF NOT EXISTS public_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      salon_id TEXT,
      scopes TEXT NOT NULL, -- JSON array as string
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      last_used_at TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_public_tokens_tenant
    ON public_tokens (tenant_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_public_tokens_hash
    ON public_tokens (token_hash);
  `);
}

export function issuePublicToken(db, { tenant_id, salon_id = null, scopes, expires_in_days }) {
  if (!tenant_id) {
    const err = new Error("tenant_id required");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const raw = randomToken();
  const token_hash = hashToken(raw);
  const scopesNorm = normalizeScopes(scopes);
  const expires_at = computeExpiry(expires_in_days);
  const created_at = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO public_tokens (token_hash, tenant_id, salon_id, scopes, expires_at, created_at)
    VALUES (@token_hash, @tenant_id, @salon_id, @scopes, @expires_at, @created_at)
  `);

  stmt.run({
    token_hash,
    tenant_id: String(tenant_id),
    salon_id: salon_id === null || salon_id === undefined ? null : String(salon_id),
    scopes: JSON.stringify(scopesNorm),
    expires_at,
    created_at,
  });

  return {
    token: raw, // показываем ОДИН раз (в БД raw нет)
    tenant_id: String(tenant_id),
    salon_id: salon_id === null || salon_id === undefined ? null : String(salon_id),
    scopes: scopesNorm,
    expires_at,
    created_at,
  };
}

export function readPublicTokenByRaw(db, rawToken) {
  const token_hash = hashToken(rawToken);
  const row = db
    .prepare(
      `
    SELECT id, tenant_id, salon_id, scopes, expires_at, created_at, revoked_at, last_used_at
    FROM public_tokens
    WHERE token_hash = ?
  `
    )
    .get(token_hash);

  if (!row) return null;

  let scopes = [];
  try {
    scopes = JSON.parse(row.scopes || "[]");
  } catch {
    scopes = [];
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    salon_id: row.salon_id,
    scopes,
    expires_at: row.expires_at,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
  };
}
