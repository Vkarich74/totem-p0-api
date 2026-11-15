import assert from "node:assert/strict";
import {
  resolveCanonicalPublicBaseUrl, resolveCanonicalBookingAppBaseUrl,
  buildPublicAbsoluteUrl, buildCabinetAbsoluteUrl,
  buildSalonBookingAbsoluteUrl, buildMasterBookingAbsoluteUrl,
  buildEntryContract
} from "../services/entry/entryContract.js";
import { buildEntry } from "../services/entry/entryBuilder.js";
import { buildQrContract, assertQrTargetAllowed } from "../services/entry/qrService.js";

const SDK = "https://totem-us-staging-sdk-staging.up.railway.app";
const OTHER = "https://totem-us-public-staging.example.com";
const PROD = "https://totemv.com";
const keys = [
  "NODE_ENV", "TOTEM_STAGE_STRICT", "STAGING_ALLOWED_ORIGINS",
  "TOTEM_STAGE_PUBLIC_ORIGIN", "TOTEM_STAGE_APP_ORIGIN",
  "WEB_BASE", "PUBLIC_WEB_BASE_URL", "APP_BASE_URL", "PUBLIC_APP_BASE_URL"
];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
function withEnv(values, fn) {
  for(const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  try{ fn(); }
  finally{
    for(const key of keys){
      if(original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}
const stage = {
  NODE_ENV: "staging", TOTEM_STAGE_STRICT: "1",
  STAGING_ALLOWED_ORIGINS: SDK
};
const salon = { owner_type: "salon", canonical_slug: "us-example" };
let checks = 0;
function verify(name, fn){ fn(); checks++; }

withEnv(stage, () => {
  verify("approved origins and all owner URLs", () => {
    assert.equal(resolveCanonicalPublicBaseUrl(), SDK);
    assert.equal(resolveCanonicalBookingAppBaseUrl(), SDK);
    assert.equal(buildPublicAbsoluteUrl("salon", "us-example"), SDK + "/salon/us-example");
    assert.equal(buildCabinetAbsoluteUrl("salon", "us-example"), SDK + "/#/salon/us-example");
    assert.equal(buildSalonBookingAbsoluteUrl("us-example"), SDK + "/#/booking?salon=us-example");
    assert.equal(buildMasterBookingAbsoluteUrl("us-example", 12), SDK + "/#/booking?salon=us-example&master=12");
  });
  verify("entry and QR return only staging", () => {
    assert.equal(buildEntry(salon).entry.public_url, SDK + "/salon/us-example");
    assert.equal(buildEntry(salon).entry.cabinet_url, SDK + "/#/salon/us-example");
    assert.equal(buildEntryContract(salon, { public_visible: true }).public_absolute_url, SDK + "/salon/us-example");
    assert.equal(buildQrContract(salon).qr.qr_target_url, SDK + "/salon/us-example");
    assert.equal(buildQrContract({
      ...salon, qr_target_type: "booking_entry",
      booking_url: SDK + "/#/booking?salon=us-example"
    }).qr.booking_url, SDK + "/#/booking?salon=us-example");
  });
  verify("production/spoofing fail closed", () => {
    assert.throws(() => resolveCanonicalPublicBaseUrl(PROD), /STAGING_PUBLIC_ORIGIN_MISMATCH/);
    assert.throws(() => resolveCanonicalBookingAppBaseUrl("https://app.totemv.com"), /STAGING_APP_ORIGIN_MISMATCH/);
    for(const target of [
      PROD + "/salon/us-example",
      SDK + ".attacker.invalid/salon/us-example",
      SDK + "/#/salon/us-example"
    ]){
      assert.throws(() => assertQrTargetAllowed(target), /QR_SERVICE_ERROR/);
    }
    for(const target of [
      "https://app.totemv.com/#/booking?salon=us-example",
      SDK + ".attacker.invalid/#/booking?salon=us-example",
      SDK + "/#/booking?salon=us-example&token=secret"
    ]){
      assert.throws(() => buildQrContract({
        ...salon, qr_target_type: "booking_entry", booking_url: target
      }), /QR_SERVICE_ERROR/);
    }
  });
});
withEnv({ ...stage, WEB_BASE: PROD }, () => verify("legacy Production URL rejected",
  () => assert.throws(() => buildEntry(salon), /STAGING_LEGACY_WEB_BASE_FORBIDDEN/)));
withEnv({ ...stage, STAGING_ALLOWED_ORIGINS: PROD }, () => verify("Production CORS rejected",
  () => assert.throws(() => resolveCanonicalPublicBaseUrl(), /STAGING_ORIGIN_REJECTED/)));
withEnv({ ...stage, STAGING_ALLOWED_ORIGINS: "" }, () => verify("missing origin rejected",
  () => assert.throws(() => resolveCanonicalBookingAppBaseUrl(), /STAGING_ALLOWED_ORIGINS_REQUIRED/)));
withEnv({ ...stage, STAGING_ALLOWED_ORIGINS: SDK + "," + OTHER }, () => verify("ambiguous origin rejected",
  () => assert.throws(() => resolveCanonicalPublicBaseUrl(), /STAGING_PUBLIC_ORIGIN_REQUIRED/)));
withEnv({
  ...stage, STAGING_ALLOWED_ORIGINS: SDK + "," + OTHER,
  TOTEM_STAGE_PUBLIC_ORIGIN: OTHER, TOTEM_STAGE_APP_ORIGIN: SDK
}, () => verify("explicit distinct stage origins",
  () => {
    assert.equal(buildPublicAbsoluteUrl("salon", "us-example"), OTHER + "/salon/us-example");
    assert.equal(buildSalonBookingAbsoluteUrl("us-example"), SDK + "/#/booking?salon=us-example");
  }));
withEnv({ NODE_ENV: "production" }, () => verify("Production unaffected",
  () => {
    assert.equal(buildEntry(salon).entry.public_url, PROD + "/salon/us-example");
    assert.equal(buildSalonBookingAbsoluteUrl("us-example"), "https://app.totemv.com/#/booking?salon=us-example");
  }));
console.log("STAGING_ENTRY_ORIGIN_SAFETY_PASS " + checks);
