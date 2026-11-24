// US-SERVICES-01: real SQL on disposable PostgreSQL17 only.
// Refuses any connection string other than localhost synthetic test DB.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {readFile} from "node:fs/promises";
import {
  readUsServiceLinkOptions,saveUsServiceLink,
  rejectLegacyUsServiceMutation,rejectLegacyUsMasterServiceCreation,
} from "../src/services/usServiceLink.service.js";

const URI=process.env.US_SERVICES_01_TEST_DB||"";
if(!/^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:55432\/us_services_01_test$/.test(URI)) {
  throw Error("US_SERVICES_01_ISOLATED_DB_REQUIRED");
}
const {Pool}=pg;
const pool=new Pool({connectionString:URI,max:2,connectionTimeoutMillis:3000});
const salon={ownerType:"salon",ownerSlug:"us-salon",
  auth:{source:"session",role:"salon_admin",user_id:81,
    session_id:"11111111-2222-4333-8444-555555555555"}};
const master={ownerType:"master",ownerSlug:"us-master",
  auth:{source:"session",role:"master",user_id:82,
    session_id:"22222222-3333-4444-8555-666666666666"}};
async function count(table) {
  const allowed=["services","salon_master_services","us_service_price_amounts"];
  assert.ok(allowed.includes(table));
  const result=await pool.query("SELECT count(*)::int AS total FROM public."+table);
  return result.rows[0].total;
}

test("PostgreSQL17: explicit-owner create/attach, USD, duplicated and foreign scope",async()=>{
  const accessKey="TOTEM_US_ODOO_SAAS_ACCESS_ENABLED";
  const policyKey="TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON";
  const oldAccess=process.env[accessKey],oldPolicy=process.env[policyKey];
  try {
    const db=await pool.query("SELECT current_database() AS name,version() AS version");
    assert.equal(db.rows[0].name,"us_services_01_test");
    assert.match(db.rows[0].version,/PostgreSQL 17\./);
    assert.equal((await pool.query("SELECT to_regclass('public.billing_subscriptions') AS tbl")).rows[0].tbl,null);
    await pool.query(await readFile(new URL("./sql/g5-t6d-prod-schema-fixture.sql",import.meta.url),"utf8"));
    for(const migration of ["g5_us_odoo_source_identity_v1.sql","g5_us_odoo_billing_projection_v1.sql"]){
      await pool.query(await readFile(new URL("../migrations/"+migration,import.meta.url),"utf8"));
    }
    // Explicit paid synthetic evidence. Real G5 migration and constraints,
    // no network call or actual payment, no fallback to legacy wallet.
    process.env[accessKey]="true";
    process.env[policyKey]=JSON.stringify({approved:true,version:"qa_us_service_v1"});
    await pool.query(`INSERT INTO public.owner_opening_requests
      (owner_type,status,name,email,created_owner_id,created_auth_user_id,precheck_result_json,
       source_namespace,source_company_id,source_website_id,source_partner_id,source_request_id)
      VALUES ('salon','activated','fixture salon','salon@example.invalid',32,81,'{"market_code":"US"}','odoo_online',4,5,410,'service-salon'),
      ('master','activated','fixture master','master@example.invalid',46,82,'{"market_code":"US"}','odoo_online',4,5,411,'service-master')`);
    await pool.query(`INSERT INTO public.billing_subscriptions
      (owner_type,owner_id,amount,currency,wallet_only,current_period_start,current_period_end,grace_period_days,
       provider_namespace,provider_company_id,provider_website_id,provider_partner_id,provider_source_request_id,
       provider_subscription_order_id,provider_invoice_id,provider_policy_version,provider_verified_at)
      VALUES ('salon',32,0,'USD',false,now()-interval '1 day',now()+interval '30 days',0,'odoo_online',4,5,410,'service-salon',501,601,'qa_us_service_v1',clock_timestamp()),
      ('master',46,0,'USD',false,now()-interval '1 day',now()+interval '30 days',0,'odoo_online',4,5,411,'service-master',502,602,'qa_us_service_v1',clock_timestamp())`);
    const read=await readUsServiceLinkOptions(pool,salon);
    assert.equal(read.status,200);
    assert.deepEqual(read.body.masters.map(x=>x.id),[46,48]);
    assert.deepEqual(read.body.catalog_services.map(x=>x.service_pk),[1]);
    const masterOptions=await readUsServiceLinkOptions(pool,master);
    assert.equal(masterOptions.body.salons.length,2);
    assert.deepEqual(masterOptions.body.catalog_services.map(x=>x.service_pk),[1]);
    const original=[await count("services"),await count("salon_master_services"),
      await count("us_service_price_amounts")];
    assert.deepEqual(original,[2,2,1]);

    const body={operation:"create",master_id:46,name:"SYNTHETIC Haircut",
      duration_min:45,amount_minor:15025};
    const created=await saveUsServiceLink(pool,{...salon,body});
    assert.equal(created.status,200);
    assert.equal(created.body.service.salon_id,32);
    assert.equal(created.body.service.master_id,46);
    assert.equal(created.body.service.amount_minor,"15025");
    assert.equal(created.body.readback_verified,true);
    assert.deepEqual([await count("services"),await count("salon_master_services"),
      await count("us_service_price_amounts")],[3,3,2]);

    const link=await pool.query(
      "SELECT sms.salon_id,sms.master_id,sms.currency_code,sms.price,"+
      "usd.amount_minor::text AS amount_minor,usd.price_version "+
      "FROM public.salon_master_services sms JOIN public.us_service_price_amounts usd "+
      "ON usd.salon_master_service_id=sms.id WHERE sms.id=$1",
      [created.body.salon_master_service_id]);
    assert.equal(link.rows[0].price,0);
    assert.equal(link.rows[0].currency_code,"USD");
    assert.equal(link.rows[0].amount_minor,"15025");
    assert.equal(Number(link.rows[0].price_version),1);

    const duplicate=await saveUsServiceLink(pool,{...salon,body});
    assert.equal(duplicate.status,409);
    assert.equal(duplicate.body.error,"US_SERVICE_LINK_DUPLICATE");
    assert.equal(await count("services"),3); // No orphan after aborted transaction.

    const foreign=await saveUsServiceLink(pool,{...salon,
      ownerSlug:"other-us-salon",body});
    assert.equal(foreign.status,404);
    assert.equal(await count("services"),3);

    const blockedMaster=await saveUsServiceLink(pool,{...master,body:{
      operation:"create",salon_slug:"unrelated-salon",
      name:"Not allowed",duration_min:30,amount_minor:1000,
    }});
    assert.equal(blockedMaster.status,404);
    assert.equal(await count("services"),3);

    const masterMade=await saveUsServiceLink(pool,{...master,body:{
      operation:"create",salon_slug:"other-us-salon",
      name:"SYNTHETIC Barber",duration_min:40,amount_minor:1725,
    }});
    assert.equal(masterMade.status,200);
    assert.equal(masterMade.body.service.salon_slug,"other-us-salon");
    assert.equal(masterMade.body.service.master_id,46);
    assert.equal(masterMade.body.service.amount_minor,"1725");

    const attached=await saveUsServiceLink(pool,{...master,body:{
      operation:"attach",salon_slug:"other-us-salon",service_pk:1,
      duration_min:60,amount_minor:2500,
    }});
    assert.equal(attached.status,200);
    assert.equal(attached.body.service.service_pk,1);
    assert.equal(attached.body.service.amount_minor,"2500");
    assert.equal(await count("services"),4); // Attachment does not create catalog row.

    // Salon owner can attach an existing service from their OWN salon to
    // another active master; this does not reveal any other US salon catalog.
    const salonAttached=await saveUsServiceLink(pool,{...salon,body:{
      operation:"attach",master_id:48,service_pk:1,
      duration_min:60,amount_minor:3000,
    }});
    assert.equal(salonAttached.status,200);
    assert.equal(salonAttached.body.service.salon_id,32);
    assert.equal(salonAttached.body.service.master_id,48);
    assert.equal(salonAttached.body.service.service_pk,1);
    assert.equal(salonAttached.body.service.amount_minor,"3000");

    const foreignUsSource=await saveUsServiceLink(pool,{...salon,body:{
      operation:"attach",master_id:48,
      service_pk:masterMade.body.service.service_pk,
      duration_min:40,amount_minor:5000,
    }});
    assert.equal(foreignUsSource.status,404);
    assert.equal(foreignUsSource.body.error,"US_SERVICE_LINK_SOURCE_NOT_FOUND");
    assert.equal(await count("services"),4);

    const kgSourceRejected=await saveUsServiceLink(pool,{...master,body:{
      operation:"attach",salon_slug:"other-us-salon",service_pk:2,
      duration_min:30,amount_minor:4900,
    }});
    assert.equal(kgSourceRejected.status,404);
    assert.equal(kgSourceRejected.body.error,"US_SERVICE_LINK_SOURCE_NOT_FOUND");
    assert.equal(await count("services"),4);

    await pool.query("UPDATE public.billing_subscriptions SET provider_verified_at=clock_timestamp()-interval '6 minutes' WHERE owner_type='salon' AND owner_id=32");
    const stale=await saveUsServiceLink(pool,{...salon,body:{...body,name:"STALE should never appear"}});
    assert.equal(stale.status,403);
    assert.equal(await count("services"),4);
    await pool.query("UPDATE public.billing_subscriptions SET provider_verified_at=clock_timestamp(),subscription_status='blocked',blocked_at=now() WHERE owner_type='salon' AND owner_id=32");
    const blocked=await saveUsServiceLink(pool,{...salon,body:{
      ...body,name:"BLOCKED should never appear",
    }});
    assert.equal(blocked.status,403);
    assert.equal(await count("services"),4);

    const mixedMasterLegacy=await rejectLegacyUsMasterServiceCreation(pool,46);
    assert.equal(mixedMasterLegacy.status,409);
    assert.equal(mixedMasterLegacy.error,"US_SERVICE_LINK_ENDPOINT_REQUIRED");

    const usLegacy=await rejectLegacyUsServiceMutation(pool,32);
    const kgLegacy=await rejectLegacyUsServiceMutation(pool,34);
    assert.equal(usLegacy.status,409);
    assert.equal(kgLegacy,null);
    const broken=await rejectLegacyUsServiceMutation(pool,999);
    assert.equal(broken.status,409);

    const verification=await pool.query(
      "SELECT count(*)::int AS total FROM public.salon_master_services "+
      "WHERE salon_id=34 AND currency_code='USD'");
    assert.equal(verification.rows[0].total,0);
  } finally {
    if(oldAccess===undefined)delete process.env[accessKey];else process.env[accessKey]=oldAccess;
    if(oldPolicy===undefined)delete process.env[policyKey];else process.env[policyKey]=oldPolicy;
    await pool.end();
  }
});
