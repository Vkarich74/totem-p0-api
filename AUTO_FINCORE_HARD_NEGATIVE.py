import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "_test_logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / f"fincore_hard_negative_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

def log(s):
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(s + "\n")

def must_env(name):
    v = os.environ.get(name, "").strip()
    if not v:
        raise RuntimeError(f"Missing env: {name}")
    return v

NODE_RUNNER = r"""
import pg from "pg";
import { getOrCreateWallet, getWalletBalance } from "./services/wallet/wallet.service.js";
import { credit, debit } from "./services/wallet/ledger.service.js";
import { createPayment, markPaymentPaid } from "./services/payment/payment.service.js";
import { requestPayout } from "./services/payout/payout.service.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// CRITICAL: enforce search_path for EVERY connection
pool.on("connect", async (client) => {
  await client.query("SET search_path TO totem_test, public");
});

function assert(c, m) {
  if (!c) throw new Error("ASSERT FAIL: " + m);
}

async function resetDB() {
  await pool.query(`
    TRUNCATE
      ledger_entries,
      payouts,
      payments,
      service_invoices
    RESTART IDENTITY
    CASCADE
  `);
}

async function raceDebits(walletId) {
  const jobs = [];
  for (let i = 0; i < 10; i++) {
    jobs.push(
      debit({
        walletId,
        amountCents: 1000,
        referenceType: "race",
        referenceId: "d-" + i,
      }).then(
        () => ({ ok: true }),
        () => ({ ok: false })
      )
    );
  }
  const res = await Promise.all(jobs);
  return res.filter(r => r.ok).length;
}

async function racePayment(paymentId) {
  const jobs = [];
  for (let i = 0; i < 5; i++) {
    jobs.push(
      markPaymentPaid({ paymentId }).then(
        () => ({ ok: true }),
        () => ({ ok: false })
      )
    );
  }
  await Promise.all(jobs);
}

async function main() {
  console.log("HARD_NEGATIVE_START");

  await resetDB();

  const systemWalletId = await getOrCreateWallet({ ownerType: "system", ownerId: 1 });
  const masterWalletId = await getOrCreateWallet({ ownerType: "master", ownerId: 200 });

  // seed
  await credit({
    walletId: masterWalletId,
    amountCents: 5000,
    referenceType: "seed",
    referenceId: "s1",
  });
  assert(await getWalletBalance(masterWalletId) === 5000, "seed");

  // R1: race debits
  const okDebits = await raceDebits(masterWalletId);
  const balAfterRace = await getWalletBalance(masterWalletId);

  console.log("RACE_DEBITS_OK:", okDebits);
  assert(okDebits === 5, "only 5 debits allowed");
  assert(balAfterRace === 0, "balance zero after race");

  // R2: payout race
  await credit({
    walletId: masterWalletId,
    amountCents: 4000,
    referenceType: "seed",
    referenceId: "s2",
  });

  const pJobs = [];
  for (let i = 0; i < 3; i++) {
    pJobs.push(
      requestPayout({ walletId: masterWalletId, amountCents: 3000 }).then(
        () => ({ ok: true }),
        () => ({ ok: false })
      )
    );
  }
  const pRes = await Promise.all(pJobs);
  const pOk = pRes.filter(r => r.ok).length;
  assert(pOk === 1, "only one payout allowed");
  assert(await getWalletBalance(masterWalletId) === 1000, "payout balance");

  // R3: payment idempotency under race
  await resetDB();
  const pid = await createPayment({
    clientRef: "race-client",
    targetWalletId: masterWalletId,
    amountCents: 7000,
  });

  await racePayment(pid);
  assert(await getWalletBalance(masterWalletId) === 7000, "payment credited once");

  // invariant
  const finalBal = await getWalletBalance(masterWalletId);
  assert(finalBal >= 0, "no negative balance");

  console.log("HARD_NEGATIVE_PASS");
  await pool.end();
}

main().catch(e => {
  console.error("HARD_NEGATIVE_FAIL");
  console.error(e.stack);
  process.exit(1);
});
"""

def main():
    must_env("DATABASE_URL")
    log("START")

    p = subprocess.run(
        ["node", "-e", NODE_RUNNER],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=os.environ
    )

    log(p.stdout)
    log(p.stderr)

    print("PASS" if p.returncode == 0 else "FAIL")
    print("LOG:", LOG_FILE)
    return p.returncode

if __name__ == "__main__":
    sys.exit(main())
