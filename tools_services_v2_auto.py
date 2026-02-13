import subprocess
import datetime
import os
import sys

PSQL_PATH = r'C:\Program Files\PostgreSQL\18\bin\psql.exe'
DB_URL = 'postgresql://postgres:prZkCbCpYTlLPXPkSprHnliKsXCQjoSU@interchange.proxy.rlwy.net:55042/railway'

REPORT_DIR = r'C:\Users\Vitaly\Desktop\odoo-local\reports'
os.makedirs(REPORT_DIR, exist_ok=True)

timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
REPORT_FILE = os.path.join(REPORT_DIR, f'services_v2_migration_{timestamp}.txt')

SQL_SCRIPT = """
BEGIN;

CREATE TABLE IF NOT EXISTS public.services_v2 (
    id SERIAL PRIMARY KEY,
    salon_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    duration_min INTEGER NOT NULL CHECK (duration_min > 0),
    price INTEGER NOT NULL CHECK (price >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS services_v2_unique_active_name
ON public.services_v2 (salon_id, name)
WHERE is_active = true;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS service_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_booking_service_v2'
    ) THEN
        ALTER TABLE public.bookings
        ADD CONSTRAINT fk_booking_service_v2
        FOREIGN KEY (service_id)
        REFERENCES public.services_v2(id)
        ON DELETE RESTRICT;
    END IF;
END $$;

COMMIT;

SELECT 'services_v2_exists' AS check,
       COUNT(*) 
FROM information_schema.tables
WHERE table_name = 'services_v2';

SELECT 'booking_has_service_id' AS check,
       COUNT(*)
FROM information_schema.columns
WHERE table_name = 'bookings'
AND column_name = 'service_id';

SELECT 'unique_index_exists' AS check,
       COUNT(*)
FROM pg_indexes
WHERE tablename = 'services_v2'
AND indexname = 'services_v2_unique_active_name';
"""

print("START SERVICES_V2 MIGRATION")

result = subprocess.run(
    [PSQL_PATH, DB_URL, "-v", "ON_ERROR_STOP=1", "-c", SQL_SCRIPT],
    capture_output=True,
    text=True
)

with open(REPORT_FILE, "w", encoding="utf-8") as f:
    f.write("=== SERVICES V2 MIGRATION REPORT ===\n")
    f.write(result.stdout)
    f.write("\n=== ERRORS ===\n")
    f.write(result.stderr)

print("REPORT SAVED TO:", REPORT_FILE)

if result.returncode != 0:
    print("MIGRATION FAILED. STOP.")
    sys.exit(1)

print("MIGRATION SUCCESS.")
