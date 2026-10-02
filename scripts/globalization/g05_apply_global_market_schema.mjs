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

const migrationPath = path.join(repoRoot, 'migrations', '2026_10_02__g05_add_global_market_schema.sql');
const reportsDir = path.join(repoRoot, 'reports', 'globalization');
const targetTables = ['markets','tenant_market_settings','market_capabilities','market_provider_bindings'];
const applyRequested = process.argv.includes('--apply');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportBase = path.join(reportsDir, `g05_global_market_schema_${timestamp}`);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function stableHash(rows) { return sha256(JSON.stringify(rows)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function clientOptions(readOnly = false) {
  assert(process.env.DATABASE_URL, 'DATABASE_URL_MISSING');
  const parsed = new URL(process.env.DATABASE_URL);
  const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  return { connectionString: process.env.DATABASE_URL, ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }), options: readOnly ? '-c default_transaction_read_only=on -c statement_timeout=120000' : '-c statement_timeout=120000' };
}
async function q(client, text, params = []) { return (await client.query(text, params)).rows; }
async function readCoreState(client) {
  const identity = (await q(client, `select current_database() database,current_user db_user,current_setting('transaction_read_only') read_only,version()`))[0];
  const existing = await q(client, `select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[]) order by table_name`, [targetTables]);
  const structure = (await q(client, `select count(*) filter(where table_type='BASE TABLE')::int base_tables,count(*) filter(where table_type='VIEW')::int views from information_schema.tables where table_schema in ('public','totem_test')`))[0];
  const countries = await q(client, `select * from public.countries order by code`);
  const cities = await q(client, `select * from public.cities order by country_code,slug`);
  const salons = await q(client, `select * from public.salons order by id`);
  const platformConfig = await q(client, `select * from public.platform_config order by key`);
  const salonCities = await q(client, `select city,count(*)::int n from public.salons group by city order by city nulls first`);
  const legacy = (await q(client, `select (select count(*) from public.bookings)::int bookings,(select count(*) from public.contracts)::int contracts,(select count(*) from public.payments)::int payments,(select count(*) from public.payouts)::int payouts,(select count(*) from public.auth_users)::int auth_users`))[0];
  return { identity, existing, structure, countries, cities, salons, platformConfig, salonCities, legacy,
    hashes: { countries: stableHash(countries), cities: stableHash(cities), salons: stableHash(salons), platformConfig: stableHash(platformConfig) } };
}

function assertPreState(state) {
  assert(state.identity.database === 'railway', `UNEXPECTED_DATABASE_${state.identity.database}`);
  assert(state.existing.length === 0, `TARGET_TABLES_ALREADY_OR_PARTIALLY_EXIST_${state.existing.map(x=>x.table_name).join(',')}`);
  assert(state.structure.base_tables === 108 && state.structure.views === 17, `UNEXPECTED_STRUCTURE_${state.structure.base_tables}_${state.structure.views}`);
  assert(state.salons.length === 27, `UNEXPECTED_SALON_COUNT_${state.salons.length}`);  assert(JSON.stringify(state.salonCities) === JSON.stringify([{city:null,n:13},{city:'Bishkek',n:8},{city:'Бишкек',n:6}]), 'UNEXPECTED_SALON_CITY_DISTRIBUTION');
  const kg = state.countries.find(x=>x.code==='KG');
  const kz = state.countries.find(x=>x.code==='KZ');
  assert(kg && kg.status==='active' && kg.currency_code==='KGS' && kg.timezone==='Asia/Bishkek' && kg.phone_prefix==='+996', 'KG_GEOGRAPHY_PRESTATE_MISMATCH');
  assert(kz && kz.status==='planned' && kz.currency_code==='KZT' && kz.timezone==='Asia/Almaty', 'KZ_GEOGRAPHY_PRESTATE_MISMATCH');
  const bishkek = state.cities.filter(x=>x.country_code==='KG' && x.slug==='bishkek' && x.status==='active');
  assert(bishkek.length===1, `BISHKEK_ACTIVE_CITY_COUNT_${bishkek.length}`);
  assert(!state.platformConfig.some(x=>x.key==='default_market_code'), 'DEFAULT_MARKET_ALREADY_EXISTS');
  assert(state.legacy.bookings===48 && state.legacy.contracts===18 && state.legacy.payments===23 && state.legacy.payouts===15 && state.legacy.auth_users===49, 'LEGACY_COUNT_PRESTATE_MISMATCH');
}

async function readAppliedState(client) {
  const core = await readCoreState(client);
  const market = await q(client, `select code,country_code,default_locale,supported_locales,default_currency,supported_currencies,default_timezone,country_pack_code,country_pack_version,active from public.markets order by code`);
  const tenant = (await q(client, `select count(*)::int total,count(*) filter(where city_id is not null)::int linked_city,count(*) filter(where city_id is null)::int null_city from public.tenant_market_settings`))[0];
  const linked = (await q(client, `select count(*)::int n from public.tenant_market_settings t join public.cities c on c.id=t.city_id where c.country_code='KG' and c.slug='bishkek'`))[0].n;
  const cfg = await q(client, `select key,value from public.platform_config where key='default_market_code'`);
  const caps = (await q(client, `select count(*)::int n from public.market_capabilities`))[0].n;
  const bindings = (await q(client, `select count(*)::int n from public.market_provider_bindings`))[0].n;
  const triggers = await q(client, `select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname='public' and c.relname=any($1::text[]) order by tgname`, [['markets','tenant_market_settings']]);
  return { ...core, market, tenant, linked, cfg, caps, bindings, triggers };
}
function assertAppliedState(state, preState = null) {
  assert(state.existing.length===4 && targetTables.every(t=>state.existing.some(x=>x.table_name===t)), 'TARGET_TABLE_SET_MISMATCH');
  assert(state.structure.base_tables===112 && state.structure.views===17, `POST_STRUCTURE_MISMATCH_${state.structure.base_tables}_${state.structure.views}`);
  assert(state.market.length===1, `MARKET_COUNT_${state.market.length}`);
  const m=state.market[0];
  assert(m.code==='KG' && m.country_code==='KG' && m.default_locale==='ru-KG' && m.default_currency==='KGS' && m.default_timezone==='Asia/Bishkek' && m.country_pack_code==='KG' && m.country_pack_version==='1' && m.active===true, 'KG_MARKET_ROW_MISMATCH');
  assert(JSON.stringify(m.supported_locales)===JSON.stringify(['ru-KG']), 'KG_SUPPORTED_LOCALES_MISMATCH');
  assert(JSON.stringify(m.supported_currencies)===JSON.stringify(['KGS']), 'KG_SUPPORTED_CURRENCIES_MISMATCH');
  assert(state.tenant.total===27 && state.tenant.linked_city===14 && state.tenant.null_city===13 && state.linked===14, 'TENANT_BACKFILL_MISMATCH');
  assert(state.cfg.length===1 && state.cfg[0].value==='KG', 'DEFAULT_MARKET_CONFIG_MISMATCH');
  assert(state.caps===0 && state.bindings===0, 'UNEXPECTED_CAPABILITY_OR_PROVIDER_SEED');
  assert(JSON.stringify(state.salonCities)===JSON.stringify([{city:null,n:13},{city:'Bishkek',n:8},{city:'Бишкек',n:6}]), 'SALON_CITY_CHANGED');
  assert(state.legacy.bookings===48 && state.legacy.contracts===18 && state.legacy.payments===23 && state.legacy.payouts===15 && state.legacy.auth_users===49, 'LEGACY_COUNTS_CHANGED');
  const triggerNames=state.triggers.map(x=>x.tgname);
  assert(JSON.stringify(triggerNames)===JSON.stringify(['trg_validate_market_row','trg_validate_tenant_market_settings_row']), 'VALIDATION_TRIGGERS_MISMATCH');
  const kz=state.countries.find(x=>x.code==='KZ');
  assert(kz && kz.status==='planned' && kz.currency_code==='KZT' && kz.timezone==='Asia/Almaty', 'KZ_CHANGED');
  if (preState) {
    assert(state.hashes.countries===preState.hashes.countries, 'COUNTRIES_CHANGED');
    assert(state.hashes.cities===preState.hashes.cities, 'CITIES_CHANGED');
    assert(state.hashes.salons===preState.hashes.salons, 'SALONS_CHANGED');
    const oldConfig=state.platformConfig.filter(x=>x.key!=='default_market_code');
    assert(stableHash(oldConfig)===preState.hashes.platformConfig, 'EXISTING_PLATFORM_CONFIG_CHANGED');
  }
}
function summarizeCore(state) {
  return {
    identity: state.identity,
    structure: state.structure,
    salon_count: state.salons.length,
    salon_city_distribution: state.salonCities,
    legacy_counts: state.legacy,
    hashes: state.hashes,
  };
}

function writeReport(payload) {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(`${reportBase}.json`, JSON.stringify(payload, null, 2));
  const lines = [
    `G05_GLOBAL_MARKET_SCHEMA=${payload.status}`,
    `MODE=${payload.mode}`,
    `MIGRATION_SHA256=${payload.migration_sha256}`,
    `PRODUCTION_DB_WRITE=${payload.production_db_write ? 1 : 0}`,
    `MARKETS=${payload.post?.market_count ?? 0}`,
    `TENANT_BINDINGS=${payload.post?.tenant_total ?? 0}`,
    `BISHKEK_LINKS=${payload.post?.bishkek_links ?? 0}`,
    `NULL_CITY_BINDINGS=${payload.post?.null_city ?? 0}`,
    `BASE_TABLES=${payload.post?.base_tables ?? 0}`,
    `VIEWS=${payload.post?.views ?? 0}`,
    `ERROR=${payload.error || ''}`,
  ];
  fs.writeFileSync(`${reportBase}.txt`, `${lines.join('\n')}\n`);
  return { json: `${reportBase}.json`, text: `${reportBase}.txt` };
}

const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const migrationSha = sha256(migrationSql);
let preClient;
let writeClient;
let postClient;
let writeCommitted = false;
let preState;
try {
  preClient = new Client(clientOptions(true));
  await preClient.connect();
  preState = await readCoreState(preClient);

  if (preState.existing.length === targetTables.length) {
    const applied = await readAppliedState(preClient);
    assertAppliedState(applied, null);
    const paths = writeReport({
      status: 'ALREADY_APPLIED_PASS', mode: applyRequested ? 'APPLY_REQUESTED_NOOP' : 'PRECHECK',
      migration_sha256: migrationSha, production_db_write: false,
      pre: summarizeCore(preState),
      post: { market_count: applied.market.length, tenant_total: applied.tenant.total, bishkek_links: applied.linked, null_city: applied.tenant.null_city, base_tables: applied.structure.base_tables, views: applied.structure.views },
      error: null,
    });
    console.log(JSON.stringify({status:'ALREADY_APPLIED_PASS',report:paths},null,2));
    await preClient.end();
    process.exit(0);
  }

  assertPreState(preState);
  if (!applyRequested) {
    console.log(JSON.stringify({status:'PRECHECK_PASS',apply:false,migration_sha256:migrationSha,pre:summarizeCore(preState)},null,2));
    await preClient.end();
    process.exit(0);
  }
  await preClient.end();
  preClient = null;
  writeClient = new Client(clientOptions(false));
  await writeClient.connect();
  const immediate = await readCoreState(writeClient);
  assertPreState(immediate);
  assert(immediate.hashes.countries===preState.hashes.countries, 'PRE_APPLY_COUNTRIES_CHANGED');
  assert(immediate.hashes.cities===preState.hashes.cities, 'PRE_APPLY_CITIES_CHANGED');
  assert(immediate.hashes.salons===preState.hashes.salons, 'PRE_APPLY_SALONS_CHANGED');
  assert(immediate.hashes.platformConfig===preState.hashes.platformConfig, 'PRE_APPLY_PLATFORM_CONFIG_CHANGED');
  const txMode=(await q(writeClient, `select current_setting('transaction_read_only') read_only`))[0].read_only;
  assert(txMode==='off', `WRITE_CONNECTION_IS_READ_ONLY_${txMode}`);

  await writeClient.query(migrationSql);
  writeCommitted = true;
  await writeClient.end();
  writeClient = null;

  postClient = new Client(clientOptions(true));
  await postClient.connect();
  const postState = await readAppliedState(postClient);
  assertAppliedState(postState, preState);
  await postClient.end();
  postClient = null;

  const payload = {
    status: 'PASS', mode: 'APPLY', migration_sha256: migrationSha, production_db_write: true,
    pre: summarizeCore(preState),
    post: {
      market_count: postState.market.length,
      market: postState.market[0],
      tenant_total: postState.tenant.total,
      bishkek_links: postState.linked,
      null_city: postState.tenant.null_city,
      capability_rows: postState.caps,
      provider_binding_rows: postState.bindings,
      base_tables: postState.structure.base_tables,
      views: postState.structure.views,
      validation_triggers: postState.triggers.map(x=>x.tgname),
      legacy_counts: postState.legacy,
    },
    error: null,
  };
  const reportPaths = writeReport(payload);
  console.log(JSON.stringify({status:'PASS',report:reportPaths,post:payload.post},null,2));
} catch (error) {
  try { if (preClient) await preClient.end(); } catch {}
  try { if (writeClient) await writeClient.end(); } catch {}
  try { if (postClient) await postClient.end(); } catch {}
  const payload = {
    status: 'FAIL',
    mode: applyRequested ? 'APPLY' : 'PRECHECK',
    migration_sha256: migrationSha,
    production_db_write: writeCommitted,
    pre: preState ? summarizeCore(preState) : null,
    post: null,
    error: error?.message || String(error),
  };
  const reportPaths = writeReport(payload);
  console.error(JSON.stringify({status:'FAIL',error:payload.error,report:reportPaths},null,2));
  process.exit(1);
}
