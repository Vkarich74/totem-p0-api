// TOTEM US06-GEO-I. Census street address + immutable IANA polygons.
// Source timezone-boundary-builder 2026d: © OpenStreetMap contributors,
// ODbL-1.0. Data artifact remains outside Git. Not USPS-certified.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve as resolvePath } from "node:path";

export const US_GEO_VERSION = "2026d";
export const US_GEO_SOURCE_SHA256 =
  "f72a40a0d00ef4464ad5f6dee85e0bf727e3fbe5ade360d8830f5a1db7d5f44b";
export const US_GEO_RUNTIME_SHA256 =
  "2da5f1e980e70f53c781e1416e8e47bee03b98160353951c886a9901f525550a";
export const US_GEO_BORDER_REVIEW_METERS = 250;
export const US_GEO_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/geographies/address";
const MAX_CENSUS_BYTES = 1_048_576;
const normalize = v => String(v || "").toUpperCase()
  .replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const hash = v => createHash("sha256").update(v).digest("hex");

export function usGeoAddressFingerprint(draft) {
  return hash([
    String(draft.state_code || "").toUpperCase(),
    normalize(draft.city_name), normalize(draft.street_line1),
    normalize(draft.street_line2), String(draft.postal_code || ""),
    String(draft.timezone_name || ""),
  ].join("\u001f"));
}
function bbox(ring) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2 ||
        !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new Error("US_GEO_BAD_POLYGON_POINT");
    }
    const [x, y] = point;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, maxX, minY, maxY];
}
let cached = null;
export function loadPinnedUsTimezonePolygons() {
  const location = process.env.US_GEO_POLYGON_PATH;
  if (!location?.trim()) throw new Error("US_GEO_DATASET_PATH_MISSING");
  const fullPath = resolvePath(location);
  if (cached?.path === fullPath) return cached;
  const compressed = readFileSync(fullPath);
  if (hash(compressed) !== US_GEO_RUNTIME_SHA256) {
    throw new Error("US_GEO_DATASET_SHA256_MISMATCH");
  }
  const data = JSON.parse(gunzipSync(compressed, {
    maxOutputLength: 15 * 1024 * 1024,
  }).toString("utf8"));
  if (data.tag !== US_GEO_VERSION ||
      data.upstream_sha256 !== US_GEO_SOURCE_SHA256 ||
      data.license !== "ODbL-1.0" ||
      !Array.isArray(data.features) || data.features.length !== 29) {
    throw new Error("US_GEO_DATASET_MANIFEST_INVALID");
  }
  const zones = new Set(), index = [];
  for (const feature of data.features) {
    if (typeof feature.tzid !== "string" || zones.has(feature.tzid)) {
      throw new Error("US_GEO_DATASET_DUPLICATE_ZONE");
    }
    const g = feature.geometry || {};
    const polygons = g.type === "Polygon" ? [g.coordinates]
      : g.type === "MultiPolygon" ? g.coordinates : null;
    if (!Array.isArray(polygons) || polygons.length === 0) {
      throw new Error("US_GEO_DATASET_BAD_GEOMETRY");
    }
    zones.add(feature.tzid);
    for (const rings of polygons) {
      if (!Array.isArray(rings) || !Array.isArray(rings[0]) ||
          rings[0].length < 4) throw new Error("US_GEO_DATASET_BAD_RING");
      index.push({ zone: feature.tzid, rings, box: bbox(rings[0]) });
    }
  }
  if (zones.size !== 29 || !zones.has("America/Chicago") ||
      !zones.has("America/Adak") || !zones.has("Pacific/Honolulu")) {
    throw new Error("US_GEO_DATASET_US_COVERAGE_INVALID");
  }
  cached = { path: fullPath, zones, index };
  return cached;
}
function contains(ring, x, y) {
  let inside = false;
  let [px, py] = ring[ring.length - 1];
  for (const [nx, ny] of ring) {
    if (((ny > y) !== (py > y)) &&
        x < nx + (y - ny) * (px - nx) / (py - ny)) inside = !inside;
    px = nx; py = ny;
  }
  return inside;
}
function distanceMeters(rings, lon, lat) {
  const mlat = 111195;
  const mlon = Math.max(1, Math.cos(lat * Math.PI / 180) * mlat);
  let min = Infinity;
  for (const ring of rings) {
    let prev = ring[ring.length - 1];
    for (const next of ring) {
      const ax = (prev[0] - lon) * mlon, ay = (prev[1] - lat) * mlat;
      const vx = (next[0] - prev[0]) * mlon, vy = (next[1] - prev[1]) * mlat;
      const den = vx * vx + vy * vy;
      const t = den ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / den)) : 0;
      min = Math.min(min, Math.hypot(ax + t * vx, ay + t * vy));
      prev = next;
    }
  }
  return min;
}
export function lookupPinnedUsTimezone(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
      lon < -180 || lon > 180 || lat < 18 || lat > 72) {
    return { reason: "US_GEO_COORDINATES_INVALID" };
  }
  const { index } = loadPinnedUsTimezonePolygons();
  const hits = [];
  let edge = Infinity;
  for (const { zone, rings, box } of index) {
    if (lon < box[0] || lon > box[1] || lat < box[2] || lat > box[3]) continue;
    if (!contains(rings[0], lon, lat) ||
        rings.slice(1).some(hole => contains(hole, lon, lat))) continue;
    hits.push(zone);
    edge = Math.min(edge, distanceMeters(rings, lon, lat));
  }
  if (hits.length !== 1) {
    return { reason: "US_GEO_POLYGON_NOT_UNIQUE", candidates: hits };
  }
  return { zone: hits[0], distance_m: Math.round(edge * 10) / 10 };
}
async function censusOne(draft, fetchImpl) {
  const args = new URLSearchParams({
    street: draft.street_line1, city: draft.city_name,
    state: draft.state_code, zip: draft.postal_code.slice(0, 5),
    benchmark: "Public_AR_Current", vintage: "Current_Current", format: "json",
  });
  const response = await fetchImpl(CENSUS_URL + "?" + args, {
    method: "GET", headers: { Accept: "application/json" },
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(7500),
  });
  if (response?.status !== 200 || !response.body?.getReader) {
    throw new Error("US_GEO_CENSUS_NO_VALID_HTTP_RESPONSE");
  }
  if (Number(response.headers?.get("content-length") || 0) > MAX_CENSUS_BYTES) {
    throw new Error("US_GEO_CENSUS_HTTP_BODY_TOO_BIG");
  }
  const chunks = []; let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CENSUS_BYTES) throw new Error("US_GEO_CENSUS_BODY_TOO_BIG");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (payload?.result?.input?.benchmark?.benchmarkName !== "Public_AR_Current" ||
      !Array.isArray(payload?.result?.addressMatches)) {
    throw new Error("US_GEO_CENSUS_CONTRACT_MISMATCH");
  }
  return payload.result.addressMatches;
}
export async function verifyUsLocationAddress(draft, { fetchImpl = fetch } = {}) {
  const checkedAt = new Date();
  const result = {
    status: "NEEDS_REVIEW", reasons: [],
    resolved_timezone: null, latitude: null, longitude: null,
    boundary_distance_m: null, census_matched_address: null,
    census_state_code: null, census_zip5: null,
    address_fingerprint_sha256: usGeoAddressFingerprint(draft),
    source_version: US_GEO_VERSION, dataset_sha256: US_GEO_RUNTIME_SHA256,
    census_benchmark: "Public_AR_Current",
    checked_at: checkedAt.toISOString(),
    expires_at: new Date(checkedAt.getTime() + US_GEO_TTL_MS).toISOString(),
  };
  try { loadPinnedUsTimezonePolygons(); }
  catch { result.reasons.push("US_GEO_DATASET_UNAVAILABLE"); return result; }
  let matches;
  try { matches = await censusOne(draft, fetchImpl); }
  catch { result.reasons.push("US_GEO_CENSUS_UNAVAILABLE"); return result; }
  if (matches.length !== 1) {
    result.reasons.push(matches.length ?
      "US_GEO_CENSUS_AMBIGUOUS" : "US_GEO_CENSUS_NO_MATCH");
    return result;
  }
  const match = matches[0], comp = match?.addressComponents || {};
  const geoStates = match?.geographies?.States;
  result.census_matched_address = String(match?.matchedAddress || "").slice(0, 320) || null;
  result.census_state_code = String(comp.state || "").slice(0, 2) || null;
  result.census_zip5 = String(comp.zip || "").slice(0, 5) || null;
  if (comp.state !== draft.state_code) result.reasons.push("US_GEO_ADDRESS_STATE_MISMATCH");
  if (!Array.isArray(geoStates) || geoStates.length !== 1 ||
      geoStates[0]?.STUSAB !== draft.state_code) {
    result.reasons.push("US_GEO_COORDINATE_STATE_MISMATCH");
  }
  if (comp.zip !== draft.postal_code.slice(0, 5)) {
    result.reasons.push("US_GEO_ZIP5_MISMATCH");
  }
  if (draft.postal_code.includes("-")) {
    result.reasons.push("US_GEO_ZIP_PLUS4_REQUIRES_USPS_REVIEW");
  }
  if (normalize(comp.city) !== normalize(draft.city_name)) {
    result.reasons.push("US_GEO_CITY_MISMATCH");
  }
  if (normalize(String(match.matchedAddress || "").split(",")[0]) !==
      normalize(draft.street_line1)) result.reasons.push("US_GEO_STREET_MISMATCH");
  const lon = Number(match?.coordinates?.x), lat = Number(match?.coordinates?.y);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
      lat < 18 || lat > 72 || lon < -180 || lon > 180) {
    result.reasons.push("US_GEO_COORDINATES_INVALID");
    return result;
  }
  result.longitude = lon; result.latitude = lat;
  let zone;
  try { zone = lookupPinnedUsTimezone(lon, lat); }
  catch { result.reasons.push("US_GEO_POLYGON_UNAVAILABLE"); return result; }
  if (zone.reason) result.reasons.push(zone.reason);
  else {
    result.resolved_timezone = zone.zone;
    result.boundary_distance_m = zone.distance_m;
    if (zone.zone !== draft.timezone_name) {
      result.reasons.push("US_GEO_IANA_TIMEZONE_MISMATCH");
    }
    if (zone.distance_m < US_GEO_BORDER_REVIEW_METERS) {
      result.reasons.push("US_GEO_NEAR_IANA_BORDER");
    }
  }
  if (!result.reasons.length) result.status = "VERIFIED_GEOMETRY";
  return result;
}
