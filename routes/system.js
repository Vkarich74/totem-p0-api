// routes/system.js
// System-level endpoints
// AUTH: X-System-Token

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

// ===== SYSTEM AUTH =====
router.use((req, res, next) => {
  const token = req.header("X-System-Token");
  if (!token || token !== process.env.SYSTEM_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// ======================================================
// POST /system/payments/webhook
// Body:
// { booking_id: number, status: "succeeded" | "failed" }
// ======================================================
router.post("/payments/webhook", async (req, res) => {
  const { booking_id, status } = req.body;

  if (!booking_id || !status) {
    return res.status(400).json({ error: "booking_id_and_status_required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE`,
      [booking_id]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "booking_not_found" });
    }

    const currentStatus = rows[0].status;

    if (currentStatus !== "pending_payment") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "invalid_booking_status",
        currentStatus,
      });
    }

    if (status === "succeeded") {
      await client.query(
        `UPDATE bookings SET status = 'paid' WHERE id = $1`,
        [booking_id]
      );
    } else if (status === "failed") {
      await client.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
        [booking_id]
      );
    } else {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "invalid_status_value" });
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[SYSTEM PAYMENTS WEBHOOK ERROR]", err);
    res.status(500).json({ error: "internal_error" });
  } finally {
    client.release();
  }
});

export default router;
