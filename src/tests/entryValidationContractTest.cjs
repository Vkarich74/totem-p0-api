const assert = require("assert");

(async () => {
  const entryContract = await import("../services/entry/entryContract.js");
  const entryValidation = await import("../services/entry/entryValidation.js");
  const entryAuth = await import("../services/entry/entryAuth.js");

  const baseUrl = "https://www.totemv.com";
  const contract = entryContract.buildEntryContract({
    owner_type: "salon",
    owner_id: 21,
    canonical_slug: "prod-test",
    lifecycle_state: "active",
    access_state: "active"
  }, {
    public_visible: true,
    lifecycle_state: "active",
    access_state: "active"
  }, baseUrl);

  const resolved = { contract };
  const auth = entryAuth.buildCabinetAuthSnapshot(resolved, { user_id: 1, role: "system" }, {}, baseUrl);
  const validation = entryValidation.buildEntryValidationSnapshot(resolved, auth, baseUrl);

  assert.strictEqual(validation.contract_shape_ok, true);
  assert.strictEqual(validation.expected_http.entry_metadata_status, 200);
  assert.strictEqual(validation.expected_http.qr_payload_status, 200);
  assert.strictEqual(validation.expected_http.qr_png_status, 200);
  assert.strictEqual(validation.expected_http.auth_snapshot_status, 200);
  assert.strictEqual(validation.expected_http.cabinet_status_without_auth, 403);
  assert.strictEqual(validation.expected_http.cabinet_status_with_auth, 200);
  assert.strictEqual(validation.expected_payloads.qr_payload, "https://www.totemv.com/salon/prod-test");
  assert.strictEqual(validation.policy.auth_required_for_cabinet, true);

  const deniedContract = entryContract.buildEntryContract({
    owner_type: "master",
    owner_id: 7,
    canonical_slug: "blocked-master",
    lifecycle_state: "blocked",
    access_state: "blocked"
  }, {
    public_visible: false,
    lifecycle_state: "blocked",
    access_state: "blocked"
  }, baseUrl);

  const deniedValidation = entryValidation.buildEntryValidationSnapshot({ contract: deniedContract }, null, baseUrl);
  assert.strictEqual(deniedValidation.contract_shape_ok, true);
  assert.strictEqual(deniedValidation.expected_http.entry_metadata_status, 403);
  assert.strictEqual(deniedValidation.expected_http.qr_payload_status, 403);
  assert.strictEqual(deniedValidation.expected_http.qr_png_status, 403);
  assert.strictEqual(deniedValidation.expected_http.cabinet_status_without_auth, 403);

  console.log("ENTRY_VALIDATION_CONTRACT_TEST: OK");
})().catch((err) => {
  console.error("ENTRY_VALIDATION_CONTRACT_TEST: FAIL");
  console.error(err);
  process.exit(1);
});
