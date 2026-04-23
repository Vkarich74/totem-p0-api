import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  return res.json({
    ok: true,
    data: [],
  });
});

router.get("/:id", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      name: "Lead Mock",
      phone: "+996700000000",
      source: "manual_admin",
      status: "new",
      assigned_to: null,
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
  const { status } = req.body;

  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      status,
    },
  });
});

router.post("/:id/assign", (req, res) => {
  const { assigned_to } = req.body;

  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      assigned_to,
    },
  });
});

router.post("/:id/convert", (req, res) => {
  const { target_type } = req.body;

  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      status: "converted",
      target_type,
    },
  });
});

router.get("/:id/audit", (req, res) => {
  return res.json({
    ok: true,
    data: {
      items: [],
    },
  });
});

export default router;
