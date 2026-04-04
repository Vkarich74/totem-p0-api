function normalizeText(value){
  return String(value || "").trim();
}

function buildConsumers(){
  return [
    "control_panel",
    "odoo_multisite",
    "onboarding_dashboard",
    "future_personal_links",
    "future_qr_issuance_ui"
  ];
}

function buildKnownLimits(){
  return [
    "no_personal_links_v1",
    "no_magic_links_v1",
    "no_passwordless_login_v1",
    "no_qr_auto_login_v1",
    "no_batch_qr_generation_v1",
    "no_qr_analytics_v1",
    "no_odoo_auto_placement_v1"
  ];
}

function buildRouteMap(contract = {}){
  return {
    entry_metadata_route: `/internal/entry/${contract.owner_type}/${contract.canonical_slug}`,
    qr_payload_route: `/internal/entry/${contract.owner_type}/${contract.canonical_slug}/qr-payload`,
    qr_png_route: `/internal/entry/${contract.owner_type}/${contract.canonical_slug}/qr.png`,
    auth_snapshot_route: `/internal/entry/${contract.owner_type}/${contract.canonical_slug}/auth`,
    validation_route: `/internal/entry/${contract.owner_type}/${contract.canonical_slug}/validate`,
    cabinet_route: `/internal/entry/${contract.owner_type}/${contract.canonical_slug}/cabinet`,
    handoff_route: `/internal/entry/${contract.owner_type}/${contract.canonical_slug}/handoff`
  };
}

export function buildEntryHandoffPackage(resolvedEntry, authSnapshot = null, validationSnapshot = null){
  const contract = resolvedEntry?.contract || null;

  if(!contract){
    const err = new Error("ENTRY_CONTRACT_REQUIRED");
    err.code = "ENTRY_CONTRACT_REQUIRED";
    throw err;
  }

  const ownerType = normalizeText(contract.owner_type).toLowerCase();
  const canonicalSlug = normalizeText(contract.canonical_slug).toLowerCase();

  if(!ownerType || !canonicalSlug){
    const err = new Error("ENTRY_HANDOFF_INVALID_CONTRACT");
    err.code = "ENTRY_HANDOFF_INVALID_CONTRACT";
    throw err;
  }

  return {
    version: "v1",
    block: "IDENTITY_ENTRY_QR_AUTH",
    status: "handoff_ready",
    owner_type: contract.owner_type,
    owner_id: contract.owner_id,
    canonical_slug: contract.canonical_slug,
    builders: {
      public_url_builder: "buildPublicUrl",
      cabinet_url_builder: "buildCabinetUrl",
      public_absolute_url_builder: "buildPublicAbsoluteUrl",
      cabinet_absolute_url_builder: "buildCabinetAbsoluteUrl",
      auth_login_url_builder: "buildAuthLoginUrl",
      entry_contract_builder: "buildEntryContract"
    },
    routes: buildRouteMap(contract),
    contract: {
      public_url: contract.public_url,
      public_absolute_url: contract.public_absolute_url,
      cabinet_url: contract.cabinet_url,
      cabinet_absolute_url: contract.cabinet_absolute_url,
      auth_login_url: contract.auth_login_url,
      auth_login_absolute_url: contract.auth_login_absolute_url,
      entry_mode: contract.entry_mode,
      lifecycle_state: contract.lifecycle_state,
      access_state: contract.access_state,
      entry_allowed: contract.entry_allowed,
      qr_allowed: contract.qr_allowed,
      ready_to_open: contract.ready_to_open,
      auth_required_for_cabinet: contract.auth_required_for_cabinet
    },
    auth: authSnapshot ? {
      authenticated: Boolean(authSnapshot.authenticated),
      authorized: Boolean(authSnapshot.authorized),
      can_open_cabinet: Boolean(authSnapshot.can_open_cabinet),
      deny_code: authSnapshot.deny_code || null,
      post_auth_redirect_url: authSnapshot.post_auth_redirect_url,
      post_auth_redirect_absolute_url: authSnapshot.post_auth_redirect_absolute_url
    } : null,
    validation: validationSnapshot ? {
      contract_shape_ok: Boolean(validationSnapshot.contract_shape_ok),
      expected_http: validationSnapshot.expected_http,
      policy: validationSnapshot.policy,
      expected_payloads: validationSnapshot.expected_payloads
    } : null,
    policy: {
      identity_source_of_truth: "canonical_slug",
      public_access_source_of_truth: "existing_public_access_layer",
      qr_role: "identifier_only",
      qr_payload_source: "canonical_public_absolute_url",
      cabinet_auth_required: true,
      direct_cabinet_via_qr_allowed: false,
      deny_by_default: true
    },
    consumers: buildConsumers(),
    known_limits_v1: buildKnownLimits()
  };
}

export default {
  buildEntryHandoffPackage
};
