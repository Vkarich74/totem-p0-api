# TOTEM_ONBOARDING_FULL_AUTO_ONEFILE.py
# EXECUTION MODE ORCHESTRATOR — single file creates/patches everything and runs full pipeline.
# TECH ONLY: embedded temporary system token as requested.

import os
import sys
import re
import subprocess
from datetime import datetime

ROOT = r"C:\Users\Vitaly\Desktop\odoo-local"

API_BASE = "https://totem-p0-api-production.up.railway.app"
TECH_SYSTEM_TOKEN = "TECH_SYSTEM_TOKEN_TEMP_2026"  # TECH ONLY (temporary)

# --- Files to create/patch ---
SQL_PATH = os.path.join(ROOT, "sql", "system_onboarding_identity.sql")
ROUTE_IDENTITY_PATH = os.path.join(ROOT, "routes", "system_onboarding_identity.js")

INDEX_JS_PATH = os.path.join(ROOT, "index.js")
SYSTEM_JS_PATH = os.path.join(ROOT, "routes", "system.js")

REPORTS_DIR = os.path.join(ROOT, "reports")


def now_ts() -> str:
    return datetime.utcnow().strftime("%Y%m%d_%H%M%S")


RUN_TS = now_ts()
REPORT_PATH = os.path.join(REPORTS_DIR, f"ONBOARDING_IDENTITY_FULL_AUTO_{RUN_TS}.md")


def banner(msg: str):
    print("\n" + "=" * 72)
    print(msg)
    print("=" * 72)


def write_report(line: str):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(REPORT_PATH, "a", encoding="utf-8") as f:
        f.write(line.rstrip() + "\n")


def status_ok(stage: str):
    s = f"[OK] {stage}"
    print(s)
    write_report(s)


def status_fail(stage: str, detail: str):
    s = f"[FAIL] {stage}\nERROR: {detail}\nSTOP EXECUTION"
    print(s)
    write_report(s)
    sys.exit(1)


def run_cmd(stage: str, cmd: str, allow_fail: bool = False) -> str:
    write_report(f"\n$ {cmd}")
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    out = (p.stdout or "") + (p.stderr or "")
    write_report(out.rstrip())
    if p.returncode != 0 and not allow_fail:
        status_fail(stage, f"Command failed ({p.returncode}): {cmd}")
    return out


def file_backup(path: str):
    if not os.path.exists(path):
        return
    bak = f"{path}.bak.{RUN_TS}"
    with open(path, "rb") as fsrc:
        data = fsrc.read()
    with open(bak, "wb") as fdst:
        fdst.write(data)
    write_report(f"[BACKUP] {path} -> {bak}")


def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text(path: str, content: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


def ensure_required_files():
    if not os.path.isdir(ROOT):
        status_fail("PRECHECK", f"ROOT not found: {ROOT}")
    if not os.path.exists(INDEX_JS_PATH):
        status_fail("PRECHECK", f"Missing index.js at {INDEX_JS_PATH}")
    # system.js may exist or not; if not, script will create.
    status_ok("PRECHECK: paths OK")


def precheck_git_clean():
    out = run_cmd("GIT_STATUS", "git status --porcelain", allow_fail=False).strip()
    if out:
        status_fail("PRECHECK: git clean", "Working tree is not clean. Commit/stash first.")
    status_ok("PRECHECK: git clean")


def precheck_health():
    out = run_cmd("HEALTH", f"curl -i {API_BASE}/health", allow_fail=False)
    if "200 OK" not in out and "HTTP/1.1 200" not in out:
        status_fail("PRECHECK: health", "API health not OK")
    status_ok("PRECHECK: health OK")


def make_sql_file():
    # Postgres schema; idempotent.
    sql = """-- system_onboarding_identity.sql
-- PURPOSE: store Odoo → Core onboarding identities
-- MODE: idempotent
-- SCOPE: NEW TABLE ONLY

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
"""
    write_text(SQL_PATH, sql)
    status_ok("WRITE: sql/system_onboarding_identity.sql")


def make_identity_route_file():
    # Uses existing db.js wrapper (your index.js imports ./db.js).
    # Route is mounted under /system via routes/system.js.
    js = f"""// routes/system_onboarding_identity.js
// TECH ONLY — SYSTEM ENDPOINT
// AUTH: X-System-Token enforced in routes/system.js
// Contract: POST /system/onboarding/identity (idempotent by lead_id)

import express from "express";
import db from "../db.js";

const router = express.Router();

router.post("/onboarding/identity", async (req, res) => {{
  try {{
    const {{ lead_id, odoo_user_id, email, requested_role }} = req.body || {{}};

    if (!lead_id || !odoo_user_id || !email || !requested_role) {{
      return res.status(400).json({{ error: "INVALID_INPUT" }});
    }}

    // 1) idempotency check
    const selectSql =
      db.mode === "POSTGRES"
        ? "SELECT id AS core_user_id, granted_role, state FROM onboarding_identities WHERE lead_id = $1"
        : "SELECT id AS core_user_id, granted_role, state FROM onboarding_identities WHERE lead_id = ?";

    const existing = await db.get(selectSql, [String(lead_id)]);
    if (existing) {{
      return res.json(existing);
    }}

    // 2) grant role = requested_role (intent accepted; state PENDING)
    const granted_role = String(requested_role);

    const insertSql =
      db.mode === "POSTGRES"
        ? `
          INSERT INTO onboarding_identities (lead_id, odoo_user_id, email, requested_role, granted_role, state)
          VALUES ($1,$2,$3,$4,$5,'PENDING')
        `
        : `
          INSERT INTO onboarding_identities (lead_id, odoo_user_id, email, requested_role, granted_role, state)
          VALUES (?,?,?,?,?,'PENDING')
        `;

    await db.run(insertSql, [
      String(lead_id),
      String(odoo_user_id),
      String(email),
      String(requested_role),
      String(granted_role),
    ]);

    const created = await db.get(selectSql, [String(lead_id)]);
    return res.json(created);
  }} catch (e) {{
    console.error("[SYSTEM_ONBOARDING_IDENTITY]", e);
    return res.status(500).json({{ error: "INTERNAL_ERROR" }});
  }}
}});

export default router;
"""
    write_text(ROUTE_IDENTITY_PATH, js)
    status_ok("WRITE: routes/system_onboarding_identity.js")


def patch_system_js():
    # If system.js exists, patch in place. If not, create.
    content = ""
    if os.path.exists(SYSTEM_JS_PATH):
        file_backup(SYSTEM_JS_PATH)
        content = read_text(SYSTEM_JS_PATH)
    else:
        content = 'import express from "express";\n\nconst router = express.Router();\n\nexport default router;\n'

    # Ensure express import exists
    if "import express" not in content:
        content = 'import express from "express";\n' + content

    # Ensure router exists
    if "express.Router()" not in content:
        # naive create router
        content = content.replace("export default router;", "")
        content += "\nconst router = express.Router();\n\nexport default router;\n"

    # Add onboarding import if missing
    if 'system_onboarding_identity.js' not in content:
        # place after existing imports
        lines = content.splitlines()
        insert_at = 0
        for i, line in enumerate(lines):
            if line.startswith("import "):
                insert_at = i + 1
        lines.insert(insert_at, 'import onboardingIdentity from "./system_onboarding_identity.js";')
        content = "\n".join(lines)

    # Add AUTH middleware (X-System-Token) if missing
    if "X-System-Token" not in content and "x-system-token" not in content:
        # Insert middleware after router creation
        # Find "const router = express.Router();"
        m = re.search(r"const\s+router\s*=\s*express\.Router\(\);\s*", content)
        if not m:
            status_fail("PATCH: routes/system.js", "Cannot find router declaration to insert auth middleware.")
        insert_pos = m.end()
        auth_block = f"""
// =====================
// SYSTEM AUTH (TECH ONLY)
// =====================
router.use((req, res, next) => {{
  const token = req.header("X-System-Token") || req.header("x-system-token");
  const expected = process.env.SYSTEM_TOKEN || "{TECH_SYSTEM_TOKEN}";
  if (!token || token !== expected) {{
    return res.status(401).json({{ error: "unauthorized" }});
  }}
  next();
}});
"""
        content = content[:insert_pos] + auth_block + content[insert_pos:]

    # Mount onboarding route if missing
    if "onboardingIdentity" in content and "router.use" in content:
        if re.search(r"router\.use\(\s*[\"']/?[\"']\s*,\s*onboardingIdentity\s*\)", content) is None and \
           re.search(r"router\.use\(\s*onboardingIdentity\s*\)", content) is None:
            # Insert before export default router
            content = content.replace(
                "export default router;",
                '\n// ===== ONBOARDING =====\nrouter.use("/", onboardingIdentity);\n\nexport default router;'
            )

    write_text(SYSTEM_JS_PATH, content + ("\n" if not content.endswith("\n") else ""))
    status_ok("PATCH: routes/system.js")


def patch_index_js():
    file_backup(INDEX_JS_PATH)
    content = read_text(INDEX_JS_PATH)

    # 1) ensure import systemRoutes exists
    if "from './routes/system.js'" not in content and 'from "./routes/system.js"' not in content:
        # insert after existing import blocks
        lines = content.splitlines()
        insert_at = 0
        for i, line in enumerate(lines):
            if line.startswith("import "):
                insert_at = i + 1
        lines.insert(insert_at, "import systemRoutes from './routes/system.js';")
        content = "\n".join(lines)

    # 2) ensure app.use('/system', systemRoutes) exists
    if re.search(r"app\.use\(\s*[\"']\/system[\"']\s*,\s*systemRoutes\s*\)", content) is None:
        # place it in ROUTES section before owner/calendar/booking/reports
        # Find line "app.use('/owner'" and insert before it
        lines = content.splitlines()
        inserted = False
        for i, line in enumerate(lines):
            if "app.use('/owner'" in line or 'app.use("/owner"' in line:
                lines.insert(i, "app.use('/system', systemRoutes);")
                inserted = True
                break
        if not inserted:
            # fallback: insert after express.json()
            for i, line in enumerate(lines):
                if "app.use(express.json" in line:
                    lines.insert(i + 1, "\n// ===== SYSTEM =====\napp.use('/system', systemRoutes);\n")
                    inserted = True
                    break
        content = "\n".join(lines)

    write_text(INDEX_JS_PATH, content + ("\n" if not content.endswith("\n") else ""))
    status_ok("PATCH: index.js")


def apply_db_schema():
    # Uses DATABASE_URL env. If missing — STOP with exact fix command.
    db_url = os.environ.get("DATABASE_URL", "").strip()
    if not db_url:
        msg = (
            "DATABASE_URL env is missing.\n"
            "Fix (one command, current CMD session):\n"
            'set DATABASE_URL=postgresql://postgres:***@interchange.proxy.rlwy.net:55042/railway'
        )
        status_fail("DB_APPLY", msg)

    psql = r'"C:\Program Files\PostgreSQL\18\bin\psql.exe"'
    cmd = f'{psql} "{db_url}" -f "{SQL_PATH}"'
    run_cmd("DB_APPLY", cmd, allow_fail=False)
    status_ok("DB_APPLY: schema applied")


def git_commit_push():
    run_cmd("GIT_ADD", "git add .", allow_fail=False)
    # commit may fail if nothing to commit (idempotent re-run)
    out = run_cmd("GIT_COMMIT", 'git commit -m "system: onboarding identity (full auto onefile)"', allow_fail=True)
    if "nothing to commit" in out.lower():
        write_report("[INFO] nothing to commit")
    else:
        # if commit failed for other reason -> stop
        if "fatal" in out.lower() or "error" in out.lower():
            status_fail("GIT_COMMIT", "Commit failed. Check git output in report.")
    run_cmd("GIT_PUSH", "git push", allow_fail=False)
    status_ok("GIT: push done")


def smoke_test():
    lead = f"test-{RUN_TS}"
    payload = (
        f'{{"lead_id":"{lead}","odoo_user_id":"1","email":"test@test","requested_role":"MASTER"}}'
    )
    cmd = (
        f'curl -i -X POST {API_BASE}/system/onboarding/identity '
        f'-H "Content-Type: application/json" '
        f'-H "X-System-Token: {TECH_SYSTEM_TOKEN}" '
        f'-d "{payload}"'
    )
    out = run_cmd("SMOKE", cmd, allow_fail=False)
    if "200 OK" not in out and "HTTP/1.1 200" not in out:
        status_fail("SMOKE", "Smoke test did not return 200 OK")
    status_ok("SMOKE: OK")


def main():
    banner("TOTEM — ONBOARDING IDENTITY FULL AUTO (ONEFILE)")
    os.makedirs(REPORTS_DIR, exist_ok=True)
    write_report("# TOTEM — ONBOARDING IDENTITY FULL AUTO (ONEFILE)")
    write_report(f"UTC RUN_TS: {RUN_TS}")
    write_report(f"ROOT: {ROOT}")
    write_report(f"API_BASE: {API_BASE}")
    write_report(f"TECH_SYSTEM_TOKEN: {TECH_SYSTEM_TOKEN} (TECH ONLY)")
    write_report("")

    # Stage 1: prechecks
    ensure_required_files()
    precheck_git_clean()
    precheck_health()

    # Stage 2: write artifacts
    make_sql_file()
    make_identity_route_file()

    # Stage 3: patch existing code (safe)
    patch_system_js()
    patch_index_js()

    # Stage 4: apply DB schema
    apply_db_schema()

    # Stage 5: git + push (deploy)
    git_commit_push()

    # Stage 6: verify health again
    precheck_health()

    # Stage 7: smoke
    smoke_test()

    banner("DONE")
    print(f"REPORT: {REPORT_PATH}")
    write_report("\n[OK] DONE")
    write_report(f"REPORT: {REPORT_PATH}")
    write_report("\nRE-FREEZE: recommended (rotate token after tech works).")


if __name__ == "__main__":
    main()
