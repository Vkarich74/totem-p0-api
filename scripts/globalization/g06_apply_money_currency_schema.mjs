import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

const migrationPath = path.join(repoRoot, 'migrations', '2026_10_02__g06_add_money_currency_code_kg_backfill.sql');
const backupRoot = 'C:/Work/TOTEM_GLOBALIZATION_BACKUPS/G06_20261002_230341';
const targetRowsPath = path.join(backupRoot, 'G06_TARGET_ROWS_PREWRITE.json');
const backupManifestPath = path.join(backupRoot, 'G06_BACKUP_MANIFEST.json');
const fullManifestPath = path.join(backupRoot, 'G06_FULL_PREWRITE_MANIFEST.json');
const targetTables = ['contracts','services','services_v2','salon_master_services','bookings','payments','payment_refunds','payouts','settlement_items','settlement_periods','settlement_payout_batches','settlement_reconciliation_reports','money_reconciliation_mismatches','withdraw_settings','withdraws'];
const existingCurrencyTables = ['payment_intents','finance_events','payment_collection_anchors','provider_events','provider_settlements','provider_settlement_items','money_audit_events','money_ledger_entries','money_owner_balances','money_owner_obligations','money_receipts','money_split_allocations','payout_executions','withdraw_requests','contract_rent_obligations','contract_rent_payments','contract_salary_obligations','billing_subscriptions'];
const applyRequested = process.argv.includes('--apply');
const localTest = process.env.G06_LOCAL_TEST === '1';
const reportsDir = localTest ? path.join(backupRoot, 'runner_local_reports') : path.join(repoRoot, 'reports', 'globalization');
const databaseUrl = process.env.G06_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_MISSING');
fs.mkdirSync(reportsDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportBase = path.join(reportsDir, `g06_money_currency_schema_${timestamp}`);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const preBackup = JSON.parse(fs.readFileSync(targetRowsPath, 'utf8'));
const backupManifest = JSON.parse(fs.readFileSync(backupManifestPath, 'utf8'));
const fullManifest = JSON.parse(fs.readFileSync(fullManifestPath, 'utf8'));

function sha256Value(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function qid(value) { return '"' + String(value).replaceAll('"', '""') + '"'; }
function canonicalRows(rows) {
  return rows.map(row => {
    const normalized = {};
    for (const key of Object.keys(row).filter(k => k !== 'currency_code').sort()) normalized[key] = row[key];
    return JSON.stringify(normalized);
  }).sort();
}
function rowsHash(rows) { return sha256Value(JSON.stringify(canonicalRows(rows))); }
function sameRows(a, b) { return rowsHash(a) === rowsHash(b); }
function sslFor(url) {
  const host = new URL(url).hostname;
  return ['127.0.0.1','localhost'].includes(host) ? false : { rejectUnauthorized: false };
}
function clientOptions(readOnly = false) {
  return {
    connectionString: databaseUrl,
    ssl: sslFor(databaseUrl),
    options: readOnly ? '-c default_transaction_read_only=on -c statement_timeout=120000' : '-c statement_timeout=120000'
  };
}
async function q(client, text, params = []) { return (await client.query(text, params)).rows; }
function verifyBackupIntegrity() {
  assert(targetTables.every(t => preBackup.tables?.[t]), 'PREWRITE_BACKUP_TABLE_MISSING');
  assert(sha256File(targetRowsPath) === backupManifest.json.sha256, 'TARGET_JSON_BACKUP_HASH_MISMATCH');
  assert(sha256File(backupManifest.dump.path) === backupManifest.dump.sha256, 'TARGET_DUMP_BACKUP_HASH_MISMATCH');
  assert(sha256File(fullManifest.path) === fullManifest.sha256, 'FULL_DUMP_BACKUP_HASH_MISMATCH');
}
function expectedCounts() {
  return Object.fromEntries(targetTables.map(t => [t, preBackup.tables[t].row_count]));
}
function expectedHashes() {
  return Object.fromEntries(targetTables.map(t => [t, rowsHash(preBackup.tables[t].rows)]));
}
async function readTargetRows(client) {
  const result = {};
  for (const table of targetTables) result[table] = await q(client, `select * from public.${qid(table)}`);
  return result;
}
async function readColumnState(client) {
  return q(client, `select table_name,column_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name=any($1::text[]) and column_name='currency_code' order by table_name`, [targetTables]);
}
async function readConstraintState(client) {
  return q(client, `select c.relname table_name,co.conname,pg_get_constraintdef(co.oid,true) definition from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) and co.conname like '%_currency_code_check' order by c.relname,co.conname`, [targetTables]);
}
async function readExistingCurrencyEvidence(client) {
  const cols = await q(client, `select table_name,column_name from information_schema.columns where table_schema='public' and table_name=any($1::text[]) and column_name in ('currency','currency_code') order by table_name,column_name`, [existingCurrencyTables]);
  const evidence = {};
  for (const table of existingCurrencyTables) {
    const found = cols.filter(c => c.table_name === table);
    assert(found.length === 1, `EXISTING_CURRENCY_COLUMN_UNEXPECTED_${table}_${found.length}`);
    const col = found[0].column_name;
    evidence[table] = (await q(client, `select count(*)::int total,count(*) filter(where ${qid(col)} is null)::int nulls,count(*) filter(where ${qid(col)} is not null and ${qid(col)}<>'KGS')::int non_kgs from public.${qid(table)}`))[0];
  }
  return evidence;
}
async function readCoreState(client) {
  const identity = (await q(client, `select current_database() database,current_user db_user,current_setting('transaction_read_only') read_only,version()`))[0];
  const structure = (await q(client, `select count(*) filter(where table_type='BASE TABLE')::int base_tables,count(*) filter(where table_type='VIEW')::int views from information_schema.tables where table_schema in ('public','totem_test')`))[0];
  const targetRows = await readTargetRows(client);
  const columns = await readColumnState(client);
  const constraints = await readConstraintState(client);
  const market = await q(client, `select code,country_code,default_currency,supported_currencies,active from public.markets order by code`);
  const tenants = await q(client, `select m.code,m.default_currency,count(*)::int n from public.tenant_market_settings t join public.markets m on m.id=t.market_id group by m.code,m.default_currency order by m.code`);
  const referral = (await q(client, `select count(*)::int n,count(reward_amount)::int with_amount,count(*) filter(where currency_code is not null)::int with_currency from public.referral_events`))[0];
  const withdrawWallets = await q(client, `select tw.currency,count(*)::int n from public.withdraws w left join totem_test.wallets tw on tw.id=w.wallet_id group by tw.currency order by tw.currency nulls first`);
  const existingCurrency = await readExistingCurrencyEvidence(client);
  const targetCounts = Object.fromEntries(targetTables.map(t => [t, targetRows[t].length]));
  const targetHashes = Object.fromEntries(targetTables.map(t => [t, rowsHash(targetRows[t])]));
  const currencyDistributions = {};
  for (const table of targetTables) {
    if (!columns.some(c => c.table_name === table)) continue;
    currencyDistributions[table] = await q(client, `select currency_code,count(*)::int n from public.${qid(table)} group by currency_code order by currency_code nulls first`);
  }
  return { identity, structure, targetRows, targetCounts, targetHashes, columns, constraints, market, tenants, referral, withdrawWallets, existingCurrency, currencyDistributions };
}
function assertCommonState(state) {
  assert(state.structure.base_tables === 112 && state.structure.views === 17, `STRUCTURE_CHANGED_${state.structure.base_tables}_${state.structure.views}`);
  assert(state.market.length === 1 && state.market[0].code === 'KG' && state.market[0].default_currency === 'KGS' && state.market[0].active === true, 'MARKET_KG_INVARIANT_FAILED');
  assert(state.tenants.length === 1 && state.tenants[0].code === 'KG' && state.tenants[0].default_currency === 'KGS' && state.tenants[0].n === 27, 'TENANT_MARKET_INVARIANT_FAILED');
  assert(state.referral.n === 10 && state.referral.with_amount === 0 && state.referral.with_currency === 0, 'REFERRAL_CURRENCY_EVIDENCE_CHANGED');
  assert(state.withdrawWallets.length === 1 && state.withdrawWallets[0].currency === 'KGS' && state.withdrawWallets[0].n === 7, 'WITHDRAW_WALLET_PROVENANCE_NOT_KGS');
  for (const [table, evidence] of Object.entries(state.existingCurrency)) assert(evidence.non_kgs === 0, `NON_KGS_EXISTING_CURRENCY_${table}`);
}
const preCounts = expectedCounts();
const preHashes = expectedHashes();
function assertIdentity(state) {
  if (localTest) assert(state.identity.database === 'g06_restore_test', `UNEXPECTED_LOCAL_DATABASE_${state.identity.database}`);
  else assert(state.identity.database === 'railway', `UNEXPECTED_PRODUCTION_DATABASE_${state.identity.database}`);
}
function assertPreState(state) {
  assertIdentity(state);
  assertCommonState(state);
  assert(state.columns.length === 0, `TARGET_CURRENCY_COLUMNS_ALREADY_OR_PARTIALLY_EXIST_${state.columns.map(c=>c.table_name).join(',')}`);
  assert(state.constraints.length === 0, `TARGET_CURRENCY_CONSTRAINTS_ALREADY_EXIST_${state.constraints.map(c=>c.conname).join(',')}`);
  for (const table of targetTables) {
    assert(state.targetCounts[table] === preCounts[table], `PREWRITE_COUNT_CHANGED_${table}_${state.targetCounts[table]}_${preCounts[table]}`);
    assert(state.targetHashes[table] === preHashes[table], `PREWRITE_DATA_CHANGED_${table}`);
  }
}
function assertAppliedState(state) {
  assertIdentity(state);
  assertCommonState(state);
  assert(state.columns.length === targetTables.length, `APPLIED_COLUMN_COUNT_${state.columns.length}`);
  assert(state.constraints.length === targetTables.length, `APPLIED_CONSTRAINT_COUNT_${state.constraints.length}`);
  for (const table of targetTables) {
    const col = state.columns.find(c => c.table_name === table);
    const con = state.constraints.find(c => c.table_name === table && c.conname === `${table}_currency_code_check`);
    assert(col && col.is_nullable === 'YES' && col.column_default === null, `COLUMN_CONTRACT_FAILED_${table}`);
    assert(con && /currency_code IS NULL/.test(con.definition) && /\^\[A-Z\]\{3\}\$/.test(con.definition), `CONSTRAINT_CONTRACT_FAILED_${table}`);
    assert(state.targetCounts[table] === preCounts[table], `POST_COUNT_CHANGED_${table}`);
    assert(state.targetHashes[table] === preHashes[table], `POST_DATA_CHANGED_${table}`);
    const dist = state.currencyDistributions[table] || [];
    if (preCounts[table] === 0) assert(dist.length === 0, `ZERO_ROW_CURRENCY_UNEXPECTED_${table}`);
    else assert(dist.length === 1 && dist[0].currency_code === 'KGS' && dist[0].n === preCounts[table], `KGS_BACKFILL_FAILED_${table}`);
  }
}
function summarize(state) {
  return {
    identity: state.identity,
    structure: state.structure,
    targetCounts: state.targetCounts,
    targetHashes: state.targetHashes,
    columnCount: state.columns.length,
    constraintCount: state.constraints.length,
    market: state.market,
    tenants: state.tenants,
    referral: state.referral,
    withdrawWallets: state.withdrawWallets,
    existingCurrency: state.existingCurrency,
    currencyDistributions: state.currencyDistributions
  };
}
function writeReport(payload) {
  fs.writeFileSync(`${reportBase}.json`, JSON.stringify(payload, null, 2));
  const lines = [
    `G06_MONEY_CURRENCY_SCHEMA=${payload.status}`,
    `MODE=${payload.mode}`,
    `MIGRATION_SHA256=${payload.migration_sha256}`,
    `PRODUCTION_DB_WRITE=${payload.production_db_write ? 1 : 0}`,
    `TARGET_TABLES=${targetTables.length}`,
    `TARGET_ROWS=${Object.values(preCounts).reduce((a,b)=>a+b,0)}`,
    `COLUMNS=${payload.post?.columnCount ?? payload.pre?.columnCount ?? 0}`,
    `CONSTRAINTS=${payload.post?.constraintCount ?? payload.pre?.constraintCount ?? 0}`,
    `BASE_TABLES=${payload.post?.structure?.base_tables ?? payload.pre?.structure?.base_tables ?? 0}`,
    `VIEWS=${payload.post?.structure?.views ?? payload.pre?.structure?.views ?? 0}`,
    `ERROR=${payload.error || ''}`
  ];
  fs.writeFileSync(`${reportBase}.txt`, `${lines.join('\n')}\n`);
  return { json: `${reportBase}.json`, text: `${reportBase}.txt` };
}

const migrationSha = sha256Value(migrationSql);
let preClient = null;
let writeClient = null;
let postClient = null;
let preState = null;
let writeCommitted = false;

try {
  verifyBackupIntegrity();
  preClient = new Client(clientOptions(true));
  await preClient.connect();
  preState = await readCoreState(preClient);

  if (preState.columns.length === targetTables.length) {
    assertAppliedState(preState);
    const payload = { status:'ALREADY_APPLIED_PASS', mode:localTest?'LOCAL_NOOP':'APPLY_REQUESTED_NOOP', migration_sha256:migrationSha, production_db_write:false, pre:summarize(preState), post:summarize(preState), error:null };
    const paths = writeReport(payload);
    console.log(JSON.stringify({status:payload.status,report:paths},null,2));
    await preClient.end(); preClient=null;
    process.exit(0);
  }

  assert(preState.columns.length === 0, `PARTIAL_CURRENCY_COLUMN_STATE_${preState.columns.map(c=>c.table_name).join(',')}`);
  assertPreState(preState);

  if (!applyRequested) {
    const payload = { status:'PRECHECK_PASS', mode:localTest?'LOCAL_PRECHECK':'PRECHECK', migration_sha256:migrationSha, production_db_write:false, pre:summarize(preState), post:null, error:null };
    const paths = writeReport(payload);
    console.log(JSON.stringify({status:payload.status,report:paths,pre:payload.pre},null,2));
    await preClient.end(); preClient=null;
    process.exit(0);
  }

  await preClient.end(); preClient=null;
  verifyBackupIntegrity();
  writeClient = new Client(clientOptions(false));
  await writeClient.connect();
  const immediate = await readCoreState(writeClient);
  assertPreState(immediate);
  const txMode = (await q(writeClient, `select current_setting('transaction_read_only') read_only`))[0].read_only;
  assert(txMode === 'off', `WRITE_CONNECTION_IS_READ_ONLY_${txMode}`);

  await writeClient.query(migrationSql);
  writeCommitted = true;
  await writeClient.end(); writeClient=null;
  postClient = new Client(clientOptions(true));
  await postClient.connect();
  const postState = await readCoreState(postClient);
  assertAppliedState(postState);
  await postClient.end(); postClient=null;

  const payload = {
    status:'PASS',
    mode:localTest?'LOCAL_APPLY':'APPLY',
    migration_sha256:migrationSha,
    production_db_write:localTest ? false : true,
    pre:summarize(preState),
    post:summarize(postState),
    error:null
  };
  const paths = writeReport(payload);
  console.log(JSON.stringify({status:payload.status,report:paths,post:payload.post},null,2));
} catch (error) {
  try { if (preClient) await preClient.end(); } catch {}
  try { if (writeClient) await writeClient.end(); } catch {}
  try { if (postClient) await postClient.end(); } catch {}
  const payload = {
    status:'FAIL',
    mode:localTest?(applyRequested?'LOCAL_APPLY':'LOCAL_PRECHECK'):(applyRequested?'APPLY':'PRECHECK'),
    migration_sha256:migrationSha,
    production_db_write:localTest ? false : writeCommitted,
    pre:preState ? summarize(preState) : null,
    post:null,
    error:error?.message || String(error)
  };
  const paths = writeReport(payload);
  console.error(JSON.stringify({status:'FAIL',error:payload.error,report:paths},null,2));
  process.exit(1);
}
