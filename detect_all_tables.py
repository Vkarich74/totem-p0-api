#!/usr/bin/env python
# detect_all_tables.py — READ ONLY / FACT DUMP

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
        cur.execute("""
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
              AND table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name;
        """)
        rows = cur.fetchall()
        print("ALL_TABLES:")
        for s, t in rows:
            print(f"{s}.{t}")
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
