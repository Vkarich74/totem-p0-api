// core/idempotency.js
import crypto from "crypto";
import Database from "better-sqlite3";
import path from "path";

function dbPath() {
  const fromEnv = process.env.TOTEM_DB_PATH && String(process.env.TOTEM_DB_PATH).trim();
  if (fromEnv) return fromEnv;
  return path.resolve(process.cwd(), "totem.db");
}

export function openDb() {
  const db = new Database(dbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function stableJsonStringify(value) {
  // минимально-стабильная сериализация: сортировка ключей объектов рекурсивно
  const seen = new WeakSet();

  function norm(v) {
    if (v === null || v === undefined) return v;
    if (typeof v !== "object") return v;
    if (seen.has(v)) return "[Circular]";
    seen.add(v);

    if (Array.isArray(v)) return v.map(norm);

    const keys = Object.keys(v).sort();
    const out = {};
    for (const k of keys) out[k] = norm(v[k]);
    return out;
  }

  return JSON.stringify(norm(value));
}

export function computeRequestHash({ method, path: p, actor, body, query }) {
  const payload = {
    method: String(method || "").toUpperCase(),
    path: String(p || ""),
    actor: String(actor || ""),
    query: query || {},
    body: body || {}
  };
  return sha256Hex(stableJsonStringify(payload));
}

export function ensureIdempotencyTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      scope              TEXT    NOT NULL,
      idem_key           TEXT    NOT NULL,
      actor              TEXT    NOT NULL,
      method             TEXT    NOT NULL,
      path               TEXT    NOT NULL,
      request_hash       TEXT    NOT NULL,

      status             TEXT    NOT NULL DEFAULT 'in_progress',
      status_code        INTEGER,
      response_headers_json TEXT,
      response_body_json    TEXT,

      created_at         TEXT    NOT NULL,
      updated_at         TEXT    NOT NULL,
      expires_at         TEXT    NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_idem_scope_key
      ON idempotency_keys(scope, idem_key);

    CREATE INDEX IF NOT EXISTS ix_idem_expires
      ON idempotency_keys(expires_at);

    CREATE INDEX IF NOT EXISTS ix_idem_actor
      ON idempotency_keys(actor);
  `);
}

export function beginIdempotentRequest(db, {
  scope,
  idemKey,
  actor,
  method,
  path: reqPath,
  requestHash,
  ttlSeconds = 60 * 60 * 24 // 24h default
}) {
  ensureIdempotencyTable(db);

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  const getStmt = db.prepare(`
    SELECT *
    FROM idempotency_keys
    WHERE scope = ? AND idem_key = ?
    LIMIT 1
  `);

  const existing = getStmt.get(scope, idemKey);

  if (!existing) {
    const ins = db.prepare(`
      INSERT INTO idempotency_keys
        (scope, idem_key, actor, method, path, request_hash, status, created_at, updated_at, expires_at)
      VALUES
        (?,     ?,        ?,     ?,      ?,    ?,           'in_progress', ?,        ?,         ?)
    `);
    ins.run(scope, idemKey, actor, method, reqPath, requestHash, createdAt, createdAt, expiresAt);
    return { kind: "new" };
  }

  // истекло — позволяем перезапись как новый (внутри транзакции безопаснее, но ок для SQLite WAL при уникальном ключе)
  if (existing.expires_at && String(existing.expires_at) <= createdAt) {
    const upd = db.prepare(`
      UPDATE idempotency_keys
      SET actor = ?, method = ?, path = ?, request_hash = ?, status = 'in_progress',
          status_code = NULL, response_headers_json = NULL, response_body_json = NULL,
          updated_at = ?, expires_at = ?
      WHERE scope = ? AND idem_key = ?
    `);
    upd.run(actor, method, reqPath, requestHash, createdAt, expiresAt, scope, idemKey);
    return { kind: "new" };
  }

  // mismatch: тот же ключ, но другой запрос => конфликт
  if (existing.request_hash !== requestHash) {
    return { kind: "conflict_hash" };
  }

  if (existing.status === "completed" && existing.status_code != null) {
    let headers = {};
    let body = null;
    try { headers = existing.response_headers_json ? JSON.parse(existing.response_headers_json) : {}; } catch {}
    try { body = existing.response_body_json ? JSON.parse(existing.response_body_json) : null; } catch {}

    return {
      kind: "replay",
      statusCode: Number(existing.status_code) || 200,
      headers,
      body
    };
  }

  return { kind: "in_progress" };
}

export function completeIdempotentRequest(db, {
  scope,
  idemKey,
  statusCode,
  responseHeaders,
  responseBody
}) {
  ensureIdempotencyTable(db);

  const now = new Date().toISOString();
  const headersJson = stableJsonStringify(responseHeaders || {});
  const bodyJson = stableJsonStringify(responseBody ?? null);

  const upd = db.prepare(`
    UPDATE idempotency_keys
    SET status = 'completed',
        status_code = ?,
        response_headers_json = ?,
        response_body_json = ?,
        updated_at = ?
    WHERE scope = ? AND idem_key = ?
  `);

  const info = upd.run(statusCode, headersJson, bodyJson, now, scope, idemKey);
  return { updated: info.changes };
}

export function cleanupExpiredIdempotency(db) {
  ensureIdempotencyTable(db);
  const now = new Date().toISOString();
  const del = db.prepare(`DELETE FROM idempotency_keys WHERE expires_at <= ?`);
  const info = del.run(now);
  return { deleted: info.changes };
}
