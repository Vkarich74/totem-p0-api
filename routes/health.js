// routes/health.js
import express from "express";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    // минимальный health, DB не трогаем
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false });
  }
});

export const healthRouter = router;
