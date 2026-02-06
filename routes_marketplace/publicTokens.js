// routes_marketplace/publicTokens.js
import express from "express";
import { issuePublicToken } from "../core/publicTokens.js";

/**
 * GO 27.1 — system-only выпуск public tokens
 *
 * Правило:
 * - это marketplace/admin эндпоинт (не public)
 * - требует abuseGuard: X-Actor-Type: system + X-Auth-Token
 * - tenant берём из tenantContext (X-Tenant-Id), НЕ из body
 *
 * POST /marketplace/public/tokens/issue
 * body: { salon_id?: string, scopes?: string[], expires_in_days?: number }
 * response: { ok:true, public_token:{ token, tenant_id, salon_id, scopes, expires_at, created_at } }
 */

export default function mountMarketplacePublicTokens(app, { db }) {
  const router = express.Router();

  router.post("/public/tokens/issue", (req, res) => {
    const tenant_id = req.tenant?.id || req.headers["x-tenant-id"] || null;

    // system-only — abuseGuard уже должен был отфильтровать actor/auth-token,
    // но на всякий случай проверим actor-type.
    const actorType = String(req.headers["x-actor-type"] || "").toLowerCase();
    if (actorType !== "system") {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const salon_id = req.body?.salon_id ?? null;
    const scopes = req.body?.scopes ?? null;
    const expires_in_days = req.body?.expires_in_days ?? null;

    try {
      const out = issuePublicToken(db, { tenant_id, salon_id, scopes, expires_in_days });
      return res.json({ ok: true, public_token: out });
    } catch (e) {
      if (e?.code === "VALIDATION_ERROR") {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: e.message });
      }
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  app.use("/marketplace", router);
}
