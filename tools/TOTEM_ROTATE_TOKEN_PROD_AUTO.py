# TOTEM_ROTATE_TOKEN_PROD_AUTO.py
# EXECUTION MODE — PROD TOKEN ROTATION
# ONE FILE. NO UI. AUDIT SAFE.

import os, sys, subprocess, re, time
from datetime import datetime

ROOT = r"C:\Users\Vitaly\Desktop\odoo-local"
API = "https://totem-p0-api-production.up.railway.app"

OLD_TOKEN = "TECH_SYSTEM_TOKEN_TEMP_2026"  # will be revoked

TS = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
REPORT_DIR = os.path.join(ROOT, "reports")
REPORT = os.path.join(REPORT_DIR, f"ROTATE_TOKEN_PROD_{TS}.md")

def log(m):
    print(m)
    os.makedirs(REPORT_DIR, exist_ok=True)
    with open(REPORT, "a", encoding="utf-8") as f:
        f.write(m + "\n")

def fail(stage, msg):
    log(f"[FAIL] {stage}")
    log(f"ERROR: {msg}")
    log(f"REPORT: {REPORT}")
    sys.exit(1)

def run(stage, args):
    log("\n$ " + " ".join(args))
    p = subprocess.run(args, capture_output=True, text=True)
    if p.stdout: log(p.stdout.rstrip())
    if p.stderr: log(p.stderr.rstrip())
    if p.returncode != 0:
        fail(stage, f"exit={p.returncode}")
    log(f"[OK] {stage}")
    return p.stdout or ""

log("# ROTATE TOKEN PROD — AUTO")
log(f"TS: {TS}")

# 1️⃣ HEALTH
out = run("HEALTH", ["curl", "-i", f"{API}/health"])
if "200" not in out:
    fail("HEALTH", "API not healthy")

# 2️⃣ ROTATE TOKEN
out = run(
    "ROTATE TOKEN",
    [
        "curl", "-i", "-X", "POST",
        f"{API}/system/onboarding/token/rotate",
        "-H", f"X-System-Token: {OLD_TOKEN}"
    ]
)

# 3️⃣ PARSE NEW TOKEN
m = re.search(r'"new_token"\s*:\s*"([^"]+)"', out)
if not m:
    fail("PARSE", "new_token not found in response")

NEW_TOKEN = m.group(1)
log("[OK] NEW TOKEN ISSUED")
log("NEW_TOKEN (SAVE SECURELY):")
log(NEW_TOKEN)

# 4️⃣ VERIFY OLD TOKEN REVOKED (expect 401)
time.sleep(2)
out2 = run(
    "VERIFY OLD TOKEN REVOKED",
    [
        "curl", "-i", "-X", "POST",
        f"{API}/system/onboarding/identity",
        "-H", "Content-Type: application/json",
        "-H", f"X-System-Token: {OLD_TOKEN}",
        "-d", '{"lead_id":"revoke-check","odoo_user_id":"0","email":"x@x","requested_role":"MASTER"}'
    ]
)
if "401" not in out2:
    fail("VERIFY", "old token still active")

log("[OK] OLD TOKEN REVOKED")

# 5️⃣ VERIFY NEW TOKEN ACTIVE
out3 = run(
    "VERIFY NEW TOKEN ACTIVE",
    [
        "curl", "-i", "-X", "POST",
        f"{API}/system/onboarding/identity",
        "-H", "Content-Type: application/json",
        "-H", f"X-System-Token: {NEW_TOKEN}",
        "-d", f'{{"lead_id":"prod-{TS}","odoo_user_id":"1","email":"a@a","requested_role":"MASTER"}}'
    ]
)
if "200" not in out3:
    fail("VERIFY", "new token not active")

log("[OK] NEW TOKEN VERIFIED")
log("[OK] ROTATE_TOKEN_PROD DONE")
log(f"REPORT: {REPORT}")
