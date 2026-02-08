// CALENDAR v1 — reserve endpoint
// DB-level conflict protection (exclusion constraint)

import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * POST /calendar/reserve
 * body: { master_id, salon_id?, start_at, end_at, request_id }
 */
router.post("/reserve", async (req, res) => {
  const { master_id, salon_id = null, start_at, end_at, request_id } = req.body;

  if (!master_id || !start_at || !end_at || !request_id) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotency check
    const idem = await client.query(
      "SELECT id FROM calendar_slots WHERE request_id = $1",
      [request_id]
    );
    if (idem.rowCount > 0) {
      await client.query("COMMIT");
      return res.status(200).json({ status: "already_reserved" });
    }

    // Insert (DB enforces conflicts)
    await client.query(
      `
      INSERT INTO calendar_slots
        (id, master_id, salon_id, start_at, end_at, status, request_id)
      VALUES
        (gen_random_uuid(), $1, $2, $3, $4, 'reserved', $5)
      `,
      [master_id, salon_id, start_at, end_at, request_id]
    );

    await client.query("COMMIT");
    return res.status(201).json({ status: "reserved" });
  } catch (err) {
    await client.query("ROLLBACK");

    // Exclusion constraint → conflict
    if (err.code === "23P01") {
      return res.status(409).json({ error: "time_conflict" });
    }

    throw err;
  } finally {
    client.release();
  }
});

export default router;
