import { TEMPLATE_OWNER_TYPES, TEMPLATE_VERSION_V1 } from "../../contracts/templates/templateConstants.js";
import { TEMPLATE_ERROR_CODES } from "../../contracts/templates/templateErrorCodes.js";
import { createDefaultTemplateDocument } from "./templateDefaultFactory.js";
import { validateTemplateDraft } from "./templateValidationService.js";
import { normalizeTemplatePayload } from "./templateNormalizationService.js";
import {
  createTemplateDocument,
  findTemplateDocumentByOwner,
  updateTemplateDraft,
} from "../../repositories/templates/templateDocumentRepository.js";
import { listTemplateAssets } from "../../repositories/templates/templateAssetRepository.js";
import { listTemplatePublishLogs } from "../../repositories/templates/templatePublishLogRepository.js";

function assertOwner(ownerType, ownerSlug){
  if (!TEMPLATE_OWNER_TYPES.includes(ownerType)) {
    const error = new Error(TEMPLATE_ERROR_CODES.OWNER_TYPE_INVALID);
    error.status = 400;
    error.code = TEMPLATE_ERROR_CODES.OWNER_TYPE_INVALID;
    throw error;
  }
  if (!String(ownerSlug || "").trim()) {
    const error = new Error(TEMPLATE_ERROR_CODES.OWNER_SLUG_MISSING);
    error.status = 400;
    error.code = TEMPLATE_ERROR_CODES.OWNER_SLUG_MISSING;
    throw error;
  }
}

export async function getOrCreateTemplateDocument(db, ownerType, ownerSlug, templateVersion = TEMPLATE_VERSION_V1){
  assertOwner(ownerType, ownerSlug);
  let document = await findTemplateDocumentByOwner(db, ownerType, ownerSlug, templateVersion);

  if (!document) {
    const created = createDefaultTemplateDocument(ownerType, ownerSlug, templateVersion);
    created.validation = validateTemplateDraft(ownerType, created.draft);
    created.status = {
      ...created.status,
      is_publishable: created.validation.is_publishable,
    };
    created.meta = {
      ...created.meta,
      updated_at: new Date().toISOString(),
    };
    document = await createTemplateDocument(db, created);
  }

  return document;
}

export async function saveTemplateDraft(db, ownerType, ownerSlug, templateVersion = TEMPLATE_VERSION_V1, draft, editedBy = null){
  const current = await getOrCreateTemplateDocument(db, ownerType, ownerSlug, templateVersion);
  const validation = validateTemplateDraft(ownerType, draft);
  const meta = {
    ...(current.meta || {}),
    updated_at: new Date().toISOString(),
    last_saved_at: new Date().toISOString(),
    edited_by: editedBy,
  };
  const status = {
    ...(current.status || {}),
    draft_exists: true,
    is_dirty: true,
    is_publishable: validation.is_publishable,
    publish_state: current.status?.published_exists ? "published" : "draft",
  };

  return updateTemplateDraft(db, ownerType, ownerSlug, templateVersion, draft, validation, status, meta);
}

export async function getPreviewSource(db, ownerType, ownerSlug, templateVersion = TEMPLATE_VERSION_V1){
  const document = await getOrCreateTemplateDocument(db, ownerType, ownerSlug, templateVersion);
  const validation = validateTemplateDraft(ownerType, document.draft || {});

  if (!validation.is_ready_for_preview) {
    const error = new Error(TEMPLATE_ERROR_CODES.PREVIEW_NOT_READY);
    error.status = 400;
    error.code = TEMPLATE_ERROR_CODES.PREVIEW_NOT_READY;
    error.validation = validation;
    throw error;
  }

  const assets = await listTemplateAssets(db, ownerType, ownerSlug, { active_only: true });
  const payload = normalizeTemplatePayload(ownerType, document.draft || {}, assets);

  return {
    validation,
    payload,
  };
}

export async function getPublishedSource(db, ownerType, ownerSlug, templateVersion = TEMPLATE_VERSION_V1){
  const document = await getOrCreateTemplateDocument(db, ownerType, ownerSlug, templateVersion);
  const assets = await listTemplateAssets(db, ownerType, ownerSlug, { active_only: true });
  return {
    document,
    payload: normalizeTemplatePayload(ownerType, document.published || {}, assets),
  };
}

export async function getTemplatePublishLog(db, ownerType, ownerSlug, templateVersion = TEMPLATE_VERSION_V1, limit = 20){
  await getOrCreateTemplateDocument(db, ownerType, ownerSlug, templateVersion);
  return listTemplatePublishLogs(db, ownerType, ownerSlug, templateVersion, limit);
}
