# TOTEM_ONBOARDING_FULL_AUTO.py
# EXECUTION MODE — ONE FILE — FULL AUTO
# WINDOWS-SAFE PSQL EXECUTION (NO cmd /c, NO nested quotes)

import os, sys, subprocess
from datetime import datetime

ROOT = r"C:\Users\Vitaly\Desktop\odoo-local"
API = "https://totem-p0-api-production.up.railway.app"

SYSTEM_TOKEN = "TECH_SYSTEM_TOKEN_TEMP_2026"

PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"
PG_EXE = os.path.join(PG_BIN, "psql.exe")
PG_URL = "postgresql://postgres:prZkCbCpYTlLPXPkSprHnliKsXCQjoSU@interchange.proxy.rlwy.net:55042/railway"

ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
REPORT_DIR = os.path.join(ROOT, "reports")
REPORT = os.path.join(REPORT_DIR, f"ONBOARDING_AUTO_{ts}.md")

def log(msg):
    print(msg)
    os.makedirs(REPORT_DIR, exist_ok=True)
    with open(REPORT, "a", encoding="utf-8") as f:
        f.write(msg + "\n")

def run(stage, args, cwd=None):
    log(f"\n$ {' '.join(args)}")
    p = subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        text=True
    )
    if p.stdout:
        log(p.stdout.rstrip())
    if p.stderr:
        log(p.stderr.rstrip())
    if p.returncode != 0:
        log(f"[FAIL] {stage}")
        log(f"REPORT: {REPORT}")
        sys.exit(1)
    log(f"[OK] {stage}")

log("# TOTEM ONBOARDING FULL AUTO")
log(f"TS: {ts}")

# 1️⃣ PRECHECK
run("GIT STATUS", ["git", "status", "--porcelain"])
run("HEALTH", ["curl", "-i", f"{API}/health"])

# 2️⃣ WRITE SQL
os.makedirs(os.path.join(ROOT, "sql"), exist_ok=True)
SQL_FILE = os.path.join(ROOT, "sql", "system_onboarding_identity.sql")

with open(SQL_FILE, "w", encoding="utf-8") as f:
    f.write("""
BEGIN;
CREATE TABLE IF NOT EXISTS onboarding_identities (
  id SERIAL PRIMARY KEY,
  lead_id TEXT UNIQUE NOT NULL,
  odoo_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  requested_role TEXT NOT NULL,
  granted_role TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
""")

log("[OK] SQL FILE CREATED")

# 3️⃣ DB PROBE (EXACTLY LIKE MANUAL, BUT SAFE)
run(
    "DB PROBE",
    [PG_EXE, PG_URL, "-v", "ON_ERROR_STOP=1", "-c", "select 1 as ok;"],
    cwd=PG_BIN
)

# 4️⃣ DB APPLY
run(
    "DB APPLY",
    [PG_EXE, PG_URL, "-v", "ON_ERROR_STOP=1", "-f", SQL_FILE],
    cwd=PG_BIN
)

# 5️⃣ WRITE ROUTE
ROUTES_DIR = os.path.join(ROOT, "routes")
os.makedirs(ROUTES_DIR, exist_ok=True)

with open(os.path.join(ROUTES_DIR, "system_onboarding_identity.js"), "w", encoding="utf-8") as f:
    f.write("""
import express from "express";
import db from "../db.js";

const router = express.Router();

router.post("/onboarding/identity", async (req, res) => {
  const { lead_id, odoo_user_id, email, requested_role } = req.body || {};
  if (!lead_id || !odoo_user_id || !email || !requested_role)
    return res.status(400).json({ error: "INVALID_INPUT" });

  const sel = db.mode === "POSTGRES"
    ? "SELECT id core_user_id, granted_role, state FROM onboarding_identities WHERE lead_id=$1"
    : "SELECT id core_user_id, granted_role, state FROM onboarding_identities WHERE lead_id=?";

  const ex = await db.get(sel, [lead_id]);
  if (ex) return res.json(ex);

  await db.run(
    db.mode === "POSTGRES"
      ? "INSERT INTO onboarding_identities (lead_id,odoo_user_id,email,requested_role,granted_role) VALUES ($1,$2,$3,$4,$5)"
      : "INSERT INTO onboarding_identities VALUES (?,?,?,?,?)",
    [lead_id, String(odoo_user_id), email, requested_role, requested_role]
  );

  const r = await db.get(sel, [lead_id]);
  res.json(r);
});

export default router;
""")

log("[OK] ROUTE FILE CREATED")

# 6️⃣ OVERWRITE routes/system.js
with open(os.path.join(ROOT, "routes", "system.js"), "w", encoding="utf-8") as f:
    f.write(f"""
import express from "express";
import onboarding from "./system_onboarding_identity.js";

const router = express.Router();

router.use((req, res, next) => {{
  const token = req.header("X-System-Token");
  if (!token || token !== "{SYSTEM_TOKEN}") {{
    return res.status(401).json({{ error: "unauthorized" }});
  }}
  next();
}});

router.use("/", onboarding);

export default router;
""")

log("[OK] SYSTEM ROUTER WRITTEN")

# 7️⃣ OVERWRITE index.js
with open(os.path.join(ROOT, "index.js"), "w", encoding="utf-8") as f:
    f.write("""
import express from 'express';
import db from './db.js';

import ownerRoutes from './routes_owner/index.js';
import calendarRoutes from './calendar/calendar.routes.js';
import bookingRoutes from './booking/booking.routes.js';
import reportsRoutes from './reports/index.js';
import systemRoutes from './routes/system.js';

import { ensureCalendarTable } from './calendar/calendar.sql.js';
import { ensureBookingsTable } from './booking/booking.sql.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/system', systemRoutes);
app.use('/owner', ownerRoutes);
app.use('/calendar', calendarRoutes);
app.use('/booking', bookingRoutes);
app.use('/reports', reportsRoutes);

async function bootstrap() {
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
""")

log("[OK] INDEX WRITTEN")

# 8️⃣ GIT
run("GIT ADD", ["git", "add", "."])
run("GIT COMMIT", ["git", "commit", "-m", "system: onboarding full auto canonical"])
run("GIT PUSH", ["git", "push"])

# 9️⃣ SMOKE
run(
    "SMOKE",
    [
        "curl", "-i", "-X", "POST", f"{API}/system/onboarding/identity",
        "-H", "Content-Type: application/json",
        "-H", f"X-System-Token: {SYSTEM_TOKEN}",
        "-d", f'{{"lead_id":"auto-{ts}","odoo_user_id":"1","email":"a@a","requested_role":"MASTER"}}'
    ]
)

log("[OK] DONE")
log(f"REPORT: {REPORT}")
