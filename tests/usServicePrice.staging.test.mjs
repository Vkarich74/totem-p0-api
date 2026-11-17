// TAX-03 staging-only PostgreSQL + Express integration acceptance.
// Restored DB only. Reuses cloned salon/master/booking; no new entities.
// All mutations (sessions, market override, USD price, booking price snapshot)
// occur inside a SINGLE outer transaction and are ROLLED BACK afterwards.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import express from "express";
import {
  readUsOwnerServicePrice,
  saveUsOwnerServicePrice,
  resolveUsBookingServicePrice,
  createUsBookingPriceSnapshot,
} from "../src/services/usServicePrice.service.js";
import { buildUsServicePricesRouter } from "../src/routes/internalUsServicePrices.js";

const dbName = process.env.US_TAX_STAGE_DATABASE || "";
if (!/^totem_us_tax01_stage_[0-9]{8}$/.test(dbName)) {
  throw new Error("TAX03_REJECT_NON_ISOLATED_DATABASE");
}
if (!process.env.PGPASSWORD) {
  throw new Error("TAX03_LOCAL_STAGE_PGPASSWORD_REQUIRED");
}
const client = new pg.Client({
  host: "127.0.0.1",port:5432,database:dbName,
  user:"postgres",password:process.env.PGPASSWORD,
  connectionTimeoutMillis:5000,
});
const pool = {
  async connect() {
    return {
      async query(sql, args) {
        if (["BEGIN","BEGIN READ ONLY","COMMIT","ROLLBACK"].includes(sql)) {
          return {rows:[],rowCount:0};
        }
        return client.query(sql,args);
      },
      release() {},
    };
  },
};
const expires = () => new Date(Date.now()+86400000).toISOString();
const makeAuth=(id,role,session)=>({
  user_id:id,role,source:"session",session_id:session,
  session_expires_at:expires(),idle_timeout_at:expires(),
});
const priceRequest=(ownerType,ownerSlug,serviceLinkId,auth,body)=>({
  ownerType,ownerSlug,serviceLinkId,auth,...(body?{body}:{})
});

test("TAX-03 US/USD canonical service price to immutable booking snapshot",async t=>{
  let open=false,server;
  await client.connect();
  try {
    const db=await client.query("SELECT current_database() AS db");
    assert.equal(db.rows[0].db,dbName);
    const tables=await client.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");
    assert.equal(tables.rows[0].n,133);
    await client.query("BEGIN");
    open=true;
    const {rows:[item]}=await client.query(
      `SELECT b.id AS booking_id,s.id AS salon_id,s.slug AS salon_slug,
              m.id AS master_id,m.slug AS master_slug,
              m.user_id AS master_user_id,os.owner_id::integer AS salon_owner_user_id,
              sms.id AS link_id,sms.service_pk,sms.price AS legacy_price
         FROM public.bookings b
         JOIN public.salons s ON s.id=b.salon_id
           AND s.enabled IS TRUE AND s.status='active'
         JOIN public.masters m ON m.id=b.master_id AND m.active IS TRUE
         JOIN public.salon_master_services sms
           ON sms.salon_id=b.salon_id AND sms.master_id=b.master_id
          AND sms.service_pk=b.service_id AND sms.active IS TRUE
         JOIN public.master_salon ms ON ms.master_id=m.id
          AND ms.salon_id=s.id AND ms.status='active'
         JOIN public.owner_salon os ON os.salon_id=s.id AND os.status='active'
         JOIN public.auth_users su ON su.id::text=os.owner_id
          AND su.enabled IS TRUE AND su.role='salon_admin'
         JOIN public.auth_users mu ON mu.id=m.user_id
          AND mu.enabled IS TRUE AND mu.role='master'
        ORDER BY b.id LIMIT 1`
    );
    assert.ok(item,"existing cloned booking with authorized salon/master required");
    const {rows:[market]}=await client.query(
      "SELECT id FROM public.markets WHERE code='US' AND active IS TRUE AND default_currency='USD'"
    );
    assert.ok(market);
    const sid=randomUUID(),mid=randomUUID();
    const salonAuth=makeAuth(item.salon_owner_user_id,"salon_admin",sid);
    const masterAuth=makeAuth(item.master_user_id,"master",mid);
    const salonOpts=priceRequest("salon",item.salon_slug,item.link_id,salonAuth);
    const masterOpts=priceRequest("master",item.master_slug,item.link_id,masterAuth);

    await t.test("foreign KG salon fails closed with authorized session",async()=>{
      await client.query(
        `INSERT INTO public.auth_sessions (id,user_id,expires_at,last_seen_at)
         VALUES ($1,$2,now()+interval '1 day',now()),
                ($3,$4,now()+interval '1 day',now())`,
        [sid,item.salon_owner_user_id,mid,item.master_user_id]
      );
      const denied=await readUsOwnerServicePrice(pool,salonOpts);
      assert.equal(denied.status,404);
      await assert.rejects(
        resolveUsBookingServicePrice(client,{
          marketId:market.id,salonId:item.salon_id,masterId:item.master_id,
          servicePk:item.service_pk,serviceLinkId:item.link_id,
        }),
        {code:"US_SERVICE_PRICE_NOT_CONFIGURED"}
      );
    });

    await client.query(
      `UPDATE public.tenant_market_settings
          SET market_id=$2,city_id=NULL,
              locale_override=NULL,currency_override=NULL
        WHERE salon_id=$1`,
      [item.salon_id,market.id]
    );
    await t.test("US service link must explicitly declare USD",async()=>{
      const denied=await readUsOwnerServicePrice(pool,salonOpts);
      assert.equal(denied.status,404);
    });
    await client.query(
      "UPDATE public.salon_master_services SET currency_code='USD' WHERE id=$1",
      [item.link_id]
    );

    await t.test("unconfigured price is NULL, never legacy KGS conversion",async()=>{
      const read=await readUsOwnerServicePrice(pool,salonOpts);
      assert.equal(read.status,200);
      assert.equal(read.body.configured,false);
      assert.equal(read.body.amount_minor,null);
      assert.equal(read.body.price_version,0);
      assert.equal(read.body.currency_code,"USD");
      await assert.rejects(
        resolveUsBookingServicePrice(client,{
          marketId:market.id,salonId:item.salon_id,masterId:item.master_id,
          servicePk:item.service_pk,serviceLinkId:item.link_id,
        }),
        {code:"US_SERVICE_PRICE_NOT_CONFIGURED"}
      );
    });

    await t.test("owner sets exact $100.05 from integer USD cents",async()=>{
      const saved=await saveUsOwnerServicePrice(pool,{
        ...salonOpts,body:{amount_minor:10005,expected_version:0},
      });
      assert.equal(saved.status,200);
      assert.equal(saved.body.amount_minor,"10005");
      assert.equal(saved.body.price_version,1);
      assert.equal(saved.body.configured,true);
      assert.notEqual(Number(item.legacy_price)*100,10005);
      const price=await readUsOwnerServicePrice(pool,salonOpts);
      assert.equal(price.body.amount_minor,"10005");
    });

    await t.test("negative, zero, decimals, huge, extra fields rejected",async()=>{
      for(const body of [
        {amount_minor:0,expected_version:1},
        {amount_minor:-1,expected_version:1},
        {amount_minor:10000.25,expected_version:1},
        {amount_minor:100000000,expected_version:1},
        {amount_minor:"10005",expected_version:1},
        {amount_minor:10005,expected_version:-1},
        {amount_minor:10005,expected_version:1,force:true},
      ]){
        const result=await saveUsOwnerServicePrice(pool,{...salonOpts,body});
        assert.equal(result.status,400,JSON.stringify(body));
      }
    });

    await t.test("price version is optimistic and unchanged value is idempotent",async()=>{
      const stale=await saveUsOwnerServicePrice(pool,{
        ...salonOpts,body:{amount_minor:10006,expected_version:0},
      });
      assert.equal(stale.status,409);
      const same=await saveUsOwnerServicePrice(pool,{
        ...salonOpts,body:{amount_minor:10005,expected_version:1},
      });
      assert.equal(same.status,200);
      assert.equal(same.body.price_version,1);
    });

    await t.test("active authenticated master can read owned service price",async()=>{
      const read=await readUsOwnerServicePrice(pool,masterOpts);
      assert.equal(read.status,200);
      assert.equal(read.body.amount_minor,"10005");
      for(const who of [
        {...salonOpts,auth:masterAuth},
        {...masterOpts,auth:salonAuth},
        {...salonOpts,auth:{...salonAuth,source:"jwt_legacy"}},
        {...salonOpts,auth:{...salonAuth,session_id:randomUUID()}},
      ]){
        const denied=await readUsOwnerServicePrice(pool,who);
        assert.equal(denied.status,403);
      }
      assert.equal((await readUsOwnerServicePrice(pool,{
        ...salonOpts,serviceLinkId:2147000000
      })).status,404);
    });

    let snapshot;
    await t.test("real PostgreSQL inserts correct authoritative USD booking snapshot",async()=>{
      // Reuse cloned booking. Only currency is temporarily altered.
      await client.query("UPDATE public.bookings SET currency_code='USD' WHERE id=$1",
        [item.booking_id]);
      const price=await resolveUsBookingServicePrice(client,{
        marketId:market.id,salonId:item.salon_id,masterId:item.master_id,
        servicePk:item.service_pk,serviceLinkId:item.link_id,
      });
      assert.equal(price.amount_minor,"10005");
      assert.equal(price.price_version,1);
      snapshot=await createUsBookingPriceSnapshot(client,{
        bookingId:item.booking_id,price,
      });
      assert.equal(snapshot.amount_minor,"10005");
      assert.equal(snapshot.price_version,1);
      assert.equal(snapshot.amount_type,"service_base_only");
      const fromDb=await client.query(
        `SELECT amount_minor::text AS amount_minor,
                service_price_version,salon_master_service_id
           FROM public.us_booking_price_snapshots
          WHERE booking_id=$1`,[item.booking_id]
      );
      assert.equal(fromDb.rows.length,1);
      assert.equal(fromDb.rows[0].amount_minor,"10005");
      assert.equal(Number(fromDb.rows[0].service_price_version),1);
      assert.equal(fromDb.rows[0].salon_master_service_id,item.link_id);
    });

    await t.test("snapshot is immutable after owner changes service price",async()=>{
      const changed=await saveUsOwnerServicePrice(pool,{
        ...salonOpts,body:{amount_minor:10006,expected_version:1},
      });
      assert.equal(changed.status,200);
      assert.equal(changed.body.price_version,2);
      const current=await resolveUsBookingServicePrice(client,{
        marketId:market.id,salonId:item.salon_id,masterId:item.master_id,
        servicePk:item.service_pk,serviceLinkId:item.link_id,
      });
      assert.equal(current.amount_minor,"10006");
      await assert.rejects(
        client.query(
          "UPDATE public.us_booking_price_snapshots SET amount_minor=$2 WHERE booking_id=$1",
          [item.booking_id,10006]
        ),
        {code:"23514"}
      );
    });

    await t.test("legacy currency and wrong service link cannot forge snapshot",async()=>{
      const other=await client.query(
        "SELECT id FROM public.salon_master_services WHERE id<>$1 ORDER BY id LIMIT 1",
        [item.link_id]
      );
      assert.ok(other.rows[0]);
      await assert.rejects(
        resolveUsBookingServicePrice(client,{
          marketId:market.id,salonId:item.salon_id,masterId:item.master_id,
          servicePk:item.service_pk,serviceLinkId:other.rows[0].id,
        }),
        {code:"US_SERVICE_PRICE_NOT_CONFIGURED"}
      );
    });

    await t.test("actual local HTTP GET/PUT, no-store and source marker",async()=>{
      const app=express();
      app.use(express.json());
      app.use((req,_res,next)=>{req.auth=salonAuth;next()});
      app.use("/internal",buildUsServicePricesRouter(pool));
      server=await new Promise(resolve=>{
        const srv=app.listen(0,"127.0.0.1",()=>resolve(srv));
      });
      const endpoint=`http://127.0.0.1:${server.address().port}/internal/us-service-prices/salon/${item.salon_slug}/${item.link_id}`;
      const first=await fetch(endpoint);
      assert.equal(first.status,200);
      assert.equal(first.headers.get("cache-control"),"no-store");
      assert.equal((await first.json()).amount_minor,"10006");
      const saved=await fetch(endpoint,{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({amount_minor:10101,expected_version:2}),
      });
      assert.equal(saved.status,200);
      assert.equal(saved.headers.get("cache-control"),"no-store");
      assert.equal((await saved.json()).price_version,3);
      const wrong=await fetch(endpoint,{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({amount_minor:1.5,expected_version:3}),
      });
      assert.equal(wrong.status,400);
    });

    await t.test("static booking path ties snapshot to booking transaction",async()=>{
      const source=await readFile(
        new URL("../src/routes/publicCreateBooking.js",import.meta.url),"utf8"
      );
      const readPos=source.indexOf("await resolveUsBookingServicePrice(client, {");
      const bookingPos=source.indexOf("const bookingInsert = await client.query(");
      const snapPos=source.indexOf("await createUsBookingPriceSnapshot(client, {");
      const commitPos=source.indexOf('await client.query("COMMIT");',snapPos);
      assert.ok(readPos>0 && readPos<bookingPos);
      assert.ok(snapPos>bookingPos && commitPos>snapPos);
      assert.match(source,/us_service_price: usServicePriceResponse/);
      assert.match(source,/marketContext\.market_code === "US"/);
      assert.match(source,/if \(usLocation\) \{/);
    });

    const persisted=await client.query(
      "SELECT count(*)::int AS n FROM public.us_booking_price_snapshots"
    );
    assert.equal(persisted.rows[0].n,1);
  }finally{
    if(server) await new Promise(resolve=>server.close(resolve));
    if(open) await client.query("ROLLBACK");
    const check=await client.query(
      `SELECT (SELECT count(*) FROM us_service_price_amounts)::int AS prices,
              (SELECT count(*) FROM us_booking_price_snapshots)::int AS snaps,
              (SELECT count(*) FROM bookings)::int AS bookings`
    ).catch(()=>({rows:[{prices:-1,snaps:-1,bookings:-1}]}));
    assert.equal(check.rows[0].prices,0,"rollback restored price table");
    assert.equal(check.rows[0].snaps,0,"rollback restored booking price snapshots");
    assert.equal(check.rows[0].bookings,49,"original bookings preserved");
    await client.end();
  }
});
