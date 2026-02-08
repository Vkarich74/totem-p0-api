#!/usr/bin/env python
# detect_db_name.py — READ ONLY, ZERO MUTATION

import sys

DB_USER = "postgres"
DB_PASSWORD = "prZkCbCpYTlLPXPkSprHnliKsXCQjoSU"
DB_HOST = "interchange.proxy.rlwy.net"
DB_PORT = 55042
SSL_MODE = "require"

DSN = (
    f"dbname=postgres "
    f"user={DB_USER} "
    f"password={DB_PASSWORD} "
    f"host={DB_HOST} "
    f"port={DB_PORT} "
    f"sslmode={SSL_MODE}"
)

def fail(msg: str) -> None:
    print(msg)
    sys.exit(1)

def main() -> None:
    try:
        import psycopg2  # type: ignore
    except Exception:
        fail("PSYCOPG2_MISSING")

    try:
        conn = psycopg2.connect(DSN)
    except Exception as e:
        fail(f"CONNECT_FAIL: {e}")

    try:
        cur = conn.cursor()
        cur.execute("SELECT current_database();")
        row = cur.fetchone()
        if not row or not row[0]:
            fail("DBNAME_FAIL")
        print(f"DB_NAME={row[0]}")
    except Exception as e:
        fail(f"QUERY_FAIL: {e}")
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

    sys.exit(0)

if __name__ == "__main__":
    main()
