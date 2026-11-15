// TOTEM US06-GEO-I pinned geometry/Census verifier unit test.
// Verified Census responses from public address fixture; no network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadPinnedUsTimezonePolygons, lookupPinnedUsTimezone,
  verifyUsLocationAddress, usGeoAddressFingerprint,
  US_GEO_RUNTIME_SHA256,
} from "../services/usAddressGeoVerification.service.js";
assert.equal(process.env.TOTEM_US06_GEO_I_LOCAL_ONLY, "1");
const root = process.env.TOTEM_US06_GEO_I_FIXTURE_ROOT;
assert.ok(root);
const a = JSON.parse(readFileSync(join(root, "CENSUS_REAL_ADDRESS_FIXTURES.json"),"utf8"));
const b = JSON.parse(readFileSync(join(root, "CENSUS_CORRECTED_STREET_FIXTURES.json"),"utf8"));
const cases = [...a.addresses, ...b.addresses];
const known = new Map(cases.map(x=>[x.tag,x]));
const log = [];
const fakeFetch = async (url) => {
  const parsed = new URL(url);
  assert.equal(parsed.hostname,"geocoding.geo.census.gov");
  assert.equal(parsed.searchParams.get("benchmark"),"Public_AR_Current");
  assert.equal(parsed.searchParams.get("vintage"),"Current_Current");
  const item = cases.find(x=>
    x.street.toUpperCase() === parsed.searchParams.get("street")?.toUpperCase() &&
    x.city.toUpperCase() === parsed.searchParams.get("city")?.toUpperCase() &&
    x.state.toUpperCase() === parsed.searchParams.get("state")?.toUpperCase() &&
    x.zip.slice(0,5) === parsed.searchParams.get("zip"));
  const matches = item?.matches===1?[{
    matchedAddress:item.matched_address,
    addressComponents:item.components,
    coordinates:item.coordinates,
    geographies:{States:item.geographies},
  }]:[];
  return new Response(JSON.stringify({
    result:{input:{benchmark:{benchmarkName:"Public_AR_Current"}},
      addressMatches:matches},
  }),{status:200,headers:{"content-type":"application/json"}});
};
function draft(item,override={}){
  return {
    state_code:item.state, city_name:item.city,
    street_line1:item.street, street_line2:"",
    postal_code:item.zip, timezone_name:item.expected,
    ...override,
  };
}
async function run(name,fn){
  await fn(); log.push(name);
  console.log("US06_GEO_I_UNIT_PASS",name);
}
const polygons=loadPinnedUsTimezonePolygons();
await run("full_29_us_zones_pinned_sha",async()=>{
  assert.equal(polygons.zones.size,29);
  assert.equal(US_GEO_RUNTIME_SHA256,
    "2da5f1e980e70f53c781e1416e8e47bee03b98160353951c886a9901f525550a");
});
await run("austin_real_census_polygon_verified",async()=>{
  const v=await verifyUsLocationAddress(draft(known.get("TX_AUSTIN")),{fetchImpl:fakeFetch});
  assert.equal(v.status,"VERIFIED_GEOMETRY",JSON.stringify(v));
  assert.equal(v.resolved_timezone,"America/Chicago");
  assert.deepEqual(v.reasons,[]);
});
await run("el_paso_real_census_polygon_verified",async()=>{
  const v=await verifyUsLocationAddress(draft(known.get("TX_EL_PASO_CENSUS_STREET")),{fetchImpl:fakeFetch});
  assert.equal(v.status,"VERIFIED_GEOMETRY",JSON.stringify(v));
  assert.equal(v.resolved_timezone,"America/Denver");
});
await run("florida_two_timezones_verified",async()=>{
  const one=await verifyUsLocationAddress(draft(known.get("FL_TALLAHASSEE")),{fetchImpl:fakeFetch});
  const two=await verifyUsLocationAddress(draft(known.get("FL_PENSACOLA_CORRECTED_DIRECTION")),{fetchImpl:fakeFetch});
  assert.equal(one.status,"VERIFIED_GEOMETRY");
  assert.equal(two.status,"VERIFIED_GEOMETRY",JSON.stringify(two));
  assert.notEqual(one.resolved_timezone,two.resolved_timezone);
});
await run("arizona_no_zip_timezone_guess",async()=>{
  const v=await verifyUsLocationAddress(draft(known.get("AZ_PHOENIX")),{fetchImpl:fakeFetch});
  assert.equal(v.status,"VERIFIED_GEOMETRY");
  assert.equal(v.resolved_timezone,"America/Phoenix");
});
await run("real_bad_zip_and_direction_review",async()=>{
  for(const tag of ["TX_EL_PASO","CA_LA","FL_PENSACOLA","ID_BOISE"]){
    const v=await verifyUsLocationAddress(draft(known.get(tag)),{fetchImpl:fakeFetch});
    assert.equal(v.status,"NEEDS_REVIEW",tag);
    assert.ok(v.reasons.length);
  }
});
await run("wrong_owner_timezone_review",async()=>{
  const src=known.get("TX_AUSTIN");
  const v=await verifyUsLocationAddress(draft(src,{timezone_name:"America/Denver"}),{fetchImpl:fakeFetch});
  assert.equal(v.status,"NEEDS_REVIEW");
  assert.ok(v.reasons.includes("US_GEO_IANA_TIMEZONE_MISMATCH"));
});
await run("census_coordinate_state_mismatch_review",async()=>{
  const v=await verifyUsLocationAddress(draft(known.get("DC_CENSUS")),{fetchImpl:fakeFetch});
  assert.equal(v.status,"NEEDS_REVIEW");
  assert.ok(v.reasons.includes("US_GEO_COORDINATE_STATE_MISMATCH"));
});
await run("zip_plus4_is_unverified",async()=>{
  const src=known.get("TX_AUSTIN");
  const v=await verifyUsLocationAddress(draft(src,{postal_code:"78701-1234"}),{fetchImpl:fakeFetch});
  assert.equal(v.status,"NEEDS_REVIEW");
  assert.ok(v.reasons.includes("US_GEO_ZIP_PLUS4_REQUIRES_USPS_REVIEW"));
});
await run("no_match_needs_review",async()=>{
  const v=await verifyUsLocationAddress(draft(known.get("TX_BOGUS_ADDRESS")),{fetchImpl:fakeFetch});
  assert.equal(v.status,"NEEDS_REVIEW");
  assert.ok(v.reasons.includes("US_GEO_CENSUS_NO_MATCH"));
});
await run("census_network_failure_needs_review",async()=>{
  const v=await verifyUsLocationAddress(draft(known.get("TX_AUSTIN")),{fetchImpl:async()=>{
    throw new Error("US06_TEST_CENSUS_OFFLINE");
  }});
  assert.equal(v.status,"NEEDS_REVIEW");
  assert.ok(v.reasons.includes("US_GEO_CENSUS_UNAVAILABLE"));
});
await run("missing_pinned_artifact_needs_review",async()=>{
  const normal=process.env.US_GEO_POLYGON_PATH;
  try{
    process.env.US_GEO_POLYGON_PATH=normal+".missing";
    const v=await verifyUsLocationAddress(draft(known.get("TX_AUSTIN")),{fetchImpl:fakeFetch});
    assert.equal(v.status,"NEEDS_REVIEW");
    assert.ok(v.reasons.includes("US_GEO_DATASET_UNAVAILABLE"));
  }finally{
    process.env.US_GEO_POLYGON_PATH=normal;
  }
});
await run("wrong_polygon_is_not_accepted",async()=>{
  assert.equal(lookupPinnedUsTimezone(-60,30).reason,"US_GEO_POLYGON_NOT_UNIQUE");
});
await run("address_fingerprint_changes_on_edit",async()=>{
  const src=draft(known.get("TX_AUSTIN"));
  assert.notEqual(usGeoAddressFingerprint(src),
    usGeoAddressFingerprint({...src,street_line2:"Suite 2"}));
});
console.log("US06_GEO_I_UNIT_ALL_PASS",JSON.stringify({cases:log.length,
  provenance:"Census Public_AR_Current and timezone-boundary-builder 2026d",
  production_writes:0,remote_requests:0}));
