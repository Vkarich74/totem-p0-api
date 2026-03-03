import express from "express";
import { pool } from "../db.js";
import { rlInternal } from "../middleware/rateLimit.js";

export function createInternalRouter() {

  const r = express.Router();

  // ===============================
  // GET MASTERS OF SALON
  // ===============================

  r.get("/salons/:slug/masters", rlInternal, async (req, res) => {

    const { slug } = req.params;

    const result = await pool.query(`
      SELECT
        m.id,
        m.name,
        ms.status
      FROM master_salon ms
      JOIN salons s ON s.id = ms.salon_id
      JOIN masters m ON m.id = ms.master_id
      WHERE s.slug = $1
      ORDER BY m.id
    `, [slug]);

    res.json(result.rows);

  });

  // ===============================
  // UPDATE MASTER PROFILE
  // ===============================

  r.put("/masters/:id/profile", rlInternal, async (req, res) => {

    const { id } = req.params;
    const { name } = req.body;

    const result = await pool.query(`
      UPDATE masters
      SET name = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING id,name
    `, [name, id]);

    res.json({
      ok: true,
      master: result.rows[0]
    });

  });

  // ===============================
  // CREATE MASTER
  // ===============================

  r.post("/masters/create", rlInternal, async (req, res) => {

    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "NAME_REQUIRED" });
    }

    const result = await pool.query(`
      INSERT INTO masters (
        name,
        active,
        created_at,
        updated_at
      )
      VALUES ($1,true,NOW(),NOW())
      RETURNING id,name
    `, [name]);

    res.json({
      ok: true,
      master: result.rows[0]
    });

  });

  // ===============================
  // FIRE MASTER
  // ===============================

  r.post("/salons/:slug/masters/:id/fire", rlInternal, async (req, res) => {

    const { slug, id } = req.params;

    await pool.query(`
      UPDATE master_salon
      SET status='fired',
          fired_at=NOW()
      WHERE master_id=$1
      AND salon_id = (
        SELECT id FROM salons WHERE slug=$2
      )
    `,[id,slug]);

    res.json({ ok:true });

  });

  // ===============================
  // ACTIVATE MASTER
  // ===============================

  r.post("/salons/:slug/masters/:id/activate", rlInternal, async (req, res) => {

    const { slug, id } = req.params;

    await pool.query(`
      UPDATE master_salon
      SET status='active',
          activated_at=NOW(),
          fired_at=NULL
      WHERE master_id=$1
      AND salon_id = (
        SELECT id FROM salons WHERE slug=$2
      )
    `,[id,slug]);

    res.json({ ok:true });

  });

  return r;

}