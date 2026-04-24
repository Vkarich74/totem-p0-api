import express from "express";
import { pool } from "../db.js";

const router = express.Router();
const leads = new Map();
const leadDbIds = new WeakMap();
let nextLeadId = 1;

function validateLeadCreateBody(body) {
  const lead_type = String(body?.lead_type || "");
  const name = String(body?.name || "");
  const phone = String(body?.phone || "");
  const source = String(body?.source || "");

  if (!lead_type || !name || !phone || !source) {
    return false;
  }

  return true;
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

async function persistLead(item, operation = "upsert") {
  const data = {
    ...item,
  };
  const idempotencyKey = item?.idempotency_key ?? null;

  if (operation === "create") {
    const result = await pool.query(
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

  const result = await pool.query(
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

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT data
      FROM public.leads
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
      error: "LEADS_READ_FAILED",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT data
      FROM public.leads
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(req.params.id || "")],
    );
    const item = result.rows?.[0]?.data ?? null;

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "LEAD_NOT_FOUND",
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
      error: "LEAD_READ_FAILED",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!validateLeadCreateBody(req.body)) {
      return res.status(400).json({
        ok: false,
        error: "LEAD_VALIDATION_FAILED",
      });
    }

    const id = `lead_${nextLeadId++}`;
    const leadItem = {
      id,
      lead_type: String(req.body?.lead_type || ""),
      name: String(req.body?.name || ""),
      phone: String(req.body?.phone || ""),
      source: String(req.body?.source || ""),
      status: "new",
      assigned_to: null,
      converted_to: null,
      db_id: null,
      audit: [],
    };

    leads.set(id, leadItem);
    await persistLead(leadItem, "create");

    return res.json({
      ok: true,
      data: {
        id,
        lead_type: leadItem.lead_type,
        name: leadItem.name,
        phone: leadItem.phone,
        source: leadItem.source,
      },
      meta: {},
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "LEAD_PERSIST_FAILED",
    });
  }
});

router.post("/:id/status", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, data
      FROM public.leads
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(req.params.id || "")],
    );
    const item = result.rows?.[0]?.data ?? null;

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "LEAD_NOT_FOUND",
      });
    }

    item.db_id = result.rows?.[0]?.id;
    item.audit = item.audit || [];
    const status = String(req.body?.status || "");
    item.status = status;
    item.audit.push({
      type: "status",
      value: status,
    });
    leads.set(req.params.id, item);
    await persistLead(item, "status_update");

    return res.json({
      ok: true,
      data: {
        id: String(req.params.id || ""),
        status,
      },
      meta: {},
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "LEAD_PERSIST_FAILED",
    });
  }
});

router.post("/:id/assign", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, data
      FROM public.leads
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(req.params.id || "")],
    );
    const item = result.rows?.[0]?.data ?? null;

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "LEAD_NOT_FOUND",
      });
    }

    item.db_id = result.rows?.[0]?.id;
    item.audit = item.audit || [];
    const assigned_to = String(req.body?.assigned_to || "");
    item.assigned_to = assigned_to;
    item.audit.push({
      type: "assign",
      value: assigned_to,
    });
    leads.set(req.params.id, item);
    await persistLead(item, "assign_update");

    return res.json({
      ok: true,
      data: {
        id: String(req.params.id || ""),
        assigned_to,
      },
      meta: {},
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "LEAD_PERSIST_FAILED",
    });
  }
});

router.post("/:id/convert", async (req, res) => {
  try {
    const item = leads.get(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "LEAD_NOT_FOUND",
      });
    }

    const target_type = String(req.body?.target_type || "");
    item.converted_to = target_type;
    item.status = "converted";
    // создать связанный moderation case (mock связь)
    const caseId = `case_from_${item.id}`;
    item.moderation_case_id = caseId;
    item.audit.push({
      type: "convert",
      value: target_type,
    });
    leads.set(req.params.id, item);
    await persistLead(item, "convert_update");

    return res.json({
      ok: true,
      data: {
        id: String(req.params.id || ""),
        target_type,
      },
      meta: {},
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "LEAD_PERSIST_FAILED",
    });
  }
});

router.get("/:id/audit", (req, res) => {
  const item = leads.get(req.params.id);

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "LEAD_NOT_FOUND",
    });
  }

  const items = item.audit || [];

  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      items,
    },
    meta: {},
  });
});

export default router;
