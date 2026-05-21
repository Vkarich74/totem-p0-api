const TABLE = "public.odoo_bridge_runs";

const ALLOWED_STATUSES = new Set([
  "received",
  "skipped_duplicate",
  "needs_review",
  "partial",
  "completed",
  "failed",
]);

function ensurePlainObject(value, fieldName = "value") {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    const error = new Error(`INVALID_${String(fieldName || "VALUE").toUpperCase()}`);
    error.code = `INVALID_${String(fieldName || "VALUE").toUpperCase()}`;
    error.status = 400;
    throw error;
  }

  return value;
}

function toDbJson(value, fieldName = "value") {
  return JSON.stringify(ensurePlainObject(value, fieldName));
}

function normalizeBridgeRun(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id ?? null,
    requestUid: row.request_uid ?? null,
    source: row.source ?? null,
    idempotencyKey: row.idempotency_key ?? null,
    odooModel: row.odoo_model ?? null,
    odooId: row.odoo_id ?? null,
    payloadJson: row.payload_json ?? {},
    resultJson: row.result_json ?? {},
    status: row.status ?? null,
    errorCode: row.error_code ?? null,
    attemptCount: row.attempt_count ?? null,
    lastError: row.last_error ?? null,
    coreSalonSlug: row.core_salon_slug ?? null,
    coreMasterSlug: row.core_master_slug ?? null,
    corePublicUrl: row.core_public_url ?? null,
    coreCabinetUrl: row.core_cabinet_url ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    completedAt: row.completed_at ?? null,
    failedAt: row.failed_at ?? null,
  };
}

async function ensureBridgeRunTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id                BIGSERIAL PRIMARY KEY,
      request_uid       UUID NULL,
      source            TEXT NOT NULL DEFAULT 'odoo',
      idempotency_key   TEXT NOT NULL,
      odoo_model        TEXT NOT NULL,
      odoo_id           TEXT NOT NULL,
      payload_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
      result_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
      status            TEXT NOT NULL,
      error_code        TEXT NULL,
      attempt_count     INTEGER NOT NULL DEFAULT 1,
      last_error        TEXT NULL,
      core_salon_slug   TEXT NULL,
      core_master_slug  TEXT NULL,
      core_public_url   TEXT NULL,
      core_cabinet_url  TEXT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at      TIMESTAMPTZ NULL,
      failed_at         TIMESTAMPTZ NULL,
      CONSTRAINT odoo_bridge_runs_source_check
        CHECK (source IN ('odoo')),
      CONSTRAINT odoo_bridge_runs_status_check
        CHECK (status IN ('received','skipped_duplicate','needs_review','partial','completed','failed')),
      CONSTRAINT odoo_bridge_runs_payload_json_check
        CHECK (jsonb_typeof(payload_json) = 'object'),
      CONSTRAINT odoo_bridge_runs_result_json_check
        CHECK (jsonb_typeof(result_json) = 'object')
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_odoo_bridge_runs_idempotency_key
      ON ${TABLE}(idempotency_key);

    CREATE INDEX IF NOT EXISTS ix_odoo_bridge_runs_source_model_id
      ON ${TABLE}(source, odoo_model, odoo_id);

    CREATE INDEX IF NOT EXISTS ix_odoo_bridge_runs_status
      ON ${TABLE}(status);

    CREATE INDEX IF NOT EXISTS ix_odoo_bridge_runs_created_at
      ON ${TABLE}(created_at DESC);

    CREATE INDEX IF NOT EXISTS ix_odoo_bridge_runs_core_salon_slug
      ON ${TABLE}(core_salon_slug);

    CREATE INDEX IF NOT EXISTS ix_odoo_bridge_runs_core_master_slug
      ON ${TABLE}(core_master_slug);
  `);
}

function assertAllowedStatus(status) {
  const normalized = String(status || "").trim();
  if (!ALLOWED_STATUSES.has(normalized)) {
    const error = new Error("INVALID_BRIDGE_STATUS");
    error.code = "INVALID_BRIDGE_STATUS";
    error.status = 400;
    throw error;
  }
  return normalized;
}

export async function findBridgeRunByIdempotencyKey(db, idempotencyKey) {
  await ensureBridgeRunTable(db);

  const result = await db.query(
    `
      SELECT *
      FROM ${TABLE}
      WHERE idempotency_key = $1
      LIMIT 1
    `,
    [String(idempotencyKey || "").trim()]
  );

  return normalizeBridgeRun(result.rows[0] || null);
}

export async function insertReceivedBridgeRun(db, input = {}) {
  await ensureBridgeRunTable(db);

  const source = String(input.source || "odoo").trim() || "odoo";
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  const odooModel = String(input.odooModel || "").trim();
  const odooId = String(input.odooId ?? "").trim();
  const payloadJson = ensurePlainObject(input.payloadJson, "payloadJson");
  const requestUid = input.requestUid ? String(input.requestUid).trim() : null;

  if (!idempotencyKey) {
    const error = new Error("IDEMPOTENCY_KEY_REQUIRED");
    error.code = "IDEMPOTENCY_KEY_REQUIRED";
    error.status = 400;
    throw error;
  }

  if (!odooModel) {
    const error = new Error("ODOO_MODEL_REQUIRED");
    error.code = "ODOO_MODEL_REQUIRED";
    error.status = 400;
    throw error;
  }

  if (!odooId) {
    const error = new Error("ODOO_ID_REQUIRED");
    error.code = "ODOO_ID_REQUIRED";
    error.status = 400;
    throw error;
  }

  await db.query(
    `
      INSERT INTO ${TABLE} (
        request_uid,
        source,
        idempotency_key,
        odoo_model,
        odoo_id,
        payload_json,
        result_json,
        status,
        attempt_count,
        created_at,
        updated_at
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::jsonb,
        '{}'::jsonb,
        'received',
        1,
        now(),
        now()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `,
    [
      requestUid,
      source,
      idempotencyKey,
      odooModel,
      odooId,
      toDbJson(payloadJson, "payloadJson"),
    ]
  );

  return findBridgeRunByIdempotencyKey(db, idempotencyKey);
}

export async function updateBridgeRunStatus(db, idempotencyKey, patch = {}) {
  await ensureBridgeRunTable(db);

  const status = assertAllowedStatus(patch.status);
  const fields = [];
  const values = [];

  values.push(status);
  fields.push(`status = $${values.length}`);

  if (Object.prototype.hasOwnProperty.call(patch, "resultJson")) {
    values.push(toDbJson(patch.resultJson, "resultJson"));
    fields.push(`result_json = $${values.length}::jsonb`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "errorCode")) {
    values.push(patch.errorCode ?? null);
    fields.push(`error_code = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "lastError")) {
    values.push(patch.lastError ?? null);
    fields.push(`last_error = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "coreSalonSlug")) {
    values.push(patch.coreSalonSlug ?? null);
    fields.push(`core_salon_slug = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "coreMasterSlug")) {
    values.push(patch.coreMasterSlug ?? null);
    fields.push(`core_master_slug = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "corePublicUrl")) {
    values.push(patch.corePublicUrl ?? null);
    fields.push(`core_public_url = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "coreCabinetUrl")) {
    values.push(patch.coreCabinetUrl ?? null);
    fields.push(`core_cabinet_url = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "completedAt")) {
    values.push(patch.completedAt ?? null);
    fields.push(`completed_at = $${values.length}`);
  } else if (status === "completed") {
    fields.push(`completed_at = COALESCE(completed_at, now())`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "failedAt")) {
    values.push(patch.failedAt ?? null);
    fields.push(`failed_at = $${values.length}`);
  } else if (status === "failed") {
    fields.push(`failed_at = COALESCE(failed_at, now())`);
  }

  fields.push(`updated_at = now()`);

  values.push(String(idempotencyKey || "").trim());

  const result = await db.query(
    `
      UPDATE ${TABLE}
      SET ${fields.join(", ")}
      WHERE idempotency_key = $${values.length}
      RETURNING *
    `,
    values
  );

  return normalizeBridgeRun(result.rows[0] || null);
}

export async function incrementBridgeRunAttempt(db, idempotencyKey, patch = {}) {
  await ensureBridgeRunTable(db);

  const status = patch.status !== undefined ? assertAllowedStatus(patch.status) : null;
  const fields = [];
  const values = [];

  if (status) {
    values.push(status);
    fields.push(`status = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "resultJson")) {
    values.push(toDbJson(patch.resultJson, "resultJson"));
    fields.push(`result_json = $${values.length}::jsonb`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "errorCode")) {
    values.push(patch.errorCode ?? null);
    fields.push(`error_code = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "lastError")) {
    values.push(patch.lastError ?? null);
    fields.push(`last_error = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "coreSalonSlug")) {
    values.push(patch.coreSalonSlug ?? null);
    fields.push(`core_salon_slug = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "coreMasterSlug")) {
    values.push(patch.coreMasterSlug ?? null);
    fields.push(`core_master_slug = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "corePublicUrl")) {
    values.push(patch.corePublicUrl ?? null);
    fields.push(`core_public_url = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "coreCabinetUrl")) {
    values.push(patch.coreCabinetUrl ?? null);
    fields.push(`core_cabinet_url = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "completedAt")) {
    values.push(patch.completedAt ?? null);
    fields.push(`completed_at = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "failedAt")) {
    values.push(patch.failedAt ?? null);
    fields.push(`failed_at = $${values.length}`);
  }

  fields.push(`attempt_count = attempt_count + 1`);
  fields.push(`updated_at = now()`);

  values.push(String(idempotencyKey || "").trim());

  const result = await db.query(
    `
      UPDATE ${TABLE}
      SET ${fields.join(", ")}
      WHERE idempotency_key = $${values.length}
      RETURNING *
    `,
    values
  );

  return normalizeBridgeRun(result.rows[0] || null);
}
