(async () => {
  const assert = (condition, message) => {
    if(!condition){
      throw new Error(message);
    }
  };

  const {
    buildPublicUrl,
    buildCabinetUrl,
    buildPublicAbsoluteUrl,
    buildCabinetAbsoluteUrl,
    buildAuthLoginUrl,
    buildEntryContract
  } = await import("../services/entry/entryContract.js");

  const baseUrl = "https://www.totemv.com/";

  assert(buildPublicUrl("salon", "prod-test") === "/salon/prod-test", "SALON_PUBLIC_URL_FAILED");
  assert(buildPublicUrl("master", "master-prod") === "/master/master-prod", "MASTER_PUBLIC_URL_FAILED");
  assert(buildCabinetUrl("salon", "prod-test") === "#/salon/prod-test", "SALON_CABINET_URL_FAILED");
  assert(buildCabinetUrl("master", "master-prod") === "#/master/master-prod", "MASTER_CABINET_URL_FAILED");
  assert(buildPublicAbsoluteUrl("salon", "prod-test", baseUrl) === "https://www.totemv.com/salon/prod-test", "PUBLIC_ABSOLUTE_URL_FAILED");
  assert(buildCabinetAbsoluteUrl("master", "master-prod", baseUrl) === "https://www.totemv.com/#/master/master-prod", "CABINET_ABSOLUTE_URL_FAILED");

  const authUrls = buildAuthLoginUrl("salon", "prod-test", baseUrl);
  assert(authUrls.auth_login_url === "/auth/login?owner_type=salon&slug=prod-test", "AUTH_LOGIN_URL_FAILED");
  assert(authUrls.auth_login_absolute_url === "https://www.totemv.com/auth/login?owner_type=salon&slug=prod-test", "AUTH_LOGIN_ABSOLUTE_URL_FAILED");

  const contract = buildEntryContract(
    {
      owner_type: "salon",
      owner_id: 21,
      canonical_slug: "prod-test",
      lifecycle_state: "active",
      access_state: "active"
    },
    {
      public_visible: true,
      lifecycle_state: "active",
      access_state: "active"
    },
    baseUrl
  );

  assert(contract.public_url === "/salon/prod-test", "ENTRY_PUBLIC_URL_FAILED");
  assert(contract.public_absolute_url === "https://www.totemv.com/salon/prod-test", "ENTRY_PUBLIC_ABSOLUTE_URL_FAILED");
  assert(contract.cabinet_absolute_url === "https://www.totemv.com/#/salon/prod-test", "ENTRY_CABINET_ABSOLUTE_URL_FAILED");
  assert(contract.auth_required_for_cabinet === true, "ENTRY_AUTH_REQUIRED_FAILED");
  assert(contract.entry_allowed === true, "ENTRY_ALLOWED_FAILED");
  assert(contract.qr_allowed === true, "QR_ALLOWED_FAILED");

  let invalidOwnerTypeCaught = false;
  try{
    buildPublicUrl("user", "prod-test");
  }catch(err){
    invalidOwnerTypeCaught = err.code === "INVALID_OWNER_TYPE";
  }
  assert(invalidOwnerTypeCaught, "INVALID_OWNER_TYPE_NOT_REJECTED");

  let invalidSlugCaught = false;
  try{
    buildPublicUrl("salon", "Prod Test");
  }catch(err){
    invalidSlugCaught = err.code === "INVALID_CANONICAL_SLUG";
  }
  assert(invalidSlugCaught, "INVALID_SLUG_NOT_REJECTED");

  console.log("ENTRY_URL_BUILDER_TEST: OK");
})();
