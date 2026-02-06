// middleware/request_context.js
// Adds request_id to req/res and structured logs

import crypto from 'crypto';

export function requestContext(req, res, next) {
  const incoming =
    req.headers['x-request-id'] ||
    req.body?.request_id ||
    crypto.randomUUID();

  req.request_id = String(incoming);

  res.setHeader('x-request-id', req.request_id);

  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(JSON.stringify({
      level: 'info',
      msg: 'request',
      request_id: req.request_id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: ms,
    }));
  });

  next();
}
