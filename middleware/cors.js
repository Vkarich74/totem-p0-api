// middleware/cors.js
// CORS — CANONICAL v1
// Default: allow all origins (safe for current phase)
// Ready for domain lock via env ALLOWED_ORIGINS

import cors from "cors";

export function corsMiddleware() {
  const raw = process.env.ALLOWED_ORIGINS || "";
  const allowList = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // If no allowlist provided -> allow all (v1 safe default)
  if (allowList.length === 0) {
    return cors({
      origin: true,
      credentials: false,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Public-Token"],
      maxAge: 86400,
    });
  }

  // Locked mode: allow only listed origins
  return cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / server-to-server
      if (allowList.includes(origin)) return cb(null, true);
      return cb(new Error("CORS_NOT_ALLOWED"), false);
    },
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Public-Token"],
    maxAge: 86400,
  });
}
