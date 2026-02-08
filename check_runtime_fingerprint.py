#!/usr/bin/env python
# check_runtime_fingerprint.py
# READ ONLY. FACT CHECK. EXECUTION MODE.

import sys

DB_DSN = "dbname=postgres user=postgres password=prZkCbCpYTlLPXPkSprHnliKsXCQjoSU host=interchange.proxy.rlwy.net port=55042 sslmode=require"

def die(msg):
    print(msg)
    sys.exit(1)

def main():
    try:
        import psycopg2
    except Exception:
        die("PSYCOPG2_MISSING")

    try:
        conn = psycopg2.connect(DB_DSN)
        cur = conn.cursor()
    except Exception as e:
        die(f"CONNECT_FAIL: {e}")

    try:
        # fingerprint 1: extensions
        cur.execute("SELECT extname FROM pg_extension ORDER BY extname;")
        exts = [r[0] for r in cur.fetchall()]
        print("EXTENSIONS:", ",".join(exts))

        # fingerprint 2: schemas
        cur.execute("""
            SELECT schema_name
            FROM information_schema.schemata
            ORDER BY schema_name;
        """)
        schemas = [r[0] for r in cur.fetchall()]
        print("SCHEMAS:", ",".join(schemas))

        # fingerprint 3: total user tables
        cur.execute("""
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema NOT IN ('pg_catalog','information_schema');
        """)
        count = cur.fetchone()[0]
        print("USER_TABLE_COUNT:", count)

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
