// middleware/requestId.js (ESM)
// STEP 24.1 — request_id for correlation

import crypto from "crypto";

function genId() {
  // short, unique-enough for logs (12 bytes -> 24 hex chars)
  return crypto.randomBytes(12).toString("hex");
}

export function requestId() {
  return function requestIdMiddleware(req, res, next) {
    const incoming =
      req.headers["x-request-id"] ||
      req.headers["x-correlation-id"] ||
      req.headers["request-id"];

    const id = incoming ? String(incoming).slice(0, 64) : genId();

    req.request_id = id;
    res.setHeader("x-request-id", id);

    next();
  };
}
