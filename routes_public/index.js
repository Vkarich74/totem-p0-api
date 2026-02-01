// routes_public/index.js
import express from 'express';
import { rateLimitPublic } from '../middleware/rate_limit.js';
import bookings from './bookings.js';

const router = express.Router();

// rate limit for ALL public endpoints
router.use(rateLimitPublic);

// health endpoint (INLINE, без health.js)
router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// bookings
router.use('/bookings', bookings);

export default router;
