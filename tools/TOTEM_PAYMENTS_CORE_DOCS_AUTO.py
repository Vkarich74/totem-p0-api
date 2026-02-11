# TOTEM_PAYMENTS_CORE_DOCS_AUTO.py
# MODE: EXECUTION ONLY
# PURPOSE: Generate and freeze PAYMENTS CORE documents (provider-agnostic)

import os
from datetime import datetime
import subprocess

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CONTRACTS_DIR = os.path.join(BASE_DIR, "contracts")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")

os.makedirs(CONTRACTS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

now = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

docs = {
    "PAYMENTS_STATE_MACHINE.md": """# PAYMENTS STATE MACHINE (FREEZE)

Statuses:
- created
- pending
- authorized
- captured
- failed
- canceled
- refunded

Rules:
- created -> pending
- pending -> authorized | failed | canceled
- authorized -> captured | canceled
- captured -> refunded
- failed / canceled / refunded are terminal

Immutability:
- terminal states cannot transition further
""",

    "PAYMENTS_PROVIDER_ADAPTER_CONTRACT.md": """# PAYMENTS PROVIDER ADAPTER CONTRACT

Required methods:
- create_intent()
- confirm_intent()
- handle_webhook()
- refund()
- reconcile()

Rules:
- provider-agnostic
- no business logic inside adapter
- adapter only maps provider -> canonical events
""",

    "PAYMENTS_WEBHOOK_CANONICAL_FLOW.md": """# PAYMENTS WEBHOOK CANONICAL FLOW

Endpoint:
POST /payments/webhook

Requirements:
- signature verification
- idempotency check
- replay protection
- append-only event log

Failure handling:
- retry-safe
- duplicate-safe
""",

    "PAYMENTS_AUDIT_AND_FORENSICS.md": """# PAYMENTS AUDIT & FORENSICS

Principles:
- append-only
- no hard deletes
- full event history

Stored:
- raw provider payload
- canonical event
- timestamps
- processing result
"""
}

created_files = []

for name, content in docs.items():
    path = os.path.join(CONTRACTS_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")
    created_files.append(path)

report_path = os.path.join(
    REPORTS_DIR, f"PAYMENTS_CORE_DOCS_REPORT_{now}.md"
)

with open(report_path, "w", encoding="utf-8") as r:
    r.write(f"""# PAYMENTS CORE DOCS — AUTO REPORT

Date (UTC): {now}

Generated documents:
""")
    for f in created_files:
        r.write(f"- {os.path.relpath(f, BASE_DIR)}\n")

    r.write("""
Status:
- Provider independent
- Ready for sandbox integration
- No external dependencies
""")

# Git operations
subprocess.run(["git", "add", "contracts", "reports"], check=True)
subprocess.run(
    ["git", "commit", "-m", "payments: freeze provider-agnostic core contracts"],
    check=True
)
subprocess.run(["git", "push"], check=True)

print("OK: PAYMENTS CORE DOCS GENERATED, COMMITTED, DEPLOYED")
print(f"REPORT: {report_path}")
