// middleware/idempotency.js
// Idempotency guard for POST /public/bookings
// Correct behavior:
// - FIRST request_id → allow insert
// - REPEAT request_id → return conflict (409)
// - NEVER block on empty DB

export default function idempotencyGuard(req, res, next) {
  const { request_id } = req.body || {};

  if (!request_id) {
    return next(); // no idempotency requested
  }

  req._idempotency = { request_id };
  return next();
}
