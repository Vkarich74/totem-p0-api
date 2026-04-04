(async () => {
  const assert = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };

  const { buildEntryAccessSnapshot } = await import("../services/entry/entryAccess.js");

  const active = buildEntryAccessSnapshot({
    owner_type: "salon",
    owner_id: 1,
    canonical_slug: "prod-test",
    lifecycle_state: "active",
    billing_state: "active"
  });

  assert(active.public_visible === true, "ACTIVE_PUBLIC_VISIBLE_FAILED");
  assert(active.access_state === "active", "ACTIVE_ACCESS_STATE_FAILED");

  const lifecycleDenied = buildEntryAccessSnapshot({
    owner_type: "salon",
    owner_id: 1,
    canonical_slug: "prod-test",
    lifecycle_state: "onboarding",
    billing_state: "active"
  });

  assert(lifecycleDenied.public_visible === false, "LIFECYCLE_DENY_VISIBLE_FAILED");
  assert(lifecycleDenied.deny_reason === "lifecycle_denied", "LIFECYCLE_DENY_REASON_FAILED");

  const billingDenied = buildEntryAccessSnapshot({
    owner_type: "master",
    owner_id: 2,
    canonical_slug: "master-prod",
    lifecycle_state: "active",
    billing_state: "blocked"
  });

  assert(billingDenied.public_visible === false, "BILLING_DENY_VISIBLE_FAILED");
  assert(billingDenied.deny_reason === "billing_denied", "BILLING_DENY_REASON_FAILED");

  const missingBilling = buildEntryAccessSnapshot({
    owner_type: "master",
    owner_id: 2,
    canonical_slug: "master-prod",
    lifecycle_state: "active",
    billing_state: "none"
  });

  assert(missingBilling.public_visible === false, "MISSING_BILLING_VISIBLE_FAILED");
  assert(missingBilling.access_state === "billing_missing", "MISSING_BILLING_ACCESS_STATE_FAILED");

  console.log("ENTRY_ACCESS_SNAPSHOT_TEST: OK");
})();
