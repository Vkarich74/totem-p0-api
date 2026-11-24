import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertAdminOpeningMarketPolicy } from "../routes/internal/adminMarketsContract.js";
import { assertVerifiedUsGeo } from "../services/provision/usOpenOwnerGuards.js";

test("US manual activation is disabled by default and KZ stays denied", () => {
  const old = process.env.TOTEM_US_ADMIN_MANUAL_ACTIVATION;
  try {
    delete process.env.TOTEM_US_ADMIN_MANUAL_ACTIVATION;
    assert.equal(assertAdminOpeningMarketPolicy("KG"), "KG");
    assert.equal(assertAdminOpeningMarketPolicy(""), null);
    assert.throws(() => assertAdminOpeningMarketPolicy("US"),
      { code: "ADMIN_US_OPEN_OWNER_PENDING", statusCode: 409 });
    assert.throws(() => assertAdminOpeningMarketPolicy("KZ"),
      { code: "ADMIN_MARKET_INACTIVE", statusCode: 409 });
    process.env.TOTEM_US_ADMIN_MANUAL_ACTIVATION = "true";
    assert.equal(assertAdminOpeningMarketPolicy("US"), "US");
    assert.throws(() => assertAdminOpeningMarketPolicy("KZ"),
      { code: "ADMIN_MARKET_INACTIVE", statusCode: 409 });
  } finally {
    if (old === undefined) delete process.env.TOTEM_US_ADMIN_MANUAL_ACTIVATION;
    else process.env.TOTEM_US_ADMIN_MANUAL_ACTIVATION = old;
  }
});

test("missing verified Census/IANA proof is always rejected", () => {
  assert.throws(() => assertVerifiedUsGeo({}, null),
    { code: "US_GEO_VERIFICATION_REQUIRED", status: 409 });
});

test("US auth remains disabled before server geo activation; KG retains enabled behavior", () => {
  const salon=readFileSync(new URL("../services/provision/createSalonCanonical.js",import.meta.url),"utf8");
  const master=readFileSync(new URL("../services/provision/createMasterCanonical.js",import.meta.url),"utf8");
  const routes=readFileSync(new URL("../routes/internal/adminOpenOwner.js",import.meta.url),"utf8");
  const canonical=readFileSync(new URL("../services/provision/ownerOpeningCanonicalActivation.js",import.meta.url),"utf8");
  const guards=readFileSync(new URL("../services/provision/usOpenOwnerGuards.js",import.meta.url),"utf8");
  assert.match(salon,/\["email", "role", "enabled"\]/);
  assert.match(salon,/input\.market_code !== "US"/);
  assert.match(master,/pushParamColumn\("enabled", input\.market_code !== "US"\)/);
  assert.match(canonical,/UPDATE public\.auth_users SET enabled=true WHERE id=\$1 AND role=\$2 AND enabled=false RETURNING id/);
  // G5 moved these invariants into the sole locked canonical service.
  assert.match(routes,/activateOwnerOpeningCanonical\(\{[\s\S]*?assertUsActivationReady,[\s\S]*?activateEntity:activateOwnerOpeningEntity/);
  assert.match(canonical,/await assertUsActivationReady\(db, current, positive\(current\.created_owner_id\)\)/);
  const geo=canonical.indexOf("await assertUsActivationReady(");
  const paid=canonical.indexOf("await persistUsSaasPaidProjection(");
  const entity=canonical.indexOf("await activateEntity(");
  const unlock=canonical.indexOf("UPDATE public.auth_users SET enabled=true");
  assert.ok(geo>=0&&paid>geo&&entity>paid&&unlock>entity);
  assert.match(canonical,/assertUsPaidEvidenceForLockedRequest\(\s*current, paidEvidence, nowRow\.rows\[0\]\?\.now/);
  assert.match(guards,/const expectedAuthEnabled = emailReadyStatus/);
  assert.match(guards,/g\.address_fingerprint_sha256=public\.us_geo_location_fingerprint/);
  assert.match(guards,/g\.expires_at>now\(\)/);
});
