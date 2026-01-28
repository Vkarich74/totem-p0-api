// logs/logger.js
function nowIso() {
  return new Date().toISOString();
}

export function log(level, msg, fields = {}) {
  const rec = {
    ts: nowIso(),
    level,
    msg,
    ...fields
  };
  // stdout — удобно для Railway / Docker / PM2
  console.log(JSON.stringify(rec));
}

export function withRequest(req, base = {}) {
  return {
    request_id: req.request_id,
    method: req.method,
    path: req.originalUrl,
    ...base
  };
}
