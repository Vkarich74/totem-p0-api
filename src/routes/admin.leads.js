import express from "express";

const router = express.Router();
const leads = new Map();
let nextLeadId = 1;

router.get("/", (req, res) => {
  const items = Array.from(leads.values());

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
  const item = leads.get(req.params.id);

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "LEAD_NOT_FOUND",
    });
  }

  return res.json({
    ok: true,
    data: item,
    meta: {},
  });
});

router.post("/", (req, res) => {
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
    audit: [],
  };

  leads.set(id, leadItem);

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
});

router.post("/:id/status", (req, res) => {
  const item = leads.get(req.params.id);

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "LEAD_NOT_FOUND",
    });
  }

  const status = String(req.body?.status || "");
  item.status = status;
  item.audit.push({
    type: "status",
    value: status,
  });
  leads.set(req.params.id, item);

  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      status,
    },
    meta: {},
  });
});

router.post("/:id/assign", (req, res) => {
  const item = leads.get(req.params.id);

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "LEAD_NOT_FOUND",
    });
  }

  const assigned_to = String(req.body?.assigned_to || "");
  item.assigned_to = assigned_to;
  item.audit.push({
    type: "assign",
    value: assigned_to,
  });
  leads.set(req.params.id, item);

  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      assigned_to,
    },
    meta: {},
  });
});

router.post("/:id/convert", (req, res) => {
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

  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      target_type,
    },
    meta: {},
  });
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
