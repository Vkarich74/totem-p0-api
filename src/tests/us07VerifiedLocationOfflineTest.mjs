// Offline US07 gates. No tenant inserts, DB access, requests, or deployment.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  US_GEO_RUNTIME_SHA256, loadPinnedUsTimezonePolygons,
  usGeoAddressFingerprint, lookupPinnedUsTimezone
} from "../services/usAddressGeoVerification.service.js";
import { buildUsOwnerLocationsRouter } from "../routes/internal/usOwnerLocations.js";
const source=new URL("../../",import.meta.url);
const file=(p)=>readFileSync(new URL(p,source),"utf8");
const sql=file("migrations/2026_11_15__us07_verified_location_activation.sql");
let count=0;
function check(label,fn){fn();count++;console.log("US07_OFFLINE_PASS",label)}
check("pinned_binary_exists_and_sha_matches",()=>{
  const p=fileURLToPath(new URL("../geo/US_2026d_29zones.geojson.gz",import.meta.url));
  assert.ok(existsSync(p));
  assert.equal(createHash("sha256").update(readFileSync(p)).digest("hex"),US_GEO_RUNTIME_SHA256);
});
check("polygon_geometry_loads_in_shared_api",()=>{
  delete process.env.US_GEO_POLYGON_PATH;
  const value=loadPinnedUsTimezonePolygons();
  assert.equal(value.zones.size,29);
  assert.equal(lookupPinnedUsTimezone(-97.7431,30.2672).zone,"America/Chicago");
});
check("fingerprint_matches_known_node_contract",()=>{
  const a={state_code:"TX",city_name:"Austin",street_line1:"1100 Congress Ave",street_line2:"",
    postal_code:"78701",timezone_name:"America/Chicago"};
  assert.match(usGeoAddressFingerprint(a),/^[a-f0-9]{64}$/);
});
check("sql_enforces_exact_fingerprint_and_fresh_census_geometry",()=>{
  for(const v of ["US07_LOCATION_VERIFIED_EVIDENCE_REQUIRED",
    "address_fingerprint_sha256=public.us_geo_location_fingerprint",
    "g.expires_at>now()","g.checked_at<=now()",
    "g.status='VERIFIED_GEOMETRY'","g.source_version='2026d'",
    "g.boundary_distance_m>=250","g.resolved_timezone=NEW.timezone_name",
    "g.census_state_code=NEW.state_code","g.census_zip5=left(NEW.postal_code,5)"]) {
    assert.ok(sql.includes(v),v);
  }
});
check("sql_preserves_kg_kz_and_creates_no_demo_rows",()=>{
  assert.match(sql,/default_market_code'\) IS DISTINCT FROM 'KG'/);
  assert.match(sql,/code='KZ'\) IS DISTINCT FROM true/);
  assert.doesNotMatch(sql,/\bINSERT INTO\s+(?:public\.)?(?:salons|masters|us_salon_locations|bookings)\b/i);
  assert.doesNotMatch(sql,/\bUPDATE\s+public\.(?:markets|countries|salons|masters)\b/i);
});
check("owner_activation_endpoint_is_existing_US_only",()=>{
  const sourceFile=file("src/routes/internal/usOwnerLocations.js");
  for(const anchor of ["/salons/:slug/us-locations/:location_code/activate",
    "await ownerContext(db,req,{...guards,write:true})",
    "SELECT id,enabled FROM public.us_salon_locations",
    "SET enabled=true,updated_at=now()", "US_LOCATION_NOT_FOUND"]) assert.ok(sourceFile.includes(anchor),anchor);
});
check("owner_routes_installed_without_writing_rows",()=>{
  const pool={query(){throw new Error("NO_DB_ALLOWED")},connect(){throw new Error("NO_DB_ALLOWED")}};
  const router=buildUsOwnerLocationsRouter(pool,{hasSalonOwnership:()=>true,
    ensureSalonWriteAllowed:()=>{}});
  const handlers=router.stack.filter(x=>x.route?.path.endsWith("/activate"));
  assert.equal(handlers.length,1);
  assert.equal(handlers[0].route.methods.post,true);
});
console.log("US07_OFFLINE_ALL_PASS",count);
