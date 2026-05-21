import {
  findBridgeRunByIdempotencyKey,
  insertReceivedBridgeRun,
  updateBridgeRunStatus,
  incrementBridgeRunAttempt,
} from "../../repositories/bridge/odooBridgeRunsRepository.js";

const ALLOWED_APPLICANT_TYPES = new Set(["salon", "master", "both", "needs_review"]);

const STABLE_STATUSES = {
  RECEIVED: "received",
  SKIPPED_DUPLICATE: "skipped_duplicate",
  NEEDS_REVIEW: "needs_review",
  PARTIAL: "partial",
  COMPLETED: "completed",
  FAILED: "failed",
};

const ERROR_CODES = {
  ODOO_LEAD_NOT_FOUND: "ODOO_LEAD_NOT_FOUND",
  MISSING_EMAIL: "MISSING_EMAIL",
  MISSING_NAME: "MISSING_NAME",
  UNKNOWN_APPLICANT_TYPE: "UNKNOWN_APPLICANT_TYPE",
  DUPLICATE_SLUG: "DUPLICATE_SLUG",
  DUPLICATE_EMAIL_ROLE: "DUPLICATE_EMAIL_ROLE",
  CORE_PROVISION_FAILED: "CORE_PROVISION_FAILED",
  CORE_PROVISION_NOT_CONNECTED: "CORE_PROVISION_NOT_CONNECTED",
  SCHEDULE_DATA_MISSING: "SCHEDULE_DATA_MISSING",
  SERVICE_DATA_MISSING: "SERVICE_DATA_MISSING",
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizePayloadForAudit(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const forbiddenKeys = new Set([
    "authorization",
    "password",
    "token",
    "api_key",
    "apiKey",
    "secret",
    "cookie",
    "cookies",
    "headers",
  ]);

  const sanitized = {};
  for (const [key, raw] of Object.entries(value)) {
    if (forbiddenKeys.has(String(key))) {
      continue;
    }

    if (isPlainObject(raw)) {
      sanitized[key] = sanitizePayloadForAudit(raw);
      continue;
    }

    if (Array.isArray(raw)) {
      sanitized[key] = raw.map((item) => (isPlainObject(item) ? sanitizePayloadForAudit(item) : item));
      continue;
    }

    sanitized[key] = raw;
  }

  return sanitized;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePayloadObject(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  return { ...value };
}

export function normalizeOdooRegistrationPayload(payload = {}) {
  const source = normalizeText(payload.source) || "odoo";
  const odooModel = normalizeText(payload.odoo_model || payload.odooModel);
  const odooId = normalizeText(payload.odoo_id ?? payload.odooId);
  const lead = normalizePayloadObject(payload.lead);
  const partner = normalizePayloadObject(payload.partner);
  const salon = normalizePayloadObject(payload.salon);
  const master = normalizePayloadObject(payload.master);
  const services = Array.isArray(payload.services) ? payload.services.map((item) => normalizePayloadObject(item)) : [];
  const workingHours = Array.isArray(payload.working_hours) ? payload.working_hours.map((item) => normalizePayloadObject(item)) : [];
  const contractTerms = normalizePayloadObject(payload.contract_terms);
  const meta = normalizePayloadObject(payload.meta);

  const applicantType = normalizeText(payload.applicant_type || payload.applicantType) || null;
  const idempotencyKey =
    normalizeText(payload.idempotency_key || payload.idempotencyKey) ||
    (odooModel && odooId ? `${odooModel}:${odooId}` : "");

  const email =
    normalizeText(lead.email_from) ||
    normalizeText(partner.email) ||
    normalizeText(master.email);

  const phone =
    normalizeText(lead.phone) ||
    normalizeText(partner.phone) ||
    normalizeText(master.phone);

  const name =
    normalizeText(lead.name) ||
    normalizeText(partner.name) ||
    normalizeText(salon.name) ||
    normalizeText(master.name);

  return {
    source,
    odooModel,
    odooId,
    idempotencyKey,
    lead,
    partner,
    salon,
    master,
    services,
    workingHours,
    contractTerms,
    meta,
    applicantType,
    email,
    phone,
    name,
    auditPayload: sanitizePayloadForAudit({
      ...normalizePayloadObject(payload),
      lead,
      partner,
      salon,
      master,
      services,
      workingHours,
      contractTerms,
      meta,
    }),
  };
}

function toTextMatch(value) {
  return normalizeText(value).toLowerCase();
}

function inspectTextSources(normalized = {}) {
  const lead = normalized.lead || {};
  const partner = normalized.partner || {};
  const meta = normalized.meta || {};

  const leadProperties = lead.lead_properties;
  const leadPropertiesText = isPlainObject(leadProperties)
    ? JSON.stringify(leadProperties)
    : Array.isArray(leadProperties)
      ? JSON.stringify(leadProperties)
      : normalizeText(leadProperties);

  return [
    toTextMatch(leadPropertiesText),
    toTextMatch(meta.team_name),
    toTextMatch(meta.stage_name),
    toTextMatch(meta.source_name),
    toTextMatch(lead.name),
    toTextMatch(partner.name),
  ].filter(Boolean);
}

export function inferApplicantType(normalized = {}) {
  const explicit = toTextMatch(normalized.applicantType);
  if (ALLOWED_APPLICANT_TYPES.has(explicit)) {
    return explicit;
  }

  const haystack = inspectTextSources(normalized).join(" | ");

  if (/(salon|салон|анкеты салонов|business)/i.test(haystack)) {
    return "salon";
  }

  if (/(master|мастер)/i.test(haystack) && /(both|mixed|team)/i.test(haystack)) {
    return "both";
  }

  if (/(master|мастер)/i.test(haystack)) {
    return "master";
  }

  if (/(both|mixed|team)/i.test(haystack)) {
    return "both";
  }

  return "needs_review";
}

export function validateOdooRegistrationPayload(normalized = {}) {
  const errors = [];

  if (normalized.source !== "odoo") {
    errors.push(ERROR_CODES.ODOO_LEAD_NOT_FOUND);
  }

  if (normalizeText(normalized.odooModel) !== "crm.lead") {
    errors.push(ERROR_CODES.ODOO_LEAD_NOT_FOUND);
  }

  if (!normalizeText(normalized.odooId)) {
    errors.push(ERROR_CODES.ODOO_LEAD_NOT_FOUND);
  }

  if (!normalizeText(normalized.idempotencyKey)) {
    errors.push("IDEMPOTENCY_KEY_REQUIRED");
  }

  if (!isPlainObject(normalized.lead) || Object.keys(normalized.lead).length === 0) {
    errors.push(ERROR_CODES.ODOO_LEAD_NOT_FOUND);
  }

  if (!normalizeText(normalized.email)) {
    errors.push(ERROR_CODES.MISSING_EMAIL);
  }

  if (!normalizeText(normalized.name)) {
    errors.push(ERROR_CODES.MISSING_NAME);
  }

  const applicantType = normalizeText(normalized.applicantType);
  if (!ALLOWED_APPLICANT_TYPES.has(applicantType)) {
    errors.push(ERROR_CODES.UNKNOWN_APPLICANT_TYPE);
  }

  const fatal = errors.includes(ERROR_CODES.MISSING_EMAIL) || errors.includes(ERROR_CODES.MISSING_NAME) || errors.includes(ERROR_CODES.ODOO_LEAD_NOT_FOUND);

  return {
    ok: errors.length === 0 || (!fatal && errors.every((code) => code === ERROR_CODES.UNKNOWN_APPLICANT_TYPE)),
    errors,
    fatal,
  };
}

export function buildBridgeResult(status, data = {}) {
  const normalizedStatus = normalizeText(status) || STABLE_STATUSES.FAILED;
  const core = isPlainObject(data.core) ? data.core : {};

  return {
    ok: normalizedStatus !== STABLE_STATUSES.FAILED,
    status: normalizedStatus,
    idempotency_key: normalizeText(data.idempotencyKey || data.idempotency_key),
    core: {
      salon_slug: core.salon_slug ?? null,
      master_slug: core.master_slug ?? null,
      public_url: core.public_url ?? null,
      cabinet_url: core.cabinet_url ?? null,
    },
    errors: Array.isArray(data.errors) ? data.errors : [],
  };
}

function buildStoredResponse(run) {
  if (!run) {
    return null;
  }

  const resultJson = isPlainObject(run.resultJson) ? run.resultJson : {};
  return buildBridgeResult(run.status, {
    idempotencyKey: run.idempotencyKey,
    core: {
      salon_slug: run.coreSalonSlug,
      master_slug: run.coreMasterSlug,
      public_url: run.corePublicUrl,
      cabinet_url: run.coreCabinetUrl,
    },
    errors: Array.isArray(resultJson.errors) ? resultJson.errors : (run.errorCode ? [run.errorCode] : []),
  });
}

function buildFailureResult(normalized, errors, status = STABLE_STATUSES.FAILED) {
  return buildBridgeResult(status, {
    idempotencyKey: normalized.idempotencyKey,
    core: {
      salon_slug: null,
      master_slug: null,
      public_url: null,
      cabinet_url: null,
    },
    errors,
  });
}

export async function processOdooRegistrationBridge(db, payload, options = {}) {
  const normalized = normalizeOdooRegistrationPayload(payload || {});
  const existing = await findBridgeRunByIdempotencyKey(db, normalized.idempotencyKey);

  if (existing) {
    if (existing.status === STABLE_STATUSES.RECEIVED) {
      return buildBridgeResult(STABLE_STATUSES.RECEIVED, {
        idempotencyKey: existing.idempotencyKey,
        core: {
          salon_slug: existing.coreSalonSlug,
          master_slug: existing.coreMasterSlug,
          public_url: existing.corePublicUrl,
          cabinet_url: existing.coreCabinetUrl,
        },
        errors: [],
      });
    }

    const replay = buildStoredResponse(existing);
    if (replay) {
      return replay;
    }
  }

  const received = await insertReceivedBridgeRun(db, {
    requestUid: options.requestUid || null,
    source: normalized.source,
    idempotencyKey: normalized.idempotencyKey,
    odooModel: normalized.odooModel,
    odooId: normalized.odooId,
    payloadJson: normalized.auditPayload,
  });

  const validation = validateOdooRegistrationPayload({
    ...normalized,
    applicantType: normalized.applicantType || inferApplicantType(normalized),
  });

  if (validation.fatal) {
    const failed = await updateBridgeRunStatus(db, normalized.idempotencyKey, {
      status: STABLE_STATUSES.FAILED,
      errorCode: validation.errors[0] || ERROR_CODES.CORE_PROVISION_FAILED,
      lastError: validation.errors.join(", "),
      resultJson: buildFailureResult(normalized, validation.errors, STABLE_STATUSES.FAILED),
      failedAt: new Date().toISOString(),
    });

    return buildStoredResponse(failed) || buildFailureResult(normalized, validation.errors, STABLE_STATUSES.FAILED);
  }

  const applicantType = inferApplicantType(normalized);
  const effectiveErrors = [...validation.errors];

  if (applicantType === "needs_review") {
    const updated = await updateBridgeRunStatus(db, normalized.idempotencyKey, {
      status: STABLE_STATUSES.NEEDS_REVIEW,
      errorCode: ERROR_CODES.UNKNOWN_APPLICANT_TYPE,
      lastError: ERROR_CODES.UNKNOWN_APPLICANT_TYPE,
      resultJson: buildBridgeResult(STABLE_STATUSES.NEEDS_REVIEW, {
        idempotencyKey: normalized.idempotencyKey,
        core: {
          salon_slug: null,
          master_slug: null,
          public_url: null,
          cabinet_url: null,
        },
        errors: [ERROR_CODES.UNKNOWN_APPLICANT_TYPE],
      }),
    });

    return buildStoredResponse(updated) || buildBridgeResult(STABLE_STATUSES.NEEDS_REVIEW, {
      idempotencyKey: normalized.idempotencyKey,
      core: {
        salon_slug: null,
        master_slug: null,
        public_url: null,
        cabinet_url: null,
      },
      errors: [ERROR_CODES.UNKNOWN_APPLICANT_TYPE],
    });
  }

  if (applicantType === "salon" || applicantType === "master" || applicantType === "both") {
    effectiveErrors.push(ERROR_CODES.CORE_PROVISION_NOT_CONNECTED);
    const updated = await updateBridgeRunStatus(db, normalized.idempotencyKey, {
      status: STABLE_STATUSES.PARTIAL,
      errorCode: ERROR_CODES.CORE_PROVISION_NOT_CONNECTED,
      lastError: ERROR_CODES.CORE_PROVISION_NOT_CONNECTED,
      resultJson: buildBridgeResult(STABLE_STATUSES.PARTIAL, {
        idempotencyKey: normalized.idempotencyKey,
        core: {
          salon_slug: null,
          master_slug: null,
          public_url: null,
          cabinet_url: null,
        },
        errors: effectiveErrors,
      }),
    });

    return buildStoredResponse(updated) || buildBridgeResult(STABLE_STATUSES.PARTIAL, {
      idempotencyKey: normalized.idempotencyKey,
      core: {
        salon_slug: null,
        master_slug: null,
        public_url: null,
        cabinet_url: null,
      },
      errors: effectiveErrors,
    });
  }

  const updated = await incrementBridgeRunAttempt(db, normalized.idempotencyKey, {
    status: STABLE_STATUSES.NEEDS_REVIEW,
    errorCode: ERROR_CODES.UNKNOWN_APPLICANT_TYPE,
    lastError: ERROR_CODES.UNKNOWN_APPLICANT_TYPE,
    resultJson: buildBridgeResult(STABLE_STATUSES.NEEDS_REVIEW, {
      idempotencyKey: normalized.idempotencyKey,
      core: {
        salon_slug: null,
        master_slug: null,
        public_url: null,
        cabinet_url: null,
      },
      errors: [ERROR_CODES.UNKNOWN_APPLICANT_TYPE],
    }),
  });

  return buildStoredResponse(updated) || buildBridgeResult(STABLE_STATUSES.NEEDS_REVIEW, {
    idempotencyKey: normalized.idempotencyKey,
    core: {
      salon_slug: null,
      master_slug: null,
      public_url: null,
      cabinet_url: null,
    },
    errors: [ERROR_CODES.UNKNOWN_APPLICANT_TYPE],
  });
}

export {
  ALLOWED_APPLICANT_TYPES,
  ERROR_CODES,
  STABLE_STATUSES,
  sanitizePayloadForAudit,
};
