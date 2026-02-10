# TOTEM PAYMENTS DOCS — FULL AUTO (NO PROVIDER)
# Creates docs pack + report, then git commit & push

import os
import subprocess
import datetime

ROOT = r"C:\Users\Vitaly\Desktop\odoo-local"
CONTRACTS = os.path.join(ROOT, "contracts")
REPORTS = os.path.join(ROOT, "reports")

FILES = {
    "contracts/PAYMENTS_CORE_CONTRACT.md": """# PAYMENTS CORE CONTRACT — FREEZE

Provider: NOT SELECTED
DB changes: NONE
Backend changes: NONE

ENTITIES
- PaymentIntent
- PaymentEvent (webhook log)
- Refund

STATUSES
Intent: created → pending → succeeded | failed | canceled
Refund: requested → succeeded | failed | canceled

IDEMPOTENCY
- intent: Idempotency-Key
- webhook: (provider, event_id)

WEBHOOK SECURITY
- HMAC signature
- timestamp window ±5 min
""",

    "contracts/PAYMENTS_ADAPTER_INTERFACE.md": """# PAYMENTS ADAPTER INTERFACE — FREEZE

create_intent(payload)
verify_webhook(headers, raw_body)
parse_event(headers, raw_body)
request_refund(intent_id, amount)
""",

    "contracts/PAYMENTS_PROVIDER_CHECKLIST_5.md": """# PROVIDER CHECKLIST (HARD)

1. Signed webhooks
2. Idempotency
3. Refunds with status
4. Legal availability
5. Integration ≤ 3 days
""",

    "contracts/PAYMENTS_FLOW_STATE_MACHINE.md": """# PAYMENT FLOW

client → intent → checkout
provider → webhook → verify
state transition → final
""",
}

def ensure(p):
    os.makedirs(p, exist_ok=True)

def write(rel, content):
    path = os.path.join(ROOT, rel)
    ensure(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

def run(cmd):
    subprocess.run(cmd, cwd=ROOT, shell=True, check=True)

def main():
    ensure(CONTRACTS)
    ensure(REPORTS)

    for rel, content in FILES.items():
        write(rel, content)

    report_path = os.path.join(
        REPORTS,
        f"PAYMENTS_DOCS_REPORT_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    )

    with open(report_path, "w", encoding="utf-8") as r:
        r.write("# PAYMENTS DOCS AUTO REPORT\n\n")
        for f in FILES:
            r.write(f"- {f}\n")

    run("git add contracts reports")
    run('git commit -m "payments: provider-agnostic docs pack"')
    run("git push")

    print("OK: PAYMENTS DOCS GENERATED, COMMITTED, DEPLOYED")

if __name__ == "__main__":
    main()
