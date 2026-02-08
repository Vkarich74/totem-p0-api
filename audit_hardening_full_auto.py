import os
import sys
import json
import subprocess
from datetime import datetime, timezone

# ================= CONFIG =================

PSQL_EXE = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"
DB_URL = r"postgresql://postgres:prZkCbCpYTlLPXPkSprHnliKsXCQjoSU@interchange.proxy.rlwy.net:55042/railway"
SCHEMA = "totem_test"

ROOT = os.getcwd()
SQL_DIR = os.path.join(ROOT, "sql", "audit")
DOCS_DIR = os.path.join(ROOT, "docs", "audit")
REPORT_DIR = os.path.join(ROOT, "reports")
REPORT_FILE = os.path.join(REPORT_DIR, "audit_run_report.json")

REPORT = {
    "started_at": datetime.now(timezone.utc).isoformat(),
    "status": "RUNNING",
    "result": None,
    "error": None
}

# ================= UTIL =================

def save_report():
    os.makedirs(REPORT_DIR, exist_ok=True)
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(REPORT, f, indent=2)

def stop(error):
    REPORT["status"] = "FAILED"
    REPORT["error"] = error
    REPORT["finished_at"] = datetime.now(timezone.utc).isoformat()
    save_report()
    print("STOP")
    print(error)
    sys.exit(1)

def success(result):
    REPORT["status"] = "SUCCESS"
    REPORT["result"] = result
    REPORT["finished_at"] = datetime.now(timezone.utc).isoformat()
    save_report()
    print("DONE")
    print(result)
    sys.exit(0)

def run_psql(sql):
    cmd = [
        PSQL_EXE, DB_URL,
        "-X", "-q", "-v", "ON_ERROR_STOP=1",
        "-c", sql
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        stop(res.stderr.strip())

def run_psql_scalar(sql):
    cmd = [
        PSQL_EXE, DB_URL,
        "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
        "-c", sql
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        stop(res.stderr.strip())
    return res.stdout.strip()

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

# ================= MAIN =================

def main():
    # 1. SQL (CANONICAL)
    views_sql = f"""
SET search_path TO {SCHEMA};

CREATE OR REPLACE VIEW v_wallet_balance_computed AS
SELECT
    w.id AS wallet_id,
    COALESCE(SUM(
        CASE
            WHEN l.direction = 'credit' THEN l.amount_cents
            WHEN l.direction = 'debit'  THEN -l.amount_cents
            ELSE 0
        END
    ), 0) AS computed_balance_cents
FROM wallets w
LEFT JOIN ledger_entries l
  ON l.wallet_id = w.id
GROUP BY w.id;

CREATE OR REPLACE VIEW v_wallet_vs_ledger_diff AS
SELECT
    w.id AS wallet_id,
    w.owner_type,
    w.owner_id,
    v.computed_balance_cents,
    v.computed_balance_cents AS ledger_balance_cents
FROM wallets w
JOIN v_wallet_balance_computed v
  ON v.wallet_id = w.id;
""".strip()

    # 2. Write files
    write(os.path.join(SQL_DIR, "views.sql"), views_sql)
    write(os.path.join(DOCS_DIR, "AUDIT_MODEL.md"),
          "# Audit Model\nLedger is the single source of truth.\nBalances computed from amount_cents + direction.\n")

    # 3. Apply SQL
    run_psql(views_sql)

    # 4. Verify
    count = run_psql_scalar(f"SET search_path TO {SCHEMA}; SELECT COUNT(*) FROM v_wallet_balance_computed;")

    # 5. Finish
    success({
        "wallets_count": count,
        "currency_unit": "cents",
        "direction_logic": "credit=+ , debit=-"
    })

if __name__ == "__main__":
    main()
