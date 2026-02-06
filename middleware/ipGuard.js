function parseList(val) {
  if (!val) return [];
  return val
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

export function allowSystemIPs(req, res, next) {
  const allow = parseList(process.env.SYSTEM_IP_ALLOWLIST);

  // если список пуст — ЗАКРЫТО
  if (!allow.length) {
    return res.status(403).json({ error: 'SYSTEM_IP_BLOCKED' });
  }

  const ip = getClientIp(req);

  if (!allow.includes(ip)) {
    return res.status(403).json({
      error: 'SYSTEM_IP_NOT_ALLOWED',
      ip
    });
  }

  next();
}

export function allowWebhookIPs(req, res, next) {
  const allow = parseList(process.env.WEBHOOK_IP_ALLOWLIST);

  // если не задан — пропускаем (по умолчанию открыто)
  if (!allow.length) {
    return next();
  }

  const ip = getClientIp(req);

  if (!allow.includes(ip)) {
    return res.status(403).json({
      error: 'WEBHOOK_IP_NOT_ALLOWED',
      ip
    });
  }

  next();
}
