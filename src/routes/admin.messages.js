import express from "express";
import { pool } from "../db.js";
import { getLeadDbIdById } from "./admin.leads.js";
import { getCaseDbIdById } from "./admin.moderation.js";
import { createNotification } from "../services/notifications/notificationService.js";

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

async function resolveCanonicalRecipientId(db, recipientType, recipientId) {
  const safeRecipientId = normalizeText(recipientId);

  if (!safeRecipientId) {
    return null;
  }

  if (recipientType !== "master" && recipientType !== "salon") {
    return safeRecipientId;
  }

  const table = recipientType === "master" ? "public.masters" : "public.salons";
  const result = await db.query(
    `
      SELECT id
      FROM ${table}
      WHERE id::text = $1 OR slug = $1
      LIMIT 1
    `,
    [safeRecipientId],
  );

  const row = result.rows?.[0] || null;
  return row?.id !== null && row?.id !== undefined ? String(row.id) : safeRecipientId;
}

async function resolvePersistedMessageDbId(db, messageItem, fallbackDbId) {
  const numericFallback = Number(fallbackDbId);
  if (Number.isFinite(numericFallback) && numericFallback > 0) {
    return numericFallback;
  }

  const runtimeId = normalizeText(messageItem?.id);
  if (runtimeId) {
    const directLookup = await db.query(
      `
      SELECT id
      FROM public.messages
      WHERE data->>'id' = $1
      ORDER BY id DESC
      LIMIT 1
      `,
      [runtimeId],
    );

    const directId = Number(directLookup.rows?.[0]?.id);
    if (Number.isFinite(directId) && directId > 0) {
      return directId;
    }
  }

  const recipientType = normalizeText(messageItem?.recipient_type);
  const recipientId = normalizeText(messageItem?.recipient_id);
  const bodyPreview = normalizeText(messageItem?.body_preview);

  if (recipientType && recipientId && bodyPreview) {
    const fallbackLookup = await db.query(
      `
      SELECT id
      FROM public.messages
      WHERE data->>'recipient_type' = $1
        AND data->>'recipient_id' = $2
        AND COALESCE(data->>'body_preview', '') = $3
      ORDER BY id DESC
      LIMIT 1
      `,
      [recipientType, recipientId, bodyPreview],
    );

    const fallbackId = Number(fallbackLookup.rows?.[0]?.id);
    if (Number.isFinite(fallbackId) && fallbackId > 0) {
      return fallbackId;
    }
  }

  return null;
}

async function persistNotificationBridgeResult(db, messageDbId, result) {
  if (!messageDbId) {
    console.error("ADMIN_MESSAGE_NOTIFICATION_BRIDGE_RESULT_NO_MESSAGE_ID", {
      message_db_id: messageDbId,
      result: result || null,
    });
    return { ok: false, noMessageId: true };
  }

  try {
    await db.query(
      `
      UPDATE public.messages
      SET
        data = jsonb_set(
          COALESCE(data, '{}'::jsonb),
          '{notification_bridge}',
          $2::jsonb,
          true
        ),
        updated_at = NOW()
      WHERE id = $1
      `,
      [messageDbId, JSON.stringify(result || { attempted: false, reason: "NO_RESULT" })],
    );

    const verify = await db.query(
      `
      SELECT data->'notification_bridge' AS notification_bridge
      FROM public.messages
      WHERE id = $1
      LIMIT 1
      `,
      [messageDbId],
    );

    if (!verify.rows?.[0]?.notification_bridge) {
      console.error("ADMIN_MESSAGE_NOTIFICATION_BRIDGE_RESULT_VERIFY_NULL", {
        message_db_id: messageDbId,
        result: result || null,
      });
      return { ok: false, verifyNull: true };
    }

    return { ok: true };
  } catch (error) {
    console.error("ADMIN_MESSAGE_NOTIFICATION_BRIDGE_RESULT_PERSIST_FAILED", {
      message_db_id: messageDbId,
      error: String(error?.message || error || "BRIDGE_RESULT_PERSIST_FAILED").slice(0, 500),
    });
    return { ok: false, error: String(error?.message || error || "BRIDGE_RESULT_PERSIST_FAILED").slice(0, 500) };
  }
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
    let notificationBridgeResult = {
      attempted: false,
      ok: false,
      reason: "BRIDGE_NOT_ATTEMPTED_YET",
      bridge: "admin_internal_message",
    };
    let notificationBridgePersisted = false;
    let canonicalRecipientId = null;

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
    const messageDbId = await resolvePersistedMessageDbId(db, messageItem, dbId);
    if (messageDbId === null) {
      notificationBridgeResult = {
        attempted: false,
        ok: false,
        reason: "MESSAGE_DB_ID_NOT_RESOLVED",
        bridge: "admin_internal_message",
        message_db_id: null,
        recipient_type,
        recipient_id,
      };
      const persistResult = await persistNotificationBridgeResult(db, messageDbId, notificationBridgeResult);
      notificationBridgePersisted = Boolean(persistResult?.ok);
    } else {
      notificationBridgeResult = {
        attempted: false,
        ok: false,
        reason: "BRIDGE_NOT_ATTEMPTED_YET",
        bridge: "admin_internal_message",
        message_db_id: messageDbId,
        recipient_type,
        recipient_id,
      };
      const persistResult = await persistNotificationBridgeResult(db, messageDbId, notificationBridgeResult);
      notificationBridgePersisted = Boolean(persistResult?.ok);
      if (!notificationBridgePersisted) {
        notificationBridgeResult.reason = persistResult?.noMessageId
          ? "MESSAGE_DB_ID_NOT_RESOLVED"
          : "BRIDGE_RESULT_VERIFY_NULL";
      }
      if (!notificationBridgePersisted && persistResult?.verifyNull) {
        notificationBridgeResult.reason = "BRIDGE_RESULT_VERIFY_NULL";
      }
    }

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

    if (channel !== "internal") {
      notificationBridgeResult = {
        attempted: false,
        ok: false,
        reason: "CHANNEL_NOT_INTERNAL",
        bridge: "admin_internal_message",
        message_db_id: messageDbId,
        recipient_type,
        recipient_id,
      };
      const persistResult = await persistNotificationBridgeResult(db, messageDbId, notificationBridgeResult);
      notificationBridgePersisted = Boolean(persistResult?.ok);
      if (!notificationBridgePersisted) {
        notificationBridgeResult.reason = persistResult?.noMessageId
          ? "MESSAGE_DB_ID_NOT_RESOLVED"
          : "BRIDGE_RESULT_VERIFY_NULL";
      }
      if (!notificationBridgePersisted && persistResult?.verifyNull) {
        notificationBridgeResult.reason = "BRIDGE_RESULT_VERIFY_NULL";
      }
    } else if (!["client", "master", "salon"].includes(recipient_type)) {
      notificationBridgeResult = {
        attempted: false,
        ok: false,
        reason: "RECIPIENT_TYPE_NOT_PUSH_TARGET",
        bridge: "admin_internal_message",
        message_db_id: messageDbId,
        recipient_type,
        recipient_id,
      };
      const persistResult = await persistNotificationBridgeResult(db, messageDbId, notificationBridgeResult);
      notificationBridgePersisted = Boolean(persistResult?.ok);
      if (!notificationBridgePersisted) {
        notificationBridgeResult.reason = persistResult?.noMessageId
          ? "MESSAGE_DB_ID_NOT_RESOLVED"
          : "BRIDGE_RESULT_VERIFY_NULL";
      }
      if (!notificationBridgePersisted && persistResult?.verifyNull) {
        notificationBridgeResult.reason = "BRIDGE_RESULT_VERIFY_NULL";
      }
    } else {
      canonicalRecipientId = await resolveCanonicalRecipientId(db, recipient_type, recipient_id);
      notificationBridgeResult = {
        attempted: true,
        ok: false,
        reason: "CREATE_NOTIFICATION_IN_PROGRESS",
        bridge: "admin_internal_message",
        message_db_id: messageDbId,
        recipient_type,
        recipient_id,
        canonical_recipient_id: canonicalRecipientId,
      };

      const notificationTitle =
        normalizeText(req.body?.title_ru || req.body?.subject || req.body?.title) ||
        "Сообщение от администратора";
      const notificationBody =
        normalizeText(req.body?.body_ru || req.body?.body || req.body?.text || req.body?.body_preview) ||
        body_preview ||
        "Новое внутреннее сообщение";
      const notificationPayload = {
        message_id: id,
        message_uid: id,
        message_db_id: messageDbId,
        recipient_type,
        recipient_id: String(recipient_id),
        canonical_recipient_id: canonicalRecipientId,
        source: "admin_messages",
        bridge: "admin_internal_message",
        channel,
        sent_by: "admin",
      };

      await db.query("SAVEPOINT admin_message_notification");

      try {
        const notification = await createNotification(db, {
          target_type: recipient_type,
          target_id: String(canonicalRecipientId || recipient_id),
          owner_type: recipient_type === "client" ? null : recipient_type,
          owner_id: recipient_type === "client" ? null : String(canonicalRecipientId || recipient_id),
          channel: "in_app",
          priority: "normal",
          title_ru: notificationTitle,
          body_ru: notificationBody,
          action_type: "message",
          action_url:
            recipient_type === "master"
              ? `/master/${canonicalRecipientId || recipient_id}/dashboard`
              : recipient_type === "salon"
                ? `/salon/${canonicalRecipientId || recipient_id}/dashboard`
                : null,
          status: "sent",
          payload_json: notificationPayload,
        });
        notificationBridgeResult = {
          attempted: true,
          ok: true,
          notification_id: notification?.id ?? null,
          notification_uid: notification?.notification_uid ?? null,
          bridge: "admin_internal_message",
          message_db_id: messageDbId,
          recipient_type,
          recipient_id,
          canonical_recipient_id: canonicalRecipientId,
        };
        try {
          await db.query("RELEASE SAVEPOINT admin_message_notification");
        } catch (releaseError) {
          console.error("ADMIN_MESSAGE_NOTIFICATION_BRIDGE_RELEASE_FAILED", {
            message_db_id: messageDbId,
            recipient_type,
            recipient_id,
            error: String(releaseError?.message || releaseError || "SAVEPOINT_RELEASE_FAILED").slice(0, 500),
          });

          try {
            await db.query("ROLLBACK TO SAVEPOINT admin_message_notification");
          } catch (notificationRollbackError) {
            console.error("ADMIN_MESSAGE_NOTIFICATION_BRIDGE_ROLLBACK_FAILED", notificationRollbackError);
          }

          notificationBridgeResult = {
            attempted: true,
            ok: false,
            error: `SAVEPOINT_RELEASE_FAILED: ${String(releaseError?.message || releaseError || "SAVEPOINT_RELEASE_FAILED").slice(0, 500)}`,
            bridge: "admin_internal_message",
            message_db_id: messageDbId,
            recipient_type,
            recipient_id,
            canonical_recipient_id: canonicalRecipientId,
          };
        }

        {
          const persistResult = await persistNotificationBridgeResult(db, messageDbId, notificationBridgeResult);
          notificationBridgePersisted = Boolean(persistResult?.ok);
          if (!notificationBridgePersisted) {
            notificationBridgeResult.reason = persistResult?.noMessageId
              ? "MESSAGE_DB_ID_NOT_RESOLVED"
              : "BRIDGE_RESULT_VERIFY_NULL";
          }
          if (!notificationBridgePersisted && persistResult?.verifyNull) {
            notificationBridgeResult.reason = "BRIDGE_RESULT_VERIFY_NULL";
          }
        }
      } catch (error) {
        try {
          await db.query("ROLLBACK TO SAVEPOINT admin_message_notification");
        } catch (notificationRollbackError) {
          console.error("ADMIN_MESSAGE_NOTIFICATION_BRIDGE_ROLLBACK_FAILED", notificationRollbackError);
        }

        console.error("ADMIN_MESSAGE_NOTIFICATION_BRIDGE_FAILED", {
          message_db_id: Number(dbId),
          recipient_type,
          recipient_id,
          error: String(error?.message || error || "ADMIN_MESSAGE_NOTIFICATION_BRIDGE_FAILED").slice(0, 500),
        });
        notificationBridgeResult = {
          attempted: true,
          ok: false,
          error: String(error?.message || error || "ADMIN_MESSAGE_NOTIFICATION_BRIDGE_FAILED").slice(0, 500),
          bridge: "admin_internal_message",
          message_db_id: messageDbId,
          recipient_type,
          recipient_id,
          canonical_recipient_id: canonicalRecipientId,
        };
        {
          const persistResult = await persistNotificationBridgeResult(db, messageDbId, notificationBridgeResult);
          notificationBridgePersisted = Boolean(persistResult?.ok);
          if (!notificationBridgePersisted) {
            notificationBridgeResult.reason = persistResult?.noMessageId
              ? "MESSAGE_DB_ID_NOT_RESOLVED"
              : "BRIDGE_RESULT_VERIFY_NULL";
          }
          if (!notificationBridgePersisted && persistResult?.verifyNull) {
            notificationBridgeResult.reason = "BRIDGE_RESULT_VERIFY_NULL";
          }
        }
        console.error("ADMIN_MESSAGE_NOTIFICATION_ERROR", error);
      }
    }

    await db.query("COMMIT");

    return res.json({
      ok: true,
      data: sanitizeMessageForResponse(messageItem),
      notification_bridge: notificationBridgeResult,
      notification_bridge_persisted: Boolean(notificationBridgePersisted),
      message_db_id: messageDbId,
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
