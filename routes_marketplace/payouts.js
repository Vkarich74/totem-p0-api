// routes_marketplace/payouts.js — B4..B9 complete
import express from "express";
import { openDb, runInTx, nowIso, auditLog } from "../db/index.js";

const router = express.Router();

const ACCOUNTING_WEBHOOK_URL =
  process.env.ACCOUNTING_WEBHOOK_URL || "http://localhost:4000/accounting/webhook";

const WEBHOOK_EVENT = "payout.paid";
const WEBHOOK_TIMEOUT_MS = 5000;
const WEBHOOK_MAX_ATTEMPTS = 3;

function actor(req) {
  return {
    actor_type: req.headers["x-actor-type"] || "unknown",
    actor_id: req.headers["x-actor-id"] || "unknown",
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postJsonWithTimeout(url, payload, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: resp.ok, status: resp.status };
  } finally {
    clearTimeout(t);
  }
}

async function deliverAccountingWebhook(payout, act, isRetry = false) {
  const db = openDb();

  let delivery = runInTx(() => {
    const existing = db.prepare(`
      SELECT * FROM marketplace_webhook_deliveries
      WHERE payout_id = ? AND event = ?
    `).get(payout.payout_id, WEBHOOK_EVENT);

    if (existing) return existing;

    db.prepare(`
      INSERT INTO marketplace_webhook_deliveries
        (payout_id, event, url, status, attempt_count, created_at)
      VALUES (?, ?, ?, 'pending', 0, ?)
    `).run(payout.payout_id, WEBHOOK_EVENT, ACCOUNTING_WEBHOOK_URL, nowIso());

    return db.prepare(`
      SELECT * FROM marketplace_webhook_deliveries
      WHERE payout_id = ? AND event = ?
    `).get(payout.payout_id, WEBHOOK_EVENT);
  });

  // already sent → no-op
  if (delivery.status === "sent") {
    auditLog({
      entity_type: "payout",
      entity_id: payout.payout_id,
      action: isRetry
        ? "accounting_webhook_retry_idempotent"
        : "accounting_webhook_idempotent",
      actor_type: act.actor_type,
      actor_id: act.actor_id,
      before_state: delivery,
      after_state: delivery,
    });
    return { status: "sent", attempts: delivery.attempt_count };
  }

  let lastError = null;

  for (let i = 0; i < WEBHOOK_MAX_ATTEMPTS; i++) {
    if (i > 0) await sleep(i === 1 ? 250 : 750);

    try {
      const resp = await postJsonWithTimeout(
        delivery.url,
        { event: WEBHOOK_EVENT, payout },
        WEBHOOK_TIMEOUT_MS
      );

      delivery = runInTx(() => {
        db.prepare(`
          UPDATE marketplace_webhook_deliveries
          SET attempt_count = attempt_count + 1,
              last_status = ?
          WHERE delivery_id = ?
        `).run(resp.status, delivery.delivery_id);

        if (resp.ok) {
          db.prepare(`
            UPDATE marketplace_webhook_deliveries
            SET status = 'sent',
                sent_at = ?,
                last_error = NULL
            WHERE delivery_id = ?
          `).run(nowIso(), delivery.delivery_id);
        } else {
          db.prepare(`
            UPDATE marketplace_webhook_deliveries
            SET status = 'failed',
                last_error = ?
            WHERE delivery_id = ?
          `).run(`HTTP_${resp.status}`, delivery.delivery_id);
        }

        return db.prepare(`
          SELECT * FROM marketplace_webhook_deliveries
          WHERE delivery_id = ?
        `).get(delivery.delivery_id);
      });

      if (resp.ok) {
        auditLog({
          entity_type: "payout",
          entity_id: payout.payout_id,
          action: isRetry
            ? "accounting_webhook_retry_sent"
            : "accounting_webhook_sent",
          actor_type: act.actor_type,
          actor_id: act.actor_id,
          before_state: null,
          after_state: { attempts: delivery.attempt_count },
        });
        return { status: "sent", attempts: delivery.attempt_count };
      }

      lastError = `HTTP_${resp.status}`;
    } catch (err) {
      lastError = String(err && err.name === "AbortError" ? "TIMEOUT" : err);

      delivery = runInTx(() => {
        db.prepare(`
          UPDATE marketplace_webhook_deliveries
          SET attempt_count = attempt_count + 1,
              status = 'failed',
              last_error = ?
          WHERE delivery_id = ?
        `).run(lastError, delivery.delivery_id);

        return db.prepare(`
          SELECT * FROM marketplace_webhook_deliveries
          WHERE delivery_id = ?
        `).get(delivery.delivery_id);
      });
    }
  }

  auditLog({
    entity_type: "payout",
    entity_id: payout.payout_id,
    action: isRetry
      ? "accounting_webhook_retry_failed"
      : "accounting_webhook_failed",
    actor_type: act.actor_type,
    actor_id: act.actor_id,
    before_state: null,
    after_state: { attempts: delivery.attempt_count, error: lastError },
  });

  return { status: "failed", attempts: delivery.attempt_count, error: lastError };
}

/* =========================
   B9 — MANUAL RETRY WEBHOOK
   POST /marketplace/payouts/:id/webhook/retry
========================= */
router.post("/:id/webhook/retry", async (req, res) => {
  const payoutId = Number(req.params.id);
  if (!payoutId) return res.status(400).json({ error: "INVALID_PAYOUT_ID" });

  const db = openDb();
  const act = actor(req);

  try {
    const payout = db.prepare(`
      SELECT * FROM marketplace_payouts WHERE payout_id = ?
    `).get(payoutId);

    if (!payout) return res.status(404).json({ error: "PAYOUT_NOT_FOUND" });
    if (payout.status !== "paid")
      return res.status(400).json({ error: "PAYOUT_NOT_PAID" });

    const result = await deliverAccountingWebhook(payout, act, true);

    res.json({
      ok: true,
      payout_id: payoutId,
      webhook: result,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
