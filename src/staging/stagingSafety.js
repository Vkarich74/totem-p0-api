// TOTEM US staging-only process and browser-origin safety.
// Production API and KG/KZ behavior are untouched outside NODE_ENV=staging.
// Fail closed if staging inherits live payment, mail, Odoo or DB secrets.
const PRODUCTION_ORIGINS = new Set([
  "api.totemv.com",
  "app.totemv.com",
  "www.totemv.com",
  "totemv.com",
  "totem-platform.odoo.com",
  "honey.totemv.com",
  "totem-admin-production.up.railway.app",
  "totem-p0-api-production.up.railway.app",
]);
const CONNECTOR_CREDENTIALS = Object.freeze([
  "INTERNAL_API_TOKEN", "INTERNAL_API_KEY", "ODOO_BRIDGE_TOKEN",
  "SMTP_USER", "SMTP_PASS", "SMTP_HOST",
  "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN",
  "GMAIL_SENDER_EMAIL",
  "XPAY_API_URL", "XPAY_CLIENT_ID", "XPAY_CLIENT_SECRET",
  "XPAY_SERVICE_UUID", "XPAY_CALLBACK_URL",
  "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
  "VAPID_PRIVATE_KEY",
]);

export function isStagingRuntime(env = {}) {
  return String(env.NODE_ENV || "").trim().toLowerCase() === "staging";
}

function required(name, value) {
  if (!String(value || "").trim()) {
    throw new Error("STAGING_" + name + "_REQUIRED");
  }
  return String(value).trim();
}

function stageOrigin(value) {
  const input = required("ALLOWED_ORIGINS", value);
  let url;
  try { url = new URL(input); }
  catch { throw new Error("STAGING_ORIGIN_INVALID"); }
  const host = url.hostname.toLowerCase();
  const local = host === "127.0.0.1" || host === "localhost";
  if (!host || PRODUCTION_ORIGINS.has(host) ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username || url.password || url.search || url.hash ||
      url.pathname !== "/" ||
      (!local && !host.includes("stage") && !host.includes("staging"))) {
    throw new Error("STAGING_ORIGIN_REJECTED");
  }
  return url.origin;
}

export function resolveCorsAllowedOrigins(env, productionOrigins) {
  if (!isStagingRuntime(env)) return productionOrigins;
  if (env.TOTEM_STAGE_STRICT !== "1") {
    throw new Error("STAGING_STRICT_FLAG_REQUIRED");
  }
  const list = required("ALLOWED_ORIGINS", env.STAGING_ALLOWED_ORIGINS)
    .split(",").map(value => stageOrigin(value.trim()));
  const unique = [...new Set(list)];
  if (!unique.length || unique.length > 5) {
    throw new Error("STAGING_ORIGIN_COUNT_REJECTED");
  }
  return unique;
}

export function assertStagingProcessSafety(env = {}) {
  if (!isStagingRuntime(env)) return;
  if (env.TOTEM_STAGE_STRICT !== "1") {
    throw new Error("STAGING_STRICT_FLAG_REQUIRED");
  }
  // No schema migrations, seed records or live bookings are authorized yet.
  if (env.TOTEM_STAGE_EMPTY_DB !== "1") {
    throw new Error("STAGING_EMPTY_DB_WRITE_LOCK_REQUIRED");
  }
  const database = required("DATABASE_URL", env.DATABASE_URL);
  let url;
  try { url = new URL(database); }
  catch { throw new Error("STAGING_DB_URL_INVALID"); }
  const hostname = url.hostname.toLowerCase();
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !(hostname === "127.0.0.1" || hostname === "localhost" ||
        hostname.endsWith(".railway.internal")) ||
      !url.pathname || url.pathname === "/" ||
      PRODUCTION_ORIGINS.has(hostname)) {
    throw new Error("STAGING_DB_MUST_USE_PRIVATE_OR_LOCAL_POSTGRES");
  }
  if (required("JWT_SECRET", env.JWT_SECRET).length < 48) {
    throw new Error("STAGING_JWT_SECRET_TOO_SHORT");
  }
  if (String(env.AUTO_FINANCE_LOOP_ENABLED || "").toLowerCase() === "true") {
    throw new Error("STAGING_FINANCE_AUTO_LOOP_FORBIDDEN");
  }
  for (const name of [
    "XPAY_RELEASE_ENABLED", "XPAY_DYNAMIC_ENABLED", "XPAY_STATIC_ENABLED",
  ]) {
    if (String(env[name] || "").toLowerCase() === "true") {
      throw new Error("STAGING_PAID_TRANSACTIONS_FORBIDDEN_" + name);
    }
  }
  for (const name of CONNECTOR_CREDENTIALS) {
    if (String(env[name] || "").trim()) {
      throw new Error("STAGING_EXTERNAL_CREDENTIAL_FORBIDDEN_" + name);
    }
  }
  if (String(env.REDIS_URL || "").trim()) {
    throw new Error("STAGING_REDIS_MUST_BE_SEPARATELY_PROVISIONED");
  }
  resolveCorsAllowedOrigins(env, []);
}
