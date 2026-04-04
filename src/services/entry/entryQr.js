import { buildResolvedEntryContract } from "./entryAccess.js";

const DEFAULT_QR_IMAGE_SIZE = 512;
const DEFAULT_QR_MARGIN = 0;

function normalizePositiveInteger(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return fallback;
  }
  return Math.max(0, Math.min(2048, Math.round(num)));
}

export function buildQrProviderUrl(payload, options = {}) {
  const size = normalizePositiveInteger(options.size, DEFAULT_QR_IMAGE_SIZE);
  const margin = normalizePositiveInteger(options.margin, DEFAULT_QR_MARGIN);
  const params = new URLSearchParams();

  params.set("format", "png");
  params.set("size", `${size}x${size}`);
  params.set("margin", String(margin));
  params.set("data", String(payload || ""));

  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}

export async function fetchQrPngBuffer(payload, options = {}) {
  const providerUrl = buildQrProviderUrl(payload, options);
  const response = await fetch(providerUrl, {
    method: "GET",
    headers: {
      accept: "image/png"
    }
  });

  if (!response.ok) {
    const err = new Error("QR_PROVIDER_REQUEST_FAILED");
    err.code = "QR_PROVIDER_REQUEST_FAILED";
    err.status = 502;
    throw err;
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (!contentType.startsWith("image/png")) {
    const err = new Error("QR_PROVIDER_INVALID_CONTENT_TYPE");
    err.code = "QR_PROVIDER_INVALID_CONTENT_TYPE";
    err.status = 502;
    throw err;
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    const err = new Error("QR_PROVIDER_EMPTY_RESPONSE");
    err.code = "QR_PROVIDER_EMPTY_RESPONSE";
    err.status = 502;
    throw err;
  }

  return {
    buffer,
    contentType: "image/png",
    providerUrl
  };
}

export async function buildResolvedQrImage(db, ownerType, slug, baseUrl = null, options = {}) {
  const resolved = await buildResolvedEntryContract(db, ownerType, slug, baseUrl);

  if (!resolved) {
    return null;
  }

  if (!resolved.contract.qr_allowed) {
    return {
      resolved,
      qr: null
    };
  }

  const qr = await fetchQrPngBuffer(resolved.contract.public_absolute_url, options);

  return {
    resolved,
    qr
  };
}

export default {
  buildQrProviderUrl,
  fetchQrPngBuffer,
  buildResolvedQrImage
};
