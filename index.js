import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pkg from 'pg';

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
   AUTH (HEADER-BASED)
========================= */

function resolveAuth(req, res, next) {
  const rawId = req.headers['x-user-id'];
  const rawRole = req.headers['x-role'];

  const user_id = rawId ? parseInt(rawId, 10) : null;
  const role = rawRole ? String(rawRole) : null;

  if (Number.isInteger(user_id) && role) {
    req.auth = { user_id, role };
  } else {
    req.auth = null;
  }

  next();
}

function requireAuth(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }
    next();
  };
}

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
   OWNER API
========================= */

app.get(
  '/owner/ping',
  requireAuth,
  requireRole(['owner', 'salon_admin']),
  (req, res) => {
    return res.status(200).json({
      ok: true,
      user_id: req.auth.user_id,
      role: req.auth.role
    });
  }
);

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
