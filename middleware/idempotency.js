// middleware/idempotency.js
// Named export REQUIRED
// Safe no-op guard: does not block first request
// Prevents server crash due to export mismatch

export function idempotencyGuard(req, _res, next) {
  const body = req.body || {};
  const request_id = body.request_id;

  if (!request_id) {
    return next();
  }

  // attach only for tracing/debug
  req._idempotency = { request_id };

  return next();
}
