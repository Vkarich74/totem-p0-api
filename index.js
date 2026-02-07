import express from 'express';
import db from './db.js';

import ownerRoutes from './routes_owner/index.js';
import calendarRoutes from './calendar/calendar.routes.js';
import bookingRoutes from './booking/booking.routes.js';

import { ensureCalendarTable } from './calendar/calendar.sql.js';
import { ensureBookingsTable } from './booking/booking.sql.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// ===== HEALTH =====
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

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

    if (!salon) {
      return res.status(500).json({ error: 'SALON_CREATE_FAILED' });
    }

    req.salon = salon;
    req.salon_id = salon.id;
    next();
  } catch (e) {
    console.error('[SALON_RESOLVER]', e);
    res.status(500).json({ error: 'SALON_RESOLVE_FAILED' });
  }
});

// ===== RESOLVE API =====
app.get('/s/:slug/resolve', (req, res) => {
  res.json({
    ok: true,
    salon_id: String(req.salon_id),
    slug: req.salon.slug,
    status: req.salon.status
  });
});

// ===== FINANCE EVENT (ACTIVATION) =====
app.post('/finance/event', async (req, res) => {
  try {
    const { salon_id, type, amount } = req.body;
    if (!salon_id || !type || !amount) {
      return res.status(400).json({ error: 'INVALID_INPUT' });
    }

    const insertEvent =
      db.mode === 'POSTGRES'
        ? `
          INSERT INTO finance_events (salon_id, type, amount, status)
          VALUES ($1,$2,$3,'confirmed')
        `
        : `
          INSERT INTO finance_events (salon_id, type, amount, status)
          VALUES (?,?,?,'confirmed')
        `;

    await db.run(insertEvent, [String(salon_id), type, amount]);

    const extend =
      db.mode === 'POSTGRES'
        ? `
          INSERT INTO salon_subscriptions (salon_id, active_until)
          VALUES ($1, NOW() + INTERVAL '30 days')
          ON CONFLICT (salon_id)
          DO UPDATE SET active_until =
            GREATEST(salon_subscriptions.active_until, NOW())
            + INTERVAL '30 days'
        `
        : `
          INSERT INTO salon_subscriptions (salon_id, active_until)
          VALUES (?, datetime('now','+30 days'))
          ON CONFLICT(salon_id)
          DO UPDATE SET active_until =
            datetime(MAX(active_until, datetime('now')), '+30 days')
        `;

    await db.run(extend, [String(salon_id)]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[FINANCE_EVENT]', e);
    res.status(500).json({ error: 'FINANCE_EVENT_FAILED' });
  }
});

// ===== ROUTES =====
app.use('/owner', ownerRoutes);
app.use('/calendar', calendarRoutes);
app.use('/booking', bookingRoutes);

// ===== START =====
async function bootstrap() {
  await ensureSalonsTable();
  await ensureFinanceTable();
  await ensureSubscriptionsTable();
  await ensureCalendarTable();
  await ensureBookingsTable();

  app.listen(PORT, () => {
    console.log('TOTEM API STARTED', PORT);
  });
}

bootstrap().catch((e) => {
  console.error('[BOOTSTRAP_FAILED]', e);
  process.exit(1);
});
