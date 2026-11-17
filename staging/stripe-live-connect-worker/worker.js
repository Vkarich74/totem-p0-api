/**
 * TOTEM USA / US-PAY-C11 / LIVE Stripe Connect HTTPS event ingress.
 *
 * This Cloudflare Workers entrypoint is dedicated to Stripe CONNECT
 * merchant-account lifecycle notifications, NOT payment execution.
 *
 * Phase A: persist a verified, minimal, immutable-ish delivery receipt
 * in isolated Cloudflare D1. No merchant approval / payment state writes.
 * Backend PostgreSQL owner verification and actual merchant processing
 * require a separate, explicitly controlled rollout.
 *
 * Never store webhook bodies, PII, OAuth tokens, bank data, or secrets.
 * Never accept sandbox or unsigned events. No KG/KZ or Odoo calls.
 */
const PATH = "/stripe/connect/us-pay-c11/live/account-events";
const MAX_BYTES = 128 * 1024;
const SIGNATURE_MAX_AGE = 300;
const EVENT_ID = /^evt_[A-Za-z0-9_]{8,}$/;
const ACCOUNT_ID = /^acct_[A-Za-z0-9]{8,}$/;
const ALLOWED = new Set([
  "account.updated",
  "account.application.deauthorized",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function parseSignature(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  const members = value.split(",").map(x => x.trim());
  const timestamps = members.filter(x => /^t=[0-9]+$/.test(x));
  const signatures = members.filter(x => /^v1=[0-9a-fA-F]{64}$/.test(x));
  if (timestamps.length !== 1 || signatures.length < 1) return null;
  const t = Number(timestamps[0].slice(2));
  if (!Number.isSafeInteger(t) ||
      Math.abs(Math.floor(Date.now() / 1000) - t) > SIGNATURE_MAX_AGE) {
    return null;
  }
  return { t, signatures: signatures.map(x => x.slice(3).toLowerCase()) };
}

function bytesFromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let delta = 0;
  for (let i = 0; i < a.length; i++) delta |= a[i] ^ b[i];
  return delta === 0;
}

async function verifyHmac(rawBytes, signature, secret) {
  const parsed = parseSignature(signature);
  if (!parsed || typeof secret !== "string" ||
      !/^whsec_[A-Za-z0-9_]+$/.test(secret)) return false;
  const encoder = new TextEncoder();
  const prefix = encoder.encode(parsed.t + ".");
  const body = new Uint8Array(prefix.length + rawBytes.length);
  body.set(prefix);
  body.set(rawBytes, prefix.length);
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, body)
  );
  return parsed.signatures.some(x =>
    constantTimeEquals(signatureBytes, bytesFromHex(x))
  );
}

async function receiptForRequest(request, env) {
  if (!env.US_C11_CONNECT_LIVE_D1 ||
      typeof env.US_C11_CONNECT_LIVE_WEBHOOK_SECRET !== "string" ||
      !/^whsec_[A-Za-z0-9_]+$/.test(env.US_C11_CONNECT_LIVE_WEBHOOK_SECRET)) {
    return json({ ok:false, code:"RECEIVER_NOT_ACTIVATED" },503);
  }
  const ct = request.headers.get("Content-Type");
  if (!ct || ct.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ ok:false, code:"JSON_REQUIRED" },415);
  }
  const len = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(len) && len > MAX_BYTES) {
    return json({ ok:false, code:"BODY_TOO_LARGE" },413);
  }
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length < 2 || raw.length > MAX_BYTES) {
    return json({ ok:false, code:"BODY_INVALID_SIZE" },413);
  }
  const verified = await verifyHmac(
    raw, request.headers.get("Stripe-Signature"),
    env.US_C11_CONNECT_LIVE_WEBHOOK_SECRET
  );
  if (!verified) return json({ ok:false, code:"STRIPE_SIGNATURE_REJECTED" },400);
  let event;
  try { event = JSON.parse(new TextDecoder().decode(raw)); }
  catch { return json({ ok:false, code:"STRIPE_JSON_REJECTED" },400); }

  if (event?.object !== "event" || event?.livemode !== true ||
      !EVENT_ID.test(String(event.id ?? "")) ||
      !ACCOUNT_ID.test(String(event.account ?? "")) ||
      !ALLOWED.has(event.type) ||
      !Number.isSafeInteger(event.created) || event.created < 1) {
    return json({ ok:false, code:"LIVE_CONNECT_EVENT_REJECTED" },400);
  }
  if (event.type === "account.updated" &&
      (event.data?.object?.object !== "account" ||
       event.data.object.id !== event.account)) {
    return json({ ok:false, code:"LIVE_ACCOUNT_SUBJECT_MISMATCH" },400);
  }

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",raw));
  const digestHex = Array.from(digest).map(x =>
    x.toString(16).padStart(2,"0")
  ).join("");

  // 200 is sent ONLY after durable D1 receipt commit; Stripe can retry
  // on persistence failure. No business owner verification happens here.
  await env.US_C11_CONNECT_LIVE_D1.prepare(
    `INSERT INTO us_c11_connect_live_deliveries
       (event_id,stripe_account_id,event_type,stripe_created,
        body_sha256,signature_verified,reconciliation_status,received_at)
     VALUES (?,?,?,?,?,1,'pending',datetime('now'))
     ON CONFLICT(event_id) DO NOTHING`
  ).bind(
    event.id,event.account,event.type,event.created,digestHex
  ).run();

  return json({
    ok:true,
    stripe_mode:"LIVE",
    delivered_to:"DURABLE_INGRESS_ONLY",
    merchant_verification_updated:false,
    payment_processing:false,
  });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET") {
      try {
        const row = await env.US_C11_CONNECT_LIVE_D1.prepare(
          "SELECT 1 AS ok"
        ).first();
        const persistent = row?.ok === 1;
        const secretConfigured =
          typeof env.US_C11_CONNECT_LIVE_WEBHOOK_SECRET === "string" &&
          /^whsec_[A-Za-z0-9_]+$/.test(
            env.US_C11_CONNECT_LIVE_WEBHOOK_SECRET
          );
        return json({
          ok:persistent,
          app:"TOTEM-US-C11-STRIPE-CONNECT-LIVE-INGRESS",
          persistent_storage_ready:persistent,
          webhook_signature_ready:secretConfigured,
          mode:"DURABLE_RECEIPTS_ONLY",
          merchant_business_updates:false,
          payments_enabled:false,
        },persistent ? 200 : 503);
      } catch {
        return json({ok:false,code:"D1_UNAVAILABLE"},503);
      }
    }
    if (path !== PATH) return json({ok:false},404);
    if (request.method !== "POST") return json({ok:false},405);
    try { return await receiptForRequest(request,env); }
    catch {
      // NEVER acknowledge events whose durable receipt could not commit.
      return json({ok:false,code:"RECEIPT_WRITE_FAILED"},503);
    }
  },
};
