import express from "express";
import { pool } from "../db.js";

export function createInternalRouter() {

  const r = express.Router();

  // ===============================
  // GET MASTERS OF SALON
  // ===============================

  r.get("/salons/:slug/masters", async (req, res) => {

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

  r.put("/masters/:id/profile", async (req, res) => {

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
  // CREATE MASTER + LINK TO SALON (ACTIVE)
  // ===============================

  r.post("/masters/create", async (req, res) => {

    const { name, salon_slug } = req.body;

    if (!name || !salon_slug) {
      return res.status(400).json({
        ok: false,
        error: "NAME_AND_SALON_REQUIRED"
      });
    }

    const client = await pool.connect();

    try {

      await client.query("BEGIN");

      const salon = await client.query(
        `SELECT id FROM salons WHERE slug = $1 LIMIT 1`,
        [salon_slug]
      );

      if (!salon.rows.length) {

        await client.query("ROLLBACK");

        return res.status(404).json({
          ok: false,
          error: "SALON_NOT_FOUND"
        });

      }

      const master = await client.query(`
        INSERT INTO masters (
          name,
          active,
          created_at,
          updated_at
        )
        VALUES ($1,true,NOW(),NOW())
        RETURNING id,name
      `, [name]);

      const masterId = master.rows[0].id;
      const salonId = salon.rows[0].id;

      // ВАЖНО: invited_at часто NOT NULL, поэтому ставим NOW()
      await client.query(`
        INSERT INTO master_salon (
          master_id,
          salon_id,
          status,
          invited_at,
          activated_at,
          fired_at,
          created_at,
          updated_at
        )
        VALUES ($1,$2,'active',NOW(),NOW(),NULL,NOW(),NOW())
      `, [masterId, salonId]);

      await client.query("COMMIT");

      return res.json({
        ok: true,
        master: master.rows[0]
      });

    } catch (err) {

      await client.query("ROLLBACK");

      console.error("CREATE_MASTER_ERROR", err);

      return res.status(500).json({
        ok: false,
        error: "CREATE_MASTER_FAILED",
        detail: err.message
      });

    } finally {

      client.release();

    }

  });


  // ===============================
  // FIRE MASTER
  // ===============================

  r.post("/salons/:slug/masters/:id/fire", async (req, res) => {

    const { slug, id } = req.params;

    await pool.query(`
      UPDATE master_salon
      SET status='fired',
          fired_at=NOW(),
          updated_at=NOW()
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

  r.post("/salons/:slug/masters/:id/activate", async (req, res) => {

    const { slug, id } = req.params;

    await pool.query(`
      UPDATE master_salon
      SET status='active',
          activated_at=NOW(),
          fired_at=NULL,
          updated_at=NOW()
      WHERE master_id=$1
      AND salon_id = (
        SELECT id FROM salons WHERE slug=$2
      )
    `,[id,slug]);

    res.json({ ok:true });

  });


  return r;

}