// routes_public/index.js
import express from 'express';
import { rateLimitPublic } from '../middleware/rate_limit.js';

import health from './health.js';
import bookings from './bookings.js';

const router = express.Router();

// rate limit for ALL public endpoints
router.use(rateLimitPublic);

router.use('/health', health);
router.use('/bookings', bookings);

export default router;
