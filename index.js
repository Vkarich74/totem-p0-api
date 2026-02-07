import express from 'express';
import db from './db.js';

import ownerRoutes from './routes_owner/index.js';
import calendarRoutes from './calendar/calendar.routes.js';
import { ensureCalendarTable } from './calendar/calendar.sql.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ===== SALONS =====
async function ensureSalonsTable() {
  if (db.mode === 'POSTGRES') {
    await db.run(`
      CREATE TABLE IF NOT EXISTS salons (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE,
        name TEXT,
        status TEXT
      );
    `);
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS salons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE,
        name TEXT,
        status TEXT
      );
    `);
  }
}

// ===== FINANCE =====
async function ensureFinanceTable() {
  if (db.mode === 'POSTGRES') {
    await db.run(`
      CREATE TABLE IF NOT EXISTS finance_events (
        id SERIAL PRIMARY KEY,
        salon_id TEXT NOT NULL,
        master_id TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'KGS',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS finance_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        salon_id TEXT NOT NULL,
        master_id TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'KGS',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
}

// ===== SUBSCRIPTIONS =====
async function ensureSubscriptionsTable() {
  if (db.mode === 'POSTGRES') {
    await db.run(`
      CREATE TABLE IF NOT EXISTS salon_subscriptions (
        salon_id TEXT PRIMARY KEY,
        active_until TIMESTAMPTZ NOT NULL
      );
    `);
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS salon_subscriptions (
        salon_id TEXT PRIMARY KEY,
        active_until TEXT NOT NULL
      );
    `);
  }
}

// ===== SALON RESOLVER =====
app.use('/s/:slug', async (req, res, next) => {
  try {
    const slug = req.params.slug;

    const selectSql =
      db.mode === 'POSTGRES'
        ? 'SELECT id, slug, status FROM salons WHERE slug = $1'
        : 'SELECT id, slug, status FROM salons WHERE slug = ?';

    let salon = await db.get(selectSql, [slug]);

    if (!salon) {
      const insertSql =
        db.mode === 'POSTGRES'
          ? `
            INSERT INTO salons (slug, name, status)
            VALUES ($1, $2, 'created')
            ON CONFLICT (slug) DO NOTHING
          `
          : `
            INSERT OR IGNORE INTO salons (slug, name, status)
            VALUES (?, ?, 'created')
          `;

      await db.run(insertSql, [slug, slug]);
      salon = await db.get(selectSql, [slug]);
    }

    if (!salon) return res.status(500).json({ error: 'SALON_CREATE_FAILED' });

    req.salon = salon;
    req.salon_id = salon.id;
    next();
  } catch (e) {
    console.error('[SALON_RESOLVER]', e);
    res.status(500).json({ error: 'SALON_RESOLVE_FAILED' });
  }
});

// ===== RESOLVE API (PUBLIC) =====
app.get('/s/:slug/resolve', (req, res) => {
  res.json({
    ok: true,
    salon_id: String(req.salon_id),
    slug: req.salon.slug,
    status: req.salon.status
  });
});

// ===== ROUTES =====
app.use('/owner', ownerRoutes);
app.use('/calendar', calendarRoutes);

// ===== START =====
async function bootstrap() {
  await ensureSalonsTable();
  await ensureFinanceTable();
  await ensureSubscriptionsTable();
  await ensureCalendarTable();

  app.listen(PORT, () => {
    console.log('TOTEM API STARTED', PORT);
  });
}

bootstrap().catch((e) => {
  console.error('[BOOTSTRAP_FAILED]', e);
  process.exit(1);
});
