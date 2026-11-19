// PostgreSQL 17 CI contract smoke — EMPTY business tables only.
// No salons, masters, users, bookings, clients, payments or any production data.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  listAdminMarkets,
  readScopedAdminList,
  assertAdminOwnerActionMarket,
} from "../routes/internal/adminMarketsContract.js";

test("real PostgreSQL parses all four scoped queries with zero business rows", async (t) => {
  const connectionString = process.env.PGTEST_URL;
  if (!connectionString) {
    t.skip("Only executed in isolated PostgreSQL CI with PGTEST_URL");
    return;
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    // Simplest type-compatible skeleton based on current source read-model.
    // DDL is rolled back; no business object is ever inserted.
    await client.query([
      "CREATE TABLE public.markets (",
      "id integer PRIMARY KEY,code text NOT NULL,country_code text,active boolean NOT NULL,",
      "default_locale text,default_currency text,default_timezone text)",
    ].join(" "));
    await client.query([
      "CREATE TABLE public.salons (",
      "id integer PRIMARY KEY,name text,slug text,enabled boolean,status text,created_at timestamptz)",
    ].join(" "));
    await client.query("CREATE TABLE public.tenant_market_settings (salon_id integer,market_id integer)");
    await client.query("CREATE TABLE public.masters (id integer PRIMARY KEY,name text,slug text,active boolean,user_id integer)");
    await client.query("CREATE TABLE public.master_salon (master_id integer,salon_id integer,status text)");
    await client.query("CREATE TABLE public.clients (id integer PRIMARY KEY,name text,phone text,salon_id integer)");
    await client.query([
      "CREATE TABLE public.bookings (",
      "id integer PRIMARY KEY,salon_id integer,master_id integer,client_id integer,",
      "start_at timestamptz,status text)",
    ].join(" "));
    await client.query([
      "INSERT INTO public.markets (id,code,country_code,active,default_currency,default_locale,default_timezone)",
      "VALUES (1,'KG','KG',true,'KGS','ru-RU','Asia/Bishkek'),",
      "(2,'US','US',true,'USD','en-US','America/New_York'),",
      "(3,'KZ','KZ',false,'KZT','ru-KZ','Asia/Almaty')",
    ].join(" "));

    const catalog = await listAdminMarkets(client);
    assert.deepEqual(catalog.map(x => x.market_code),["KG","US","KZ"]);
    assert.equal(catalog[2].admin_operation_enabled,false);
    for (const kind of ["salons","masters","clients","bookings"]) {
      for (const marketCode of ["KG","US"]) {
        const result = await readScopedAdminList(client,{kind,marketCode,limit:20,offset:0});
        assert.equal(result.pagination.total,0);
        assert.deepEqual(result.items,[]);
        assert.equal(result.market_code,marketCode);
      }
    }
    await assert.rejects(readScopedAdminList(client,{
      kind:"salons",marketCode:"KZ",limit:10,offset:0,
    }),{code:"ADMIN_MARKET_INACTIVE"});
    // No salon or master was ever created; only SELECTs are used by the guard.
    const neutral = await assertAdminOwnerActionMarket(client,{ownerType:"master",ownerId:1});
    assert.equal(neutral.legacy_unclassified,true);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
