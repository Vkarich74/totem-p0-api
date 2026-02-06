// routes_marketplace/publicPaymentsWebhook.js — B3.3
import express from "express";
import { openDb } from "../db/index.js";

const router = express.Router();

/**
 * POST /marketplace/public/payments/webhook
 * headers:
 *  - X-Actor-Type: provider
 *  - X-Auth-Token: PROVIDER_SECRET
 * body:
 *  { request_id, status, provider_ref }
 */
router.post("/public/payments/webhook", (req, res) => {
  const db = openDb();

  try {
    const actor = String(req.headers["x-actor-type"] || "").toLowerCase();
    if (actor !== "provider") {
      return res.status(403).json({ error: "PROVIDER_ONLY" });
    }

    const { request_id, status, provider_ref } = req.body || {};
    if (!request_id || !status) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }

    if (!["succeeded", "failed"].includes(status)) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    const intent = db.prepare(`
      SELECT intent_id
      FROM public_payment_intents
      WHERE request_id = ?
    `).get(request_id);

    if (!intent) {
      return res.status(404).json({ error: "INTENT_NOT_FOUND" });
    }

    // idempotent update
    db.prepare(`
      UPDATE public_payment_intents
      SET provider_ref = ?
      WHERE intent_id = ?
    `).run(provider_ref || null, intent.intent_id);

    return res.json({
      ok: true,
      request_id,
      status
    });
  } catch (e) {
    console.error("B3.3 webhook error:", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    db.close();
  }
});

export default router;
