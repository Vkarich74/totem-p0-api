// middleware/anti_bypass_public.js

export function requirePublicToken(req, res, next) {
  const expected = process.env.PUBLIC_TOKEN || ''

  const got =
    req.headers['x-public-token'] ||
    req.headers['X-Public-Token'] ||
    req.query.public_token ||
    ''

  if (!expected) {
    return res.status(500).json({ error: 'server_misconfigured' })
  }

  if (!got || got !== expected) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  next()
}

export function requireWebhookToken(req, res, next) {
  const expected = process.env.PAYMENT_WEBHOOK_TOKEN || ''

  const got =
    req.headers['x-webhook-token'] ||
    req.headers['X-Webhook-Token'] ||
    ''

  if (!expected) {
    return res.status(500).json({ error: 'server_misconfigured' })
  }

  if (!got || got !== expected) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  next()
}
