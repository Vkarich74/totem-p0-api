// routes/health.js
import express from 'express';
import { db } from '../db/index.js';

const router = express.Router();

router.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error('HEALTH_DB_ERROR', err);
    res.status(500).json({ ok: false });
  }
});

export default router;
