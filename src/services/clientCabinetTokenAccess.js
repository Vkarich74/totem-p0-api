// Shared client-cabinet bearer-token verification.
// Exact behavior preserved from public.js: SHA-256 token hash, cabinet purpose,
// client_id isolation, revoked_at IS NULL. No raw tokens are logged.
import crypto from "node:crypto";

export function hashClientCabinetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export async function verifyClientCabinetAccess(db, clientId, token) {
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { ok: false, status: 400, error: "INVALID_CLIENT_ID" };
  }

  const safeToken = String(token || "").trim();
  if (!safeToken) {
    return { ok: false, status: 400, error: "CLIENT_TOKEN_REQUIRED" };
  }

  const tokenHash = hashClientCabinetToken(safeToken);

  const tokenRes = await db.query(
    `
    SELECT
      id,
      client_id,
      booking_id,
      token_last4,
      purpose,
      created_at
    FROM client_access_tokens
    WHERE client_id = $1
      AND token_hash = $2
      AND purpose = 'cabinet'
      AND revoked_at IS NULL
    LIMIT 1
    `,
    [clientId, tokenHash]
  );

  if (!tokenRes.rows.length) {
    return { ok: false, status: 403, error: "INVALID_CLIENT_TOKEN" };
  }

  return { ok: true, token: tokenRes.rows[0] };
}
