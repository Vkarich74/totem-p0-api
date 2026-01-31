import express from "express";

const router = express.Router();

/**
 * GET /health
 * Simple health check for Railway / monitoring
 */
router.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

export default router;
