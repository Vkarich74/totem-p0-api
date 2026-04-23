import express from "express";

const router = express.Router();
const messages = new Map();
let nextMessageId = 1;

function persistMessage(item, operation = "upsert") {
  // mock persistence layer
  // в будущем здесь будет DB insert/update
  return {
    operation,
    item,
  };
}

function persistMessageAudit(messageId, auditItem) {
  // mock audit persistence layer
  // в будущем здесь будет DB insert
  return {
    message_id: messageId,
    audit: auditItem,
  };
}

function persistTraceLink(traceId, payload) {
  // mock trace persistence layer
  // в будущем здесь будет DB insert/update
  return {
    trace_id: traceId,
    payload,
  };
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

router.get("/", (req, res) => {
  const items = Array.from(messages.values());

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

router.post("/send", (req, res) => {
  const id = `msg_${nextMessageId++}`;
  const channel = String(req.body?.channel || "");
  const recipient_type = String(req.body?.recipient_type || "");
  const recipient_id = String(req.body?.recipient_id || "lead_mock_1");
  const moderation_case_id = String(req.body?.moderation_case_id || "");
  const trace_id = String(req.body?.trace_id || `trace_${id}`);
  const persistence = getMessagesPersistenceAdapter();
  const messageItem = {
    id,
    channel,
    recipient_type,
    recipient_id,
    moderation_case_id,
    trace_id,
    status: "sent",
    audit: [],
  };

  messages.set(id, messageItem);
  persistence.saveMessage(messageItem, "create");
  persistence.saveTrace(trace_id, {
    message_id: id,
    recipient_id,
    moderation_case_id,
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
});

router.post("/:id/retry", (req, res) => {
  const item = messages.get(req.params.id);
  const persistence = getMessagesPersistenceAdapter();

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "MESSAGE_NOT_FOUND",
    });
  }

  item.status = "sent";
  item.audit.push({
    type: "retry",
    value: "sent",
  });
  persistence.saveAudit(req.params.id, {
    type: "retry",
    value: "sent",
  });
  messages.set(req.params.id, item);
  persistence.saveMessage(item, "retry_update");

  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      status: "sent",
    },
    meta: {},
  });
});

router.get("/:id/audit", (req, res) => {
  const item = messages.get(req.params.id);

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "MESSAGE_NOT_FOUND",
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
});

router.get("/:id", (req, res) => {
  const item = messages.get(req.params.id);

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "MESSAGE_NOT_FOUND",
    });
  }

  return res.json({
    ok: true,
    data: item,
    meta: {},
  });
});

export default router;
