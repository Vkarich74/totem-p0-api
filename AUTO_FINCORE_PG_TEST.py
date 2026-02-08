import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "_test_logs"
LOG_DIR.mkdir(exist_ok=True)

LOG_FILE = LOG_DIR / f"fincore_pg_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
SCHEMA = "totem_test"

NODE_RUNNER = f"""
import pg from "pg";
const {{ Pool }} = pg;

const SCHEMA = "{SCHEMA}";
const SSL = {{ rejectUnauthorized: false }};

function assert(cond, msg) {{
  if (!cond) throw new Error("ASSERT FAIL: " + msg);
}}

async function main() {{
  console.log("FINCORE_PG_TEST_START");

  const pool = new Pool({{
    connectionString: process.env.DATABASE_URL,
    ssl: SSL
  }});

  const q = async (sql, params=[]) => (await pool.query(sql, params)).rows;

  // --- BOOTSTRAP (NO $ IN SQL) ---
  await q("CREATE SCHEMA IF NOT EXISTS " + SCHEMA);
  await q("CREATE EXTENSION IF NOT EXISTS \\"uuid-ossp\\"");
  await q("SET search_path TO " + SCHEMA + ", public");

  await q(`
    CREATE TABLE IF NOT EXISTS wallets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      owner_type TEXT NOT NULL,
      owner_id BIGINT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(owner_type, owner_id, currency)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wallet_id UUID NOT NULL REFERENCES wallets(id),
      direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
      amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
      reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      client_ref TEXT NOT NULL,
      target_wallet UUID NOT NULL REFERENCES wallets(id),
      amount_cents BIGINT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','paid','failed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      paid_at TIMESTAMPTZ
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS payouts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wallet_id UUID NOT NULL REFERENCES wallets(id),
      amount_cents BIGINT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('requested','completed','failed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS service_invoices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      system_wallet UUID NOT NULL REFERENCES wallets(id),
      description TEXT NOT NULL,
      amount_cents BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // clean
  await q("DELETE FROM ledger_entries");
  await q("DELETE FROM service_invoices");
  await q("DELETE FROM payouts");
  await q("DELETE FROM payments");
  await q("DELETE FROM wallets");

  // wallets
  const [system] = await q("INSERT INTO wallets (owner_type, owner_id) VALUES ('system',1) RETURNING id");
  const [master] = await q("INSERT INTO wallets (owner_type, owner_id) VALUES ('master',100) RETURNING id");

  const bal = async id =>
    Number((await q(
      "SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END),0) b FROM ledger_entries WHERE wallet_id=$1",
      [id]
    ))[0].b);

  // payment
  const [pay] = await q(
    "INSERT INTO payments (client_ref,target_wallet,amount_cents,status) VALUES ('test',$1,10000,'paid') RETURNING id",
    [master.id]
  );
  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'credit',10000,'payment',$2)",
    [master.id, pay.id]
  );
  assert(await bal(master.id) === 10000, "payment");

  // payout + rollback
  const [p] = await q(
    "INSERT INTO payouts (wallet_id,amount_cents,status) VALUES ($1,3000,'requested') RETURNING id",
    [master.id]
  );
  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'debit',3000,'payout',$2)",
    [master.id, p.id]
  );
  assert(await bal(master.id) === 7000, "payout reserve");

  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'credit',3000,'payout_rollback',$2)",
    [master.id, p.id]
  );
  assert(await bal(master.id) === 10000, "rollback");

  // invoice
  const [inv] = await q(
    "INSERT INTO service_invoices (system_wallet,description,amount_cents) VALUES ($1,'fee',1000) RETURNING id",
    [system.id]
  );
  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'debit',1000,'invoice',$2)",
    [master.id, inv.id]
  );
  await q(
    "INSERT INTO ledger_entries (wallet_id,direction,amount_cents,reference_type,reference_id) VALUES ($1,'credit',1000,'invoice',$2)",
    [system.id, inv.id]
  );

  assert(await bal(master.id) === 9000, "master final");
  assert(await bal(system.id) === 1000, "system final");

  console.log("TEST_PASS");
  await pool.end();
}}

main().catch(e=>{{ console.error("TEST_FAIL"); console.error(e.stack); process.exit(1); }});
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
