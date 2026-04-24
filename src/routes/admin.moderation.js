import express from "express";
import { pool } from "../db.js";
import { getLeadDbIdById } from "./admin.leads.js";

const router = express.Router();
const cases = new Map();
let nextCaseId = 1;

function validateCaseCreateBody(body) {
  const lead_id = String(body?.lead_id || "");

  if (!lead_id) {
    return false;
  }

  return true;
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

async function persistCase(item, operation = "upsert") {
  const data = {
    ...item,
  };
  const runtimeLeadId = item?.lead_runtime_id ?? null;
  const leadDbId = await getLeadDbIdById(runtimeLeadId);

  if (operation === "create") {
    if (leadDbId === null || leadDbId === undefined) {
      throw new Error("CASE_LEAD_DB_ID_MISSING");
    }

    const result = await pool.query(
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

  const result = await pool.query(
    `
    UPDATE public.moderation_cases
    SET status = $1,
        data = $2::jsonb,
        updated_at = NOW()
    WHERE id = $3
    `,
    [String(item?.status || ""), JSON.stringify(data), dbId],
  );

  if (!result.rowCount) {
    throw new Error("CASE_DB_UPDATE_FAILED");
  }

  return result;
}

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT data
      FROM public.moderation_cases
      ORDER BY created_at DESC, id DESC
    `);
    const items = result.rows.map((row) => {
      const { db_id, ...responseItem } = row.data || {};
      return responseItem;
    });

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
    return res.status(500).json({
      ok: false,
      error: "CASES_READ_FAILED",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT data
      FROM public.moderation_cases
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(req.params.id || "")],
    );
    const item = result.rows?.[0]?.data ?? null;

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "CASE_NOT_FOUND",
      });
    }

    const { db_id, ...responseItem } = item;

    return res.json({
      ok: true,
      data: responseItem,
      meta: {},
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "CASE_READ_FAILED",
    });
  }
});

router.get("/:id/audit", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT data
      FROM public.moderation_cases
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(req.params.id || "")],
    );
    const item = result.rows?.[0]?.data ?? null;

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "CASE_NOT_FOUND",
      });
    }

    const items = item.audit || [];

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
    return res.status(500).json({
      ok: false,
      error: "CASE_AUDIT_READ_FAILED",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!validateCaseCreateBody(req.body)) {
      return res.status(400).json({
        ok: false,
        error: "CASE_VALIDATION_FAILED",
      });
    }

    const id = await getNextCaseRuntimeId();
    const caseItem = {
      id,
      entity_type: "lead",
      lead_runtime_id: String(req.body?.lead_id || ""),
      status: "open",
      priority: "normal",
      audit: [],
      db_id: null,
    };

    cases.set(id, caseItem);
    await persistCase(caseItem, "create");

    return res.json({
      ok: true,
      data: {
        id,
        status: "open",
      },
      meta: {},
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "CASE_PERSIST_FAILED",
    });
  }
});

router.post("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      `
      SELECT id, data
      FROM public.moderation_cases
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(req.params.id || "")],
    );
    const item = result.rows?.[0]?.data ?? null;

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "CASE_NOT_FOUND",
      });
    }

    item.db_id = result.rows?.[0]?.id;
    item.audit = item.audit || [];
    item.status = status;
    item.audit.push({
      type: "status",
      value: status,
    });
    cases.set(req.params.id, item);
    await persistCase(item, "status_update");

    return res.json({
      ok: true,
      data: {
        id: req.params.id,
        status,
      },
      meta: {},
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "CASE_PERSIST_FAILED",
    });
  }
});

router.post("/:id/action", async (req, res) => {
  try {
    const { action } = req.body;
    const result = await pool.query(
      `
      SELECT id, data
      FROM public.moderation_cases
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(req.params.id || "")],
    );
    const item = result.rows?.[0]?.data ?? null;

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "CASE_NOT_FOUND",
      });
    }

    item.db_id = result.rows?.[0]?.id;
    item.audit = item.audit || [];
    item.audit.push({
      type: "action",
      value: action,
    });
    cases.set(req.params.id, item);
    await persistCase(item, "action_update");

    return res.json({
      ok: true,
      data: {
        id: req.params.id,
        action,
      },
      meta: {},
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "CASE_PERSIST_FAILED",
    });
  }
});

export default router;
