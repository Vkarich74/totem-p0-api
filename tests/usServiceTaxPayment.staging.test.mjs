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
import { readUsServiceTaxReport } from "../src/services/usServiceTaxReport.service.js";
import { quoteUsC11LiveRefund,authorizeUsC11LiveRefund } from "../src/services/usPayC11LiveRefundAuthorization.service.js";
import { acceptUsC11SignedLiveFinancialEvent } from "../src/services/usPayC11LiveFinancialEvents.service.js";
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
    let verifiedReservation;
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
        "SELECT amount_minor::text AS amount_minor,stripe_payment_intent_id,status,reservation_token::text AS reservation_token FROM us_stripe_live_payment_intents WHERE booking_id=$1",
        [item.booking_id]
      );
      assert.equal(saved.rows[0].amount_minor,cents);
      assert.equal(saved.rows[0].stripe_payment_intent_id,PI);
      assert.equal(saved.rows[0].status,"requires_payment_method");
      verifiedReservation=saved.rows[0].reservation_token;
      assert.match(verifiedReservation,/^[0-9a-f-]{36}$/);
    });

    await t.test("signed webhook with valid signature but old base amount is REJECTED",async()=>{
      const payload=sign(event(item.booking_id,verifiedReservation,10005,"evt_TAX05MISMATCH001"));
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
      const payload=sign(event(item.booking_id,verifiedReservation,10730,"evt_TAX05FORGED0001"));
      const result=await acceptSignedUsC11LivePaymentEvent({
        pool,...payload,stripeSignature:"t=123,v1="+"0".repeat(64),webhookSecret:SECRET,
      });
      assert.equal(result.status,400);
    });

    await t.test("signed webhook exact gross settles once and is idempotent",async()=>{
      const payload=sign(event(item.booking_id,verifiedReservation,10730,"evt_TAX05SUCCESS001"));
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

    await t.test("TAX-07 authenticated owner sees signed USD base/tax/gross, never unverified",async()=>{
      const response=await readUsServiceTaxReport(pool,{
        auth:actor,ownerType:"salon",ownerId:item.salon_id,
      });
      assert.equal(response.status,200,JSON.stringify(response));
      assert.equal(response.body.contract_version,"US-SERVICE-TAX-report-v1");
      assert.equal(response.body.booking_count,1);
      assert.equal(response.body.items[0].reconciliation_status,"captured");
      assert.equal(response.body.items[0].signed_payment_captured,true);
      assert.equal(response.body.items[0].quote.service_base_minor,"10005");
      assert.equal(response.body.items[0].quote.service_tax_minor,"725");
      assert.equal(response.body.items[0].quote.charge_total_minor,"10730");
      assert.equal(response.body.totals.captured_gross_minor,"10730");
      assert.equal(response.body.totals.captured_service_tax_minor,"725");
      assert.equal(response.body.totals.refunded_gross_minor,"0");
      assert.equal(response.body.tax_filing_ready,false);
      assert.equal(response.body.tax_remittance_claim,false);
      const stolen=await readUsServiceTaxReport(pool,{
        auth:{...actor,role:"master"},
        ownerType:"master",ownerId:item.master_id,
      });
      assert.equal(stolen.status,404,"owner cannot access independent master report");
    });

    const refunds={
      "re_TAX07PARTIAL0001":{amount:2500,status:"succeeded"},
      "re_TAX07FULLREST02":{amount:8230,status:"pending"},
    };
    const refundTransport=async(url,opts={})=>{
      if(url==="https://api.stripe.com/v1/refunds" &&
         opts.method==="POST"){
        const data=new URLSearchParams(opts.body);
        assert.equal(opts.headers["Stripe-Account"],ACCOUNT);
        assert.equal(data.get("payment_intent"),PI);
        assert.equal(data.get("amount"),"8230");
        assert.equal(data.get("reason"),"requested_by_customer");
        return new Response(JSON.stringify({
          object:"refund",id:"re_TAX07FULLREST02",livemode:true,
          status:"pending",currency:"usd",amount:8230,
          payment_intent:PI,
          metadata:{totem_us_c11_refund_request:data.get("metadata[totem_us_c11_refund_request]")},
        }),{status:200,headers:{"Content-Type":"application/json"}});
      }
      const match=url.match(/^https:\/\/api\.stripe\.com\/v1\/refunds\/(re_[A-Za-z0-9_]+)$/);
      if(match){
        const ref=refunds[match[1]];
        if(!ref)throw Error("TAX07_UNEXPECTED_REFUND_ID");
        assert.equal(opts.headers["Stripe-Account"],ACCOUNT);
        return new Response(JSON.stringify({
          object:"refund",id:match[1],livemode:true,
          amount:ref.amount,status:ref.status,
          currency:"usd",payment_intent:PI,balance_transaction:null,
        }),{status:200,headers:{"Content-Type":"application/json"}});
      }
      return fake.fetchImpl(url,opts);
    };
    const refundEvent=(stripeEventId,refundId,created)=>({
      object:"event",id:stripeEventId,livemode:true,account:ACCOUNT,
      type:"refund.updated",created,
      data:{object:{object:"refund",id:refundId}},
    });
    const eventTime=Math.floor(Date.now()/1000);
    const observe=async(eventId,refundId,timestamp)=>{
      const signed=sign(refundEvent(eventId,refundId,timestamp));
      return acceptUsC11SignedLiveFinancialEvent({
        pool,...signed,webhookSecret:SECRET,secretKey,
        fetchImpl:refundTransport,
      });
    };

    await t.test("TAX-07 full refund quote is server-derived before any refund",async()=>{
      const quote=await quoteUsC11LiveRefund(pool,{
        auth:actor,ownerType:"salon",ownerId:item.salon_id,
        bookingId:item.booking_id,
      });
      assert.equal(quote.status,200,JSON.stringify(quote));
      assert.equal(quote.body.service_base_minor,"10005");
      assert.equal(quote.body.service_tax_minor,"725");
      assert.equal(quote.body.remaining_minor,"10730");
      assert.equal(quote.body.full_remaining_refund_estimate.refundable_service_tax_minor,"725");
      assert.equal(quote.body.full_remaining_refund_estimate.refundable_service_base_minor,"10005");
    });

    await t.test("TAX-07 signed external partial refund $25.00 allocates $1.69 tax",async()=>{
      const out=await observe("evt_TAX07PARTIAL001",
        "re_TAX07PARTIAL0001",eventTime);
      assert.equal(out.status,200,JSON.stringify(out));
      assert.equal(out.body.result,"observed");
      const dup=await observe("evt_TAX07PARTIAL001",
        "re_TAX07PARTIAL0001",eventTime);
      assert.equal(dup.body.result,"duplicate");
      const report=await readUsServiceTaxReport(pool,{
        auth:actor,ownerType:"salon",ownerId:item.salon_id,
      });
      assert.equal(report.status,200,JSON.stringify(report));
      assert.equal(report.body.totals.refunded_gross_minor,"2500");
      assert.equal(report.body.totals.refunded_service_tax_minor,"169");
      assert.equal(report.body.totals.refunded_service_base_minor,"2331");
      assert.equal(report.body.totals.net_service_tax_minor,"556");
      assert.equal(report.body.items[0].reconciliation_status,"refunded_partial");
      assert.equal(report.body.items[0].refunded.refunds[0].authorized_by_owner,false);
    });

    await t.test("TAX-07 authorized owner remaining refund is 8230 with 556 tax",async()=>{
      const quote=await quoteUsC11LiveRefund(pool,{
        auth:actor,ownerType:"salon",ownerId:item.salon_id,
        bookingId:item.booking_id,
      });
      assert.equal(quote.status,200,JSON.stringify(quote));
      assert.equal(quote.body.remaining_minor,"8230");
      assert.equal(quote.body.already_refunded_minor,"2500");
      assert.equal(quote.body.full_remaining_refund_estimate.refundable_service_tax_minor,"556");
      assert.equal(quote.body.full_remaining_refund_estimate.refundable_service_base_minor,"7674");
      const id=randomUUID();
      const sent=await authorizeUsC11LiveRefund(pool,{
        auth:actor,ownerType:"salon",ownerId:item.salon_id,
        bookingId:item.booking_id,secretKey,fetchImpl:refundTransport,
        body:{
          request_id:id,amount_minor:"8230",expected_remaining_minor:"8230",
          reason:"requested_by_customer",consent:true,
        },
      });
      assert.equal(sent.status,200,JSON.stringify(sent));
      assert.equal(sent.body.refund_confirmed,false);
      assert.equal(sent.body.stripe_refund_id,"re_TAX07FULLREST02");
      assert.equal(sent.body.state,"submitted");
      const pending=await readUsServiceTaxReport(pool,{
        auth:actor,ownerType:"salon",ownerId:item.salon_id,
      });
      assert.equal(pending.body.totals.refunded_gross_minor,"2500");
      assert.equal(pending.body.totals.outstanding_refund_requests_minor,"8230");
    });

    await t.test("TAX-07 signed final refund settles full 725 tax once",async()=>{
      refunds.re_TAX07FULLREST02.status="succeeded";
      const paid=await observe("evt_TAX07FINAL0001",
        "re_TAX07FULLREST02",eventTime+1);
      assert.equal(paid.status,200,JSON.stringify(paid));
      assert.equal(paid.body.result,"observed");
      const report=await readUsServiceTaxReport(pool,{
        auth:actor,ownerType:"salon",ownerId:item.salon_id,
      });
      assert.equal(report.status,200,JSON.stringify(report));
      assert.equal(report.body.items[0].reconciliation_status,"refunded_full");
      assert.equal(report.body.totals.refunded_gross_minor,"10730");
      assert.equal(report.body.totals.refunded_service_tax_minor,"725");
      assert.equal(report.body.totals.refunded_service_base_minor,"10005");
      assert.equal(report.body.totals.net_gross_minor,"0");
      assert.equal(report.body.totals.net_service_tax_minor,"0");
      assert.equal(report.body.totals.outstanding_refund_requests_minor,"0");
      assert.equal(report.body.items[0].refunded.refunds.length,2);
      assert.equal(report.body.items[0].refunded.refunds[1].authorized_by_owner,true);
      const quote=await quoteUsC11LiveRefund(pool,{
        auth:actor,ownerType:"salon",ownerId:item.salon_id,
        bookingId:item.booking_id,
      });
      assert.equal(quote.body.refundable,false);
      assert.equal(quote.body.full_remaining_refund_estimate,null);
    });

    await t.test("TAX-07 signed late refund failure reverses only affected share",async()=>{
      refunds.re_TAX07FULLREST02.status="failed";
      const reversed=await observe("evt_TAX07FAIL00001",
        "re_TAX07FULLREST02",eventTime+2);
      assert.equal(reversed.status,200,JSON.stringify(reversed));
      assert.equal(reversed.body.result,"observed");
      const report=await readUsServiceTaxReport(pool,{
        auth:actor,ownerType:"salon",ownerId:item.salon_id,
      });
      assert.equal(report.status,200,JSON.stringify(report));
      assert.equal(report.body.items[0].reconciliation_status,"refunded_partial");
      assert.equal(report.body.totals.refunded_gross_minor,"2500");
      assert.equal(report.body.totals.refunded_service_tax_minor,"169");
      assert.equal(report.body.totals.net_gross_minor,"8230");
      assert.equal(report.body.totals.net_service_tax_minor,"556");
      const request=await client.query(
        `SELECT state FROM us_c11_live_refund_requests
          WHERE stripe_refund_id='re_TAX07FULLREST02'`
      );
      assert.equal(request.rows[0].state,"failed");
    });

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
