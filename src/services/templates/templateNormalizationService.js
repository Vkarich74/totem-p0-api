import { createEmptyTemplatePayload } from "./templateDefaultFactory.js";

function deepClone(value){
  return JSON.parse(JSON.stringify(value));
}

function mergeAssetsIntoPayload(payload, assets){
  const nextPayload = deepClone(payload);
  const bucket = {};

  for (const asset of assets) {
    bucket[asset.id] = {
      id: asset.id,
      slot_type: asset.slot_type,
      slot_index: asset.slot_index,
      secure_url: asset.secure_url,
      fallback_url: asset.fallback_url,
      width: asset.width,
      height: asset.height,
      format: asset.format,
      bytes: asset.bytes,
      alt: asset.alt,
      is_active: asset.is_active,
    };
  }

  if (nextPayload?.images && typeof nextPayload.images === "object") {
    nextPayload.images.assets = bucket;
  }

  return nextPayload;
}

export function normalizeTemplatePayload(ownerType, payload, assets = []){
  const base = createEmptyTemplatePayload(ownerType);
  const rawPayload = payload || {};
  const safePayload = {
    ...base,
    ...rawPayload,
    identity: { ...(base.identity || {}), ...(rawPayload.identity || {}) },
    contact: { ...(base.contact || {}), ...(rawPayload.contact || {}) },
    location: { ...(base.location || {}), ...(rawPayload.location || {}) },
    trust: { ...(base.trust || {}), ...(rawPayload.trust || {}) },
    cta: { ...(base.cta || {}), ...(rawPayload.cta || {}) },
    images: { ...(base.images || {}), ...(rawPayload.images || {}) },
    seo: { ...(base.seo || {}), ...(rawPayload.seo || {}) },
    stats: { ...(base.stats || {}), ...(rawPayload.stats || {}) },
    sections: { ...(base.sections || {}), ...(rawPayload.sections || {}) },
  };

  return mergeAssetsIntoPayload(safePayload, assets);
}
