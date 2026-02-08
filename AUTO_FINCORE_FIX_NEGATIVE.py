import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "_test_logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / f"fincore_fix_negative_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

def log(s):
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(s + "\n")

def run(cmd, env=None):
    p = subprocess.run(cmd, capture_output=True, text=True, env=env)
    log("CMD: " + " ".join(cmd))
    if p.stdout:
        log(p.stdout)
    if p.stderr:
        log(p.stderr)
    return p.returncode

def must_env(name):
    v = os.environ.get(name, "").strip()
    if not v:
        raise RuntimeError(f"Missing env: {name}")
    return v

DB_FIX_NODE = r"""
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("DB_FIX_START");

  await pool.query(`SET search_path TO totem_test, public`);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_idempotency
    ON ledger_entries (wallet_id, reference_type, reference_id, direction)
  `);

  console.log("DB_FIX_DONE");
  await pool.end();
}

main().catch(e => {
  console.error(e.stack);
  process.exit(1);
});
"""

def main():
    must_env("DATABASE_URL")

    env = os.environ.copy()

    # --- DB FIX ONLY ---
    rc = run(["node", "-e", DB_FIX_NODE], env)
    if rc != 0:
        print("FAIL")
        print("LOG:", LOG_FILE)
        return rc

    # --- RUN NEGATIVE TEST ---
    rc = run(["node", "tests/financial_core_negative_runner.mjs"], env)

    print("PASS" if rc == 0 else "FAIL")
    print("LOG:", LOG_FILE)
    return rc

if __name__ == "__main__":
    sys.exit(main())
