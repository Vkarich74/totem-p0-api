import test from "node:test";
import assert from "node:assert/strict";
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
