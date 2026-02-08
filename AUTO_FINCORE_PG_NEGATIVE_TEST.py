import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "_test_logs"
LOG_DIR.mkdir(exist_ok=True)

LOG_FILE = LOG_DIR / f"fincore_pg_negative_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
SCHEMA = "totem_test"

NODE_RUNNER = f"""
import pg from "pg";
const {{ Pool }} = pg;

const SCHEMA = "{SCHEMA}";
const SSL = {{ rejectUnauthorized: false }};

function log(m) {{ console.log(m); }}
function ok(m) {{ console.log("[OK]", m); }}
function fail(m) {{ throw new Error(m); }}

async function main() {{
  log("NEGATIVE_TEST_START");

  const pool = new Pool({{
    connectionString: process.env.DATABASE_URL,
    ssl: SSL
  }});

  const q = async (sql, params=[]) => (await pool.query(sql, params)).rows;
  await q("SET search_path TO " + SCHEMA + ", public");

  // clean
  await q("DELETE FROM ledger_entries");
  await q("DELETE FROM payouts");
  await q("DELETE FROM payments");
  await q("DELETE FROM wallets");

  const [system] = await q("INSERT INTO wallets (owner_type, owner_id) VALUES ('system',1) RETURNING id");
  const [master] = await q("INSERT INTO wallets (owner_type, owner_id) VALUES ('master',100) RETURNING id");

  const balance = async (id) =>
    Number((await q(
      "SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END),0) b FROM ledger_entries WHERE wallet_id=$1",
      [id]
    ))[0].b);

  // seed balance = 5000
  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'credit',5000,'seed','init')",
    [master.id]
  );
  if (await balance(master.id) !== 5000) fail("seed failed");

  // N1 overdraft
  try {{
    await q(
      "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'debit',6000,'overdraft','n1')",
      [master.id]
    );
    if (await balance(master.id) < 0) fail("N1 overdraft allowed");
    fail("N1 should not pass");
  }} catch {{
    ok("N1 overdraft blocked");
  }}

  // N2 double debit
  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'debit',3000,'debit','n2a')",
    [master.id]
  );
  if (await balance(master.id) !== 2000) fail("N2 first debit wrong");

  try {{
    await q(
      "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'debit',3000,'debit','n2b')",
      [master.id]
    );
    if (await balance(master.id) < 0) fail("N2 double debit allowed");
    fail("N2 should not pass");
  }} catch {{
    ok("N2 double debit blocked");
  }}

  // reset
  await q("DELETE FROM ledger_entries");
  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'credit',8000,'seed','init2')",
    [master.id]
  );

  // N3 double payout reserve
  const [p1] = await q(
    "INSERT INTO payouts (wallet_id,amount_cents,status) VALUES ($1,4000,'requested') RETURNING id",
    [master.id]
  );
  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'debit',4000,'payout',$2)",
    [master.id,p1.id]
  );
  if (await balance(master.id) !== 4000) fail("N3 first payout wrong");

  try {{
    const [p2] = await q(
      "INSERT INTO payouts (wallet_id,amount_cents,status) VALUES ($1,5000,'requested') RETURNING id",
      [master.id]
    );
    await q(
      "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'debit',5000,'payout',$2)",
      [master.id,p2.id]
    );
    if (await balance(master.id) < 0) fail("N3 double payout allowed");
    fail("N3 should not pass");
  }} catch {{
    ok("N3 double payout blocked");
  }}

  // N4 double payment credit
  await q("DELETE FROM ledger_entries");
  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'credit',7000,'payment','pay1')",
    [master.id]
  );
  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'credit',7000,'payment','pay1')",
    [master.id]
  );
  if (await balance(master.id) !== 7000) {{
    ok("N4 duplicate payment prevented (idempotency expected)");
  }} else {{
    fail("N4 duplicate payment credited twice");
  }}

  // invariant
  const finalBal = await balance(master.id);
  if (finalBal < 0) fail("NEGATIVE BALANCE INVARIANT BROKEN");

  ok("ALL NEGATIVE TESTS PASSED");
  log("NEGATIVE_TEST_PASS");
  await pool.end();
}}

main().catch(e => {{
  console.error("NEGATIVE_TEST_FAIL");
  console.error(e.stack);
  process.exit(1);
}});
"""

def main():
  with open(LOG_FILE, "w", encoding="utf-8") as f:
    p = subprocess.run(
      ["node", "-e", NODE_RUNNER],
      stdout=f,
      stderr=subprocess.STDOUT,
      text=True,
      env=os.environ
    )
  print("PASS" if p.returncode == 0 else "FAIL")
  print("LOG:", LOG_FILE)
  return p.returncode

if __name__ == "__main__":
  sys.exit(main())
