#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TOTEM — BOT PILOT (HYBRID, DIAGNOSTIC ONLY)

Scope (HARD RULES):
- Public routes only
- No auth
- No forms submit
- No mutations

Output:
- docs/prod/BOT_PILOT_HYBRID_REPORT_v1.md
"""

import sys
import subprocess
from pathlib import Path
from datetime import datetime

import requests

ROOT = Path(r"C:\Users\Vitaly\Desktop\odoo-local")
DOCS = ROOT / "docs" / "prod"
COMMIT_MSG = "docs: bot pilot hybrid diagnostic report (odoo)"

# ✅ SOURCE OF TRUTH: Odoo site
BASE_URL = "https://totem-platform.odoo.com"

# Canonical routes (public + guarded checks). We DO NOT bypass guards.
PUBLIC_PATHS = [
    "/",                       # homepage
    "/s/",                      # should 404 or redirect (slug required) -> diagnostic
    "/s/test",                  # placeholder slug (diagnostic)
    "/s/test/booking",
    "/s/test/calendar",
    "/s/test/owner",            # guarded
    "/s/test/reports",          # guarded
    "/masters/cabinet",         # guarded/public blocked
    "/salons/cabinet",          # guarded/public blocked
    "/masters/",                # namespace check
    "/salons/",
]

TIMEOUT_SEC = 15

def http_check(url: str) -> dict:
    try:
        r = requests.get(
            url,
            allow_redirects=True,
            timeout=TIMEOUT_SEC,
            headers={
                "User-Agent": "TOTEM-BOT-PILOT/1.0 (diagnostic-only)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        return {
            "url": url,
            "status": r.status_code,
            "final_url": r.url,
            "redirected": (r.url != url),
            "content_length": len(r.text) if r.text is not None else 0,
        }
    except Exception as e:
        return {
            "url": url,
            "status": "ERROR",
            "error": str(e),
        }

def run_git(cmd):
    p = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if p.returncode != 0:
        if p.stdout:
            print(p.stdout)
        if p.stderr:
            print(p.stderr)
        sys.exit(1)
    if p.stdout:
        print(p.stdout)

def main():
    DOCS.mkdir(parents=True, exist_ok=True)
    now_utc = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    results = []
    for path in PUBLIC_PATHS:
        full = BASE_URL.rstrip("/") + path
        results.append(http_check(full))

    # Basic classification
    ok = [r for r in results if r.get("status") in (200, 201, 204)]
    redirects = [r for r in results if r.get("redirected") is True]
    guarded = [r for r in results if r.get("status") in (401, 403)]
    notfound = [r for r in results if r.get("status") == 404]
    errors = [r for r in results if r.get("status") == "ERROR"]
    other = [r for r in results if r.get("status") not in (200, 201, 204, 301, 302, 303, 307, 308, 401, 403, 404, "ERROR")]

    lines = []
    lines.append("# BOT PILOT HYBRID REPORT v1 — ODOO")
    lines.append("")
    lines.append(f"Timestamp (UTC): {now_utc}")
    lines.append(f"Base URL: {BASE_URL}")
    lines.append("")
    lines.append("## SCOPE (LOCKED)")
    lines.append("- Public-only HTTP diagnostics")
    lines.append("- No auth, no form submits, no DB writes")
    lines.append("- Guards are NOT bypassed")
    lines.append("")

    lines.append("## SUMMARY")
    lines.append(f"- Total checks: {len(results)}")
    lines.append(f"- 200/OK: {len(ok)}")
    lines.append(f"- Redirects: {len(redirects)}")
    lines.append(f"- 401/403 guarded: {len(guarded)}")
    lines.append(f"- 404 not found: {len(notfound)}")
    lines.append(f"- Errors: {len(errors)}")
    lines.append(f"- Other statuses: {len(other)}")
    lines.append("")

    lines.append("## RESULTS (FULL)")
    lines.append("")
    for r in results:
        lines.append(f"### {r.get('url')}")
        for k in ("status", "final_url", "redirected", "content_length", "error"):
            if k in r:
                lines.append(f"- {k}: {r[k]}")
        lines.append("")

    lines.append("## DIAGNOSTIC VERDICT")
    lines.append("")
    lines.append("If most public pages are 404/redirect/empty or guarded incorrectly → site is NOT pilot-ready.")
    lines.append("This report is a factual map of accessibility and dead-ends, not UX scoring.")
    lines.append("")
    lines.append("END")

    report = DOCS / "BOT_PILOT_HYBRID_REPORT_v1.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[OK] Report created: {report}")

    # Commit + deploy via git push
    if (ROOT / ".git").exists():
        run_git(["git", "add", "docs/prod/BOT_PILOT_HYBRID_REPORT_v1.md"])
        run_git(["git", "commit", "-m", COMMIT_MSG])
        run_git(["git", "push"])
        print("[OK] git push done (deploy triggers if configured).")
    else:
        print("[INFO] No .git detected → report created only.")

    print("[DONE] BOT PILOT HYBRID (ODOO) COMPLETED")

if __name__ == "__main__":
    main()
