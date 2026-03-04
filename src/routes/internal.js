import express from "express";
import { pool } from "../db.js";

export function createInternalRouter() {

  const r = express.Router();

  // ===============================
  // GET MASTERS OF SALON
  // ===============================

  r.get("/salons/:slug/masters", async (req, res) => {

    const { slug } = req.params;

    try {

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

    } catch (err) {

      console.error(err);

      res.status(500).json({
        ok:false,
        error:"MASTERS_FETCH_FAILED"
      });

    }

  });

  // ===============================
  // CREATE MASTER + LINK SALON
  // ===============================

  r.post("/masters/create", async (req, res) => {

    const { name, salon_slug } = req.body;

    if (!name || !salon_slug) {
      return res.status(400).json({
        ok:false,
        error:"NAME_AND_SALON_REQUIRED"
      });
    }

    const client = await pool.connect();

    try {

      await client.query("BEGIN");

      // получить salon_id
      const salon = await client.query(
        `SELECT id FROM salons WHERE slug=$1`,
        [salon_slug]
      );

      if (!salon.rows.length) {
        throw new Error("SALON_NOT_FOUND");
      }

      const salonId = salon.rows[0].id;

      // сгенерировать slug мастера
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      // создать мастера
      const master = await client.query(`
        INSERT INTO masters(name, slug, active, created_at)
        VALUES ($1,$2,true,NOW())
        RETURNING id,name
      `,[name,slug]);

      const masterId = master.rows[0].id;

      // связать с салоном
      await client.query(`
        INSERT INTO master_salon(
          master_id,
          salon_id,
          status,
          invited_at,
          activated_at,
          created_at,
          updated_at
        )
        VALUES($1,$2,'active',NOW(),NOW(),NOW(),NOW())
      `,[masterId,salonId]);

      await client.query("COMMIT");

      res.json({
        ok:true,
        master:master.rows[0]
      });

    } catch(err) {

      await client.query("ROLLBACK");

      console.error("CREATE_MASTER_ERROR:",err);

      res.status(500).json({
        ok:false,
        error:err.message
      });

    } finally {

      client.release();

    }

  });

  return r;

}