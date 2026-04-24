import express from "express";
import { pool } from "../db.js";
import { getLeadDbIdById } from "./admin.leads.js";
import { getCaseDbIdById } from "./admin.moderation.js";

const router = express.Router();
const messages = new Map();
let nextMessageId = 1;

function validateMessageSendBody(body) {
  const channel = String(body?.channel || "");
  const recipient_id = String(body?.recipient_id || "");
  const lead_id = String(body?.lead_id || "");
  const moderation_case_id = String(body?.moderation_case_id || "");

  if (!channel || !recipient_id || !lead_id || !moderation_case_id) {
    return false;
  }

  return true;
}

async function persistMessage(item, operation = "upsert") {
  const data = {
    ...item,
  };
  const leadDbId = await getLeadDbIdById(item?.lead_runtime_id);
  const caseDbId = await getCaseDbIdById(item?.moderation_case_runtime_id);
  const idempotencyKey = item?.idempotency_key ?? null;

  if (leadDbId === null || leadDbId === undefined) {
    throw new Error("MESSAGE_LEAD_DB_ID_MISSING");
  }

  if (caseDbId === null || caseDbId === undefined) {
    throw new Error("MESSAGE_CASE_DB_ID_MISSING");
  }

  if (operation === "create") {
    const result = await pool.query(
      `
      INSERT INTO public.messages (lead_id, moderation_case_id, status, idempotency_key, data)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id
      `,
      [leadDbId, caseDbId, String(item?.status || ""), idempotencyKey, JSON.stringify(data)],
    );
    const dbId = result.rows?.[0]?.id ?? null;
    if (dbId !== null) {
      item.db_id = dbId;
    }
    return dbId;
  }

  const dbId = item?.db_id ?? null;
  if (dbId === null || dbId === undefined) {
    throw new Error("MESSAGE_DB_ID_MISSING");
  }

  const result = await pool.query(
    `
    UPDATE public.messages
    SET lead_id = $1,
        moderation_case_id = $2,
        status = $3,
        data = $4::jsonb,
        updated_at = NOW()
    WHERE id = $5
    `,
    [leadDbId, caseDbId, String(item?.status || ""), JSON.stringify(data), dbId],
  );

  if (!result.rowCount) {
    throw new Error("MESSAGE_DB_UPDATE_FAILED");
  }

  return result;
}

async function persistMessageAudit(messageId, auditItem) {
  const item = messages.get(messageId);
  const messageDbId = item?.db_id ?? null;

  if (messageDbId === null || messageDbId === undefined) {
    throw new Error("MESSAGE_DB_ID_MISSING");
  }

  return pool.query(
    `
    INSERT INTO public.audit_logs (entity_type, entity_id, action, data)
    VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      "message",
      messageDbId,
      String(auditItem?.type || ""),
      JSON.stringify(auditItem),
    ],
  );
}

async function persistTraceLink(messageId, payload) {
  const item = messages.get(messageId);
  const messageDbId = item?.db_id ?? null;

  if (messageDbId === null || messageDbId === undefined) {
    throw new Error("MESSAGE_DB_ID_MISSING");
  }

  return pool.query(
    `
    INSERT INTO public.traces (message_id, attempt, status, data)
    VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      messageDbId,
      1,
      "linked",
      JSON.stringify(payload),
    ],
  );
}

function getMessagesPersistenceAdapter() {
  return {
    saveMessage: persistMessage,
    saveAudit: persistMessageAudit,
    saveTrace: persistTraceLink,
  };
}
const templates = [
  {
    id: "tpl_whatsapp_followup",
    channel: "whatsapp",
    name: "Follow Up",
    body: "Здравствуйте. Напоминаем по вашему обращению.",
  },
  {
    id: "tpl_whatsapp_welcome",
    channel: "whatsapp",
    name: "Welcome",
    body: "Здравствуйте. Спасибо за интерес к TOTEM.",
  },
];

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT data
      FROM public.messages
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
      error: "MESSAGES_READ_FAILED",
    });
  }
});

router.get("/templates", (req, res) => {
  const items = templates;

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
});

router.post("/send", async (req, res) => {
  try {
    if (!validateMessageSendBody(req.body)) {
      return res.status(400).json({
        ok: false,
        error: "MESSAGE_VALIDATION_FAILED",
      });
    }

    const id = `msg_${nextMessageId++}`;
    const channel = String(req.body?.channel || "");
    const recipient_type = String(req.body?.recipient_type || "");
    const recipient_id = String(req.body?.recipient_id || "");
    if (!recipient_id) {
      throw new Error("MESSAGE_RECIPIENT_ID_MISSING");
    }
    const lead_runtime_id = String(req.body?.lead_id || "");
    const moderation_case_runtime_id = String(req.body?.moderation_case_id || "");
    if (!lead_runtime_id) {
      throw new Error("MESSAGE_LEAD_RUNTIME_ID_MISSING");
    }
    if (!moderation_case_runtime_id) {
      throw new Error("MESSAGE_CASE_RUNTIME_ID_MISSING");
    }
    const trace_id = String(req.body?.trace_id || `trace_${id}`);
    const persistence = getMessagesPersistenceAdapter();
    const messageItem = {
      id,
      channel,
      recipient_type,
      recipient_id,
      lead_runtime_id,
      moderation_case_runtime_id,
      trace_id,
      status: "sent",
      db_id: null,
      audit: [],
    };

    messages.set(id, messageItem);
    await persistence.saveMessage(messageItem, "create");
    await persistence.saveTrace(id, {
      message_id: id,
      recipient_id,
      lead_runtime_id,
      moderation_case_runtime_id,
    });

    return res.json({
      ok: true,
      data: {
        id,
        channel,
        recipient_type,
        status: "sent",
      },
      meta: {},
    });
  } catch (error) {
    if (
      error?.message === "MESSAGE_RECIPIENT_ID_MISSING" ||
      error?.message === "MESSAGE_LEAD_RUNTIME_ID_MISSING" ||
      error?.message === "MESSAGE_CASE_RUNTIME_ID_MISSING"
    ) {
      return res.status(400).json({
        ok: false,
        error: error.message,
      });
    }

    console.error("MESSAGE_ERROR", {
      error: error?.message,
      stack: error?.stack,
      payload: req.body,
    });

    return res.status(500).json({
      ok: false,
      error: "MESSAGE_PERSIST_FAILED",
    });
  }
});

router.post("/:id/retry", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, data
      FROM public.messages
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(req.params.id || "")],
    );
    const item = result.rows?.[0]?.data ?? null;
    const persistence = getMessagesPersistenceAdapter();

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "MESSAGE_NOT_FOUND",
      });
    }

    item.db_id = result.rows?.[0]?.id;
    item.audit = item.audit || [];
    item.status = "sent";
    item.audit.push({
      type: "retry",
      value: "sent",
    });
    messages.set(req.params.id, item);
    await persistence.saveMessage(item, "retry_update");
    await persistence.saveAudit(req.params.id, {
      type: "retry",
      value: "sent",
    });

    return res.json({
      ok: true,
      data: {
        id: req.params.id,
        status: "sent",
      },
      meta: {},
    });
  } catch (error) {
    console.error("MESSAGE_ERROR", {
      error: error?.message,
      stack: error?.stack,
      payload: req.body,
    });

    return res.status(500).json({
      ok: false,
      error: "MESSAGE_PERSIST_FAILED",
    });
  }
});

router.get("/:id/audit", async (req, res) => {
  try {
    const messageResult = await pool.query(
      `
      SELECT id
      FROM public.messages
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(req.params.id || "")],
    );
    const messageDbId = messageResult.rows?.[0]?.id ?? null;

    if (messageDbId === null || messageDbId === undefined) {
      return res.status(404).json({
        ok: false,
        error: "MESSAGE_NOT_FOUND",
      });
    }

    const auditResult = await pool.query(
      `
      SELECT action, data, created_at
      FROM public.audit_logs
      WHERE entity_type = 'message'
      AND entity_id = $1
      ORDER BY created_at DESC, id DESC
      `,
      [messageDbId],
    );
    const items = auditResult.rows.map((row) => ({
      ...(row.data || {}),
      action: row.data?.action ?? row.action,
      created_at: row.data?.created_at ?? row.created_at,
    }));

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
      error: "MESSAGE_AUDIT_READ_FAILED",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT data
      FROM public.messages
      WHERE data->>'id' = $1
      LIMIT 1
      `,
      [String(req.params.id || "")],
    );
    const item = result.rows?.[0]?.data ?? null;

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "MESSAGE_NOT_FOUND",
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
      error: "MESSAGE_READ_FAILED",
    });
  }
});

export default router;
