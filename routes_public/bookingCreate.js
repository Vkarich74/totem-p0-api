// routes_public/bookingCreate.js
import express from "express";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const {
      salon_id,
      master_slug,
      service_id,
      date,
      start_time,
      end_time,
      client
    } = req.body || {};

    if (
      !salon_id ||
      !master_slug ||
      !service_id ||
      !date ||
      !start_time ||
      !end_time ||
      !client ||
      !client.name
    ) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR"
      });
    }

    // FREEZE-SAFE RESPONSE
    // (smoke implementation, контракт уже зафиксирован)
    return res.json({
      ok: true,
      request_id: 1,
      price: 1000,
      duration_min: 60,
      status: "pending_payment"
    });
  } catch (err) {
    console.error("public bookingCreate error:", err);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR"
    });
  }
});

export default router;
