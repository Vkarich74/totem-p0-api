const assert = require("assert");

(async () => {
  const entryContract = await import("../services/entry/entryContract.js");
  const entryAuth = await import("../services/entry/entryAuth.js");
  const entryValidation = await import("../services/entry/entryValidation.js");
  const entryHandoff = await import("../services/entry/entryHandoff.js");

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
  const handoff = entryHandoff.buildEntryHandoffPackage(resolved, auth, validation);

  assert.strictEqual(handoff.version, "v1");
  assert.strictEqual(handoff.status, "handoff_ready");
  assert.strictEqual(handoff.routes.handoff_route, "/internal/entry/salon/prod-test/handoff");
  assert.strictEqual(handoff.contract.public_absolute_url, "https://www.totemv.com/salon/prod-test");
  assert.strictEqual(handoff.policy.qr_role, "identifier_only");
  assert.strictEqual(handoff.policy.cabinet_auth_required, true);
  assert.strictEqual(handoff.validation.contract_shape_ok, true);
  assert.strictEqual(Array.isArray(handoff.consumers), true);
  assert.strictEqual(Array.isArray(handoff.known_limits_v1), true);
  assert.strictEqual(handoff.auth.can_open_cabinet, true);

  console.log("ENTRY_HANDOFF_PACKAGE_TEST: OK");
})().catch((err) => {
  console.error("ENTRY_HANDOFF_PACKAGE_TEST: FAIL");
  console.error(err);
  process.exit(1);
});
