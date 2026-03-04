import express from "express";
import { pool } from "../db.js";

export function createInternalRouter() {

  const r = express.Router();

  // ===============================
  // GET MASTERS OF SALON
  // ===============================

  r.get("/salons/:slug/masters", async (req,res)=>{

    const { slug } = req.params;

    try{

      const result = await pool.query(`
        SELECT
          m.id,
          m.name,
          ms.status
        FROM master_salon ms
        JOIN salons s ON s.id = ms.salon_id
        JOIN masters m ON m.id = ms.master_id
        WHERE s.slug=$1
        ORDER BY m.id
      `,[slug]);

      res.json(result.rows);

    }catch(err){

      console.error(err);

      res.status(500).json({
        ok:false,
        error:"MASTERS_FETCH_FAILED"
      });

    }

  });

  // ===============================
  // CREATE MASTER (INVITE)
  // ===============================

  r.post("/masters/create", async (req,res)=>{

    const { name, salon_slug } = req.body;

    if(!name || !salon_slug){
      return res.status(400).json({
        ok:false,
        error:"NAME_AND_SALON_REQUIRED"
      });
    }

    const client = await pool.connect();

    try{

      await client.query("BEGIN");

      const salon = await client.query(
        `SELECT id FROM salons WHERE slug=$1`,
        [salon_slug]
      );

      if(!salon.rows.length){
        throw new Error("SALON_NOT_FOUND");
      }

      const salonId = salon.rows[0].id;

      const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g,"-")
        .replace(/(^-|-$)/g,"");

      const slug = baseSlug + "-" + Date.now();

      const email = slug + "@totem.local";

      const passwordHash = "invite_pending";

      // создаем auth_users
      const user = await client.query(`
        INSERT INTO auth_users(
          email,
          role,
          master_slug,
          password_hash
        )
        VALUES ($1,'master',$2,$3)
        RETURNING id
      `,[email,slug,passwordHash]);

      const userId = user.rows[0].id;

      // создаем master
      const master = await client.query(`
        INSERT INTO masters(
          user_id,
          slug,
          name
        )
        VALUES ($1,$2,$3)
        RETURNING id,name
      `,[userId,slug,name]);

      const masterId = master.rows[0].id;

      // связываем с салоном (INVITE → pending)
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
        VALUES($1,$2,'pending',NOW(),NULL,NOW(),NOW())
      `,[masterId,salonId]);

      await client.query("COMMIT");

      res.json({
        ok:true,
        master:master.rows[0]
      });

    }catch(err){

      await client.query("ROLLBACK");

      console.error(err);

      res.status(500).json({
        ok:false,
        error:err.message
      });

    }finally{

      client.release();

    }

  });

  // ===============================
  // ACTIVATE MASTER
  // ===============================

  r.post("/masters/activate", async (req,res)=>{

    const { master_id, salon_slug } = req.body;

    if(!master_id || !salon_slug){
      return res.status(400).json({
        ok:false,
        error:"MASTER_AND_SALON_REQUIRED"
      });
    }

    try{

      const result = await pool.query(`
        UPDATE master_salon ms
        SET
          status='active',
          activated_at=NOW(),
          updated_at=NOW()
        FROM salons s
        WHERE
          s.id = ms.salon_id
          AND s.slug=$1
          AND ms.master_id=$2
          AND ms.status='pending'
        RETURNING ms.master_id
      `,[salon_slug,master_id]);

      if(!result.rows.length){
        return res.status(404).json({
          ok:false,
          error:"MASTER_NOT_PENDING"
        });
      }

      res.json({ ok:true });

    }catch(err){

      console.error(err);

      res.status(500).json({
        ok:false,
        error:"ACTIVATE_FAILED"
      });

    }

  });

  // ===============================
  // FIRE MASTER
  // ===============================

  r.post("/masters/fire", async (req,res)=>{

    const { master_id, salon_slug } = req.body;

    if(!master_id || !salon_slug){
      return res.status(400).json({
        ok:false,
        error:"MASTER_AND_SALON_REQUIRED"
      });
    }

    try{

      const result = await pool.query(`
        UPDATE master_salon ms
        SET
          status='fired',
          updated_at=NOW()
        FROM salons s
        WHERE
          s.id = ms.salon_id
          AND s.slug=$1
          AND ms.master_id=$2
          AND ms.status='active'
        RETURNING ms.master_id
      `,[salon_slug,master_id]);

      if(!result.rows.length){
        return res.status(404).json({
          ok:false,
          error:"MASTER_NOT_ACTIVE"
        });
      }

      res.json({ ok:true });

    }catch(err){

      console.error(err);

      res.status(500).json({
        ok:false,
        error:"FIRE_FAILED"
      });

    }

  });

  return r;

}