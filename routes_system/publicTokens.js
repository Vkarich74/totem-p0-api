// routes_system/publicTokens.js
// Admin API for Public Tokens (PostgreSQL)

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

// LIST tokens
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        token,
        salon_id,
        enabled,
        rate_limit_per_min,
        created_at,
        revoked_at
      FROM public_tokens
      ORDER BY created_at DESC
      `
    );

    return res.json({ ok: true, tokens: rows });
  } catch (err) {
    console.error("publicTokens list error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// CREATE token
router.post("/create", async (req, res) => {
  try {
    const { token, salon_slug, rate_limit_per_min = 60 } = req.body || {};

    if (!token || !salon_slug) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PAYLOAD",
      });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO public_tokens (
        token,
        salon_id,
        enabled,
        rate_limit_per_min,
        created_at
      )
      VALUES ($1, $2, true, $3, NOW())
      RETURNING id, token, salon_id, enabled, rate_limit_per_min, created_at
      `,
      [token, salon_slug, rate_limit_per_min]
    );

    return res.json({ ok: true, token: rows[0] });
  } catch (err) {
    // unique violation (duplicate token)
    if (err?.code === "23505") {
      return res.status(409).json({
        ok: false,
        error: "TOKEN_ALREADY_EXISTS",
      });
    }

    console.error("publicTokens create error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// REVOKE token
router.post("/:id/revoke", async (req, res) => {
  try {
    const { id } = req.params;

    const { rowCount, rows } = await pool.query(
      `
      UPDATE public_tokens
      SET enabled = false,
          revoked_at = NOW()
      WHERE id = $1
      RETURNING id, token, enabled, revoked_at
      `,
      [id]
    );

    if (!rowCount) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    return res.json({ ok: true, token: rows[0] });
  } catch (err) {
    console.error("publicTokens revoke error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
