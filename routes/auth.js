// routes/auth.js
import express from "express";

const router = express.Router();

router.post("/request", (req, res) => {
  res.json({ ok: true });
});

router.get("/verify-json", (req, res) => {
  res.status(400).json({ error: "not implemented" });
});

router.post("/session", (req, res) => {
  res.status(400).json({ error: "not implemented" });
});

export default router;
