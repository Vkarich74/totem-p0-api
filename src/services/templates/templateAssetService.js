import { TEMPLATE_ERROR_CODES } from "../../contracts/templates/templateErrorCodes.js";
import { TEMPLATE_SINGLETON_SLOT_TYPES } from "../../contracts/templates/templateConstants.js";
import { getAllowedSlotTypes } from "../../contracts/templates/templateSlotTypes.js";
import {
  activateSingletonTemplateAsset,
  createTemplateAsset,
  findTemplateAssetById,
  listTemplateAssets,
  updateTemplateAsset,
} from "../../repositories/templates/templateAssetRepository.js";

function assertSlot(ownerType, slotType){
  const allowed = getAllowedSlotTypes(ownerType);
  if (!allowed.includes(slotType)) {
    const error = new Error(TEMPLATE_ERROR_CODES.ASSET_SLOT_INVALID);
    error.status = 400;
    error.code = TEMPLATE_ERROR_CODES.ASSET_SLOT_INVALID;
    throw error;
  }
}

export async function listAssetsForOwner(db, ownerType, ownerSlug, filters = {}){
  return listTemplateAssets(db, ownerType, ownerSlug, filters);
}

export async function createAssetForOwner(db, ownerType, ownerSlug, asset){
  assertSlot(ownerType, asset.slot_type);
  if (!String(asset.public_id || "").trim()) {
    const error = new Error(TEMPLATE_ERROR_CODES.ASSET_PUBLIC_ID_MISSING);
    error.status = 400;
    error.code = TEMPLATE_ERROR_CODES.ASSET_PUBLIC_ID_MISSING;
    throw error;
  }
  if (!String(asset.secure_url || "").trim()) {
    const error = new Error(TEMPLATE_ERROR_CODES.ASSET_SECURE_URL_MISSING);
    error.status = 400;
    error.code = TEMPLATE_ERROR_CODES.ASSET_SECURE_URL_MISSING;
    throw error;
  }
  return createTemplateAsset(db, ownerType, ownerSlug, asset);
}

export async function patchAssetForOwner(db, ownerType, ownerSlug, assetId, patch){
  const current = await findTemplateAssetById(db, ownerType, ownerSlug, assetId);
  if (!current) {
    const error = new Error(TEMPLATE_ERROR_CODES.ASSET_NOT_FOUND);
    error.status = 404;
    error.code = TEMPLATE_ERROR_CODES.ASSET_NOT_FOUND;
    throw error;
  }
  return updateTemplateAsset(db, ownerType, ownerSlug, assetId, patch);
}

export async function activateSingletonAssetForOwner(db, ownerType, ownerSlug, assetId){
  const current = await findTemplateAssetById(db, ownerType, ownerSlug, assetId);
  if (!current) {
    const error = new Error(TEMPLATE_ERROR_CODES.ASSET_NOT_FOUND);
    error.status = 404;
    error.code = TEMPLATE_ERROR_CODES.ASSET_NOT_FOUND;
    throw error;
  }
  if (!TEMPLATE_SINGLETON_SLOT_TYPES.includes(current.slot_type)) {
    const error = new Error(TEMPLATE_ERROR_CODES.ASSET_SINGLETON_CONFLICT);
    error.status = 400;
    error.code = TEMPLATE_ERROR_CODES.ASSET_SINGLETON_CONFLICT;
    throw error;
  }
  return activateSingletonTemplateAsset(db, ownerType, ownerSlug, current.slot_type, assetId);
}

export async function deleteAssetForOwner(db, ownerType, ownerSlug, assetId){
  return patchAssetForOwner(db, ownerType, ownerSlug, assetId, { is_active: false });
}
