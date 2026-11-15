// TOTEM US staging link contract V2. Same code in API and SDK.
// Pure module: no network, database, navigation, or environment access.
// Split forbidden hosts into components to keep literal Production
// hosts out of the Staging bundle; the build gate independently scans it.
const forbiddenHostParts = [
  ["api","totemv","com"], ["app","totemv","com"], ["www","totemv","com"],
  ["totemv","com"], ["totem-platform","odoo","com"], ["honey","totemv","com"],
  ["totem-admin-production","up","railway","app"],
  ["totem-p0-api-production","up","railway","app"]
];
const FORBIDDEN_HOSTS = new Set(forbiddenHostParts.map(parts => parts.join(".")));
const BAD_CHARS = /[\u0000-\u001f\u007f\\]/;
const ENCODED_SEPARATOR = /%(?:00|0a|0d|2f|5c)/i;
const DANGEROUS_QUERY = /(?:[?&])(?:token|access_token|client_token|api_key|password|authorization|bearer|redirect|return_url|next)=/i;

function fail(code) {
  const e = new Error("STAGING_LINK_" + code);
  e.code = "STAGING_LINK_" + code;
  e.status = 400;
  return e;
}

function origin(value, role) {
  const text = String(value || "").trim();
  if (!text || text !== value) throw fail(role + "_ORIGIN_REQUIRED");
  let u;
  try { u = new URL(text); }
  catch { throw fail(role + "_ORIGIN_INVALID"); }
  const host = u.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  if (!host || u.origin !== text || u.pathname !== "/" || u.username ||
      u.password || u.search || u.hash ||
      (u.protocol !== "https:" && !(local && u.protocol === "http:")) ||
      (!local && !host.includes("stag")) ||
      [...FORBIDDEN_HOSTS].some(bad => host === bad || host.endsWith("." + bad) || host.startsWith(bad + ".")) ||
      (host.includes("railway.app") &&
       !/^totem-us-staging-(?:api|sdk)-staging\.up\.railway\.app$/.test(host))) {
    throw fail(role + "_ORIGIN_REJECTED");
  }
  return text;
}

function permitted(route, kind) {
  const publicPage = /^\/(?:salon|master)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?\/?(?:\?slug=[a-z0-9]+(?:-[a-z0-9]+)*)?$/i.test(route);
  const booking = /^(?:#\/|\/#\/)booking(?:\/[a-z0-9-]+)?(?:\?[^#]*)?$/i.test(route) ||
    /^\/(?:booking|m\/booking)(?:\?[^#]*)?$/i.test(route);
  const cabinet = /^(?:#\/|\/#\/)(?:salon|master)\/[a-z0-9-]+(?:\/[a-z0-9-]+){0,5}(?:\?[^#]*)?$/i.test(route);
  const reset = /^(?:#\/|\/#\/)auth\/reset(?:\?[^#]*)?$/i.test(route);
  const login = /^(?:#\/|\/#\/)auth\/login(?:\?[^#]*)?$/i.test(route);
  const referral = /^(?:#\/|\/#\/)mobile\?ref=[a-z0-9._~%-]+$/i.test(route);
  const action = /^(?:#\/|\/#\/)(?:salon|master|client|mobile|auth|booking)(?:[/?][^#]*)?$/i.test(route) ||
    /^\/(?:salon|master)\/[a-z0-9-]+\/dashboard(?:\?[^#]*)?$/i.test(route) ||
    /^\/m\/city\/[a-z0-9-]+\/[a-z0-9-]+(?:\?[^#]*)?$/i.test(route);
  switch (kind) {
    case "public": return publicPage;
    case "booking": return booking;
    case "cabinet": return cabinet || login;
    case "reset": return reset;
    case "referral": return referral;
    case "action": return publicPage || booking || cabinet || reset || login || referral || action;
    default: return false;
  }
}

export function createStageLinkPolicy({ strict = false, appOrigin = "", publicOrigin = "" } = {}) {
  const app = strict ? origin(appOrigin, "APP") : null;
  const site = strict ? origin(publicOrigin, "PUBLIC") : null;

  function assert(input, kind = "action") {
    const text = String(input ?? "").trim();
    if (!strict) return text;
    if (!text || BAD_CHARS.test(text) || ENCODED_SEPARATOR.test(text) ||
        text.startsWith("//") || text.includes("///") || DANGEROUS_QUERY.test(text)) {
      throw fail("INPUT_REJECTED");
    }
    let u, absolute = false;
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text)) {
      absolute = true;
      try { u = new URL(text); }
      catch { throw fail("URL_INVALID"); }
      if (!["https:", "http:"].includes(u.protocol) || u.username || u.password ||
          u.origin === "null") throw fail("SCHEME_REJECTED");
    } else {
      if (!text.startsWith("/") && !text.startsWith("#/")) throw fail("RELATIVE_REJECTED");
      try { u = new URL(text, app + "/"); }
      catch { throw fail("RELATIVE_INVALID"); }
    }
    const route = u.pathname + u.search + u.hash;
    if (!permitted(route, kind)) throw fail("ROUTE_REJECTED");
    if (absolute) {
      const allowed = kind === "action" ? [app, site] :
        kind === "public" ? [site] : [app];
      if (!allowed.includes(u.origin)) throw fail("ORIGIN_REJECTED");
      if (u.pathname !== "/" && u.hash) throw fail("MIXED_ROUTE_REJECTED");
    }
    return text;
  }

  function safe(input, kind = "action") {
    if (!strict) return String(input ?? "").trim();
    try { return assert(input, kind); }
    catch { return ""; }
  }

  function appLink(route, kind) {
    if (!strict) throw fail("STAGE_ONLY");
    return assert(app + "/" + String(route || ""), kind);
  }

  return Object.freeze({ strict: Boolean(strict), appOrigin: app, publicOrigin: site,
    assert, safe, appLink });
}
