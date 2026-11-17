// TOTEM USA / TAX-04 — isolated restored PostgreSQL 18 + Express.
// Uses ONLY existing copied salon/master/bookings, with all data fixtures
// inside one outer BEGIN ... ROLLBACK. No LIVE Stripe, no new bookings/users.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import {
  calculateUsServiceTaxCents,
  readUsBookingServiceTaxQuote,
  createUsBookingServiceTaxQuote,
} from "../src/services/usServiceTaxQuote.service.js";
import { buildUsServiceTaxQuoteRouter } from "../src/routes/internalUsServiceTaxQuote.js";

const stageDatabase = process.env.US_TAX_STAGE_DATABASE || "";
if (!/^totem_us_tax01_stage_[0-9]{8}$/.test(stageDatabase) ||
    !process.env.PGPASSWORD) {
  throw new Error("TAX04_ISOLATED_RESTORED_DB_REQUIRED");
}
const client=new pg.Client({
  host:"127.0.0.1",port:5432,database:stageDatabase,
  user:"postgres",password:process.env.PGPASSWORD,
  connectionTimeoutMillis:5000,
});
// The real service's internal COMMIT is suppressed ONLY in this test
// wrapper; the full suite's outer transaction must always ROLLBACK.
const pool={
  async connect(){
    return {
      async query(sql,values){
        if(["BEGIN","BEGIN READ ONLY","COMMIT","ROLLBACK"].includes(sql))
          return {rows:[],rowCount:0};
        return client.query(sql,values);
      },
      release(){},
    };
  },
};
function ownerAuth(userId,sessionId){
  const future=new Date(Date.now()+86400000).toISOString();
  return {
    user_id:userId,role:"salon_admin",source:"session",
    session_id:sessionId,session_expires_at:future,
    idle_timeout_at:future,
  };
}
const post=(bookingId,auth,collectorRevision,taxRevision)=>({
  bookingId,auth,
  body:{
    expected_collector_revision:collectorRevision,
    expected_tax_setting_revision:taxRevision,
  },
});
async function setupPrice(bookingId,serviceLinkId,marketId,amountMinor){
  const result=await client.query(
    `INSERT INTO public.us_booking_price_snapshots
       (booking_id,market_id,salon_master_service_id,
        amount_minor,currency_code,service_price_version)
     VALUES ($1,$2,$3,$4,'USD',1)
     RETURNING booking_id`,
    [bookingId,marketId,serviceLinkId,amountMinor]
  );
  assert.equal(result.rows.length,1);
}
async function setupCollector(bookingId,marketId,ownerType,ownerId,actorId){
  const r=await client.query(
    `INSERT INTO public.us_booking_payment_collectors
       (booking_id,market_id,collector_owner_type,
        collector_owner_id,selection_source,selected_by_user_id)
      VALUES ($1,$2,$3,$4,'owner_authorized',$5)
      RETURNING revision,verification_status`,
    [bookingId,marketId,ownerType,ownerId,actorId]
  );
  assert.equal(r.rows[0].verification_status,"pending");
  assert.equal(Number(r.rows[0].revision),1);
}
async function verifyCollector(bookingId){
  const r=await client.query(
    `UPDATE public.us_booking_payment_collectors
       SET verification_status='verified',verified_at=now()
     WHERE booking_id=$1 AND verification_status='pending'
     RETURNING revision`,
    [bookingId]
  );
  assert.equal(r.rows.length,1);
  return Number(r.rows[0].revision);
}

test("TAX-04: verified collector tax rate to immutable service quote",async t=>{
  let outer=false, server;
  await client.connect();
  try{
    const identity=await client.query("SELECT current_database() AS db");
    assert.equal(identity.rows[0].db,stageDatabase);
    const schema=await client.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'"
    );
    assert.equal(schema.rows[0].n,133,"requires TAX-01 migrated staging");
    await client.query("BEGIN");
    outer=true;
    const {rows:fixture}=await client.query(
      `SELECT b.id AS booking_id,s.id AS salon_id,s.slug AS salon_slug,
              m.id AS master_id,m.user_id AS master_user_id,
              sms.id AS service_link_id,sms.service_pk,
              os.owner_id::integer AS owner_user_id
         FROM public.bookings b
         JOIN public.salons s ON s.id=b.salon_id AND s.enabled IS TRUE
          AND s.status='active'
         JOIN public.masters m ON m.id=b.master_id AND m.active IS TRUE
         JOIN public.salon_master_services sms
           ON sms.salon_id=s.id AND sms.master_id=m.id
          AND sms.service_pk=b.service_id AND sms.active IS TRUE
         JOIN public.master_salon ms ON ms.salon_id=s.id
          AND ms.master_id=m.id AND ms.status='active'
         JOIN public.owner_salon os ON os.salon_id=s.id AND os.status='active'
         JOIN public.auth_users au ON au.id::text=os.owner_id
          AND au.enabled IS TRUE AND au.role='salon_admin'
         JOIN public.auth_users mu ON mu.id=m.user_id
          AND mu.enabled IS TRUE AND mu.role='master'
        WHERE b.status IN ('reserved','confirmed')
        ORDER BY b.id LIMIT 3`
    );
    assert.equal(fixture.length,3,"three existing cloned bookings required");
    const [a,b,c]=fixture;
    assert.equal(a.salon_id,b.salon_id);
    assert.equal(a.master_id,c.master_id);
    assert.equal(a.service_link_id,c.service_link_id);

    const {rows:[market]}=await client.query(
      `SELECT id FROM public.markets
        WHERE code='US' AND country_code='US'
         AND active IS TRUE AND default_currency='USD'`
    );
    assert.ok(market);
    const auth=ownerAuth(a.owner_user_id,randomUUID());
    await client.query(
      `INSERT INTO public.auth_sessions (id,user_id,expires_at,last_seen_at)
        VALUES ($1,$2,now()+interval '1 day',now())`,
      [auth.session_id,auth.user_id]
    );
    await client.query(
      `UPDATE public.tenant_market_settings
          SET market_id=$2,city_id=NULL,
              locale_override=NULL,currency_override=NULL
        WHERE salon_id=$1`,
      [a.salon_id,market.id]
    );
    await client.query(
      "UPDATE public.salon_master_services SET currency_code='USD' WHERE id=$1",
      [a.service_link_id]
    );
    await client.query(
      "UPDATE public.bookings SET currency_code='USD' WHERE id=ANY($1::integer[])",
      [fixture.map(x=>x.booking_id)]
    );
    await client.query(
      `INSERT INTO public.us_service_price_amounts
         (salon_master_service_id,market_id,amount_minor,currency_code)
       VALUES($1,$2,10005,'USD')`,
      [a.service_link_id,market.id]
    );
    for(const booking of fixture){
      await setupPrice(booking.booking_id,booking.service_link_id,market.id,10005);
    }
    await setupCollector(a.booking_id,market.id,"salon",a.salon_id,auth.user_id);
    await setupCollector(b.booking_id,market.id,"salon",b.salon_id,auth.user_id);
    await setupCollector(c.booking_id,market.id,"master",c.master_id,auth.user_id);

    await t.test("BigInt cents: 0, 7.25%, 50% half-up, 100%, upper limit",()=>{
      assert.deepEqual(calculateUsServiceTaxCents("10000",0),{
        service_base_minor:"10000",rate_bps:0,
        service_tax_minor:"0",charge_total_minor:"10000",currency_code:"USD",
      });
      assert.equal(calculateUsServiceTaxCents("10005",725).service_tax_minor,"725");
      assert.equal(calculateUsServiceTaxCents("10005",725).charge_total_minor,"10730");
      assert.equal(calculateUsServiceTaxCents("1",5000).service_tax_minor,"1");
      assert.equal(calculateUsServiceTaxCents("10000",10000).charge_total_minor,"20000");
      assert.throws(()=>calculateUsServiceTaxCents("99999999",10000),
        {code:"US_TAX_QUOTE_TOTAL_TOO_LARGE"});
      for(const rate of [-1,10001,7.25,"725",NaN]){
        assert.throws(()=>calculateUsServiceTaxCents("10000",rate),
          {code:"US_TAX_QUOTE_AMOUNT_INVALID"});
      }
    });

    await t.test("GET exists=false and no quote before verified collector",async()=>{
      const read=await readUsBookingServiceTaxQuote(pool,{bookingId:a.booking_id,auth});
      assert.equal(read.status,200);
      assert.equal(read.body.quote_exists,false);
      assert.equal(read.body.quote,null);
      assert.equal(read.body.payment_ready,false);
      const create=await createUsBookingServiceTaxQuote(pool,post(a.booking_id,auth,1,0));
      assert.equal(create.status,409);
      assert.equal(create.body.error,"US_TAX_QUOTE_VERIFIED_COLLECTOR_REQUIRED");
      assert.equal((await client.query(
        "SELECT count(*)::int AS n FROM us_booking_service_tax_snapshots"
      )).rows[0].n,0);
    });

    await t.test("salon: verified recipient, implicit 0 tax, frozen quote",async()=>{
      const verified=await verifyCollector(a.booking_id);
      assert.equal(verified,2);
      const preview=await readUsBookingServiceTaxQuote(pool,{bookingId:a.booking_id,auth});
      assert.equal(preview.body.expected_tax_setting_revision,0);
      assert.equal(preview.body.preview.preview_only,true);
      assert.equal(preview.body.preview.rate_bps,0);
      assert.equal(preview.body.preview.charge_total_minor,"10005");
      const stale=await createUsBookingServiceTaxQuote(pool,post(a.booking_id,auth,1,0));
      assert.equal(stale.status,409);
      assert.equal(stale.body.error,"US_TAX_QUOTE_COLLECTOR_REVISION_CONFLICT");
      const created=await createUsBookingServiceTaxQuote(pool,post(a.booking_id,auth,2,0));
      assert.equal(created.status,201);
      assert.equal(created.body.quote.collector_owner_type,"salon");
      assert.equal(created.body.quote.rate_bps,0);
      assert.equal(created.body.quote.service_base_minor,"10005");
      assert.equal(created.body.quote.service_tax_minor,"0");
      assert.equal(created.body.quote.charge_total_minor,"10005");
      assert.equal(created.body.quote.tax_setting_revision,0);
      assert.equal(created.body.quote.immutable,true);
      assert.equal(created.body.payment_ready,false);
      const twice=await createUsBookingServiceTaxQuote(pool,post(a.booking_id,auth,2,0));
      assert.equal(twice.status,200);
      assert.equal(twice.body.created,false);
      const result=await readUsBookingServiceTaxQuote(pool,{bookingId:a.booking_id,auth});
      assert.equal(result.status,200);
      assert.equal(result.body.quote_exists,true);
      assert.equal(result.body.quote_matches_current_collector,true);
      assert.equal(result.body.preview,null);
      assert.equal(result.body.expected_tax_setting_revision,0);
    });

    await t.test("salon 7.25% applies only to a later, separate booking",async()=>{
      const tax=await client.query(
        `INSERT INTO public.us_owner_service_tax_settings
          (owner_type,owner_id,market_id,rate_bps,updated_by_user_id)
          VALUES('salon',$1,$2,725,$3)
          RETURNING revision`,
        [a.salon_id,market.id,auth.user_id]
      );
      assert.equal(Number(tax.rows[0].revision),1);
      await verifyCollector(b.booking_id);
      const preview=await readUsBookingServiceTaxQuote(pool,{bookingId:b.booking_id,auth});
      assert.equal(preview.body.expected_tax_setting_revision,1);
      assert.equal(preview.body.preview.service_tax_minor,"725");
      assert.equal(preview.body.preview.charge_total_minor,"10730");
      const stale=await createUsBookingServiceTaxQuote(pool,post(b.booking_id,auth,2,0));
      assert.equal(stale.status,409);
      assert.equal(stale.body.error,"US_TAX_QUOTE_TAX_REVISION_CONFLICT");
      const good=await createUsBookingServiceTaxQuote(pool,post(b.booking_id,auth,2,1));
      assert.equal(good.status,201);
      assert.equal(good.body.quote.rate_bps,725);
      assert.equal(good.body.quote.service_base_minor,"10005");
      assert.equal(good.body.quote.service_tax_minor,"725");
      assert.equal(good.body.quote.charge_total_minor,"10730");
      const aOld=await readUsBookingServiceTaxQuote(pool,{bookingId:a.booking_id,auth});
      assert.equal(aOld.body.quote.charge_total_minor,"10005");
    });

    await t.test("master recipient gets OWN rate, never salon rate",async()=>{
      await client.query(
        `INSERT INTO public.us_owner_service_tax_settings
           (owner_type,owner_id,market_id,rate_bps,updated_by_user_id)
         VALUES('master',$1,$2,250,$3)`,
        [c.master_id,market.id,c.master_user_id]
      );
      await verifyCollector(c.booking_id);
      // The salon owner CANNOT read the master's TAX-02 settings directly,
      // but can see a buyer-facing tax preview for this confirmed collector.
      const preview=await readUsBookingServiceTaxQuote(pool,{bookingId:c.booking_id,auth});
      assert.equal(preview.body.expected_tax_setting_revision,1);
      assert.equal(preview.body.current_verified_collector.owner_type,"master");
      assert.equal(preview.body.preview.service_tax_minor,"250");
      assert.equal(preview.body.preview.charge_total_minor,"10255");
      const quote=await createUsBookingServiceTaxQuote(pool,post(c.booking_id,auth,2,1));
      assert.equal(quote.status,201);
      assert.equal(quote.body.quote.collector_owner_type,"master");
      assert.equal(quote.body.quote.collector_owner_id,c.master_id);
      assert.equal(quote.body.quote.rate_bps,250);
      assert.equal(quote.body.quote.service_tax_minor,"250");
      assert.equal(quote.body.quote.charge_total_minor,"10255");
    });

    await t.test("editing rate after freeze never changes prior signed quote",async()=>{
      const changed=await client.query(
        `UPDATE public.us_owner_service_tax_settings
            SET rate_bps=10000
          WHERE owner_type='salon' AND owner_id=$1
          RETURNING revision`,[a.salon_id]
      );
      assert.equal(Number(changed.rows[0].revision),2);
      const historical=await readUsBookingServiceTaxQuote(pool,{bookingId:b.booking_id,auth});
      assert.equal(historical.body.quote.rate_bps,725);
      assert.equal(historical.body.quote.charge_total_minor,"10730");
      const replay=await createUsBookingServiceTaxQuote(pool,post(b.booking_id,auth,2,1));
      assert.equal(replay.status,200);
      assert.equal(replay.body.created,false);
      const incorrect=await createUsBookingServiceTaxQuote(pool,post(b.booking_id,auth,2,2));
      assert.equal(incorrect.status,409);
      assert.equal(incorrect.body.error,"US_TAX_QUOTE_ALREADY_FROZEN");
    });

    await t.test("body rejects forged amounts, wrong revision, master role",async()=>{
      const invalid=[
        {expected_collector_revision:2,expected_tax_setting_revision:1,charge_total_minor:10},
        {expected_collector_revision:"2",expected_tax_setting_revision:1},
        {expected_collector_revision:0,expected_tax_setting_revision:0},
        {expected_collector_revision:2,expected_tax_setting_revision:-1},
        {expected_collector_revision:2.5,expected_tax_setting_revision:1},
      ];
      for(const body of invalid){
        const response=await createUsBookingServiceTaxQuote(pool,{
          bookingId:b.booking_id,auth,body,
        });
        assert.equal(response.status,400,JSON.stringify(body));
      }
      for(const badAuth of [
        {...auth,role:"master"},
        {...auth,source:"jwt_legacy"},
        {...auth,session_id:randomUUID()},
      ]){
        const response=await readUsBookingServiceTaxQuote(pool,{
          bookingId:b.booking_id,auth:badAuth,
        });
        assert.equal(response.status,403);
      }
      assert.equal((await readUsBookingServiceTaxQuote(pool,{
        bookingId:2147000000,auth,
      })).status,404);
      assert.equal((await readUsBookingServiceTaxQuote(pool,{
        bookingId:b.booking_id,auth,identity:{user_id:2147000000},
      })).status,403);
    });

    await t.test("raw PostgreSQL snapshot cannot be mutated",async()=>{
      await client.query("SAVEPOINT tax04_immutable_test");
      try {
        await assert.rejects(
          client.query(
            "UPDATE public.us_booking_service_tax_snapshots SET rate_bps=0 WHERE booking_id=$1",
            [b.booking_id]
          ),{code:"23514"}
        );
      }finally{
        await client.query("ROLLBACK TO SAVEPOINT tax04_immutable_test");
        await client.query("RELEASE SAVEPOINT tax04_immutable_test");
      }
    });

    await t.test("collector revocation makes the existing quote unpayable",async()=>{
      await client.query("SAVEPOINT tax04_revoked");
      try {
        await client.query(
          `UPDATE public.us_booking_payment_collectors
              SET verification_status='revoked',verified_at=NULL
            WHERE booking_id=$1`,[b.booking_id]
        );
        const read=await readUsBookingServiceTaxQuote(pool,{bookingId:b.booking_id,auth});
        assert.equal(read.status,200);
        assert.equal(read.body.quote_exists,true);
        assert.equal(read.body.quote_matches_current_collector,false);
        assert.equal(read.body.payment_ready,false);
        const blocked=await createUsBookingServiceTaxQuote(pool,post(b.booking_id,auth,3,2));
        assert.equal(blocked.status,409);
        assert.equal(blocked.body.error,"US_TAX_QUOTE_VERIFIED_COLLECTOR_REQUIRED");
      }finally{
        await client.query("ROLLBACK TO SAVEPOINT tax04_revoked");
        await client.query("RELEASE SAVEPOINT tax04_revoked");
      }
    });

    await t.test("real HTTP GET/POST without cache; no Stripe used",async()=>{
      const app=express();
      app.use(express.json());
      app.use((req,_res,next)=>{req.auth=auth;next()});
      app.use("/internal",buildUsServiceTaxQuoteRouter(pool));
      server=await new Promise(resolve=>{
        const srv=app.listen(0,"127.0.0.1",()=>resolve(srv));
      });
      const url=`http://127.0.0.1:${server.address().port}/internal/us-pay-c11/bookings/${c.booking_id}/service-tax-quote`;
      const r=await fetch(url);
      assert.equal(r.status,200);
      assert.equal(r.headers.get("cache-control"),"no-store");
      const body=await r.json();
      assert.equal(body.quote.service_tax_minor,"250");
      assert.equal(body.payment_ready,false);
      const postResponse=await fetch(url,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          expected_collector_revision:2,
          expected_tax_setting_revision:1,
        }),
      });
      assert.equal(postResponse.status,200);
      assert.equal((await postResponse.json()).created,false);
      const forbidden=await fetch(url,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({charge_total_minor:1}),
      });
      assert.equal(forbidden.status,400);
    });

    const count=await client.query(
      "SELECT count(*)::int AS n FROM public.us_booking_service_tax_snapshots"
    );
    assert.equal(count.rows[0].n,3);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(outer)await client.query("ROLLBACK");
    const clean=await client.query(
      `SELECT
        (SELECT count(*) FROM public.us_booking_service_tax_snapshots)::int AS quotes,
        (SELECT count(*) FROM public.us_booking_payment_collectors)::int AS collectors,
        (SELECT count(*) FROM public.us_owner_service_tax_settings)::int AS settings,
        (SELECT count(*) FROM public.us_booking_price_snapshots)::int AS base_prices,
        (SELECT count(*) FROM public.bookings)::int AS bookings`
    ).catch(()=>({rows:[{quotes:-1,collectors:-1,settings:-1,base_prices:-1,bookings:-1}]}));
    assert.deepEqual(clean.rows[0],{
      quotes:0,collectors:0,settings:0,base_prices:0,bookings:49,
    },"all staging fixtures must rollback");
    await client.end();
  }
});
