// routes/public.js
// Minimal public router to keep API stable
// SAFE: read-only placeholder

import express from "express";

const router = express.Router();

// health-like ping for public scope
router.get("/ping", (req, res) => {
  res.json({ ok: true, scope: "public" });
});

export default router;
