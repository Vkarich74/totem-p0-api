// US-SERVICES-01: real SQL on disposable PostgreSQL17 only.
// Refuses any connection string other than localhost synthetic test DB.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
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
  try {
    const read=await readUsServiceLinkOptions(pool,salon);
    assert.equal(read.status,200);
    assert.equal(read.body.masters[0].id,46);
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

    const kgSourceRejected=await saveUsServiceLink(pool,{...master,body:{
      operation:"attach",salon_slug:"other-us-salon",service_pk:2,
      duration_min:30,amount_minor:4900,
    }});
    assert.equal(kgSourceRejected.status,404);
    assert.equal(kgSourceRejected.body.error,"US_SERVICE_LINK_SOURCE_NOT_FOUND");
    assert.equal(await count("services"),4);

    await pool.query("INSERT INTO public.billing_subscriptions"+
      "(owner_type,owner_id,subscription_status,blocked_at) "+
      "VALUES('salon',32,'blocked',now())");
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
    await pool.end();
  }
});
