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

const evidenceRoot = 'C:/Work/TOTEM_GLOBALIZATION_BACKUPS/G10_20261003_103745';
const migrationPath = path.join(repoRoot, 'migrations', '2026_10_03__g10_generalize_market_money_constraints.sql');
const precheckPath = path.join(evidenceRoot, 'G10_PRECHECK.json');
const dumpPath = path.join(evidenceRoot, 'production_pre_g10.dump');
const expectedDumpSha = 'C055AD900771B8ED2FC215DB97E3847FA7BD1521DC78AF9606D3453D78E13605';
const reportsDir = path.join(repoRoot, 'reports', 'globalization');
const applyRequested = process.argv.includes('--apply');
const databaseUrl = process.env.G10_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_MISSING');
fs.mkdirSync(reportsDir, { recursive: true });

const precheck = JSON.parse(fs.readFileSync(precheckPath, 'utf8'));
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
function assert(v, m) { if (!v) throw new Error(m); }
function sslFor(url) {
  const host = new URL(url).hostname;
  return ['127.0.0.1','localhost'].includes(host) ? false : { rejectUnauthorized: false };
}
function clientOptions(readOnly=false) {
  return {
    connectionString: databaseUrl,
    ssl: sslFor(databaseUrl),
    options: readOnly
      ? '-c default_transaction_read_only=on -c statement_timeout=120000'
      : '-c statement_timeout=120000'
  };
}
async function rows(client, text, params=[]) {
  return (await client.query(text, params)).rows;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  }
  return value;
}
function hashRows(value) {
  return sha256(JSON.stringify(stable(value)));
}

const currencyTables = [
  'money_audit_events','money_ledger_entries','money_owner_balances','money_receipts',
  'money_split_allocations','payout_executions','provider_events',
  'provider_settlement_items','provider_settlements','withdraw_requests'
];
async function readState(client) {
  const identity = (await rows(client, `select current_database() database,current_user db_user,current_setting('transaction_read_only') read_only`))[0];
  const constraints = await rows(client, `
    select conrelid::regclass::text table_name,conname,pg_get_constraintdef(oid) definition
    from pg_constraint
    where connamespace='public'::regnamespace and contype='c'
      and conname = any($1::text[])
    order by 1,2`, [[
      'auth_users_phone_canonical_check','destination_providers_country_check',
      ...currencyTables.map(t => `${t}_currency_check`)
    ]]);
  const destCountryDefault = (await rows(client, `
    select column_default from information_schema.columns
    where table_schema='public' and table_name='destination_providers' and column_name='country'`))[0]?.column_default ?? null;
  const bindings = await rows(client, `
    select m.code market_code,mpb.provider_type,mpb.provider_code,mpb.enabled,mpb.priority,mpb.profile_code,mpb.config_json
    from public.market_provider_bindings mpb join public.markets m on m.id=mpb.market_id
    where m.code='KG' and mpb.provider_type='payout'
    order by mpb.provider_code`);
  const destinationProviders = (await rows(client, `select to_jsonb(dp) row from public.destination_providers dp order by code`)).map(r => r.row);
  const authPhones = await rows(client, `select id,phone,role,created_at from public.auth_users order by id`);
  const functionDef = (await rows(client, `
    select pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='create_refund_on_booking_cancel' and p.prokind='f'`))[0]?.definition || '';
  const businessCounts = {};
  for (const table of ['bookings','payments','payouts','withdraw_requests','contracts']) {
    businessCounts[table] = Number((await rows(client, `select count(*)::bigint n from public.${table}`))[0].n);
  }
  const totemTestWallets = await rows(client, `select * from totem_test.wallets order by id`);
  const totemTestLedger = await rows(client, `select * from totem_test.ledger_entries order by id`);
  const market = await rows(client, `select code,country_code,default_currency,default_timezone,active from public.markets order by code`);
  const tenants = await rows(client, `select m.code,count(*)::int n from public.tenant_market_settings t join public.markets m on m.id=t.market_id group by m.code order by m.code`);
  return {
    identity,constraints,destCountryDefault,bindings,destinationProviders,authPhones,
    functionDef,businessCounts,market,tenants,
    totemTestWalletHash:hashRows(totemTestWallets),
    totemTestLedgerHash:hashRows(totemTestLedger),
    totemTestWalletCount:totemTestWallets.length,
    totemTestLedgerCount:totemTestLedger.length
  };
}

function assertCore(state) {
  assert(state.identity.database === 'railway', `UNEXPECTED_DATABASE_${state.identity.database}`);
  assert(state.market.length === 1 && state.market[0].code === 'KG' && state.market[0].active === true, 'KG_MARKET_INVARIANT_FAILED');
  assert(state.tenants.length === 1 && state.tenants[0].code === 'KG' && state.tenants[0].n === 27, 'TENANT_MARKET_INVARIANT_FAILED');
  for (const [table, expected] of Object.entries(precheck.business_counts)) {
    assert(state.businessCounts[table] === expected, `BUSINESS_COUNT_CHANGED_${table}_${state.businessCounts[table]}_${expected}`);
  }
  assert(hashRows(state.destinationProviders) === hashRows(precheck.destination_providers), 'DESTINATION_PROVIDERS_DATA_CHANGED');
  assert(state.authPhones.length === precheck.phone.auth.total, 'AUTH_USER_COUNT_CHANGED');
  assert(state.authPhones.filter(r => r.phone != null).length === precheck.phone.auth.with_phone, 'AUTH_PHONE_COUNT_CHANGED');
  assert(state.authPhones.every(r => r.phone == null || /^\+[1-9][0-9]{7,14}$/.test(r.phone)), 'AUTH_PHONE_NOT_GENERIC_E164');
}

function byName(state, name) {
  return state.constraints.find(c => c.conname === name);
}
function assertPre(state) {
  assertCore(state);
  assert(state.bindings.length === 0, `PRE_PROVIDER_BINDINGS_${state.bindings.length}`);
  assert(String(state.destCountryDefault).includes("'KG'"), 'PRE_DESTINATION_COUNTRY_DEFAULT_NOT_KG');
  assert(/\\\+996/.test(byName(state,'auth_users_phone_canonical_check')?.definition || ''), 'PRE_AUTH_PHONE_CHECK_NOT_KG');
  assert(/= 'KG'/.test(byName(state,'destination_providers_country_check')?.definition || ''), 'PRE_DEST_COUNTRY_CHECK_NOT_KG');
  for (const table of currencyTables) {
    assert(/= 'KGS'/.test(byName(state,`${table}_currency_check`)?.definition || ''), `PRE_CURRENCY_CHECK_NOT_KGS_${table}`);
  }
  assert(state.functionDef.includes("'KGS'"), 'PRE_REFUND_FUNCTION_NOT_KGS');
}
function assertPost(state, preState) {
  assertCore(state);
  assert(state.bindings.length === 4, `POST_PROVIDER_BINDINGS_${state.bindings.length}`);
  const providerCodes = precheck.destination_providers.map(r => r.code).sort();
  assert(JSON.stringify(state.bindings.map(r => r.provider_code).sort()) === JSON.stringify(providerCodes), 'POST_PROVIDER_CODES_MISMATCH');
  assert(state.bindings.every(r => r.provider_type === 'payout'), 'POST_PROVIDER_TYPE_MISMATCH');
  assert(state.destCountryDefault === null, 'POST_DESTINATION_COUNTRY_DEFAULT_PRESENT');
  const phoneDef = byName(state,'auth_users_phone_canonical_check')?.definition || '';
  assert(phoneDef.includes('[1-9][0-9]{7,14}'), 'POST_AUTH_PHONE_CHECK_NOT_GENERIC');
  assert(!phoneDef.includes('+996'), 'POST_AUTH_PHONE_CHECK_STILL_KG');
  const countryDef = byName(state,'destination_providers_country_check')?.definition || '';
  assert(countryDef.includes('[A-Z]{2}'), 'POST_DEST_COUNTRY_CHECK_NOT_GENERIC');
  for (const table of currencyTables) {
    const def = byName(state,`${table}_currency_check`)?.definition || '';
    assert(def.includes('[A-Z]{3}'), `POST_CURRENCY_CHECK_NOT_GENERIC_${table}`);
    assert(!def.includes("'KGS'"), `POST_CURRENCY_CHECK_STILL_KGS_${table}`);
  }
  assert(state.functionDef.includes('v_currency'), 'POST_REFUND_FUNCTION_CURRENCY_SOURCE_MISSING');
  assert(state.functionDef.includes('currency_code'), 'POST_REFUND_FUNCTION_CURRENCY_CODE_MISSING');
  assert(!state.functionDef.includes("'KGS'"), 'POST_REFUND_FUNCTION_STILL_KGS');
  assert(state.totemTestWalletHash === preState.totemTestWalletHash, 'TOTEM_TEST_WALLETS_CHANGED');
  assert(state.totemTestLedgerHash === preState.totemTestLedgerHash, 'TOTEM_TEST_LEDGER_CHANGED');
}
function looksApplied(state) {
  const phoneDef = byName(state,'auth_users_phone_canonical_check')?.definition || '';
  const countryDef = byName(state,'destination_providers_country_check')?.definition || '';
  return state.bindings.length === 4
    && state.destCountryDefault === null
    && phoneDef.includes('[1-9][0-9]{7,14}')
    && countryDef.includes('[A-Z]{2}')
    && currencyTables.every(t => (byName(state,`${t}_currency_check`)?.definition || '').includes('[A-Z]{3}'))
    && state.functionDef.includes('v_currency')
    && !state.functionDef.includes("'KGS'");
}
function summarize(state) {
  return {
    identity:state.identity,
    constraintCount:state.constraints.length,
    destCountryDefault:state.destCountryDefault,
    bindings:state.bindings,
    destinationProviderHash:hashRows(state.destinationProviders),
    authUserCount:state.authPhones.length,
    businessCounts:state.businessCounts,
    market:state.market,
    tenants:state.tenants,
    refundFunctionSha256:sha256(state.functionDef),
    totemTestWalletHash:state.totemTestWalletHash,
    totemTestLedgerHash:state.totemTestLedgerHash,
    totemTestWalletCount:state.totemTestWalletCount,
    totemTestLedgerCount:state.totemTestLedgerCount
  };
}
const migrationSha = sha256(migrationSql);
const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
const reportBase = path.join(reportsDir, `g10_generalization_schema_${timestamp}`);
function writeReport(payload) {
  fs.writeFileSync(`${reportBase}.json`, JSON.stringify(payload,null,2));
  const lines = [
    `G10_GENERALIZATION_SCHEMA=${payload.status}`,
    `MODE=${payload.mode}`,
    `MIGRATION_SHA256=${payload.migration_sha256}`,
    `PRODUCTION_DB_WRITE=${payload.production_db_write ? 1 : 0}`,
    `PROVIDER_BINDINGS=${payload.post?.bindings?.length ?? payload.pre?.bindings?.length ?? 0}`,
    `BUSINESS_COUNTS=${JSON.stringify(payload.post?.businessCounts ?? payload.pre?.businessCounts ?? {})}`,
    `TOTEM_TEST_WALLETS=${payload.post?.totemTestWalletCount ?? payload.pre?.totemTestWalletCount ?? 0}`,
    `TOTEM_TEST_LEDGER=${payload.post?.totemTestLedgerCount ?? payload.pre?.totemTestLedgerCount ?? 0}`,
    `ERROR=${payload.error || ''}`
  ];
  fs.writeFileSync(`${reportBase}.txt`, `${lines.join('\n')}\n`);
  return {json:`${reportBase}.json`,text:`${reportBase}.txt`};
}

assert(precheck.mode === 'READ_ONLY' && precheck.production_db_write === 0, 'PRECHECK_EVIDENCE_INVALID');
assert(sha256File(dumpPath) === expectedDumpSha, 'PREWRITE_DUMP_HASH_MISMATCH');

let preClient=null, writeClient=null, postClient=null;
let preState=null;
let writeCommitted=false;
try {
  preClient = new Client(clientOptions(true));
  await preClient.connect();
  preState = await readState(preClient);

  if (looksApplied(preState)) {
    assertCore(preState);
    const payload={status:'ALREADY_APPLIED_PASS',mode:'NOOP',migration_sha256:migrationSha,production_db_write:false,pre:summarize(preState),post:summarize(preState),error:null};
    const report=writeReport(payload);
    console.log(JSON.stringify({status:payload.status,report},null,2));
    await preClient.end(); preClient=null;
    process.exit(0);
  }

  assertPre(preState);
  if (!applyRequested) {
    const payload={status:'PRECHECK_PASS',mode:'PRECHECK',migration_sha256:migrationSha,production_db_write:false,pre:summarize(preState),post:null,error:null};
    const report=writeReport(payload);
    console.log(JSON.stringify({status:payload.status,report,pre:payload.pre},null,2));
    await preClient.end(); preClient=null;
    process.exit(0);
  }

  await preClient.end(); preClient=null;
  assert(sha256File(dumpPath) === expectedDumpSha, 'PREWRITE_DUMP_HASH_CHANGED');
  writeClient = new Client(clientOptions(false));
  await writeClient.connect();
  const immediate = await readState(writeClient);
  assertPre(immediate);
  const writeMode = (await rows(writeClient, `select current_setting('transaction_read_only') v`))[0].v;
  assert(writeMode === 'off', `WRITE_CONNECTION_READ_ONLY_${writeMode}`);
  await writeClient.query(migrationSql);
  writeCommitted=true;
  await writeClient.end(); writeClient=null;

  postClient = new Client(clientOptions(true));
  await postClient.connect();
  const postState = await readState(postClient);
  assertPost(postState, preState);
  await postClient.end(); postClient=null;

  const payload={status:'PASS',mode:'APPLY',migration_sha256:migrationSha,production_db_write:true,pre:summarize(preState),post:summarize(postState),error:null};
  const report=writeReport(payload);
  console.log(JSON.stringify({status:payload.status,report,post:payload.post},null,2));
} catch (error) {
  try { if (preClient) await preClient.end(); } catch {}
  try { if (writeClient) await writeClient.end(); } catch {}
  try { if (postClient) await postClient.end(); } catch {}
  const payload={status:'FAIL',mode:applyRequested?'APPLY':'PRECHECK',migration_sha256:migrationSha,production_db_write:writeCommitted,pre:preState?summarize(preState):null,post:null,error:error?.stack || String(error)};
  const report=writeReport(payload);
  console.error(JSON.stringify({status:payload.status,report,error:payload.error},null,2));
  process.exitCode=1;
}
