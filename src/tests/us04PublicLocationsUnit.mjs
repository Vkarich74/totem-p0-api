// US-04 exact real handler contract with a locked in-memory query stub.
// No database or external connections. SQL is tested separately in sandbox.
import assert from "node:assert/strict";
import { pool } from "../db.js";
import { US_STATE_CODES } from "../market-context/country-packs/US.js";
import { publicUsLocationCatalog } from "../routes/publicUsLocationCatalog.js";

const states = US_STATE_CODES.map(code => ({
  code,
  name_en: code === "DC" ? "District of Columbia" : `State ${code}`,
  kind: code === "DC" ? "federal_district" : "state",
}));
const rows = [{
  id: 2001,
  location_code:"ny",
  state_code:"NY",
  city_name:"New York",
  street_line1:"111 Test Street",
  street_line2:"Suite 2",
  postal_code:"10001-0001",
  timezone_name:"America/New_York",
  is_primary:true,
}, {
  id: 2002,
  location_code:"az",
  state_code:"AZ",
  city_name:"Phoenix",
  street_line1:"222 Example St",
  street_line2:null,
  postal_code:"85001",
  timezone_name:"America/Phoenix",
  is_primary:false,
}];
const marketContext = Object.freeze({
  market_code:"US",country_code:"US",currency_code:"USD",
  country_pack_code:"US",country_pack_version:"1",
});
let calls=[];
let mockStates=states;
let fails=false;
const original=pool.query;
pool.query = async (query,params=[]) => {
  if (fails) throw new Error("US04_TEST_DB_SIMULATED_FAILURE");
  calls.push({query,params});
  if (query.includes("FROM public.us_states")) {
    assert.match(query,/country_code = 'US'/);
    return {rows:mockStates};
  }
  if (query.includes("FROM public.us_salon_locations")) {
    assert.match(query,/l.enabled = true/);
    assert.deepEqual(params,[901]);
    return {rows};
  }
  throw new Error("US04_UNEXPECTED_QUERY");
};
function res() {
  return {
    statusCode:200,
    body:null,
    status(n){this.statusCode=n;return this;},
    json(data){this.body=data;return this;},
  };
}
async function invoke({tenantId=901,market=marketContext}={}) {
  const reply=res();
  await publicUsLocationCatalog(
    {tenant:{salon_id:tenantId},market_context:market},
    reply
  );
  return reply;
}
try {
  assert.equal(US_STATE_CODES.length,51);
  const first=await invoke();
  assert.equal(first.statusCode,200);
  assert.equal(first.body.ok,true);
  assert.equal(first.body.states.length,51);
  assert.equal(first.body.locations.length,2);
  assert.equal(first.body.market_code,"US");
  assert.equal(first.body.currency_code,"USD");
  assert.equal(first.body.locale,"en-US");
  assert.equal(first.body.phone_country_code,"+1");
  assert.equal(first.body.locations[0].timezone,"America/New_York");
  assert.equal(first.body.locations[0].postal_code,"10001-0001");
  assert.equal(first.body.locations[0].street_line2,"Suite 2");
  assert.equal(first.body.locations[1].street_line2,"");
  assert.equal(Object.hasOwn(first.body.locations[0],"id"),false);
  assert.equal(calls.length,2);

  calls=[];
  const kg=await invoke({market:{...marketContext,market_code:"KG"}});
  assert.equal(kg.statusCode,404);
  assert.equal(kg.body.error,"US_MARKET_ONLY");
  assert.equal(calls.length,0);

  const missing=await invoke({tenantId:0});
  assert.equal(missing.statusCode,400);
  assert.equal(missing.body.error,"TENANT_REQUIRED");
  assert.equal(calls.length,0);

  mockStates=states.slice(1);
  const incomplete=await invoke();
  assert.equal(incomplete.statusCode,503);
  assert.equal(incomplete.body.error,"US_STATES_CATALOG_UNAVAILABLE");
  mockStates=states;

  fails=true;
  const unavailable=await invoke();
  assert.equal(unavailable.statusCode,503);
  assert.equal(unavailable.body.error,"US_LOCATIONS_UNAVAILABLE");

  console.log("US04_PUBLIC_LOCATION_HANDLER_UNIT=PASS",
    JSON.stringify({states_and_dc:51,locations:2,us_only:true,
      blocked_kg_kz:true,blocked_missing_tenant:true,
      no_ids_exposed:true,database_error_fails_closed:true}));
} finally {
  pool.query=original;
  await pool.end();
}
