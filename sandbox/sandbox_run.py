# sandbox_run.py
# TOTEM — SANDBOX E2E (AUTOMATED) v1.2
# SECURITY-CONTRACT AWARE
# Public booking is FORBIDDEN by backend — expected behavior

import requests
import json
import sys
import uuid
import datetime as dt
from pathlib import Path

API_BASE = "https://totem-p0-api-production.up.railway.app"
SALON_SLUG = "salon-1"
MASTER_ID = "1"

OUT_DIR = Path(__file__).parent
REPORT = OUT_DIR / "SANDBOX_REPORT.md"

def write(lines):
    REPORT.write_text("\n".join(lines), encoding="utf-8")

def http(method, url, headers=None, data=None):
    r = requests.request(method, url, headers=headers, data=data, timeout=30)
    return r.status_code, r.text[:800]

def fail(lines, msg):
    lines.append(f"❌ FAIL: {msg}")
    write(lines)
    sys.exit(1)

def ok(lines, msg):
    lines.append(f"✅ PASS: {msg}")

def main():
    lines = []
    lines.append("# TOTEM — SANDBOX REPORT (v1.2)")
    lines.append(f"Date: {dt.datetime.now().isoformat(timespec='seconds')}")
    lines.append(f"API: {API_BASE}")
    lines.append("")

    # 1) PUBLIC RESOLVE
    status, _ = http("GET", f"{API_BASE}/s/{SALON_SLUG}/resolve")
    if status != 200:
        fail(lines, f"PUBLIC RESOLVE expected 200, got {status}")
    ok(lines, "PUBLIC RESOLVE")

    # 2) CALENDAR READ — NO AUTH MUST BE BLOCKED
    status, _ = http("GET", f"{API_BASE}/calendar/master/{MASTER_ID}")
    if status not in (401, 403):
        fail(lines, f"CALENDAR READ (NO AUTH) expected 401/403, got {status}")
    ok(lines, "CALENDAR READ (NO AUTH BLOCKED)")

    # 3) BOOKING CREATE — NO AUTH MUST BE BLOCKED
    payload = {
        "master_id": MASTER_ID,
        "start_at": "2026-03-01T10:00:00Z",
        "end_at": "2026-03-01T11:00:00Z",
        "client": {
            "name": "Sandbox Client",
            "phone": "+10000000000"
        }
    }

    status, _ = http(
        "POST",
        f"{API_BASE}/calendar/reserve",
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload)
    )

    if status not in (401, 403):
        fail(lines, f"BOOKING CREATE (NO AUTH) expected 401/403, got {status}")
    ok(lines, "BOOKING CREATE (NO AUTH BLOCKED)")

    lines.append("")
    lines.append("🎉 SANDBOX COMPLETED SUCCESSFULLY (SECURITY CONTRACT CONFIRMED)")
    write(lines)

if __name__ == "__main__":
    main()
