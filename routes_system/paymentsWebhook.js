// routes_system/paymentsWebhook.js
// SYSTEM: confirm payment intent

import express from "express";

const router = express.Router();

/*
  SYSTEM-ONLY endpoint.
  Confirms payment intent and marks booking as paid.
*/

router.post("/", (req, res) => {
  const { payment_id, status } = req.body;

  if (!payment_id || !status) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_PAYLOAD",
    });
  }

  if (status !== "succeeded") {
    return res.status(400).json({
      ok: false,
      error: "UNSUPPORTED_STATUS",
    });
  }

  // MOCK CONFIRMATION (v1)
  // In real provider integration, this is where DB update happens

  return res.json({
    ok: true,
    payment_id,
    status: "confirmed",
  });
});

export default router;
