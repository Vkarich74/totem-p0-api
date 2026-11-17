// TAX-02 staging-only integration acceptance. NEVER run against production.
// Requires US_TAX_STAGE_DATABASE=totem_us_tax01_stage_YYYYMMDD and local PG credentials.
// Uses existing cloned salon/master, creates only short-lived TEST sessions,
// updates only a disposable restored database, wraps all fixtures in ROLLBACK.
// Does NOT create salons, masters, bookings, or real Stripe charges.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import {
  readUsOwnerServiceTax, saveUsOwnerServiceTax,
} from "../src/services/usServiceTaxSettings.service.js";
import { buildUsServiceTaxSettingsRouter } from "../src/routes/internalUsServiceTaxSettings.js";

const dbName = process.env.US_TAX_STAGE_DATABASE || "";
if (!/^totem_us_tax01_stage_[0-9]{8}$/.test(dbName)) {
  throw new Error("TAX02_REJECT_NON_ISOLATED_DATABASE");
}
if (!process.env.PGPASSWORD) {
  throw new Error("TAX02_LOCAL_STAGE_PGPASSWORD_REQUIRED");
}

const client = new pg.Client({
  host: "127.0.0.1", port: 5432, database: dbName,
  user: "postgres", password: process.env.PGPASSWORD,
  connectionTimeoutMillis: 5000,
});

// Inner commits are intentionally never forwarded. Everything stays
// inside a single outer test transaction until the final ROLLBACK.
const pool = {
  async connect() {
    return {
      async query(sql, values) {
        if (sql === "BEGIN" || sql === "BEGIN READ ONLY" ||
            sql === "COMMIT" || sql === "ROLLBACK") {
          return { rows: [], rowCount: 0 };
        }
        return client.query(sql, values);
      },
      release() {},
    };
  },
};

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const auth = (userId, role, sessionId) => ({
  user_id: userId, role, source: "session", session_id: sessionId,
  session_expires_at: future(), idle_timeout_at: future(),
});

test("TAX-02: staged PostgreSQL ownership and REST contract", async t => {
  await client.connect();
  let opened = false;
  let server;
  try {
    const identity = await client.query("SELECT current_database() AS db, inet_server_addr()::text AS ip");
    assert.equal(identity.rows[0].db, dbName);
    const pre = await client.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'"
    );
    assert.equal(pre.rows[0].n, 133, "isolated TAX-01 migrated schema required");
    await client.query("BEGIN");
    opened = true;

    const { rows: [salon] } = await client.query(
      `SELECT s.id AS owner_id, s.slug AS slug, u.id AS user_id
         FROM public.salons s
         JOIN public.owner_salon os ON os.salon_id=s.id AND os.status='active'
         JOIN public.auth_users u ON os.owner_id=u.id::text
        WHERE s.enabled IS TRUE AND s.status='active'
          AND u.enabled IS TRUE AND u.role='salon_admin'
        ORDER BY s.id LIMIT 1`
    );
    const { rows: [master] } = await client.query(
      `SELECT m.id AS owner_id, m.slug AS slug, m.user_id AS user_id,
              ms.salon_id
         FROM public.masters m
         JOIN public.auth_users u ON u.id=m.user_id
         JOIN public.master_salon ms ON ms.master_id=m.id
         JOIN public.salons s ON s.id=ms.salon_id
        WHERE m.active IS TRUE AND u.enabled IS TRUE AND u.role='master'
          AND ms.status='active' AND s.enabled IS TRUE AND s.status='active'
        ORDER BY m.id LIMIT 1`
    );
    assert.ok(salon && master, "cloned active owner/master fixtures required");
    const market = await client.query(
      "SELECT id FROM public.markets WHERE code='US' AND active IS TRUE AND default_currency='USD'"
    );
    assert.equal(market.rows.length, 1);

    const sid = randomUUID(), mid = randomUUID();
    const salonAuth = auth(salon.user_id, "salon_admin", sid);
    const masterAuth = auth(master.user_id, "master", mid);

    await t.test("no cross-market owner access even with valid credentials", async () => {
      await client.query(
        `INSERT INTO public.auth_sessions
           (id,user_id,expires_at,last_seen_at)
         VALUES ($1,$2,now()+interval '1 day',now()),
                ($3,$4,now()+interval '1 day',now())`,
        [sid,salon.user_id,mid,master.user_id]
      );
      const response = await readUsOwnerServiceTax(pool, {
        ownerType: "salon", ownerSlug: salon.slug, auth: salonAuth,
      });
      assert.equal(response.status, 404);
    });

    await client.query(
      `UPDATE public.tenant_market_settings
          SET market_id=$2,city_id=NULL,
              locale_override=NULL,currency_override=NULL
        WHERE salon_id=ANY($1::integer[])`,
      [[...new Set([salon.owner_id,master.salon_id])], market.rows[0].id]
    );

    await t.test("default 0 percent without a stored setting", async () => {
      const response = await readUsOwnerServiceTax(pool, {
        ownerType: "salon", ownerSlug: salon.slug, auth: salonAuth,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.rate_bps, 0);
      assert.equal(response.body.tax_percent, "0.00");
      assert.equal(response.body.revision, 0);
      assert.equal(response.body.configured, false);
      assert.equal(response.body.payment_purpose, "beauty_service");
    });

    await t.test("direct owner writes 7.25 percent and reads it back", async () => {
      const result = await saveUsOwnerServiceTax(pool, {
        ownerType: "salon", ownerSlug: salon.slug, auth: salonAuth,
        body: { rate_bps: 725, expected_revision: 0 },
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.tax_percent, "7.25");
      assert.equal(result.body.revision, 1);
      const read = await readUsOwnerServiceTax(pool, {
        ownerType: "salon", ownerSlug: salon.slug, auth: salonAuth,
      });
      assert.equal(read.body.rate_bps, 725);
    });

    await t.test("stale revision conflicts and does not change saved rate", async () => {
      const response = await saveUsOwnerServiceTax(pool, {
        ownerType: "salon", ownerSlug: salon.slug, auth: salonAuth,
        body: { rate_bps: 900, expected_revision: 0 },
      });
      assert.equal(response.status, 409);
      const read = await readUsOwnerServiceTax(pool, {
        ownerType: "salon", ownerSlug: salon.slug, auth: salonAuth,
      });
      assert.equal(read.body.rate_bps, 725);
      assert.equal(read.body.revision, 1);
    });

    await t.test("zero through 100%, integer only, no extra fields", async () => {
      for (const body of [
        {rate_bps: -1, expected_revision:1},
        {rate_bps:10001, expected_revision:1},
        {rate_bps:0.01, expected_revision:1},
        {rate_bps:725, expected_revision:1, admin:true},
        {rate_bps:"725", expected_revision:1},
      ]) {
        assert.equal((await saveUsOwnerServiceTax(pool,{
          ownerType:"salon",ownerSlug:salon.slug,auth:salonAuth,body,
        })).status,400);
      }
      const result = await saveUsOwnerServiceTax(pool, {
        ownerType:"salon",ownerSlug:salon.slug,auth:salonAuth,
        body:{rate_bps:10000,expected_revision:1},
      });
      assert.equal(result.status,200);
      assert.equal(result.body.revision,2);
      assert.equal(result.body.tax_percent,"100.00");
    });

    await t.test("master has independent default 0 and own 2.50% rate", async () => {
      const initial = await readUsOwnerServiceTax(pool, {
        ownerType:"master",ownerSlug:master.slug,auth:masterAuth,
      });
      assert.equal(initial.status,200);
      assert.equal(initial.body.rate_bps,0);
      const saved = await saveUsOwnerServiceTax(pool, {
        ownerType:"master",ownerSlug:master.slug,auth:masterAuth,
        body:{rate_bps:250,expected_revision:0},
      });
      assert.equal(saved.status,200);
      assert.equal(saved.body.rate_bps,250);
      const salonStill = await readUsOwnerServiceTax(pool, {
        ownerType:"salon",ownerSlug:salon.slug,auth:salonAuth,
      });
      assert.equal(salonStill.body.rate_bps,10000);
    });

    await t.test("authorization excludes role confusion, forged slug, legacy and invalid session", async () => {
      const cases = [
        { ownerType:"salon",ownerSlug:salon.slug,auth:masterAuth,expected:403 },
        { ownerType:"master",ownerSlug:master.slug,auth:salonAuth,expected:403 },
        { ownerType:"salon",ownerSlug:master.slug,auth:salonAuth,expected:404 },
        { ownerType:"salon",ownerSlug:salon.slug,auth:{...salonAuth,source:"jwt_legacy"},expected:403 },
        { ownerType:"salon",ownerSlug:salon.slug,auth:{...salonAuth,session_id:randomUUID()},expected:403 },
        { ownerType:"salon",ownerSlug:"../../foo",auth:salonAuth,expected:400 },
        { ownerType:"subscription",ownerSlug:salon.slug,auth:salonAuth,expected:400 },
        { ownerType:"salon",ownerSlug:salon.slug,auth:salonAuth,identity:{user_id:master.user_id},expected:403 },
      ];
      for(const c of cases){
        const response=await readUsOwnerServiceTax(pool,c);
        assert.equal(response.status,c.expected,JSON.stringify(c.ownerType));
      }
    });

    await t.test("real HTTP GET/PUT checks body validation and no-store", async () => {
      const app=express();
      app.use(express.json());
      app.use((req,_res,next)=>{req.auth=salonAuth;next();});
      app.use("/internal",buildUsServiceTaxSettingsRouter(pool));
      server=await new Promise(resolve=>{
        const srv=app.listen(0,"127.0.0.1",()=>resolve(srv));
      });
      const port=server.address().port;
      const url=`http://127.0.0.1:${port}/internal/us-service-tax/salon/${salon.slug}`;
      const received=await fetch(url);
      assert.equal(received.status,200);
      assert.equal(received.headers.get("cache-control"),"no-store");
      assert.equal((await received.json()).rate_bps,10000);

      const bad=await fetch(url,{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({rate_bps:99999,expected_revision:2}),
      });
      assert.equal(bad.status,400);
      assert.equal(bad.headers.get("cache-control"),"no-store");

      const saved=await fetch(url,{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({rate_bps:0,expected_revision:2}),
      });
      assert.equal(saved.status,200);
      assert.equal((await saved.json()).revision,3);
    });

    await t.test("revoked session loses read and write access", async () => {
      await client.query("UPDATE auth_sessions SET revoked_at=now() WHERE id=$1",[sid]);
      const read=await readUsOwnerServiceTax(pool,{
        ownerType:"salon",ownerSlug:salon.slug,auth:salonAuth,
      });
      const write=await saveUsOwnerServiceTax(pool,{
        ownerType:"salon",ownerSlug:salon.slug,auth:salonAuth,
        body:{rate_bps:25,expected_revision:3},
      });
      assert.equal(read.status,403);
      assert.equal(write.status,403);
    });

    const settingRows=await client.query(
      "SELECT count(*)::int AS n FROM public.us_owner_service_tax_settings"
    );
    assert.equal(settingRows.rows[0].n,2);
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    if(opened) await client.query("ROLLBACK");
    const check=await client.query(
      "SELECT count(*)::int AS n FROM public.us_owner_service_tax_settings"
    ).catch(()=>({rows:[{n:-1}]}));
    assert.equal(check.rows[0].n,0,"rollback leaves no persisted tax fixtures");
    await client.end();
  }
});
