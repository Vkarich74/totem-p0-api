// middlewares/rateLimitPublic.js

import rateLimit from "express-rate-limit";

export const publicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 300, // 300 запросов с IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "RATE_LIMIT_EXCEEDED",
  },
});
