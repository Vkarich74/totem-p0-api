import express from "express";
import { pool } from "../db.js";

const router = express.Router();
const leads = new Map();
const leadDbIds = new WeakMap();
let nextLeadId = 1;

const LEAD_TYPES = new Set(["salon", "master", "client", "unknown"]);
const LEAD_STATUSES = new Set(["new", "in_review", "contacted", "qualified", "rejected", "converted"]);
const CONVERT_TARGET_TYPES = new Set(["salon", "master", "client"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeLeadType(value) {
  const leadType = normalizeText(value).toLowerCase();
  return LEAD_TYPES.has(leadType) ? leadType : "";
}

function normalizeLeadStatus(value) {
  const status = normalizeText(value).toLowerCase();
  return LEAD_STATUSES.has(status) ? status : "";
}

function normalizeConvertTargetType(value) {
  const targetType = normalizeText(value).toLowerCase();
  return CONVERT_TARGET_TYPES.has(targetType) ? targetType : "";
}

function sanitizeLeadForResponse(item) {
  const { db_id, audit, ...responseItem } = item || {};
  return responseItem;
}

function validateLeadCreateBody(body) {
  const lead_type = normalizeLeadType(body?.lead_type);
  const name = normalizeText(body?.name);
  const phone = normalizeText(body?.phone);
  const source = normalizeText(body?.source);

  if (!lead_type || !name || !phone || !source) {
    return false;
  }

  return true;
}

async function logLeadAudit(db, leadDbId, action, payload = {}) {
  await db.query(
    `
    INSERT INTO public.audit_logs (entity_type, entity_id, action, data)
    VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      "lead",
      leadDbId,
      action,
      JSON.stringify({
        source: "admin_control",
        entity_type: "lead",
        entity_id: leadDbId,
        ...payload,
      }),
    ],
  );
}

async function getNextLeadRuntimeId() {
  try {
    const result = await pool.query(`
      SELECT data->>'id' AS runtime_id
      FROM public.leads
      WHERE data->>'id' LIKE 'lead_%'
    `);
    const max = result.rows.reduce((currentMax, row) => {
      const runtimeId = String(row.runtime_id || "");
      if (!/^lead_\d+$/.test(runtimeId)) {
        return currentMax;
      }

      const value = Number(runtimeId.replace("lead_", ""));
      return Number.isFinite(value) ? Math.max(currentMax, value) : currentMax;
    }, 0);
    const nextId = max + 1;
    const runtimeId = `lead_${nextId}`;
    nextLeadId = Math.max(nextLeadId, nextId + 1);

    return runtimeId;
  } catch (error) {
    return `lead_${nextLeadId++}`;
  }
}

export async function getLeadDbIdById(runtimeLeadId) {
  if (!runtimeLeadId) {
    return null;
  }

  const lead = leads.get(runtimeLeadId);
  const dbId = lead?.db_id ?? (lead ? leadDbIds.get(lead) : null) ?? null;

  if (dbId !== null && dbId !== undefined) {
    return dbId;
  }

  try {
    const result = await pool.query(
      `
      SELECT id
      FROM public.leads
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(runtimeLeadId || "")],
    );

    return result.rows?.[0]?.id ?? null;
  } catch (error) {
    return null;
  }
}

async function persistLead(item, operation = "upsert", db = pool) {
  const data = {
    ...item,
  };
  delete data.audit;

  const idempotencyKey = item?.idempotency_key ?? null;

  if (operation === "create") {
    const result = await db.query(
      `
      INSERT INTO public.leads (status, idempotency_key, data)
      VALUES ($1, $2, $3::jsonb)
      RETURNING id
      `,
      [String(item?.status || ""), idempotencyKey, JSON.stringify(data)],
    );
    const dbId = result.rows?.[0]?.id ?? null;
    if (dbId !== null) {
      item.db_id = dbId;
      leadDbIds.set(item, dbId);
    }
    return dbId;
  }

  const dbId = item?.db_id ?? leadDbIds.get(item);
  if (dbId === null || dbId === undefined) {
    throw new Error("LEAD_DB_ID_MISSING");
  }

  const result = await db.query(
    `
    UPDATE public.leads
    SET status = $1,
        data = $2::jsonb,
        updated_at = NOW()
    WHERE id = $3
    `,
    [String(item?.status || ""), JSON.stringify(data), dbId],
  );

  if (!result.rowCount) {
    throw new Error("LEAD_DB_UPDATE_FAILED");
  }

  return result;
}

async function loadLeadByRuntimeId(runtimeLeadId) {
  const result = await pool.query(
    `
    SELECT id, data
    FROM public.leads
    WHERE data->>'id' = $1
    LIMIT 1
    `,
    [String(runtimeLeadId || "")],
  );

  const row = result.rows?.[0] || null;
  if (!row?.data) {
    return null;
  }

  const item = {
    ...row.data,
    db_id: row.id,
  };

  leads.set(String(runtimeLeadId || ""), item);
  leadDbIds.set(item, row.id);

  return item;
}

router.get("/", async (req, res) => {
  try {
    const status = normalizeLeadStatus(req.query.status);
    const source = normalizeText(req.query.source).toLowerCase();
    const search = normalizeText(req.query.search).toLowerCase();

    const result = await pool.query(`
      SELECT id, data
      FROM public.leads
      ORDER BY created_at DESC, id DESC
    `);

    let items = result.rows.map((row) => {
      const item = {
        ...(row.data || {}),
        db_id: row.id,
      };
      leads.set(String(item.id || ""), item);
      leadDbIds.set(item, row.id);
      return sanitizeLeadForResponse(item);
    });

    if (status) {
      items = items.filter((item) => String(item.status || "").toLowerCase() === status);
    }

    if (source) {
      items = items.filter((item) => String(item.source || "").toLowerCase() === source);
    }

    if (search) {
      items = items.filter((item) => {
        const haystack = [
          item.id,
          item.name,
          item.phone,
          item.source,
          item.lead_type,
          item.status,
          item.assigned_to,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(search);
      });
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
    console.error("ADMIN_LEADS_READ_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "LEADS_READ_FAILED",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const item = await loadLeadByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "LEAD_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      data: sanitizeLeadForResponse(item),
      meta: {},
    });
  } catch (error) {
    console.error("ADMIN_LEAD_READ_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "LEAD_READ_FAILED",
    });
  }
});

router.post("/", async (req, res) => {
  const db = await pool.connect();

  try {
    if (!validateLeadCreateBody(req.body)) {
      return res.status(400).json({
        ok: false,
        error: "LEAD_VALIDATION_FAILED",
      });
    }

    await db.query("BEGIN");

    const id = await getNextLeadRuntimeId();
    const leadItem = {
      id,
      lead_type: normalizeLeadType(req.body?.lead_type),
      name: normalizeText(req.body?.name),
      phone: normalizeText(req.body?.phone),
      source: normalizeText(req.body?.source),
      status: "new",
      assigned_to: null,
      converted_to: null,
      conversion: null,
      notes_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      db_id: null,
    };

    leads.set(id, leadItem);
    const dbId = await persistLead(leadItem, "create", db);

    await logLeadAudit(db, dbId, "lead_created", {
      action: "create",
      after: sanitizeLeadForResponse(leadItem),
    });

    await db.query("COMMIT");

    return res.json({
      ok: true,
      data: sanitizeLeadForResponse(leadItem),
      meta: {},
    });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch (rollbackError) {}

    console.error("ADMIN_LEAD_CREATE_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "LEAD_PERSIST_FAILED",
    });
  } finally {
    db.release();
  }
});

router.post("/:id/status", async (req, res) => {
  const db = await pool.connect();

  try {
    const item = await loadLeadByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "LEAD_NOT_FOUND",
      });
    }

    const status = normalizeLeadStatus(req.body?.status);
    if (!status) {
      return res.status(400).json({
        ok: false,
        error: "LEAD_STATUS_INVALID",
      });
    }

    await db.query("BEGIN");

    const before = sanitizeLeadForResponse(item);
    item.status = status;
    item.updated_at = new Date().toISOString();
    leads.set(String(req.params.id || ""), item);

    await persistLead(item, "status_update", db);

    await logLeadAudit(db, item.db_id, "lead_status_changed", {
      action: "status",
      before,
      after: sanitizeLeadForResponse(item),
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

    console.error("ADMIN_LEAD_STATUS_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "LEAD_PERSIST_FAILED",
    });
  } finally {
    db.release();
  }
});

router.post("/:id/assign", async (req, res) => {
  const db = await pool.connect();

  try {
    const item = await loadLeadByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "LEAD_NOT_FOUND",
      });
    }

    const assigned_to = normalizeText(req.body?.assigned_to);
    if (!assigned_to) {
      return res.status(400).json({
        ok: false,
        error: "LEAD_ASSIGNEE_INVALID",
      });
    }

    await db.query("BEGIN");

    const before = sanitizeLeadForResponse(item);
    item.assigned_to = assigned_to;
    item.updated_at = new Date().toISOString();
    leads.set(String(req.params.id || ""), item);

    await persistLead(item, "assign_update", db);

    await logLeadAudit(db, item.db_id, "lead_assigned", {
      action: "assign",
      before,
      after: sanitizeLeadForResponse(item),
      assigned_to,
    });

    await db.query("COMMIT");

    return res.json({
      ok: true,
      data: {
        id: String(req.params.id || ""),
        assigned_to,
      },
      meta: {},
    });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch (rollbackError) {}

    console.error("ADMIN_LEAD_ASSIGN_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "LEAD_PERSIST_FAILED",
    });
  } finally {
    db.release();
  }
});

router.post("/:id/convert", async (req, res) => {
  const db = await pool.connect();

  try {
    const item = await loadLeadByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "LEAD_NOT_FOUND",
      });
    }

    const target_type = normalizeConvertTargetType(req.body?.target_type);
    if (!target_type) {
      return res.status(400).json({
        ok: false,
        error: "LEAD_CONVERT_TARGET_INVALID",
      });
    }

    const target_id = normalizeText(req.body?.target_id) || null;

    await db.query("BEGIN");

    const before = sanitizeLeadForResponse(item);
    item.converted_to = target_type;
    item.conversion = {
      target_type,
      target_id,
      converted_at: new Date().toISOString(),
    };
    item.status = "converted";
    item.updated_at = new Date().toISOString();
    delete item.moderation_case_id;
    leads.set(String(req.params.id || ""), item);

    await persistLead(item, "convert_update", db);

    await logLeadAudit(db, item.db_id, "lead_converted", {
      action: "convert",
      before,
      after: sanitizeLeadForResponse(item),
      target_type,
      target_id,
    });

    await db.query("COMMIT");

    return res.json({
      ok: true,
      data: {
        id: String(req.params.id || ""),
        target_type,
        target_id,
      },
      meta: {},
    });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch (rollbackError) {}

    console.error("ADMIN_LEAD_CONVERT_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "LEAD_PERSIST_FAILED",
    });
  } finally {
    db.release();
  }
});

router.get("/:id/audit", async (req, res) => {
  try {
    const item = await loadLeadByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "LEAD_NOT_FOUND",
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
      WHERE entity_type = 'lead'
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
      },
      meta: {},
    });
  } catch (error) {
    console.error("ADMIN_LEAD_AUDIT_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "LEAD_AUDIT_READ_FAILED",
    });
  }
});

export default router;
