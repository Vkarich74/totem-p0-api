import express from "express";
import { pool } from "../db.js";
import { getLeadDbIdById } from "./admin.leads.js";
import { getCaseDbIdById } from "./admin.moderation.js";

const router = express.Router();
const messages = new Map();
let nextMessageId = 1;

const MESSAGE_CHANNELS = new Set(["whatsapp", "email", "sms", "internal"]);
const MESSAGE_DIRECTIONS = new Set(["outbound", "inbound"]);
const MESSAGE_RECIPIENT_TYPES = new Set(["salon", "master", "client", "lead"]);
const MESSAGE_STATUSES = new Set(["queued", "sent", "delivered", "failed", "read"]);

const templates = [
  {
    id: "tpl_whatsapp_followup",
    template_key: "whatsapp_followup",
    channel: "whatsapp",
    name: "Follow Up",
    body: "Здравствуйте. Напоминаем по вашему обращению.",
  },
  {
    id: "tpl_whatsapp_welcome",
    template_key: "whatsapp_welcome",
    channel: "whatsapp",
    name: "Welcome",
    body: "Здравствуйте. Спасибо за интерес к TOTEM.",
  },
  {
    id: "tpl_internal_note",
    template_key: "internal_note",
    channel: "internal",
    name: "Internal Note",
    body: "Internal admin message.",
  },
];

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeChannel(value) {
  const channel = normalizeText(value).toLowerCase();
  return MESSAGE_CHANNELS.has(channel) ? channel : "";
}

function normalizeDirection(value) {
  const direction = normalizeText(value || "outbound").toLowerCase();
  return MESSAGE_DIRECTIONS.has(direction) ? direction : "";
}

function normalizeRecipientType(value) {
  const recipientType = normalizeText(value).toLowerCase();
  return MESSAGE_RECIPIENT_TYPES.has(recipientType) ? recipientType : "";
}

function normalizeStatus(value) {
  const status = normalizeText(value || "sent").toLowerCase();
  return MESSAGE_STATUSES.has(status) ? status : "";
}

function sanitizeMessageForResponse(item) {
  const { db_id, audit, ...responseItem } = item || {};
  return responseItem;
}

function buildBodyPreview(body, templateKey) {
  const raw = normalizeText(body);

  if (raw) {
    return raw.slice(0, 240);
  }

  const template = templates.find((item) => item.template_key === templateKey || item.id === templateKey);
  return normalizeText(template?.body).slice(0, 240);
}

function validateMessageSendBody(body) {
  const channel = normalizeChannel(body?.channel);
  const direction = normalizeDirection(body?.direction || "outbound");
  const recipientType = normalizeRecipientType(body?.recipient_type);
  const recipientId = normalizeText(body?.recipient_id);

  if (!channel || !direction || !recipientType || !recipientId) {
    return false;
  }

  return true;
}

async function getNextMessageRuntimeId() {
  try {
    const result = await pool.query(`
      SELECT data->>'id' AS runtime_id
      FROM public.messages
      WHERE data->>'id' LIKE 'msg_%'
    `);
    const max = result.rows.reduce((currentMax, row) => {
      const runtimeId = String(row.runtime_id || "");
      if (!/^msg_\d+$/.test(runtimeId)) {
        return currentMax;
      }

      const value = Number(runtimeId.replace("msg_", ""));
      return Number.isFinite(value) ? Math.max(currentMax, value) : currentMax;
    }, 0);
    const nextId = max + 1;
    const runtimeId = `msg_${nextId}`;
    nextMessageId = Math.max(nextMessageId, nextId + 1);

    return runtimeId;
  } catch (error) {
    return `msg_${nextMessageId++}`;
  }
}

async function getMessageDbIdByRuntimeId(runtimeMessageId) {
  const cached = messages.get(runtimeMessageId);
  if (cached?.db_id !== null && cached?.db_id !== undefined) {
    return cached.db_id;
  }

  const result = await pool.query(
    `
    SELECT id
    FROM public.messages
    WHERE data->>'id' = $1
    LIMIT 1
    `,
    [String(runtimeMessageId || "")],
  );

  return result.rows?.[0]?.id ?? null;
}

async function resolveOptionalLeadDbId(runtimeLeadId) {
  const normalized = normalizeText(runtimeLeadId);

  if (!normalized) {
    return null;
  }

  return getLeadDbIdById(normalized);
}

async function resolveOptionalCaseDbId(runtimeCaseId) {
  const normalized = normalizeText(runtimeCaseId);

  if (!normalized) {
    return null;
  }

  return getCaseDbIdById(normalized);
}

async function logMessageAudit(db, messageDbId, action, payload = {}) {
  await db.query(
    `
    INSERT INTO public.audit_logs (entity_type, entity_id, action, data)
    VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      "message",
      messageDbId,
      action,
      JSON.stringify({
        source: "admin_control",
        entity_type: "message",
        entity_id: messageDbId,
        ...payload,
      }),
    ],
  );
}

async function persistTraceLink(db, messageDbId, payload) {
  return db.query(
    `
    INSERT INTO public.traces (message_id, attempt, status, data)
    VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      messageDbId,
      Number(payload?.attempt || 1),
      String(payload?.status || "linked"),
      JSON.stringify(payload),
    ],
  );
}

async function persistMessage(item, operation = "upsert", db = pool) {
  const data = {
    ...item,
  };
  delete data.audit;

  const leadDbId = await resolveOptionalLeadDbId(item?.lead_runtime_id);
  const caseDbId = await resolveOptionalCaseDbId(item?.moderation_case_runtime_id);
  const idempotencyKey = item?.idempotency_key ?? null;

  if (operation === "create") {
    const result = await db.query(
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

  const result = await db.query(
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

async function loadMessageByRuntimeId(runtimeMessageId) {
  const result = await pool.query(
    `
    SELECT id, data
    FROM public.messages
    WHERE data->>'id' = $1
    LIMIT 1
    `,
    [String(runtimeMessageId || "")],
  );

  const row = result.rows?.[0] || null;
  if (!row?.data) {
    return null;
  }

  const item = {
    ...row.data,
    db_id: row.id,
  };

  messages.set(String(runtimeMessageId || ""), item);

  return item;
}

router.get("/", async (req, res) => {
  try {
    const channel = normalizeChannel(req.query.channel);
    const status = normalizeStatus(req.query.status);
    const recipientType = normalizeRecipientType(req.query.recipient_type);

    const result = await pool.query(`
      SELECT id, data
      FROM public.messages
      ORDER BY created_at DESC, id DESC
    `);

    let items = result.rows.map((row) => {
      const item = {
        ...(row.data || {}),
        db_id: row.id,
      };
      messages.set(String(item.id || ""), item);
      return sanitizeMessageForResponse(item);
    });

    if (channel) {
      items = items.filter((item) => String(item.channel || "").toLowerCase() === channel);
    }

    if (status) {
      items = items.filter((item) => String(item.status || "").toLowerCase() === status);
    }

    if (recipientType) {
      items = items.filter((item) => String(item.recipient_type || "").toLowerCase() === recipientType);
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
    console.error("ADMIN_MESSAGES_READ_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "MESSAGES_READ_FAILED",
    });
  }
});

router.get("/templates", (req, res) => {
  return res.json({
    ok: true,
    data: {
      items: templates,
      pagination: {
        total: templates.length,
        limit: 0,
        offset: 0,
      },
    },
    meta: {},
  });
});

router.post("/send", async (req, res) => {
  const db = await pool.connect();

  try {
    if (!validateMessageSendBody(req.body)) {
      return res.status(400).json({
        ok: false,
        error: "MESSAGE_VALIDATION_FAILED",
      });
    }

    const channel = normalizeChannel(req.body?.channel);
    const direction = normalizeDirection(req.body?.direction || "outbound");
    const recipient_type = normalizeRecipientType(req.body?.recipient_type);
    const recipient_id = normalizeText(req.body?.recipient_id);
    const recipient_label = normalizeText(req.body?.recipient_label) || recipient_id;
    const lead_runtime_id = normalizeText(req.body?.lead_id || (recipient_type === "lead" ? recipient_id : "")) || null;
    const moderation_case_runtime_id = normalizeText(req.body?.moderation_case_id) || null;
    const template_key = normalizeText(req.body?.template_key);
    const body_preview = buildBodyPreview(req.body?.body_preview || req.body?.body, template_key);
    const provider_ref = normalizeText(req.body?.provider_ref) || null;
    const status = normalizeStatus(req.body?.status || "sent") || "sent";
    const trace_id = normalizeText(req.body?.trace_id) || null;
    const now = new Date().toISOString();

    await db.query("BEGIN");

    const id = await getNextMessageRuntimeId();
    const messageItem = {
      id,
      channel,
      direction,
      recipient_type,
      recipient_id,
      recipient_label,
      status,
      template_key,
      body_preview,
      provider_ref,
      lead_runtime_id,
      moderation_case_runtime_id,
      trace_id: trace_id || `trace_${id}`,
      created_at: now,
      sent_at: status === "sent" || status === "delivered" || status === "read" ? now : null,
      delivered_at: status === "delivered" || status === "read" ? now : null,
      failed_at: status === "failed" ? now : null,
      error_message: normalizeText(req.body?.error_message) || null,
      db_id: null,
    };

    messages.set(id, messageItem);
    const dbId = await persistMessage(messageItem, "create", db);

    await logMessageAudit(db, dbId, "message_sent", {
      action: "send",
      after: sanitizeMessageForResponse(messageItem),
      channel,
      recipient_type,
      recipient_id,
      status,
    });

    await persistTraceLink(db, dbId, {
      message_id: id,
      recipient_type,
      recipient_id,
      lead_runtime_id,
      moderation_case_runtime_id,
      trace_id: messageItem.trace_id,
      status: "linked",
      attempt: 1,
    });

    await db.query("COMMIT");

    return res.json({
      ok: true,
      data: sanitizeMessageForResponse(messageItem),
      meta: {},
    });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch (rollbackError) {}

    console.error("ADMIN_MESSAGE_SEND_ERROR", {
      error: error?.message,
      stack: error?.stack,
      payload: req.body,
    });

    return res.status(500).json({
      ok: false,
      error: "MESSAGE_PERSIST_FAILED",
    });
  } finally {
    db.release();
  }
});

router.post("/:id/retry", async (req, res) => {
  const db = await pool.connect();

  try {
    const item = await loadMessageByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "MESSAGE_NOT_FOUND",
      });
    }

    await db.query("BEGIN");

    const before = sanitizeMessageForResponse(item);
    const now = new Date().toISOString();

    item.status = "sent";
    item.sent_at = now;
    item.failed_at = null;
    item.error_message = null;
    item.retry_count = Number(item.retry_count || 0) + 1;
    item.updated_at = now;

    messages.set(String(req.params.id || ""), item);

    await persistMessage(item, "retry_update", db);

    await logMessageAudit(db, item.db_id, "message_retry", {
      action: "retry",
      before,
      after: sanitizeMessageForResponse(item),
      status: "sent",
      retry_count: item.retry_count,
    });

    await persistTraceLink(db, item.db_id, {
      message_id: item.id,
      recipient_type: item.recipient_type,
      recipient_id: item.recipient_id,
      lead_runtime_id: item.lead_runtime_id,
      moderation_case_runtime_id: item.moderation_case_runtime_id,
      trace_id: item.trace_id || `trace_${item.id}`,
      status: "retry",
      attempt: item.retry_count + 1,
    });

    await db.query("COMMIT");

    return res.json({
      ok: true,
      data: {
        id: String(req.params.id || ""),
        status: "sent",
        retry_count: item.retry_count,
      },
      meta: {},
    });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch (rollbackError) {}

    console.error("ADMIN_MESSAGE_RETRY_ERROR", {
      error: error?.message,
      stack: error?.stack,
      payload: req.body,
    });

    return res.status(500).json({
      ok: false,
      error: "MESSAGE_PERSIST_FAILED",
    });
  } finally {
    db.release();
  }
});

router.get("/:id/audit", async (req, res) => {
  try {
    const messageDbId = await getMessageDbIdByRuntimeId(req.params.id);

    if (messageDbId === null || messageDbId === undefined) {
      return res.status(404).json({
        ok: false,
        error: "MESSAGE_NOT_FOUND",
      });
    }

    const auditResult = await pool.query(
      `
      SELECT
        id,
        entity_type,
        entity_id,
        action,
        data,
        created_at
      FROM public.audit_logs
      WHERE entity_type = 'message'
      AND entity_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 50
      `,
      [messageDbId],
    );

    return res.json({
      ok: true,
      data: {
        id: String(req.params.id || ""),
        entity_id: messageDbId,
        items: auditResult.rows,
        pagination: {
          total: auditResult.rows.length,
          limit: 50,
          offset: 0,
        },
      },
      meta: {},
    });
  } catch (error) {
    console.error("ADMIN_MESSAGE_AUDIT_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "MESSAGE_AUDIT_READ_FAILED",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const item = await loadMessageByRuntimeId(req.params.id);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "MESSAGE_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      data: sanitizeMessageForResponse(item),
      meta: {},
    });
  } catch (error) {
    console.error("ADMIN_MESSAGE_DETAIL_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "MESSAGE_READ_FAILED",
    });
  }
});

export default router;
