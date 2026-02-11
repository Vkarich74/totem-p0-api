import express from "express";
import db from "../db.js";

const router = express.Router();

router.get("/auth-users", async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM auth_users LIMIT 10`);
    res.json(rows);
  } catch (e) {
    console.error("[DEBUG_AUTH_USERS_ERROR]", e);
    res.status(500).json({ error: "debug_failed" });
  }
});

export default router;
