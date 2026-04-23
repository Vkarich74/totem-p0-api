import express from "express";

const router = express.Router();
const cases = new Map();
let nextCaseId = 1;

function persistCase(item, operation = "upsert") {
  // mock persistence layer
  // в будущем здесь будет DB insert/update
  return {
    operation,
    item,
  };
}

router.get("/", (req, res) => {
  const items = Array.from(cases.values());

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
  const item = cases.get(req.params.id);

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "CASE_NOT_FOUND",
    });
  }

  return res.json({
    ok: true,
    data: item,
    meta: {},
  });
});

router.get("/:id/audit", (req, res) => {
  const item = cases.get(req.params.id);

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
});

router.post("/", (req, res) => {
  const id = `case_${nextCaseId++}`;
  const caseItem = {
    id,
    entity_type: "lead",
    entity_id: "lead_mock_1",
    status: "open",
    priority: "normal",
    audit: [],
  };

  cases.set(id, caseItem);
  persistCase(caseItem, "create");

  return res.json({
    ok: true,
    data: {
      id,
      status: "open",
    },
    meta: {},
  });
});

router.post("/:id/status", (req, res) => {
  const { status } = req.body;
  const item = cases.get(req.params.id);

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "CASE_NOT_FOUND",
    });
  }

  item.status = status;
  item.audit.push({
    type: "status",
    value: status,
  });
  cases.set(req.params.id, item);
  persistCase(item, "status_update");

  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      status,
    },
    meta: {},
  });
});

router.post("/:id/action", (req, res) => {
  const { action } = req.body;
  const item = cases.get(req.params.id);

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: "CASE_NOT_FOUND",
    });
  }

  item.audit.push({
    type: "action",
    value: action,
  });
  cases.set(req.params.id, item);
  persistCase(item, "action_update");

  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      action,
    },
    meta: {},
  });
});

export default router;
