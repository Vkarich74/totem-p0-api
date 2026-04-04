(async () => {
  const assert = (condition, message) => {
    if(!condition){
      throw new Error(message);
    }
  };

  const { buildCabinetAuthSnapshot, hasCabinetOwnerAccess } = await import("../services/entry/entryAuth.js");

  const resolvedEntry = {
    contract: {
      owner_type: "salon",
      owner_id: 21,
      canonical_slug: "prod-test",
      cabinet_url: "#/salon/prod-test",
      cabinet_absolute_url: "https://www.totemv.com/#/salon/prod-test"
    }
  };

  const anonymous = buildCabinetAuthSnapshot(resolvedEntry, null, null, "https://www.totemv.com");
  assert(anonymous.authenticated === false, "ANON_AUTHENTICATED_FAILED");
  assert(anonymous.can_open_cabinet === false, "ANON_CAN_OPEN_FAILED");
  assert(anonymous.deny_code === "AUTH_REQUIRED", "ANON_DENY_CODE_FAILED");

  const ownerAuth = { user_id: 7, role: "owner" };
  const ownerIdentity = { salons: [21], masters: [], ownership: [{ owner_type: "salon", owner_id: 21 }] };
  assert(hasCabinetOwnerAccess(ownerAuth, ownerIdentity, "salon", 21) === true, "OWNER_ACCESS_FAILED");

  const ownerAllowed = buildCabinetAuthSnapshot(resolvedEntry, ownerAuth, ownerIdentity, "https://www.totemv.com");
  assert(ownerAllowed.authenticated === true, "OWNER_AUTHENTICATED_FAILED");
  assert(ownerAllowed.authorized === true, "OWNER_AUTHORIZED_FAILED");
  assert(ownerAllowed.can_open_cabinet === true, "OWNER_CAN_OPEN_FAILED");
  assert(ownerAllowed.post_auth_redirect_absolute_url === "https://www.totemv.com/#/salon/prod-test", "OWNER_REDIRECT_FAILED");

  const foreignAuth = { user_id: 8, role: "owner" };
  const foreignIdentity = { salons: [22], masters: [], ownership: [{ owner_type: "salon", owner_id: 22 }] };
  const foreignDenied = buildCabinetAuthSnapshot(resolvedEntry, foreignAuth, foreignIdentity, "https://www.totemv.com");
  assert(foreignDenied.authenticated === true, "FOREIGN_AUTHENTICATED_FAILED");
  assert(foreignDenied.authorized === false, "FOREIGN_AUTHORIZED_FAILED");
  assert(foreignDenied.deny_code === "CABINET_ACCESS_DENIED", "FOREIGN_DENY_CODE_FAILED");

  const systemAllowed = buildCabinetAuthSnapshot(resolvedEntry, { user_id: 1, role: "system" }, { salons: [], masters: [], ownership: [] }, "https://www.totemv.com");
  assert(systemAllowed.can_open_cabinet === true, "SYSTEM_CAN_OPEN_FAILED");

  console.log("ENTRY_AUTH_CONTRACT_TEST: OK");
})();
