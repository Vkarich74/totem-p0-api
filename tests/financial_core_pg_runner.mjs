import pg from "pg";

const { Pool } = pg;

const SCHEMA = "totem_test";
const SSL = process.env.PGSSLMODE === "disable"
  ? false
  : { rejectUnauthorized: false };

function log(msg) {
  console.log(msg);
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAIL: " + msg);
}

function connInfo() {
  const host = process.env.PGHOST || "";
  const port = process.env.PGPORT || "";
  const db = process.env.PGDATABASE || "";
  const user = process.env.PGUSER || "";
  return `host=${host} port=${port} db=${db} user=${user} schema=${SCHEMA}`;
}

async function main() {
  log("FINCORE_PG_TEST_START");
  log("CONN " + connInfo());

  // Build pool config:
  // Prefer DATABASE_URL if present, else rely on PG* env vars.
  const cfg = {
    ssl: SSL,
    options: `-c search_path=${SCHEMA},public`,
  };
  if (process.env.DATABASE_URL) cfg.connectionString = process.env.DATABASE_URL;

  const pool = new Pool(cfg);

  const q = async (sql, params=[]) => {
    const res = await pool.query(sql, params);
    return res.rows;
  };

  // Ensure schema search_path (belt)
  await q(`SET search_path TO $totem_test, public;`);

  // Clean deterministic state inside schema
  await q("DELETE FROM ledger_entries;");
  await q("DELETE FROM service_invoices;");
  await q("DELETE FROM payouts;");
  await q("DELETE FROM payments;");
  await q("DELETE FROM wallets;");

  // 1) wallets
  const system = (await q(
    "INSERT INTO wallets (owner_type, owner_id, currency) VALUES ('system', 1, 'USD') RETURNING id;"
  ))[0];
  const master = (await q(
    "INSERT INTO wallets (owner_type, owner_id, currency) VALUES ('master', 100, 'USD') RETURNING id;"
  ))[0];

  assert(system?.id, "system wallet created");
  assert(master?.id, "master wallet created");
  log("systemWallet=" + system.id);
  log("masterWallet=" + master.id);

  // helper: balance from ledger
  const balanceOf = async (walletId) => {
    const r = (await q(
      "SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END),0)::bigint AS bal FROM ledger_entries WHERE wallet_id=$1;",
      [walletId]
    ))[0];
    return Number(r.bal);
  };

  // 2) payment pending -> paid, then ledger credit
  const payment = (await q(
    "INSERT INTO payments (client_ref, target_wallet, amount_cents, status) VALUES ('test-client', $1, 10000, 'pending') RETURNING id;",
    [master.id]
  ))[0];
  assert(payment?.id, "payment created");
  await q("UPDATE payments SET status='paid', paid_at=now() WHERE id=$1;", [payment.id]);

  await q(
    "INSERT INTO ledger_entries (wallet_id, direction, amount_cents, reference_type, reference_id) VALUES ($1,'credit',10000,'payment',$2);",
    [master.id, String(payment.id)]
  );

  const b1 = await balanceOf(master.id);
  assert(b1 === 10000, "balance after payment = 10000");
  log("paymentId=" + payment.id);
  log("masterBalanceAfterPayment=" + b1);

  // 3) payout reserve (debit)
  const payout = (await q(
    "INSERT INTO payouts (wallet_id, amount_cents, status) VALUES ($1, 3000, 'requested') RETURNING id;",
    [master.id]
  ))[0];
  assert(payout?.id, "payout created");

  await q(
    "INSERT INTO ledger_entries (wallet_id, direction, amount_cents, reference_type, reference_id) VALUES ($1,'debit',3000,'payout',$2);",
    [master.id, String(payout.id)]
  );

  const b2 = await balanceOf(master.id);
  assert(b2 === 7000, "balance after payout reserve = 7000");
  log("payoutId=" + payout.id);
  log("masterBalanceAfterPayoutReserve=" + b2);

  // 4) payout fail -> rollback (credit)
  await q("UPDATE payouts SET status='failed' WHERE id=$1;", [payout.id]);
  await q(
    "INSERT INTO ledger_entries (wallet_id, direction, amount_cents, reference_type, reference_id) VALUES ($1,'credit',3000,'payout_rollback',$2);",
    [master.id, String(payout.id)]
  );

  const b3 = await balanceOf(master.id);
  assert(b3 === 10000, "balance after payout rollback = 10000");
  log("masterBalanceAfterPayoutRollback=" + b3);

  // 5) service invoice: master -> system
  const invoice = (await q(
    "INSERT INTO service_invoices (system_wallet, description, amount_cents) VALUES ($1,'platform fee',1000) RETURNING id;",
    [system.id]
  ))[0];
  assert(invoice?.id, "invoice created");

  await q(
    "INSERT INTO ledger_entries (wallet_id, direction, amount_cents, reference_type, reference_id) VALUES ($1,'debit',1000,'service_invoice',$2);",
    [master.id, String(invoice.id)]
  );
  await q(
    "INSERT INTO ledger_entries (wallet_id, direction, amount_cents, reference_type, reference_id) VALUES ($1,'credit',1000,'service_invoice',$2);",
    [system.id, String(invoice.id)]
  );

  const masterFinal = await balanceOf(master.id);
  const systemFinal = await balanceOf(system.id);

  assert(masterFinal === 9000, "master final = 9000");
  assert(systemFinal === 1000, "system final = 1000");
  assert(masterFinal >= 0 && systemFinal >= 0, "no negative balances");

  log("masterFinal=" + masterFinal);
  log("systemFinal=" + systemFinal);

  log("TEST_PASS");
  log("FINCORE_PG_TEST_END");

  await pool.end();
}

main().catch((e) => {
  console.error("TEST_FAIL");
  console.error(String(e?.stack || e));
  process.exit(1);
});
