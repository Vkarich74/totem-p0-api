// calendar v1 canonical — rebuild marker 2026-02-10
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.post("/reserve", async (req, res) => {
  const { master_id, salon_id, start_at, end_at, request_id } = req.body;

  if (!salon_id) return res.status(400).json({ error: "SALON_ID_REQUIRED" });
  if (!request_id) return res.status(400).json({ error: "REQUEST_ID_REQUIRED" });
  if (!master_id || !start_at || !end_at) return res.status(400).json({ error: "MISSING_FIELDS" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const idem = await client.query(
      "SELECT id FROM calendar_slots WHERE request_id = $1",
      [request_id]
    );
    if (idem.rowCount > 0) {
      await client.query("COMMIT");
      return res.json({ ok: true });
    }

    await client.query(
      `
      INSERT INTO calendar_slots
        (master_id, salon_id, start_at, end_at, status, request_id)
      VALUES
        ($1, $2, $3, $4, 'reserved', $5)
      `,
      [master_id, salon_id, start_at, end_at, request_id]
    );

    await client.query("COMMIT");
    return res.status(201).json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23P01") return res.status(409).json({ error: "CALENDAR_CONFLICT" });
    if (err.code === "23505") return res.json({ ok: true }); // request_id unique hit
    throw err;
  } finally {
    client.release();
  }
});

router.get("/master/:master_id", async (req, res) => {
  const { master_id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) return res.status(400).json({ error: "SALON_ID_REQUIRED" });

  const { rows } = await pool.query(
    `
    SELECT id, master_id, salon_id, start_at, end_at, status
    FROM calendar_slots
    WHERE master_id = $1
      AND salon_id = $2
      AND status <> 'cancelled'
    ORDER BY start_at
    `,
    [master_id, salon_id]
  );

  return res.json({ ok: true, slots: rows });
});

export default router;
