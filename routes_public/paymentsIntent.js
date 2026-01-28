// routes_public/paymentsIntent.js — B3.2 MINIMAL STABLE
import express from "express";
import { openDb } from "../db/index.js";
import { publicTokenAuth } from "../middleware/publicTokenAuth.js";

const router = express.Router();

/**
 * POST /public/payments/intent
 * body: { request_id, provider, amount }
 */
router.post(
  "/payments/intent",
  (req, res, next) => {
    const db = openDb();
    return publicTokenAuth({ db, requiredScope: "public:book" })(req, res, next);
  },
  (req, res) => {
    const db = openDb();

    try {
      const { request_id, provider, amount } = req.body || {};

      if (!request_id || !provider || !amount) {
        return res.status(400).json({ error: "MISSING_FIELDS" });
      }

      // request MUST exist (no other assumptions)
      const reqRow = db.prepare(
        `SELECT request_id FROM public_booking_requests WHERE request_id = ?`
      ).get(request_id);

      if (!reqRow) {
        return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
      }

      // idempotency per request
      const existing = db.prepare(`
        SELECT intent_id, request_id, provider, amount, currency
        FROM public_payment_intents
        WHERE request_id = ?
      `).get(request_id);

      if (existing) {
        return res.json({
          ok: true,
          intent: existing,
          idempotent: true
        });
      }

      // create intent (ONLY existing columns)
      const now = new Date().toISOString();
      const tokenId = req.public.token_id;

      const result = db.prepare(`
        INSERT INTO public_payment_intents
          (request_id, token_id, provider, amount, currency, created_at)
        VALUES
          (?, ?, ?, ?, 'KGS', ?)
      `).run(request_id, tokenId, provider, amount, now);

      const intent = db.prepare(`
        SELECT intent_id, request_id, provider, amount, currency
        FROM public_payment_intents
        WHERE intent_id = ?
      `).get(result.lastInsertRowid);

      return res.json({ ok: true, intent });
    } catch (e) {
      console.error("B3.2 intent error:", e);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    } finally {
      db.close();
    }
  }
);

export default router;
