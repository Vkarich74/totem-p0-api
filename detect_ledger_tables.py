#!/usr/bin/env python
# detect_ledger_tables.py — READ ONLY / FACT COLLECTION

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

def die(msg):
    print(msg)
    sys.exit(1)

def main():
    try:
        import psycopg2
    except Exception:
        die("PSYCOPG2_MISSING")

    try:
        conn = psycopg2.connect(DSN)
        cur = conn.cursor()
    except Exception as e:
        die(f"CONNECT_FAIL: {e}")

    try:
        # 1) find ledger-like tables
        cur.execute("""
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_type='BASE TABLE'
              AND table_name ILIKE '%ledger%';
        """)
        rows = cur.fetchall()
        print("LEDGER_TABLES:")
        for r in rows:
            print(f"{r[0]}.{r[1]}")

        # 2) find wallet table(s)
        cur.execute("""
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_type='BASE TABLE'
              AND table_name ILIKE '%wallet%';
        """)
        rows = cur.fetchall()
        print("WALLET_TABLES:")
        for r in rows:
            print(f"{r[0]}.{r[1]}")

    except Exception as e:
        die(f"QUERY_FAIL: {e}")
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

    sys.exit(0)

if __name__ == "__main__":
    main()
