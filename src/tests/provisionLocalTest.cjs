const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const BASE = process.env.TOTEM_PROVISION_BASE || "http://localhost:8080";
const TOKEN = process.env.TOTEM_PROVISION_TOKEN || "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3NzUyODIyMTl9.ZQEdncQ7gnaKlnCrooXe9XPiMmoYRWmfWd_eh6YaMQY";

function logStep(title, data) {
  console.log(`\n=== ${title} ===`);
  console.log(data);
}

function fail(message, data) {
  if (data) {
    console.error(data);
  }
  throw new Error(message);
}

function pickSalonSlug(response) {
  return (
    response?.canonical_slug ||
    response?.slug ||
    response?.result?.salon?.slug ||
    response?.result?.slug ||
    null
  );
}

function pickMasterSlug(response) {
  return (
    response?.canonical_slug ||
    response?.slug ||
    response?.result?.master?.slug ||
    response?.result?.slug ||
    null
  );
}

function assertResponseContract(flow, json) {
  const required = [
    "owner_type",
    "owner_id",
    "canonical_slug",
    "public_url",
    "cabinet_url",
    "lifecycle_state",
    "access_state",
    "readiness_flag",
    "meta",
  ];

  for (const key of required) {
    if (!(key in (json || {}))) {
      fail(`${flow.toUpperCase()}_MISSING_${key.toUpperCase()}`, json);
    }
  }

  if (typeof json.meta !== "object" || json.meta === null) {
    fail(`${flow.toUpperCase()}_META_INVALID`, json);
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  let json = null;
  try {
    json = JSON.parse(text);
  } catch (error) {
    fail(`NON_JSON_RESPONSE ${path}`, text);
  }

  return {
    status: res.status,
    json,
  };
}

async function run() {
  console.log("--- START PROVISION LOCAL TEST ---");

  const stamp = Date.now();

  const salonSlug = `test-salon-${stamp}`;
  const masterSlug = `test-master-${stamp}`;

  const salonEmail = `${salonSlug}@test.local`;
  const masterEmail = `${masterSlug}@test.local`;

  const salonPayload = {
    email: salonEmail,
    name: "Owner Test",
    salon_name: `Test Salon ${stamp}`,
    salon_slug: salonSlug,
    phone: "+996555000001",
    city: "Bishkek",
    description: "Local provision test",
    slogan: "Test slogan",
    requested_role: "salon_admin",
  };

  const salonRes = await post("/internal/provision/salons", salonPayload);
  logStep("CREATE SALON", salonRes.json);

  if (!salonRes.json?.ok) {
    fail("CREATE_SALON_FAILED", salonRes.json);
  }

  assertResponseContract("create_salon", salonRes.json);

  const createdSalonSlug = pickSalonSlug(salonRes.json);
  if (!createdSalonSlug) {
    fail("SALON_SLUG_MISSING_IN_RESPONSE", salonRes.json);
  }

  const masterPayload = {
    email: masterEmail,
    name: `Test Master ${stamp}`,
    master_slug: masterSlug,
    requested_role: "master",
    password_hash: "local_test_password_hash",
  };

  const masterRes = await post("/internal/provision/masters", masterPayload);
  logStep("CREATE MASTER", masterRes.json);

  if (!masterRes.json?.ok) {
    fail("CREATE_MASTER_FAILED", masterRes.json);
  }

  assertResponseContract("create_master", masterRes.json);

  const createdMasterSlug = pickMasterSlug(masterRes.json);
  if (!createdMasterSlug) {
    fail("MASTER_SLUG_MISSING_IN_RESPONSE", masterRes.json);
  }

  const bindPayload = {
    salon_slug: createdSalonSlug,
    master_slug: createdMasterSlug,
    bind_mode: "pending",
    create_contract: true,
    contract_terms: {
      master_percent: 70,
      salon_percent: 20,
      platform_percent: 10,
      payout_schedule: "manual",
    },
  };

  const bindRes = await post("/internal/provision/bind", bindPayload);
  logStep("BIND MASTER TO SALON", bindRes.json);

  if (!bindRes.json?.ok) {
    fail("BIND_FAILED", bindRes.json);
  }

  assertResponseContract("bind_master_to_salon", bindRes.json);

  const activatePayload = {
    salon_slug: createdSalonSlug,
    master_slug: createdMasterSlug,
    accept_contract: true,
  };

  const activateRes = await post("/internal/provision/bind/activate", activatePayload);
  logStep("ACTIVATE BIND", activateRes.json);

  if (!activateRes.json?.ok) {
    fail("ACTIVATE_BIND_FAILED", activateRes.json);
  }

  assertResponseContract("activate_master_salon", activateRes.json);

  const salonResult = salonRes.json?.result?.salon || {};
  const masterResult = masterRes.json?.result?.master || {};
  const bindResult = bindRes.json?.result || {};
  const activateResult = activateRes.json?.result || {};

  if (String(salonResult.slug || "") !== createdSalonSlug) {
    fail("SALON_RESPONSE_CONTRACT_INVALID", salonRes.json);
  }

  if (String(masterResult.slug || "") !== createdMasterSlug) {
    fail("MASTER_RESPONSE_CONTRACT_INVALID", masterRes.json);
  }

  if (!bindResult?.relation) {
    fail("BIND_RELATION_MISSING", bindRes.json);
  }

  if (!activateResult?.relation) {
    fail("ACTIVATE_RELATION_MISSING", activateRes.json);
  }

  console.log("\n--- TEST PASSED ---");
  console.log({
    salon_slug: createdSalonSlug,
    master_slug: createdMasterSlug,
  });
}

run().catch((error) => {
  console.error("\n--- TEST FAILED ---");
  console.error(error.message);
  process.exit(1);
});
