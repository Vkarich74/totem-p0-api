import express from "express";
import { pool } from "../db.js";
import { getLeadDbIdById } from "./admin.leads.js";

const router = express.Router();
const cases = new Map();
let nextCaseId = 1;

const CASE_ENTITY_TYPES = new Set(["salon", "master", "client", "booking", "lead"]);
const CASE_STATUSES = new Set(["open", "in_review", "resolved", "dismissed", "escalated"]);
const CASE_PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const CASE_ACTIONS = new Set([
  "assign_case",
  "resolve_case",
  "dismiss_case",
  "escalate_case",
  "suspend_entity",
  "unsuspend_entity",
]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeCaseEntityType(value) {
  const entityType = normalizeText(value).toLowerCase();
  return CASE_ENTITY_TYPES.has(entityType) ? entityType : "";
}

function normalizeCaseStatus(value) {
  const status = normalizeText(value).toLowerCase();
  return CASE_STATUSES.has(status) ? status : "";
}

function normalizeCasePriority(value) {
  const priority = normalizeText(value).toLowerCase();
  return CASE_PRIORITIES.has(priority) ? priority : "";
}

function normalizeCaseAction(value) {
  const action = normalizeText(value).toLowerCase();
  return CASE_ACTIONS.has(action) ? action : "";
}

function sanitizeCaseForResponse(item) {
  const { db_id, audit, ...responseItem } = item || {};
  return responseItem;
}

function validateCaseCreateBody(body) {
  const entityType = normalizeCaseEntityType(body?.entity_type || "lead");
  const entityId = normalizeText(body?.entity_id || body?.lead_id);

  if (!entityType || !entityId) {
    return false;
  }

  return true;
}

async function logCaseAudit(db, caseDbId, action, payload = {}) {
  await db.query(
    `
    INSERT INTO public.audit_logs (entity_type, entity_id, action, data)
    VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      "moderation_case",
      caseDbId,
      action,
      JSON.stringify({
        source: "admin_control",
        entity_type: "moderation_case",
        entity_id: caseDbId,
        ...payload,
      }),
    ],
  );
}

async function getNextCaseRuntimeId() {
  try {
    const result = await pool.query(`
      SELECT data->>'id' AS runtime_id
      FROM public.moderation_cases
      WHERE data->>'id' LIKE 'case_%'
    `);
    const max = result.rows.reduce((currentMax, row) => {
      const runtimeId = String(row.runtime_id || "");
      if (!/^case_\d+$/.test(runtimeId)) {
        return currentMax;
      }

      const value = Number(runtimeId.replace("case_", ""));
      return Number.isFinite(value) ? Math.max(currentMax, value) : currentMax;
    }, 0);
    const nextId = max + 1;
    const runtimeId = `case_${nextId}`;
    nextCaseId = Math.max(nextCaseId, nextId + 1);

    return runtimeId;
  } catch (error) {
    return `case_${nextCaseId++}`;
  }
}

export async function getCaseDbIdById(runtimeCaseId) {
  if (!runtimeCaseId) {
    return null;
  }

  const item = cases.get(runtimeCaseId);
  const dbId = item?.db_id ?? null;

  if (dbId !== null && dbId !== undefined) {
    return dbId;
  }

  try {
    const result = await pool.query(
      `
      SELECT id
      FROM public.moderation_cases
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(runtimeCaseId || "")],
    );

    return result.rows?.[0]?.id ?? null;
  } catch (error) {
    return null;
  }
}

async function resolveOptionalLeadDbId(runtimeLeadId) {
  const normalized = normalizeText(runtimeLeadId);

  if (!normalized) {
    return null;
  }

  return getLeadDbIdById(normalized);
}

async function persistCase(item, operation = "upsert", db = pool) {
  const data = {
    ...item,
  };
  delete data.audit;

  const leadDbId = await resolveOptionalLeadDbId(item?.lead_runtime_id);

  if (operation === "create") {
    const result = await db.query(
      `
      INSERT INTO public.moderation_cases (lead_id, status, data)
      VALUES ($1, $2, $3::jsonb)
      RETURNING id
      `,
      [leadDbId, String(item?.status || ""), JSON.stringify(data)],
    );

    const dbId = result.rows?.[0]?.id ?? null;
    if (dbId !== null) {
      item.db_id = dbId;
    }
    return dbId;
  }

  const dbId = item?.db_id ?? null;
  if (dbId === null || dbId === undefined) {
    throw new Error("CASE_DB_ID_MISSING");
  }

  const result = await db.query(
    `
    UPDATE public.moderation_cases
    SET lead_id = $1,
        status = $2,
        data = $3::jsonb,
        updated_at = NOW()
    WHERE id = $4
    `,
    [leadDbId, String(item?.status || ""), JSON.stringify(data), dbId],
  );

  if (!result.rowCount) {
    throw new Error("CASE_DB_UPDATE_FAILED");
  }

  return result;
}

async function loadCaseByRuntimeId(runtimeCaseId) {
  const result = await pool.query(
    `
    SELECT id, data
    FROM public.moderation_cases
    WHERE data->>'id' = $1
    LIMIT 1
    `,
    [String(runtimeCaseId || "")],
  );

  const row = result.rows?.[0] || null;
  if (!row?.data) {
    return null;
  }

  const item = {
    ...row.data,
    db_id: row.id,
  };

  cases.set(String(runtimeCaseId || ""), item);

  return item;
}

router.get("/", async (req, res) => {
  try {
    const status = normalizeCaseStatus(req.query.status);
    const entityType = normalizeCaseEntityType(req.query.entity_type);
    const priority = normalizeCasePriority(req.query.priority);

    const result = await pool.query(`
      SELECT id, data
      FROM public.moderation_cases
      ORDER BY created_at DESC, id DESC
    `);

    let items = result.rows.map((row) => {
      const item = {
        ...(row.data || {}),
        db_id: row.id,
      };
      cases.set(String(item.id || ""), item);
      return sanitizeCaseForResponse(item);
    });

    if (status) {
      items = items.filter((item) => String(item.status || "").toLowerCase() === status);
    }

    if (entityType) {
      items = items.filter((item) => String(item.entity_type || "").toLowerCase() === entityType);
    }

    if (priority) {
      items = items.filter((item) => String(item.priority || "").toLowerCase() === priority);
    }

    return res.json({
      ok: true,
      data: {
        items,
        pagination: {
          total: items.length,
          limit: 0,
          offset: 0,
        },
      },
      meta: {},
    });
  } catch (error) {
    console.error("ADMIN_MODERATION_READ_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "CASES_READ_FAILED",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const item = await loadCaseByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "CASE_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      data: sanitizeCaseForResponse(item),
      meta: {},
    });
  } catch (error) {
    console.error("ADMIN_MODERATION_DETAIL_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "CASE_READ_FAILED",
    });
  }
});

router.get("/:id/audit", async (req, res) => {
  try {
    const item = await loadCaseByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "CASE_NOT_FOUND",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        entity_type,
        entity_id,
        action,
        data,
        created_at
      FROM public.audit_logs
      WHERE entity_type = 'moderation_case'
        AND entity_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 50
      `,
      [item.db_id],
    );

    return res.json({
      ok: true,
      data: {
        id: String(req.params.id || ""),
        entity_id: item.db_id,
        items: result.rows,
        pagination: {
          total: result.rows.length,
          limit: 50,
          offset: 0,
        },
      },
      meta: {},
    });
  } catch (error) {
    console.error("ADMIN_MODERATION_AUDIT_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "CASE_AUDIT_READ_FAILED",
    });
  }
});

router.post("/", async (req, res) => {
  const db = await pool.connect();

  try {
    if (!validateCaseCreateBody(req.body)) {
      return res.status(400).json({
        ok: false,
        error: "CASE_VALIDATION_FAILED",
      });
    }

    const entityType = normalizeCaseEntityType(req.body?.entity_type || "lead");
    const entityId = normalizeText(req.body?.entity_id || req.body?.lead_id);
    const leadRuntimeId = normalizeText(req.body?.lead_id || (entityType === "lead" ? entityId : ""));
    const priority = normalizeCasePriority(req.body?.priority) || "normal";
    const reasonCode = normalizeText(req.body?.reason_code) || "manual_review";
    const reasonText = normalizeText(req.body?.reason_text);
    const assignedTo = normalizeText(req.body?.assigned_to) || null;
    const createdBy = normalizeText(req.body?.created_by) || null;

    await db.query("BEGIN");

    const id = await getNextCaseRuntimeId();
    const caseItem = {
      id,
      entity_type: entityType,
      entity_id: entityId,
      lead_runtime_id: leadRuntimeId || null,
      reason_code: reasonCode,
      reason_text: reasonText,
      status: "open",
      priority,
      created_by: createdBy,
      assigned_to: assignedTo,
      resolved_by: null,
      resolution: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      db_id: null,
    };

    cases.set(id, caseItem);
    const dbId = await persistCase(caseItem, "create", db);

    await logCaseAudit(db, dbId, "case_created", {
      action: "create",
      after: sanitizeCaseForResponse(caseItem),
    });

    await db.query("COMMIT");

    return res.json({
      ok: true,
      data: sanitizeCaseForResponse(caseItem),
      meta: {},
    });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch (rollbackError) {}

    console.error("ADMIN_MODERATION_CREATE_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "CASE_PERSIST_FAILED",
    });
  } finally {
    db.release();
  }
});

router.post("/:id/status", async (req, res) => {
  const db = await pool.connect();

  try {
    const item = await loadCaseByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "CASE_NOT_FOUND",
      });
    }

    const status = normalizeCaseStatus(req.body?.status);
    if (!status) {
      return res.status(400).json({
        ok: false,
        error: "CASE_STATUS_INVALID",
      });
    }

    await db.query("BEGIN");

    const before = sanitizeCaseForResponse(item);
    item.status = status;
    item.updated_at = new Date().toISOString();

    if (status === "resolved" || status === "dismissed") {
      item.resolved_by = normalizeText(req.body?.resolved_by) || item.resolved_by || null;
      item.resolution = normalizeText(req.body?.resolution) || item.resolution || null;
    }

    cases.set(String(req.params.id || ""), item);

    await persistCase(item, "status_update", db);

    await logCaseAudit(db, item.db_id, "case_status_changed", {
      action: "status",
      before,
      after: sanitizeCaseForResponse(item),
      status,
    });

    await db.query("COMMIT");

    return res.json({
      ok: true,
      data: {
        id: String(req.params.id || ""),
        status,
      },
      meta: {},
    });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch (rollbackError) {}

    console.error("ADMIN_MODERATION_STATUS_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "CASE_PERSIST_FAILED",
    });
  } finally {
    db.release();
  }
});

router.post("/:id/action", async (req, res) => {
  const db = await pool.connect();

  try {
    const item = await loadCaseByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "CASE_NOT_FOUND",
      });
    }

    const action = normalizeCaseAction(req.body?.action);
    if (!action) {
      return res.status(400).json({
        ok: false,
        error: "CASE_ACTION_INVALID",
      });
    }

    await db.query("BEGIN");

    const before = sanitizeCaseForResponse(item);

    if (action === "assign_case") {
      const assignedTo = normalizeText(req.body?.assigned_to);
      if (!assignedTo) {
        await db.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          error: "CASE_ASSIGNEE_INVALID",
        });
      }
      item.assigned_to = assignedTo;
      item.status = item.status === "open" ? "in_review" : item.status;
    }

    if (action === "resolve_case") {
      item.status = "resolved";
      item.resolved_by = normalizeText(req.body?.resolved_by) || item.resolved_by || null;
      item.resolution = normalizeText(req.body?.resolution) || "resolved";
    }

    if (action === "dismiss_case") {
      item.status = "dismissed";
      item.resolved_by = normalizeText(req.body?.resolved_by) || item.resolved_by || null;
      item.resolution = normalizeText(req.body?.resolution) || "dismissed";
    }

    if (action === "escalate_case") {
      item.status = "escalated";
      item.priority = "critical";
    }

    item.last_action = action;
    item.last_action_reason = normalizeText(req.body?.reason);
    item.updated_at = new Date().toISOString();

    cases.set(String(req.params.id || ""), item);

    await persistCase(item, "action_update", db);

    await logCaseAudit(db, item.db_id, action, {
      action,
      before,
      after: sanitizeCaseForResponse(item),
      reason: item.last_action_reason,
    });

    await db.query("COMMIT");

    return res.json({
      ok: true,
      data: {
        id: String(req.params.id || ""),
        action,
        status: item.status,
        priority: item.priority,
      },
      meta: {},
    });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch (rollbackError) {}

    console.error("ADMIN_MODERATION_ACTION_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "CASE_PERSIST_FAILED",
    });
  } finally {
    db.release();
  }
});

export default router;
