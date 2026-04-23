import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  return res.json({
    ok: true,
    data: {
      items: [],
      pagination: {
        total: 0,
        limit: 0,
        offset: 0,
      },
    },
    meta: {},
  });
});

router.get("/:id", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      entity_type: "lead",
      entity_id: "lead_mock_1",
      status: "open",
      priority: "normal",
    },
    meta: {},
  });
});

router.post("/", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: "case_mock_1",
      status: "open",
    },
    meta: {},
  });
});

router.post("/:id/status", (req, res) => {
  const { status } = req.body;

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

  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      action,
    },
  });
});

export default router;
