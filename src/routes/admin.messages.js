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

router.get("/templates", (req, res) => {
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

router.post("/send", (req, res) => {
  const { channel, recipient_type } = req.body;

  return res.json({
    ok: true,
    data: {
      id: "msg_mock_1",
      channel,
      recipient_type,
      status: "sent",
    },
    meta: {},
  });
});

router.post("/:id/retry", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      status: "sent",
    },
    meta: {},
  });
});

router.get("/:id", (req, res) => {
  return res.json({
    ok: true,
    data: {
      id: req.params.id,
      channel: "whatsapp",
      status: "sent",
      recipient_type: "lead",
      recipient_id: "lead_mock_1",
    },
    meta: {},
  });
});

export default router;
