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
      id: String(req.params.id || ""),
    },
    meta: {},
  });
});

router.post("/", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: "new_lead",
      lead_type: String(req.body?.lead_type || ""),
      name: String(req.body?.name || ""),
      phone: String(req.body?.phone || ""),
      source: String(req.body?.source || ""),
    },
    meta: {},
  });
});

router.post("/:id/status", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      status: String(req.body?.status || ""),
    },
    meta: {},
  });
});

router.post("/:id/assign", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      assigned_to: String(req.body?.assigned_to || ""),
    },
    meta: {},
  });
});

router.post("/:id/convert", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      target_type: String(req.body?.target_type || ""),
    },
    meta: {},
  });
});

router.get("/:id/audit", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      items: [],
    },
    meta: {},
  });
});

export default router;
