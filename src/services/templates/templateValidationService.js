import { TEMPLATE_OWNER_TYPES } from "../../contracts/templates/templateConstants.js";
import { TEMPLATE_ERROR_CODES } from "../../contracts/templates/templateErrorCodes.js";

function normalizeString(value){
  return String(value || "").trim();
}

function hasActiveItems(list, requiredField = null){
  if (!Array.isArray(list)) return false;
  return list.some((item) => {
    if (!item || item.is_active === false) return false;
    if (!requiredField) return true;
    return normalizeString(item[requiredField]).length > 0;
  });
}

function pushHardError(errors, section, field, code, message){
  errors.push({ code, section, field, message });
}

function pushWarning(warnings, section, field, code, message){
  warnings.push({ code, section, field, message });
}

function computeSectionStatus(hardErrors, warnings, section){
  if (hardErrors.some((item) => item.section === section)) return "blocked";
  if (warnings.some((item) => item.section === section)) return "warning";
  return "valid";
}

function scoreSection(isValid, partialWeight, fullWeight){
  if (isValid) return fullWeight;
  return partialWeight;
}

function validateSalonDraft(draft){
  const errors = [];
  const warnings = [];

  const salonName = normalizeString(draft?.identity?.salon_name);
  const slogan = normalizeString(draft?.identity?.slogan);
  const subtitle = normalizeString(draft?.identity?.subtitle);
  const address = normalizeString(draft?.contact?.address);
  const mapEmbedUrl = normalizeString(draft?.contact?.map_embed_url);
  const phone = normalizeString(draft?.contact?.phone);
  const whatsapp = normalizeString(draft?.contact?.whatsapp);
  const bookingLabel = normalizeString(draft?.cta?.booking_label);
  const bookingUrl = normalizeString(draft?.cta?.booking_url);
  const heroImageId = draft?.images?.hero?.image_asset_id || null;
  const servicesOk = hasActiveItems(draft?.sections?.popular_services, "name") || hasActiveItems(draft?.sections?.full_service_list, "name");
  const aboutOk = hasActiveItems(draft?.sections?.about_paragraphs, "text");

  if (!salonName) pushHardError(errors, "identity", "salon_name", "IDENTITY_NAME_MISSING", "Salon name is required.");
  if (!slogan && !subtitle) pushHardError(errors, "identity", "slogan", "IDENTITY_SLOGAN_MISSING", "Slogan or subtitle is required.");
  if (!address && !mapEmbedUrl) pushHardError(errors, "contacts", "address", "LOCATION_MISSING", "Address or map is required.");
  if (!phone && !whatsapp) pushHardError(errors, "contacts", "phone", "CONTACT_PATH_MISSING", "Phone or WhatsApp is required.");
  if (!heroImageId) pushHardError(errors, "images", "hero.image_asset_id", "HERO_IMAGE_MISSING", "Hero image is required.");
  if (!servicesOk) pushHardError(errors, "services", "sections", "SERVICE_REQUIRED", "At least one active service is required.");
  if (!aboutOk) pushHardError(errors, "about", "sections.about_paragraphs", "ABOUT_REQUIRED", "At least one active about paragraph is required.");
  if (!bookingLabel) pushHardError(errors, "cta", "booking_label", "CTA_BOOKING_LABEL_MISSING", "Booking button label is required.");
  if (!bookingUrl) pushHardError(errors, "cta", "booking_url", "CTA_BOOKING_URL_MISSING", "Booking URL is required.");

  if (!normalizeString(draft?.trust?.rating_value)) pushWarning(warnings, "trust", "rating_value", "TRUST_EMPTY", "Trust rating is empty.");
  if (!Array.isArray(draft?.sections?.reviews) || draft.sections.reviews.length === 0) pushWarning(warnings, "reviews", "sections.reviews", "REVIEWS_EMPTY", "Reviews are empty.");
  if (!Array.isArray(draft?.sections?.gallery) || draft.sections.gallery.length === 0) pushWarning(warnings, "images", "sections.gallery", "GALLERY_EMPTY", "Gallery is empty.");
  if (!normalizeString(draft?.seo?.title) || !normalizeString(draft?.seo?.description)) pushWarning(warnings, "seo", "seo", "SEO_EMPTY", "SEO metadata is incomplete.");

  const sectionStatus = {
    identity: computeSectionStatus(errors, warnings, "identity"),
    contacts: computeSectionStatus(errors, warnings, "contacts"),
    trust: computeSectionStatus(errors, warnings, "trust"),
    services: computeSectionStatus(errors, warnings, "services"),
    images: computeSectionStatus(errors, warnings, "images"),
    about: computeSectionStatus(errors, warnings, "about"),
    reviews: computeSectionStatus(errors, warnings, "reviews"),
    map: computeSectionStatus(errors, warnings, "contacts"),
    cta: computeSectionStatus(errors, warnings, "cta"),
    seo: computeSectionStatus(errors, warnings, "seo"),
    publish: errors.length ? "blocked" : "valid",
  };

  const completenessScore = Math.max(0, Math.min(100,
    scoreSection(!!salonName && (!!slogan || !!subtitle), 0, 15) +
    scoreSection(!!address || !!mapEmbedUrl, 0, 15) +
    scoreSection(servicesOk, 0, 20) +
    scoreSection(!!heroImageId, 0, 15) +
    scoreSection(aboutOk, 0, 10) +
    scoreSection(!!bookingLabel && !!bookingUrl, 0, 15) +
    scoreSection(!!normalizeString(draft?.trust?.rating_value), 0, 5) +
    scoreSection(Array.isArray(draft?.sections?.reviews) && draft.sections.reviews.length > 0, 0, 3) +
    scoreSection(!!normalizeString(draft?.seo?.title) && !!normalizeString(draft?.seo?.description), 0, 2)
  ));

  return {
    is_ready_for_preview: !!salonName && !!bookingLabel && !!bookingUrl,
    is_publishable: errors.length === 0,
    completeness_score: completenessScore,
    hard_errors: errors,
    warnings,
    section_status: sectionStatus,
    validated_at: new Date().toISOString(),
  };
}

function validateMasterDraft(draft){
  const errors = [];
  const warnings = [];

  const masterName = normalizeString(draft?.identity?.master_name);
  const profession = normalizeString(draft?.identity?.profession);
  const address = normalizeString(draft?.location?.address);
  const mapUrl = normalizeString(draft?.location?.map_url);
  const phone = normalizeString(draft?.location?.phone);
  const whatsapp = normalizeString(draft?.location?.whatsapp);
  const bookingLabel = normalizeString(draft?.cta?.booking_label);
  const bookingUrl = normalizeString(draft?.cta?.booking_url);
  const heroImageId = draft?.images?.hero?.image_asset_id || null;
  const servicesOk = hasActiveItems(draft?.sections?.featured_services, "title") || hasActiveItems(draft?.sections?.service_catalog, "name");
  const aboutOk = hasActiveItems(draft?.sections?.about_paragraphs, "text");

  if (!masterName) pushHardError(errors, "identity", "master_name", "IDENTITY_NAME_MISSING", "Master name is required.");
  if (!profession) pushHardError(errors, "identity", "profession", "IDENTITY_PROFESSION_MISSING", "Profession is required.");
  if (!address && !mapUrl) pushHardError(errors, "contacts", "address", "LOCATION_MISSING", "Address or map is required.");
  if (!phone && !whatsapp) pushHardError(errors, "contacts", "phone", "CONTACT_PATH_MISSING", "Phone or WhatsApp is required.");
  if (!heroImageId) pushHardError(errors, "images", "hero.image_asset_id", "HERO_IMAGE_MISSING", "Hero image is required.");
  if (!servicesOk) pushHardError(errors, "services", "sections", "SERVICE_REQUIRED", "At least one active service is required.");
  if (!aboutOk) pushHardError(errors, "about", "sections.about_paragraphs", "ABOUT_REQUIRED", "At least one active about paragraph is required.");
  if (!bookingLabel) pushHardError(errors, "cta", "booking_label", "CTA_BOOKING_LABEL_MISSING", "Booking button label is required.");
  if (!bookingUrl) pushHardError(errors, "cta", "booking_url", "CTA_BOOKING_URL_MISSING", "Booking URL is required.");

  if (!Array.isArray(draft?.sections?.reviews) || draft.sections.reviews.length === 0) pushWarning(warnings, "reviews", "sections.reviews", "REVIEWS_EMPTY", "Reviews are empty.");
  if (!Array.isArray(draft?.sections?.portfolio) || draft.sections.portfolio.length === 0) pushWarning(warnings, "images", "sections.portfolio", "PORTFOLIO_EMPTY", "Portfolio is empty.");
  if (!normalizeString(draft?.seo?.title) || !normalizeString(draft?.seo?.description)) pushWarning(warnings, "seo", "seo", "SEO_EMPTY", "SEO metadata is incomplete.");

  const sectionStatus = {
    identity: computeSectionStatus(errors, warnings, "identity"),
    contacts: computeSectionStatus(errors, warnings, "contacts"),
    trust: computeSectionStatus(errors, warnings, "trust"),
    services: computeSectionStatus(errors, warnings, "services"),
    images: computeSectionStatus(errors, warnings, "images"),
    about: computeSectionStatus(errors, warnings, "about"),
    reviews: computeSectionStatus(errors, warnings, "reviews"),
    map: computeSectionStatus(errors, warnings, "contacts"),
    cta: computeSectionStatus(errors, warnings, "cta"),
    seo: computeSectionStatus(errors, warnings, "seo"),
    publish: errors.length ? "blocked" : "valid",
  };

  const completenessScore = Math.max(0, Math.min(100,
    scoreSection(!!masterName && !!profession, 0, 15) +
    scoreSection(!!address || !!mapUrl, 0, 15) +
    scoreSection(servicesOk, 0, 20) +
    scoreSection(!!heroImageId, 0, 15) +
    scoreSection(aboutOk, 0, 10) +
    scoreSection(!!bookingLabel && !!bookingUrl, 0, 15) +
    scoreSection(Array.isArray(draft?.sections?.reviews) && draft.sections.reviews.length > 0, 0, 5) +
    scoreSection(Array.isArray(draft?.sections?.portfolio) && draft.sections.portfolio.length > 0, 0, 3) +
    scoreSection(!!normalizeString(draft?.seo?.title) && !!normalizeString(draft?.seo?.description), 0, 2)
  ));

  return {
    is_ready_for_preview: !!masterName && !!profession && !!bookingLabel && !!bookingUrl,
    is_publishable: errors.length === 0,
    completeness_score: completenessScore,
    hard_errors: errors,
    warnings,
    section_status: sectionStatus,
    validated_at: new Date().toISOString(),
  };
}

export function validateTemplateDraft(ownerType, draft){
  if (!TEMPLATE_OWNER_TYPES.includes(ownerType)) {
    const error = new Error(TEMPLATE_ERROR_CODES.OWNER_TYPE_INVALID);
    error.status = 400;
    error.code = TEMPLATE_ERROR_CODES.OWNER_TYPE_INVALID;
    throw error;
  }

  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    const error = new Error(TEMPLATE_ERROR_CODES.DRAFT_PAYLOAD_INVALID);
    error.status = 400;
    error.code = TEMPLATE_ERROR_CODES.DRAFT_PAYLOAD_INVALID;
    throw error;
  }

  return ownerType === "master" ? validateMasterDraft(draft) : validateSalonDraft(draft);
}
