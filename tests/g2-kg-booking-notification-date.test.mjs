import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

// Focused regression: KG/KZ public booking accepts date + time without start_at.
// This validates the real date normalization and notification timestamp source.
// No HTTP request, database connection, fixture mutation, or external service.
const sourceFile = resolve(dirname(fileURLToPath(import.meta.url)), "../src/routes/publicCreateBooking.js");
const source = readFileSync(sourceFile, "utf8");
const normalizerStart = source.indexOf("function isIanaTimeZone(value) {");
const handlerStart = source.indexOf("export async function publicCreateBooking(req, res) {");
assert.ok(normalizerStart >= 0 && handlerStart > normalizerStart, "booking normalizer source must exist");
const ctx = { Date, Intl, Number, String, RegExp };
runInNewContext(source.slice(normalizerStart, handlerStart) + "\n globalThis.normalize = normalizePublicStartAt;", ctx);
assert.equal(typeof ctx.normalize, "function");
const payloadStart = source.indexOf("const bookingNotificationPayload = {", handlerStart);
const payloadEnd = source.indexOf("};", payloadStart);
assert.ok(payloadStart > handlerStart && payloadEnd > payloadStart, "notification payload must exist");
const payloadText = source.slice(payloadStart, payloadEnd);
const timestampLine = payloadText.match(/^\s*start_at:\s*(.+),\s*$/m);
assert.ok(timestampLine, "notification must provide start_at");
const notificationTimestamp = new Function(
  "marketContext", "start_at", "normalizedStartAt",
  `return (${timestampLine[1]});`
);

test("KG booking using date+time returns the canonical UTC timestamp in notification", () => {
  const actual = ctx.normalize({ date: "2026-11-23", time: "12:00" }, { marketTimeZone: "Asia/Bishkek" });
  assert.equal(actual, "2026-11-23T06:00:00.000Z");
  assert.equal(notificationTimestamp({ market_code: "KG" }, undefined, actual), actual);
});

test("KG booking using zoned start_at preserves the canonical UTC timestamp", () => {
  const actual = ctx.normalize({ start_at: "2026-11-23T12:00:00+06:00" }, { marketTimeZone: "Asia/Bishkek" });
  assert.equal(actual, "2026-11-23T06:00:00.000Z");
  assert.equal(notificationTimestamp({ market_code: "KG" }, "2026-11-23T12:00:00+06:00", actual), actual);
});

test("US timestamp behavior remains canonical and independent of raw input", () => {
  const actual = "2026-11-23T06:00:00.000Z";
  assert.equal(notificationTimestamp({ market_code: "US" }, undefined, actual), actual);
});
