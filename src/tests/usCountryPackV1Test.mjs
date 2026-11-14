import assert from "node:assert/strict";

import { getCountryPack, listCountryPacks } from "../market-context/CountryPackRegistry.js";
import US_COUNTRY_PACK, { US_STATE_CODES } from "../market-context/country-packs/US.js";

const EXPECTED_STATES_AND_DC = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
  "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const pack = getCountryPack("us", "1");
assert.equal(pack, US_COUNTRY_PACK);
assert.equal(pack.code, "US");
assert.equal(pack.version, "1");
assert.equal(pack.country_code, "US");
assert.equal(pack.phone_country_code, "+1");
assert.equal(pack.default_phone_region, "US");
assert.equal(pack.default_locale, "en-US");
assert.equal(pack.default_currency, "USD");
assert.equal(pack.default_timezone, "Etc/UTC");
assert.equal(pack.requires_location_timezone, true);
assert.ok(Object.isFrozen(pack));
assert.ok(Object.isFrozen(pack.state_codes));

assert.equal(US_STATE_CODES.length, 51);
assert.equal(new Set(US_STATE_CODES).size, 51);
assert.deepEqual([...US_STATE_CODES].sort(), [...EXPECTED_STATES_AND_DC].sort());
assert.deepEqual(pack.state_codes, US_STATE_CODES);

for (const stateCode of EXPECTED_STATES_AND_DC) {
  assert.deepEqual(pack.normalizeStateCode(stateCode), {
    ok: true,
    state_code: stateCode,
  });
  assert.deepEqual(pack.normalizeStateCode(` ${stateCode.toLowerCase()} `), {
    ok: true,
    state_code: stateCode,
  });
}

for (const rejected of ["", "XX", "PR", "GU", "VI", "AS", "MP", "AA", "AE", "AP", "FM", "MH", "PW", "California"]) {
  assert.deepEqual(pack.normalizeStateCode(rejected), {
    ok: false,
    error: "INVALID_US_STATE",
  });
}

const zipValid = [
  ["00501", "00501"],
  ["10001", "10001"],
  ["90210", "90210"],
  ["10001-0001", "10001-0001"],
  ["100010001", "10001-0001"],
];
for (const [input, canonical] of zipValid) {
  assert.deepEqual(pack.normalizeZipCode(input), {
    ok: true,
    postal_code: canonical,
  });
}
for (const rejected of ["", "1234", "123456", "12345-123", "12345-12345", "12345 6789", "ABCDE", "1O001"]) {
  assert.deepEqual(pack.normalizeZipCode(rejected), {
    ok: false,
    error: "INVALID_US_ZIP",
  });
}

const US_PHONE = "+12133734253";
for (const formatted of [
  US_PHONE,
  "+1 213 373 4253",
  "1 213 373 4253",
  "213-373-4253",
  "(213) 373-4253",
  "213.373.4253",
  "2133734253",
]) {
  assert.deepEqual(pack.normalizeBusinessPhone(formatted), {
    ok: true,
    phone: US_PHONE,
  });
  assert.deepEqual(pack.normalizeMobilePhone(formatted), {
    ok: true,
    phone: US_PHONE,
  });
}

for (const nonUsOfNANP of ["+14162564567", "+1 416 256 4567", "+18765551234"]) {
  assert.deepEqual(pack.normalizeBusinessPhone(nonUsOfNANP), {
    ok: false,
    error: "INVALID_US_PHONE",
  });
}
for (const invalid of [
  "+996555123456",
  "+70000000000",
  "1234",
  "0000000000",
  "213-373-4253 ext. 10",
  "call 213-373-4253",
  "++12133734253",
  "213-373-4253#100",
]) {
  assert.deepEqual(pack.normalizeBusinessPhone(invalid), {
    ok: false,
    error: "INVALID_US_PHONE",
  });
}
for (const missing of ["", " ", null, undefined]) {
  assert.deepEqual(pack.normalizeMobilePhone(missing), {
    ok: false,
    error: "PHONE_REQUIRED",
  });
}

const registered = listCountryPacks();
assert.deepEqual(registered.map(item => item.code), ["US", "KZ", "KG"]);
assert.equal(getCountryPack("KG", "1").default_timezone, "Asia/Bishkek");
assert.equal(getCountryPack("KZ", "1").default_timezone, "Asia/Almaty");
assert.deepEqual(getCountryPack("KG", "1").normalizeMobilePhone("0555 123 456"), {
  ok: true,
  phone: "+996555123456",
});
assert.throws(
  () => getCountryPack("US", "2"),
  error => error.code === "COUNTRY_PACK_NOT_FOUND",
);

console.log("US01_COUNTRY_PACK_UNIT=PASS", JSON.stringify({
  states_and_dc: US_STATE_CODES.length,
  us_phone_formats_checked: 7,
  non_us_nanp_rejected: 3,
  usa_default_locale: pack.default_locale,
  usa_default_currency: pack.default_currency,
  requires_location_timezone: pack.requires_location_timezone,
  preserved_country_packs: ["KG@1", "KZ@1"],
}));
