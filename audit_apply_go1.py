#!/usr/bin/env python
# ============================================================
# audit_apply_go1.py
# GO_1 — Canonical Ledger View
# FULL AUTOMATION / NO FRAGMENTS / EXECUTION MODE
# ============================================================

import sys

DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "prZkCbCpYTlLPXPkSprHnliKsXCQjoSU"
DB_HOST = "interchange.proxy.rlwy.net"
DB_PORT = 55042
SSL_MODE = "require"

DSN = (
    f"dbname={DB_NAME} "
    f"user={DB_USER} "
    f"password={DB_PASSWORD} "
    f"host={DB_HOST} "
    f"port={DB_PORT} "
    f"sslmode={SSL_MODE}"
)

def fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)

def ok(msg):
    print(f"OK: {msg}")

def main():
    try:
        import psycopg2
    except Exception:
        fail("psycopg2 not installed → pip install psycopg2-binary")

    try:
        conn = psycopg2.connect(DSN)
        conn.autocommit = False
    except Exception as e:
        fail(f"connect error: {e}")

    try:
        cur = conn.cursor()

        # 1️⃣ schema
        cur.execute("CREATE SCHEMA IF NOT EXISTS audit;")
        ok("schema audit ensured")

        # 2️⃣ canonical view
        cur.execute("""
        CREATE OR REPLACE VIEW audit.v_ledger_canonical AS
        SELECT
            le.id          AS ledger_entry_id,
            le.created_at  AS created_at,
            le.reference   AS reference,
            le.tx_type     AS tx_type,

            le.wallet_id   AS wallet_id,
            w.owner_type   AS wallet_owner_type,
            w.owner_id     AS wallet_owner_id,

            le.amount      AS amount,
            CASE
                WHEN le.amount > 0 THEN 'credit'
                WHEN le.amount < 0 THEN 'debit'
                ELSE 'zero'
            END             AS direction,

            ABS(le.amount) AS amount_abs,
            le.currency    AS currency,

            le.source_type AS source_type,
            le.source_id   AS source_id,

            le.metadata    AS metadata,
            le.created_by  AS created_by

        FROM ledger_entries le
        JOIN wallets w ON w.id = le.wallet_id
        WHERE le.is_void = FALSE;
        """)
        ok("view audit.v_ledger_canonical created")

        # 3️⃣ validation — count
        cur.execute("SELECT COUNT(*) FROM ledger_entries WHERE is_void = FALSE;")
        ledger_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM audit.v_ledger_canonical;")
        view_count = cur.fetchone()[0]

        if ledger_count != view_count:
            fail(f"count mismatch ledger={ledger_count} view={view_count}")

        ok("count validation passed")

        # 4️⃣ validation — sum(amount) == 0
        cur.execute("SELECT COALESCE(SUM(amount),0) FROM audit.v_ledger_canonical;")
        total_sum = cur.fetchone()[0]

        if total_sum != 0:
            fail(f"ledger sum != 0 → {total_sum}")

        ok("sum(amount)=0 validation passed")

        conn.commit()
        ok("GO_1 COMPLETED SUCCESSFULLY")

    except Exception as e:
        conn.rollback()
        fail(f"runtime error: {e}")

    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

    sys.exit(0)

if __name__ == "__main__":
    main()
