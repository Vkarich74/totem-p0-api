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
  });
});

router.get("/:id", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
    },
  });
});

router.post("/", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: "lead_mock_1",
      status: "new",
    },
  });
});

router.post("/:id/status", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      status: String(req.body?.status || ""),
    },
  });
});

router.post("/:id/assign", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      assigned_to: String(req.body?.assigned_to || ""),
    },
  });
});

router.post("/:id/convert", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      target_type: String(req.body?.target_type || ""),
    },
  });
});

router.get("/:id/audit", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: String(req.params.id || ""),
      items: [],
    },
  });
});

export default router;
