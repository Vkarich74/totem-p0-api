import os
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def run(cmd: str) -> None:
    print(f"\n> {cmd}")
    p = subprocess.run(cmd, cwd=ROOT, shell=True)
    if p.returncode != 0:
        print(f"\nERROR: command failed ({p.returncode}): {cmd}")
        sys.exit(p.returncode)

def write_file(rel_path: str, content: str) -> None:
    path = ROOT / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"WRITE: {rel_path}")

def patch_index_js() -> None:
    index_path = ROOT / "index.js"
    if not index_path.exists():
        print("ERROR: index.js not found in repo root")
        sys.exit(2)

    txt = index_path.read_text(encoding="utf-8")

    # 1) ensure import
    import_line = "import reportsRoutes from './reports/index.js';\n"
    if "from './reports/index.js'" not in txt:
        # insert after bookingRoutes import if present, else after express/db imports
        lines = txt.splitlines(True)
        insert_at = None
        for i, line in enumerate(lines):
            if "import bookingRoutes" in line:
                insert_at = i + 1
                break
        if insert_at is None:
            # fallback: after first block of imports
            for i, line in enumerate(lines):
                if not line.startswith("import"):
                    insert_at = i
                    break
            if insert_at is None:
                insert_at = len(lines)

        lines.insert(insert_at, import_line)
        txt = "".join(lines)

    # 2) ensure mount
    if "app.use('/reports'," not in txt and 'app.use("/reports",' not in txt:
        mount_line = "app.use('/reports', reportsRoutes);\n"
        lines = txt.splitlines(True)

        # insert near other app.use routes (after booking routes preferred)
        insert_at = None
        for i, line in enumerate(lines):
            if "app.use('/booking'" in line or 'app.use("/booking"' in line:
                insert_at = i + 1
                break
        if insert_at is None:
            # fallback: before START block
            for i, line in enumerate(lines):
                if "===== START" in line:
                    insert_at = i
                    break
        if insert_at is None:
            insert_at = len(lines)

        lines.insert(insert_at, mount_line)
        txt = "".join(lines)

    index_path.write_text(txt, encoding="utf-8")
    print("PATCH: index.js (reports import + mount)")

def main() -> None:
    os.chdir(ROOT)

    # Safety: show where we are
    print(f"ROOT: {ROOT}")

    # Create reports files (READ-ONLY)
    reports_index = """import express from 'express';
import db from '../db.js';

const router = express.Router();

/**
 * Activation guard (READ-ONLY allowed)
 * Uses subscription table.
 * Context: salon_id from:
 * - X-Salon-Id header
 * - req.params.salon_id
 * - req.query.salon_id
 */
async function requireActiveSalon(req, res, next) {
  try {
    const salon_id =
      req.headers['x-salon-id'] ||
      req.params?.salon_id ||
      req.query?.salon_id;

    if (!salon_id) return res.status(400).json({ error: 'SALON_ID_REQUIRED' });

    const sql =
      db.mode === 'POSTGRES'
        ? `SELECT 1 FROM salon_subscriptions WHERE salon_id=$1 AND active_until >= NOW()`
        : `SELECT 1 FROM salon_subscriptions WHERE salon_id=? AND active_until >= datetime('now')`;

    const row = await db.get(sql, [String(salon_id)]);
    if (!row) return res.status(403).json({ error: 'SALON_NOT_ACTIVE' });

    req._reports_salon_id = String(salon_id);
    next();
  } catch (e) {
    console.error('[REPORTS_GUARD]', e);
    res.status(500).json({ error: 'REPORTS_GUARD_FAILED' });
  }
}

/**
 * GET /reports/calendar/master/:master_id
 * Requires active salon via X-Salon-Id (caller context)
 */
router.get('/calendar/master/:master_id', requireActiveSalon, async (req, res) => {
  try {
    const master_id = Number(req.params.master_id);

    const sql =
      db.mode === 'POSTGRES'
        ? `
          SELECT salon_id, start_at, end_at, status
          FROM calendar_slots
          WHERE master_id = $1
          ORDER BY start_at
        `
        : `
          SELECT salon_id, start_at, end_at, status
          FROM calendar_slots
          WHERE master_id = ?
          ORDER BY start_at
        `;

    const rows = await db.all(sql, [master_id]);
    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[REPORT_CALENDAR_MASTER]', e);
    res.status(500).json({ error: 'REPORT_FAILED' });
  }
});

/**
 * GET /reports/finance/salon/:salon_id
 * Requires active salon for the same salon_id
 */
router.get('/finance/salon/:salon_id', requireActiveSalon, async (req, res) => {
  try {
    const salon_id = String(req.params.salon_id);

    // Ensure caller context matches the requested salon_id (hard rule)
    if (req._reports_salon_id !== salon_id) {
      return res.status(403).json({ error: 'SALON_CONTEXT_MISMATCH' });
    }

    const listSql =
      db.mode === 'POSTGRES'
        ? `SELECT type, status, amount, currency, created_at FROM finance_events WHERE salon_id=$1 ORDER BY created_at DESC`
        : `SELECT type, status, amount, currency, created_at FROM finance_events WHERE salon_id=? ORDER BY created_at DESC`;

    const items = await db.all(listSql, [salon_id]);

    // Aggregates (safe in app layer)
    let cnt = 0;
    let sum = 0;
    const by_type = {};
    const by_status = {};

    for (const it of items) {
      cnt += 1;
      const a = Number(it.amount || 0);
      sum += a;

      const t = String(it.type || 'unknown');
      const s = String(it.status || 'unknown');

      by_type[t] = (by_type[t] || 0) + a;
      by_status[s] = (by_status[s] || 0) + a;
    }

    res.json({
      ok: true,
      salon_id,
      totals: { cnt, sum, currency: 'KGS' },
      by_type,
      by_status,
      items
    });
  } catch (e) {
    console.error('[REPORT_FINANCE_SALON]', e);
    res.status(500).json({ error: 'REPORT_FAILED' });
  }
});

/**
 * GET /reports/bookings/salon/:salon_id
 * Requires active salon for the same salon_id
 */
router.get('/bookings/salon/:salon_id', requireActiveSalon, async (req, res) => {
  try {
    const salon_id = String(req.params.salon_id);

    if (req._reports_salon_id !== salon_id) {
      return res.status(403).json({ error: 'SALON_CONTEXT_MISMATCH' });
    }

    const sql =
      db.mode === 'POSTGRES'
        ? `
          SELECT id, salon_id, salon_slug, master_id, start_at, end_at, status, request_id, created_at
          FROM bookings
          WHERE salon_id = $1
          ORDER BY start_at DESC
        `
        : `
          SELECT id, salon_id, salon_slug, master_id, start_at, end_at, status, request_id, created_at
          FROM bookings
          WHERE salon_id = ?
          ORDER BY start_at DESC
        `;

    const rows = await db.all(sql, [Number(salon_id)]);
    res.json({ ok: true, salon_id, items: rows });
  } catch (e) {
    console.error('[REPORT_BOOKINGS_SALON]', e);
    res.status(500).json({ error: 'REPORT_FAILED' });
  }
});

export default router;
"""

    write_file("reports/index.js", reports_index)

    # Patch index.js to mount /reports
    patch_index_js()

    # Git automation
    run("git status --porcelain")
    run("git add reports index.js")
    run("git commit -m \"REPORTS: read-only endpoints (calendar/finance/bookings)\"")
    run("git push")

    # Tag and push tags
    run("git tag v1.0.1-reports")
    run("git push --tags")

    print("\nDONE: REPORTS deployed.")
    print("\nVERIFY:")
    print("  curl -s https://totem-p0-api-production.up.railway.app/health")
    print("  curl -s https://totem-p0-api-production.up.railway.app/reports/bookings/salon/1 -H \"X-Salon-Id: 1\"")
    print("  curl -s https://totem-p0-api-production.up.railway.app/reports/finance/salon/1 -H \"X-Salon-Id: 1\"")
    print("  curl -s https://totem-p0-api-production.up.railway.app/reports/calendar/master/1 -H \"X-Salon-Id: 1\"")

if __name__ == "__main__":
    main()
