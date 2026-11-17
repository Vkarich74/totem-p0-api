// TOTEM US / TAX-05 — signed LIVE payment and exact tax-inclusive total.
// DISPOSABLE local clone only. No production writes, no real Stripe calls.
// Existing cloned salon/master/client/booking only. All mutations ROLLBACK.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID,createHmac,createHash } from "node:crypto";
import pg from "pg";
import { prepareUsC11LiveDirectCharge } from "../src/services/usPayC11LiveDirectCharge.service.js";
import { acceptSignedUsC11LivePaymentEvent } from "../src/services/usPayC11LivePaymentWebhook.service.js";
import { readUsPayC11Booking } from "../src/services/usPayC11ReadService.js";
import { createUsBookingServiceTaxQuote } from "../src/services/usServiceTaxQuote.service.js";
import { TOTEM_US_CONNECT_PLATFORM } from "../src/services/usPayC11LiveStripeApi.js";

const DB=process.env.US_TAX_STAGE_DATABASE||"";
if(!/^totem_us_tax01_stage_[0-9]{8}$/.test(DB) || !process.env.PGPASSWORD){
  throw Error("TAX05_ISOLATED_PG_REQUIRED");
}
const client=new pg.Client({
  host:"127.0.0.1",port:5432,user:"postgres",database:DB,
  password:process.env.PGPASSWORD,connectionTimeoutMillis:5000,
});
const pool={
  async connect(){
    return {
      async query(sql,args){
        // Keep ALL service-level commits nested in an outer ROLLBACK.
        if(["BEGIN","BEGIN READ ONLY","COMMIT","ROLLBACK"].includes(sql))
          return {rows:[],rowCount:0};
        return client.query(sql,args);
      },
      release(){},
    };
  },
};
const SECRET="whsec_TAX05_STAGING_SECRET_ONLY";
const ACCOUNT="acct_TAX05ISOLATED00001";
const PI="pi_TAX05ISOLATED0000001";
const cents="10730";
const token=randomUUID()+"tax05only";
const secretKey="sk_live_TAX05_STAGING_FAKE_NEVER_SENT";
const publishable="pk_live_TAX05_STAGING_FAKE_NEVER_SENT";
const event=(bookingId,reservation,amount,id)=>({
  object:"event",id,livemode:true,account:ACCOUNT,
  type:"payment_intent.succeeded",created:Math.floor(Date.now()/1000),
  data:{object:{
    object:"payment_intent",id:PI,livemode:true,status:"succeeded",
    amount,amount_received:amount,currency:"usd",
    metadata:{
      totem_us_booking_id:String(bookingId),
      totem_us_reservation:reservation,
      totem_market:"US",
    },
  }},
});
function sign(value){
  const raw=Buffer.from(JSON.stringify(value));
  const ts=Math.floor(Date.now()/1000);
  const hash=createHmac("sha256",SECRET).update(String(ts)+".").update(raw).digest("hex");
  return {rawBody:raw,stripeSignature:`t=${ts},v1=${hash}`};
}
function mockStripe(){
  const calls=[];
  const fetchImpl=async (url,options={})=>{
    calls.push({url,method:options.method,body:options.body||null,account:options.headers?.["Stripe-Account"]||null});
    let answer;
    if(url==="https://api.stripe.com/v1/account"){
      answer={
        id:TOTEM_US_CONNECT_PLATFORM,country:"US",charges_enabled:true,
        capabilities:{card_payments:"active"},
      };
    } else if(url===`https://api.stripe.com/v1/accounts/${ACCOUNT}`){
      answer={
        object:"account",id:ACCOUNT,country:"US",type:"standard",livemode:true,
        charges_enabled:true,payouts_enabled:true,details_submitted:true,
        requirements:{currently_due:[],past_due:[],disabled_reason:null},
        capabilities:{card_payments:"active",transfers:"active"},
      };
    } else if(url==="https://api.stripe.com/v1/payment_intents" &&
              options.method==="POST"){
      const fields=new URLSearchParams(options.body);
      assert.equal(fields.get("amount"),cents,"Stripe receives GROSS, never base!");
      assert.equal(fields.get("currency"),"usd");
      assert.equal(options.headers["Stripe-Account"],ACCOUNT);
      assert.equal(fields.get("confirm"),"false");
      const reservation=fields.get("metadata[totem_us_reservation]");
      assert.match(reservation,/^[0-9a-f-]{36}$/);
      answer={
        object:"payment_intent",id:PI,currency:"usd",
        amount:Number(cents),livemode:true,capture_method:"automatic",
        status:"requires_payment_method",
        metadata:{
          totem_us_booking_id:fields.get("metadata[totem_us_booking_id]"),
          totem_us_reservation:reservation,
        },
        client_secret:PI+"_secret_taxtestonly",
      };
    } else if(url===`https://api.stripe.com/v1/payment_intents/${PI}`){
      throw Error("TAX05_TEST_UNEXPECTED_REMOTE_RETRIEVAL");
    } else {
      throw Error("TAX05_NETWORK_FORBIDDEN: "+url);
    }
    return new Response(JSON.stringify(answer),{
      status:200,headers:{"Content-Type":"application/json"},
    });
  };
  return {fetchImpl,calls};
}
test("TAX-05 signed Stripe LIVE contract on isolated DB: gross = base + tax",async t=>{
  let opened=false;
  await client.connect();
  try{
    const dbInfo=await client.query("SELECT current_database() AS db");
    assert.equal(dbInfo.rows[0].db,DB);
    const guard=await client.query(
      `SELECT pg_get_functiondef(oid) AS def
       FROM pg_proc WHERE proname='us_c11_live_intent_guard'`
    );
    assert.equal(guard.rows.length,1);
    assert.match(guard.rows[0].def,/tax_total_minor IS DISTINCT FROM NEW.amount_minor/);
    await client.query("BEGIN");
    opened=true;
    const {rows:[item]}=await client.query(
      `SELECT b.id AS booking_id,b.client_id,s.id AS salon_id,
              m.id AS master_id,sms.id AS service_link_id,
              os.owner_id::integer AS user_id
         FROM public.bookings b
         JOIN public.salons s ON s.id=b.salon_id AND s.enabled IS TRUE AND s.status='active'
         JOIN public.masters m ON m.id=b.master_id AND m.active IS TRUE
         JOIN public.salon_master_services sms ON sms.salon_id=b.salon_id
           AND sms.master_id=b.master_id AND sms.service_pk=b.service_id
           AND sms.active IS TRUE
         JOIN public.master_salon ms ON ms.salon_id=s.id AND ms.master_id=m.id AND ms.status='active'
         JOIN public.owner_salon os ON os.salon_id=s.id AND os.status='active'
         JOIN public.auth_users u ON u.id::text=os.owner_id
           AND u.enabled IS TRUE AND u.role='salon_admin'
        WHERE b.client_id IS NOT NULL AND b.status IN ('reserved','confirmed')
        ORDER BY b.id LIMIT 1`
    );
    assert.ok(item&&item.client_id&&item.user_id);
    const {rows:[market]}=await client.query(
      "SELECT id FROM markets WHERE code='US' AND country_code='US' AND active IS TRUE AND default_currency='USD'"
    );
    assert.ok(market);
    await client.query(
      `UPDATE tenant_market_settings
         SET market_id=$2,city_id=NULL,locale_override=NULL,currency_override=NULL
       WHERE salon_id=$1`,[item.salon_id,market.id]
    );
    await client.query(
      "UPDATE salon_master_services SET currency_code='USD' WHERE id=$1",
      [item.service_link_id]
    );
    await client.query(
      "UPDATE bookings SET currency_code='USD' WHERE id=$1",[item.booking_id]
    );
    const session=randomUUID();
    await client.query(
      `INSERT INTO auth_sessions(id,user_id,expires_at,last_seen_at)
       VALUES($1,$2,now()+interval '1 day',now())`,[session,item.user_id]
    );
    const cabinetHash=createHash("sha256").update(token).digest("hex");
    await client.query(
      `INSERT INTO client_access_tokens
       (client_id,booking_id,token_hash,token_last4,purpose)
       VALUES($1,$2,$3,$4,'cabinet')`,
      [item.client_id,item.booking_id,cabinetHash,token.slice(-4)]
    );
    await client.query(
      `INSERT INTO us_service_price_amounts
       (salon_master_service_id,market_id,amount_minor,currency_code)
       VALUES($1,$2,10005,'USD')`,[item.service_link_id,market.id]
    );
    await client.query(
      `INSERT INTO us_booking_price_snapshots
        (booking_id,market_id,salon_master_service_id,amount_minor,currency_code,service_price_version)
       VALUES($1,$2,$3,10005,'USD',1)`,
      [item.booking_id,market.id,item.service_link_id]
    );
    await client.query(
      `INSERT INTO us_booking_payment_collectors
       (booking_id,market_id,collector_owner_type,collector_owner_id,selection_source,selected_by_user_id)
       VALUES($1,$2,'salon',$3,'owner_authorized',$4)`,
      [item.booking_id,market.id,item.salon_id,item.user_id]
    );
    await client.query(
      `UPDATE us_booking_payment_collectors
       SET verification_status='verified',verified_at=now()
       WHERE booking_id=$1`,[item.booking_id]
    );
    await client.query(
      `INSERT INTO us_owner_service_tax_settings
        (owner_type,owner_id,market_id,rate_bps,updated_by_user_id)
       VALUES('salon',$1,$2,725,$3)`,[item.salon_id,market.id,item.user_id]
    );
    const actor={
      user_id:item.user_id,role:"salon_admin",source:"session",
      session_id:session,
      session_expires_at:new Date(Date.now()+86400000).toISOString(),
    };
    const q=await createUsBookingServiceTaxQuote(pool,{
      bookingId:item.booking_id,auth:actor,
      body:{expected_collector_revision:2,expected_tax_setting_revision:1},
    });
    assert.equal(q.status,201,JSON.stringify(q));
    assert.equal(q.body.quote.service_base_minor,"10005");
    assert.equal(q.body.quote.service_tax_minor,"725");
    assert.equal(q.body.quote.charge_total_minor,cents);

    const binding=await client.query(
      `INSERT INTO us_stripe_live_seller_bindings
       (market_id,owner_type,owner_id,created_by_user_id,provisioning_token,
        stripe_account_id,verification_status,verified_at,last_checked_at,
        charges_enabled,payouts_enabled,details_submitted,
        card_payments_status,transfers_status)
       VALUES($1,'salon',$2,$3,$4,$5,'verified',now(),now(),
              true,true,true,'active','active')
       RETURNING id`,
      [market.id,item.salon_id,item.user_id,randomUUID(),ACCOUNT]
    );
    assert.equal(binding.rows.length,1);

    await t.test("SQL refuses old base-only PaymentIntent even for verified seller",async()=>{
      await client.query("SAVEPOINT tax05_base_intent");
      try{
        await assert.rejects(
          client.query(
            `INSERT INTO us_stripe_live_payment_intents
               (booking_id,market_id,seller_binding_id,
                collector_owner_type,collector_owner_id,collector_revision,
                stripe_account_id,amount_minor,reservation_token)
             VALUES($1,$2,$3,'salon',$4,2,$5,10005,$6)`,
            [item.booking_id,market.id,binding.rows[0].id,item.salon_id,ACCOUNT,randomUUID()]
          ),{code:"23514"}
        );
      } finally{
        await client.query("ROLLBACK TO SAVEPOINT tax05_base_intent");
        await client.query("RELEASE SAVEPOINT tax05_base_intent");
      }
      const empty=await client.query(
        "SELECT count(*)::int AS n FROM us_stripe_live_payment_intents"
      );
      assert.equal(empty.rows[0].n,0);
    });

    const fake=mockStripe();
    let bookingResponse;
    await t.test("Stripe mock receives exact immutable gross; no real network",async()=>{
      bookingResponse=await prepareUsC11LiveDirectCharge(pool,{
        clientId:item.client_id,clientToken:token,bookingId:item.booking_id,
        secretKey,stripePublishableKey:publishable,fetchImpl:fake.fetchImpl,
      });
      assert.equal(bookingResponse.status,200,JSON.stringify(bookingResponse));
      assert.equal(bookingResponse.body.amount_minor,cents);
      assert.equal(bookingResponse.body.amount_source,"us_booking_service_tax_snapshots");
      assert.equal(bookingResponse.body.payment_ready,false);
      assert.equal(fake.calls.filter(x=>x.url.endsWith("/payment_intents")).length,1);
      const saved=await client.query(
        "SELECT amount_minor::text AS amount_minor,stripe_payment_intent_id,status FROM us_stripe_live_payment_intents WHERE booking_id=$1",
        [item.booking_id]
      );
      assert.equal(saved.rows[0].amount_minor,cents);
      assert.equal(saved.rows[0].stripe_payment_intent_id,PI);
      assert.equal(saved.rows[0].status,"requires_payment_method");
    });

    await t.test("signed webhook with valid signature but old base amount is REJECTED",async()=>{
      const payload=sign(event(item.booking_id,bookingResponse.body.reservation_token,10005,"evt_TAX05MISMATCH001"));
      const out=await acceptSignedUsC11LivePaymentEvent({
        pool,...payload,webhookSecret:SECRET,
      });
      assert.equal(out.status,200);
      assert.equal(out.body.result,"rejected_mismatch");
      const check=await client.query(
        "SELECT status FROM us_stripe_live_payment_intents WHERE booking_id=$1",
        [item.booking_id]
      );
      assert.equal(check.rows[0].status,"requires_payment_method");
    });

    await t.test("tampered webhook signature rejected before database mutation",async()=>{
      const payload=sign(event(item.booking_id,bookingResponse.body.reservation_token,10730,"evt_TAX05FORGED0001"));
      const result=await acceptSignedUsC11LivePaymentEvent({
        pool,...payload,stripeSignature:"t=123,v1="+"0".repeat(64),webhookSecret:SECRET,
      });
      assert.equal(result.status,400);
    });

    await t.test("signed webhook exact gross settles once and is idempotent",async()=>{
      const payload=sign(event(item.booking_id,bookingResponse.body.reservation_token,10730,"evt_TAX05SUCCESS001"));
      const out=await acceptSignedUsC11LivePaymentEvent({
        pool,...payload,webhookSecret:SECRET,
      });
      assert.equal(out.status,200);
      assert.equal(out.body.result,"accepted");
      const duplicate=await acceptSignedUsC11LivePaymentEvent({
        pool,...payload,webhookSecret:SECRET,
      });
      assert.equal(duplicate.body.result,"duplicate");
      const state=await client.query(
        "SELECT amount_minor::text AS amount_minor,status,last_event_id FROM us_stripe_live_payment_intents WHERE booking_id=$1",
        [item.booking_id]
      );
      assert.equal(state.rows[0].status,"succeeded");
      assert.equal(state.rows[0].last_event_id,"evt_TAX05SUCCESS001");
      assert.equal(state.rows[0].amount_minor,cents);
    });

    await t.test("authenticated client paid projection reports base, tax, gross separately",async()=>{
      const read=await readUsPayC11Booking(client,{
        clientId:item.client_id,bookingId:item.booking_id,
        allowTestStripeMode:false,
      });
      assert.equal(read.status,200,JSON.stringify(read));
      assert.equal(read.body.price.amount_minor,"10005");
      assert.equal(read.body.service_tax.amount_minor,"725");
      assert.equal(read.body.charge_total_minor,cents);
      assert.equal(read.body.payment.service_payment_status,"paid");
      assert.equal(read.body.payment.provider,"stripe");
      assert.equal(read.body.payment_ready,false);
    });

    const check=await client.query(
      "SELECT count(*)::int AS n FROM us_stripe_live_payment_receipts"
    );
    assert.equal(check.rows[0].n,2,"mismatch + accepted receipts, duplicate ignored");
  }finally{
    if(opened)await client.query("ROLLBACK");
    const check=await client.query(
      `SELECT (SELECT count(*) FROM us_stripe_live_payment_intents)::int AS intents,
          (SELECT count(*) FROM us_stripe_live_payment_receipts)::int AS receipts,
          (SELECT count(*) FROM us_booking_service_tax_snapshots)::int AS quotes,
          (SELECT count(*) FROM us_stripe_live_seller_bindings)::int AS sellers,
          (SELECT count(*) FROM bookings)::int AS bookings`
    ).catch(()=>({rows:[{intents:-1,receipts:-1,quotes:-1,sellers:-1,bookings:-1}]}));
    assert.deepEqual(check.rows[0],{
      intents:0,receipts:0,quotes:0,sellers:0,bookings:49,
    },"financial test data must not persist in staging");
    await client.end();
  }
});
