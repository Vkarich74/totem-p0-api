import { TEMPLATE_ERROR_CODES } from "../../contracts/templates/templateErrorCodes.js";
import { TEMPLATE_VERSION_V1 } from "../../contracts/templates/templateConstants.js";
import { validateTemplateDraft } from "./templateValidationService.js";
import { normalizeTemplatePayload } from "./templateNormalizationService.js";
import { getOrCreateTemplateDocument } from "./templateDocumentService.js";
import { updateTemplatePublished } from "../../repositories/templates/templateDocumentRepository.js";
import { listTemplateAssets } from "../../repositories/templates/templateAssetRepository.js";
import { createTemplatePublishLog } from "../../repositories/templates/templatePublishLogRepository.js";

export async function publishTemplateDraft(
  db,
  ownerType,
  ownerSlug,
  templateVersion = TEMPLATE_VERSION_V1,
  publishedBy = null
) {
  const document = await getOrCreateTemplateDocument(
    db,
    ownerType,
    ownerSlug,
    templateVersion
  );

  const validation = validateTemplateDraft(
    ownerType,
    document.draft || {}
  );

  if (!validation.is_publishable) {
    const error = new Error(TEMPLATE_ERROR_CODES.PUBLISH_BLOCKED);
    error.status = 400;
    error.code = TEMPLATE_ERROR_CODES.PUBLISH_BLOCKED;
    error.validation = validation;
    throw error;
  }

  const assets = await listTemplateAssets(db, ownerType, ownerSlug, {
    active_only: true,
  });

  // ❗ жёсткая проверка assets
  if (!Array.isArray(assets)) {
    const error = new Error("ASSETS_INVALID");
    error.status = 500;
    throw error;
  }

  const published = normalizeTemplatePayload(
    ownerType,
    document.draft || {},
    assets
  );

  const now = new Date().toISOString();

  const meta = {
    ...(document.meta || {}),
    updated_at: now,
    last_published_at: now,
    published_by: publishedBy,
  };

  const status = {
    ...(document.status || {}),
    published_exists: true,
    is_dirty: false,
    is_publishable: true,
    publish_state: "published",
  };

  // ❗ snapshot (immutable copy)
  const publishedSnapshot = JSON.parse(JSON.stringify(published));
  const validationSnapshot = JSON.parse(JSON.stringify(validation));

  const updated = await updateTemplatePublished(
    db,
    ownerType,
    ownerSlug,
    templateVersion,
    publishedSnapshot,
    validationSnapshot,
    status,
    meta
  );

  await createTemplatePublishLog(db, {
    owner_type: ownerType,
    owner_slug: ownerSlug,
    template_version: templateVersion,
    published_by: publishedBy,
    publish_result: "success",
    published_snapshot: publishedSnapshot,
    validation_snapshot: validationSnapshot,
    created_at: now,
  });

  return updated;
}
