// routes/auth.js
import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.post("/request", (req, res) => {
  res.json({ ok: true });
});

router.post("/verify-json", (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token required" });

  // минимальный bearer для тестов
  res.json({ token });
});

router.post("/session", (req, res) => {
  res.status(400).json({ error: "not implemented" });
});

export default router;
