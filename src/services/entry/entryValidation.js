import {
  buildPublicUrl,
  buildCabinetUrl,
  buildPublicAbsoluteUrl,
  buildCabinetAbsoluteUrl,
  buildAuthLoginUrl,
  validateOwnerType,
  validateCanonicalSlug
} from "./entryContract.js";
import { buildQrContract } from "./qrService.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function buildExpectedQrAbsoluteUrl(ownerType, canonicalSlug, baseUrl = null) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    return null;
  }

  return `${normalizedBaseUrl}/entry/${ownerType}/${canonicalSlug}/qr.png`;
}

function isCabinetStyleUrl(value) {
  return String(value || "").includes("/#/");
}

export function validateEntryContractShape(contract = {}, baseUrl = null) {
  const ownerType = validateOwnerType(contract.owner_type);
  const canonicalSlug = validateCanonicalSlug(contract.canonical_slug);

  const expectedPublicUrl = buildPublicUrl(ownerType, canonicalSlug);
  const expectedCabinetUrl = buildCabinetUrl(ownerType, canonicalSlug);
  const expectedPublicAbsoluteUrl = buildPublicAbsoluteUrl(ownerType, canonicalSlug, baseUrl);
  const expectedCabinetAbsoluteUrl = buildCabinetAbsoluteUrl(ownerType, canonicalSlug, baseUrl);
  const expectedAuth = buildAuthLoginUrl(ownerType, canonicalSlug, baseUrl);
  const expectedQr = buildQrContract({
    owner_type: ownerType,
    canonical_slug: canonicalSlug,
    owner_id: contract.owner_id ?? null
  });

  const lifecycleState = normalizeText(contract.lifecycle_state).toLowerCase();
  const accessState = normalizeText(contract.access_state).toLowerCase();

  const publicAbsoluteUrlMatches =
    !expectedPublicAbsoluteUrl || contract.public_absolute_url === expectedPublicAbsoluteUrl;

  const cabinetAbsoluteUrlMatches =
    !expectedCabinetAbsoluteUrl || contract.cabinet_absolute_url === expectedCabinetAbsoluteUrl;

  const authLoginAbsoluteUrlMatches =
    !expectedAuth.auth_login_absolute_url ||
    contract.auth_login_absolute_url === expectedAuth.auth_login_absolute_url;

  return {
    owner_type_valid: contract.owner_type === ownerType,
    canonical_slug_valid: contract.canonical_slug === canonicalSlug,

    public_url_valid: contract.public_url === expectedPublicUrl,
    cabinet_url_valid: contract.cabinet_url === expectedCabinetUrl,

    public_absolute_url_valid: publicAbsoluteUrlMatches,
    cabinet_absolute_url_valid: cabinetAbsoluteUrlMatches,

    entry_url_valid: contract.entry_url === expectedPublicUrl,
    entry_mode_valid: contract.entry_mode === "public",

    auth_login_url_valid: contract.auth_login_url === expectedAuth.auth_login_url,
    auth_login_absolute_url_valid: authLoginAbsoluteUrlMatches,
    auth_required_for_cabinet_valid: contract.auth_required_for_cabinet === true,

    lifecycle_state_present: Boolean(lifecycleState),
    access_state_present: Boolean(accessState),

    entry_allowed_boolean: typeof contract.entry_allowed === "boolean",
    qr_allowed_boolean: typeof contract.qr_allowed === "boolean",
    ready_to_open_boolean: typeof contract.ready_to_open === "boolean",

    qr_target_matches_public_absolute_url:
      contract.public_absolute_url === expectedQr.qr.qr_target_url,

    qr_target_is_not_cabinet:
      !isCabinetStyleUrl(expectedQr.qr.qr_target_url),

    cabinet_url_is_not_qr_target:
      contract.cabinet_absolute_url !== expectedQr.qr.qr_target_url
  };
}

export function buildEntryValidationSnapshot(resolvedEntry, authSnapshot = null, baseUrl = null) {
  const contract = resolvedEntry?.contract;

  if (!contract) {
    const err = new Error("ENTRY_CONTRACT_REQUIRED");
    err.code = "ENTRY_CONTRACT_REQUIRED";
    throw err;
  }

  const ownerType = validateOwnerType(contract.owner_type);
  const canonicalSlug = validateCanonicalSlug(contract.canonical_slug);

  const shape = validateEntryContractShape(contract, baseUrl);
  const allContractChecksPassed = Object.values(shape).every(Boolean);

  const publicAllowed = Boolean(contract.entry_allowed);
  const qrAllowed = Boolean(contract.qr_allowed);
  const authRequired = contract.auth_required_for_cabinet === true;

  const qr = buildQrContract({
    owner_type: ownerType,
    canonical_slug: canonicalSlug,
    owner_id: contract.owner_id ?? null
  });

  const expectedQrImageUrl = buildExpectedQrAbsoluteUrl(ownerType, canonicalSlug, baseUrl);

  return {
    owner_type: contract.owner_type,
    owner_id: contract.owner_id,
    canonical_slug: contract.canonical_slug,

    contract_shape: shape,
    contract_shape_ok: allContractChecksPassed,

    expected_http: {
      entry_metadata_status: publicAllowed ? 200 : 403,
      qr_payload_status: qrAllowed ? 200 : 403,
      qr_png_status: qrAllowed ? 200 : 403,
      auth_snapshot_status: 200,
      cabinet_status_without_auth: 403,
      cabinet_status_with_auth: authSnapshot?.can_open_cabinet ? 200 : 403
    },

    policy: {
      public_entry_allowed: publicAllowed,
      qr_allowed: qrAllowed,
      auth_required_for_cabinet: authRequired,
      lifecycle_state: contract.lifecycle_state,
      access_state: contract.access_state,
      ready_to_open: Boolean(contract.ready_to_open),

      qr_scope: qr.qr.qr_scope,
      qr_target_type: qr.qr.qr_target_type,
      qr_public_only: qr.qr.qr_scope === "public_only",
      cabinet_qr_forbidden: true
    },

    expected_payloads: {
      qr_payload: qr.qr.qr_target_url,
      qr_target_url: qr.qr.qr_target_url,
      qr_image_url: expectedQrImageUrl,

      public_url: contract.public_url,
      public_absolute_url: contract.public_absolute_url,

      cabinet_url: contract.cabinet_url,
      cabinet_absolute_url: contract.cabinet_absolute_url,

      auth_login_url: contract.auth_login_url,
      auth_login_absolute_url: contract.auth_login_absolute_url
    }
  };
}

export default {
  validateEntryContractShape,
  buildEntryValidationSnapshot
};