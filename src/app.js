import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pkg from 'pg';

import { resolveAuth } from './middleware/resolveAuth.js';
import { requireAuth } from './middleware/requireAuth.js';
import { requireRole } from './middleware/requireRole.js';

const { Pool } = pkg;

const app = express();
app.use(express.json());

/* =========================
   CORS
========================= */

const ALLOWED_ORIGIN = 'https://totem-platform.odoo.com';

app.use(cors({
  origin: ALLOWED_ORIGIN,
  credentials: true
}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key, X-User-Id, X-Role'
  );
  next();
});

/* =========================
   AUTH CONTEXT
========================= */

app.use(resolveAuth);

/* =========================
   DATABASE
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   HEALTH
========================= */

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('HEALTH_ERROR:', err);
    return res.status(500).json({ ok: false });
  }
});

/* =========================
   AUTH RESOLVE
========================= */

app.get('/auth/resolve', async (req, res) => {
  return res.status(200).json({
    ok: true,
    auth: req.auth
      ? {
          user_id: req.auth.user_id,
          role: req.auth.role,
          source: req.auth.source
        }
      : null
  });
});

/* =========================
   OWNER API
========================= */

app.get(
  '/owner/ping',
  requireAuth,
  requireRole(['owner', 'salon_admin']),
  async (req, res) => {
    return res.status(200).json({
      ok: true,
      role: req.auth.role,
      user_id: req.auth.user_id
    });
  }
);

/* =========================
   SLUG RESOLVE
========================= */

app.get('/s/:slug/resolve', async (req, res) => {
  const { slug } = req.params;

  try {
    const result = await pool.query(
      'SELECT id, slug FROM salons WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'SALON_NOT_FOUND' });
    }

    const salon = result.rows[0];

    return res.status(200).json({
      ok: true,
      salon_id: String(salon.id),
      slug: salon.slug
    });
  } catch (err) {
    console.error('SLUG_RESOLVE_ERROR:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

/* =========================
   BOOKINGS (TEMP SAFE STUB)
========================= */

app.post('/bookings/:id/confirm', async (req, res) => {
  return res.status(501).json({
    ok: false,
    error: 'CONFIRM_BOOKING_NOT_ENABLED_RUNTIME'
  });
});

app.post('/bookings/:id/cancel', async (req, res) => {
  return res.status(501).json({
    ok: false,
    error: 'CANCEL_BOOKING_NOT_ENABLED_RUNTIME'
  });
});

/* =========================
   GLOBAL 404
========================= */

app.use((req, res) => {
  return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
});

/* =========================
   START SERVER (FIXED 8080)
========================= */

const PORT = 8080;

app.listen(PORT, () => {
  console.log(`Server running on port: ${PORT}`);
});
