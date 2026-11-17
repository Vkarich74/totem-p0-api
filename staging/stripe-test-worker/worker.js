/**
 * TOTEM US-PAY-C11: FREE Cloudflare Worker HTTPS Stripe TEST webhook inbox.
 *
 * Delivery verification ONLY; deliberately NOT a payment ledger and NOT
 * PostgreSQL staging. Stores only minimal event audit in dedicated D1.
 * Never processes a charge, chooses a merchant, or marks a booking paid.
 * No prod, Odoo, KG or KZ paths. Never logs secrets or raw customer events.
 */
const ENDPOINT_PATH = "/stripe/test/us-pay-c11/webhook";
const MAX_BYTES = 128 * 1024;
const MAX_AGE_SECONDS = 300;
const SAFE_EVENT = /^(customer\.created|account\.updated|payment_intent\.(succeeded|processing|payment_failed|canceled))$/;
const EVENT_ID = /^evt_[a-zA-Z0-9_]{8,}$/;

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

function parseStripeSignature(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  const parts = value.split(",").map(v => v.trim());
  const timestamps = parts.filter(v => /^t=\d+$/.test(v));
  const v1s = parts.filter(v => /^v1=[0-9a-fA-F]{64}$/.test(v));
  if (timestamps.length !== 1 || v1s.length === 0) return null;
  const t = Number(timestamps[0].slice(2));
  if (!Number.isSafeInteger(t) ||
      Math.abs(Math.floor(Date.now() / 1000) - t) > MAX_AGE_SECONDS) {
    return null;
  }
  return { timestamp: t, signatures: v1s.map(v => v.slice(3).toLowerCase()) };
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function verifyBody(body, sigHeader, secret) {
  const parsed = parseStripeSignature(sigHeader);
  if (!parsed || typeof secret !== "string" || !secret.startsWith("whsec_")) return false;
  const encoder = new TextEncoder();
  const prefix = encoder.encode(parsed.timestamp + ".");
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix);
  message.set(body, prefix.length);
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  return parsed.signatures.some(s => safeEqual(hmac, hexToBytes(s)));
}

async function auditRequest(request, env) {
  if (!env.STRIPE_TEST_WEBHOOK_SECRET || !env.C11_AUDIT) {
    return json({ ok: false, error: "STRIPE_TEST_INBOX_NOT_CONFIGURED" }, 503);
  }
  if (request.headers.get("Content-Type")?.split(";")[0]?.trim() !== "application/json") {
    return json({ ok: false, error: "STRIPE_TEST_CONTENT_TYPE_REQUIRED" }, 415);
  }
  const sizeHint = Number(request.headers.get("Content-Length") || "0");
  if (sizeHint > MAX_BYTES) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length < 2 || raw.length > MAX_BYTES) {
    return json({ ok: false, error: "PAYLOAD_SIZE_INVALID" }, 413);
  }
  const signed = await verifyBody(raw, request.headers.get("Stripe-Signature"),
    env.STRIPE_TEST_WEBHOOK_SECRET);
  if (!signed) return json({ ok: false, error: "STRIPE_SIGNATURE_INVALID" }, 400);

  let event;
  try {
    event = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ ok: false, error: "STRIPE_EVENT_JSON_INVALID" }, 400);
  }
  if (event?.object !== "event" || event?.livemode !== false ||
      !EVENT_ID.test(String(event.id || "")) ||
      !Number.isSafeInteger(event.created) || event.created < 1 ||
      typeof event.type !== "string" || !SAFE_EVENT.test(event.type)) {
    return json({ ok: false, error: "STRIPE_TEST_EVENT_NOT_ACCEPTED" }, 400);
  }
  // Events from connected accounts carry 'account'. Platform events don't.
  const source = typeof event.account === "string"
    ? event.account : "platform";
  if (source !== "platform" && !/^acct_[a-zA-Z0-9]{8,}$/.test(source)) {
    return json({ ok: false, error: "STRIPE_TEST_ACCOUNT_INVALID" }, 400);
  }

  const hash = Array.from(new Uint8Array(
    await crypto.subtle.digest("SHA-256", raw)
  )).map(x => x.toString(16).padStart(2, "0")).join("");

  // D1 is an independent delivery-evidence inbox, not the authoritative
  // payments/merchant binding database. No raw PII or Stripe secrets saved.
  // UNIQUE event ID gives idempotency; Stripe retries still receive HTTP 200.
  await env.C11_AUDIT.prepare(
    `INSERT INTO stripe_test_deliveries
      (event_id, event_type, stripe_source_account, stripe_created,
       sha256_hex, signature_verified, received_at)
     VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(event_id) DO NOTHING`
  ).bind(event.id, event.type, source, event.created, hash).run();
  return json({ ok: true, accepted: true, environment: "STRIPE_TEST",
    payment_status_modified: false });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      try {
        const r = await env.C11_AUDIT.prepare("SELECT 1 AS ready").first();
        return json({
          ok: r?.ready === 1,
          name: "TOTEM-US-C11-STRIPE-TEST-INBOX",
          stripe_mode: "TEST",
          persistent_delivery_audit: true,
          payment_processing: false,
          payments_enabled: false,
        }, r?.ready === 1 ? 200 : 503);
      } catch {
        return json({ ok: false, error: "C11_TEST_AUDIT_NOT_READY" }, 503);
      }
    }
    if (url.pathname !== ENDPOINT_PATH) return json({ ok: false }, 404);
    if (request.method !== "POST") return json({ ok: false }, 405);
    try {
      return await auditRequest(request, env);
    } catch {
      // No success reply before persistence: Stripe should retry on 503.
      return json({ ok: false, error: "STRIPE_TEST_AUDIT_FAILED" }, 503);
    }
  },
};
