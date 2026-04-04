import { ensureReservationTable } from "../services/provision/slugReservation.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildCheck(name, ok, details = {}) {
  return {
    name,
    ok: Boolean(ok),
    details,
  };
}

async function fetchJson(baseUrl, path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  const text = await response.text();
  const json = parseJsonSafe(text);

  return {
    status: response.status,
    ok: response.ok,
    json,
    text,
  };
}

function assertProvisionContract(flow, json) {
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

  const missing = required.filter((key) => !(key in (json || {})));

  return buildCheck(`${flow}_contract`, missing.length === 0, {
    missing,
    flow,
  });
}

function pickSalonSlug(json) {
  return (
    json?.canonical_slug ||
    json?.slug ||
    json?.result?.salon?.slug ||
    json?.result?.slug ||
    null
  );
}

function pickMasterSlug(json) {
  return (
    json?.canonical_slug ||
    json?.slug ||
    json?.result?.master?.slug ||
    json?.result?.slug ||
    null
  );
}

async function runProvisionFlowChecks({ baseUrl, token }) {
  const stamp = Date.now();
  const salonSlug = `validation-salon-${stamp}`;
  const masterSlug = `validation-master-${stamp}`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: token,
  };

  const salonPayload = {
    email: `${salonSlug}@test.local`,
    name: "Validation Owner",
    salon_name: `Validation Salon ${stamp}`,
    salon_slug: salonSlug,
    phone: "+996555000111",
    city: "Bishkek",
    description: "Validation flow",
    requested_role: "salon_admin",
  };

  const salonResponse = await fetchJson(baseUrl, "/internal/provision/salons", {
    method: "POST",
    headers,
    body: JSON.stringify(salonPayload),
  });

  const masterPayload = {
    email: `${masterSlug}@test.local`,
    name: `Validation Master ${stamp}`,
    master_slug: masterSlug,
    requested_role: "master",
    password_hash: "validation_password_hash",
  };

  const masterResponse = await fetchJson(baseUrl, "/internal/provision/masters", {
    method: "POST",
    headers,
    body: JSON.stringify(masterPayload),
  });

  let bindResponse = null;
  let activateResponse = null;

  const createdSalonSlug = pickSalonSlug(salonResponse.json);
  const createdMasterSlug = pickMasterSlug(masterResponse.json);

  if (salonResponse.json?.ok && masterResponse.json?.ok && createdSalonSlug && createdMasterSlug) {
    bindResponse = await fetchJson(baseUrl, "/internal/provision/bind", {
      method: "POST",
      headers,
      body: JSON.stringify({
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
      }),
    });

    if (bindResponse.json?.ok) {
      activateResponse = await fetchJson(baseUrl, "/internal/provision/bind/activate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          salon_slug: createdSalonSlug,
          master_slug: createdMasterSlug,
          accept_contract: true,
        }),
      });
    }
  }

  const checks = [
    buildCheck("provision_create_salon_http", salonResponse.status === 200 && salonResponse.json?.ok === true, {
      status: salonResponse.status,
      body: salonResponse.json || salonResponse.text,
    }),
    assertProvisionContract("create_salon", salonResponse.json),
    buildCheck("provision_create_master_http", masterResponse.status === 200 && masterResponse.json?.ok === true, {
      status: masterResponse.status,
      body: masterResponse.json || masterResponse.text,
    }),
    assertProvisionContract("create_master", masterResponse.json),
  ];

  if (bindResponse) {
    checks.push(
      buildCheck("provision_bind_http", bindResponse.status === 200 && bindResponse.json?.ok === true, {
        status: bindResponse.status,
        body: bindResponse.json || bindResponse.text,
      }),
      assertProvisionContract("bind_master_to_salon", bindResponse.json)
    );
  } else {
    checks.push(buildCheck("provision_bind_http", false, { reason: "bind_not_executed" }));
  }

  if (activateResponse) {
    checks.push(
      buildCheck("provision_activate_http", activateResponse.status === 200 && activateResponse.json?.ok === true, {
        status: activateResponse.status,
        body: activateResponse.json || activateResponse.text,
      }),
      assertProvisionContract("activate_master_salon", activateResponse.json)
    );
  } else {
    checks.push(buildCheck("provision_activate_http", false, { reason: "activate_not_executed" }));
  }

  return {
    ok: checks.every((item) => item.ok),
    checks,
    created: {
      salon_slug: createdSalonSlug,
      master_slug: createdMasterSlug,
    },
  };
}

async function validateDbChecks(db) {
  await ensureReservationTable(db);

  const tableExists = await db.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_name = 'slug_reservations'
     ) AS exists`
  );

  const reservationDuplicates = await db.query(
    `SELECT COUNT(*)::int AS duplicates_count
     FROM (
       SELECT owner_type, LOWER(slug), COUNT(*)::int AS c
       FROM slug_reservations
       WHERE status IN ('reserved', 'activated')
       GROUP BY owner_type, LOWER(slug)
       HAVING COUNT(*) > 1
     ) t`
  );

  const salonDuplicates = await db.query(
    `SELECT COUNT(*)::int AS duplicates_count
     FROM (
       SELECT LOWER(slug), COUNT(*)::int AS c
       FROM salons
       GROUP BY LOWER(slug)
       HAVING COUNT(*) > 1
     ) t`
  );

  const masterDuplicates = await db.query(
    `SELECT COUNT(*)::int AS duplicates_count
     FROM (
       SELECT LOWER(slug), COUNT(*)::int AS c
       FROM masters
       GROUP BY LOWER(slug)
       HAVING COUNT(*) > 1
     ) t`
  );

  const expiredReserved = await db.query(
    `SELECT COUNT(*)::int AS expired_reserved_count
     FROM slug_reservations
     WHERE status = 'reserved'
       AND expires_at <= NOW()`
  );

  const checks = [
    buildCheck("db_slug_reservations_table_exists", tableExists.rows[0]?.exists === true, {
      exists: tableExists.rows[0]?.exists === true,
    }),
    buildCheck("db_active_reservation_duplicates_zero", Number(reservationDuplicates.rows[0]?.duplicates_count || 0) === 0, {
      duplicates_count: Number(reservationDuplicates.rows[0]?.duplicates_count || 0),
    }),
    buildCheck("db_salon_slug_duplicates_zero", Number(salonDuplicates.rows[0]?.duplicates_count || 0) === 0, {
      duplicates_count: Number(salonDuplicates.rows[0]?.duplicates_count || 0),
    }),
    buildCheck("db_master_slug_duplicates_zero", Number(masterDuplicates.rows[0]?.duplicates_count || 0) === 0, {
      duplicates_count: Number(masterDuplicates.rows[0]?.duplicates_count || 0),
    }),
    buildCheck("db_expired_reserved_zero", Number(expiredReserved.rows[0]?.expired_reserved_count || 0) === 0, {
      expired_reserved_count: Number(expiredReserved.rows[0]?.expired_reserved_count || 0),
    }),
  ];

  return {
    ok: checks.every((item) => item.ok),
    checks,
  };
}

async function validateRouteChecks({ baseUrl, token, demoSalonSlug }) {
  const headers = {
    Authorization: token,
  };

  const health = await fetchJson(baseUrl, "/health");
  const internalSalon = await fetchJson(baseUrl, `/internal/salons/${encodeURIComponent(demoSalonSlug)}`, { headers });
  const internalWallet = await fetchJson(baseUrl, `/internal/salons/${encodeURIComponent(demoSalonSlug)}/wallet-balance`, { headers });

  const checks = [
    buildCheck("route_health_ok", health.status === 200 && health.json?.ok === true, {
      status: health.status,
      body: health.json || health.text,
    }),
    buildCheck("route_internal_salon_ok", internalSalon.status === 200 && internalSalon.json?.ok === true, {
      status: internalSalon.status,
      body: internalSalon.json || internalSalon.text,
    }),
    buildCheck("route_internal_wallet_ok", internalWallet.status === 200 && internalWallet.json?.ok === true, {
      status: internalWallet.status,
      body: internalWallet.json || internalWallet.text,
    }),
    buildCheck(
      "route_internal_wallet_has_billing_access",
      Boolean(internalWallet.json?.billing_access && typeof internalWallet.json.billing_access === "object"),
      {
        billing_access: internalWallet.json?.billing_access || null,
      }
    ),
  ];

  return {
    ok: checks.every((item) => item.ok),
    checks,
  };
}

async function validatePublicChecks({ baseUrl, demoSalonSlug }) {
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const to = toDate.toISOString().slice(0, 10);

  const profile = await fetchJson(baseUrl, `/public/salons/${encodeURIComponent(demoSalonSlug)}`);
  const bookings = await fetchJson(baseUrl, `/public/salons/${encodeURIComponent(demoSalonSlug)}/bookings`);
  const masters = await fetchJson(baseUrl, `/public/salons/${encodeURIComponent(demoSalonSlug)}/masters`);

  let availability = null;
  const firstMasterId = masters.json?.masters?.[0]?.id || null;

  if (firstMasterId) {
    availability = await fetchJson(
      baseUrl,
      `/public/salons/${encodeURIComponent(demoSalonSlug)}/masters/${encodeURIComponent(firstMasterId)}/availability?service_id=1&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
  }

  const checks = [
    buildCheck("public_profile_ok", profile.status === 200 && profile.json?.ok === true, {
      status: profile.status,
      body: profile.json || profile.text,
    }),
    buildCheck("public_bookings_ok", bookings.status === 200 && bookings.json?.ok === true, {
      status: bookings.status,
      body: bookings.json || bookings.text,
    }),
    buildCheck("public_masters_ok", masters.status === 200 && masters.json?.ok === true, {
      status: masters.status,
      body: masters.json || masters.text,
    }),
  ];

  if (availability) {
    const isAvailabilityOk =
      (availability.status === 200 && availability.json?.ok === true) ||
      (availability.status === 404 && availability.json?.error === "SERVICE_NOT_FOUND");

    checks.push(
      buildCheck("public_availability_ok", isAvailabilityOk, {
        status: availability.status,
        body: availability.json || availability.text,
      })
    );
  } else {
    checks.push(buildCheck("public_availability_ok", false, { reason: "master_not_found_for_demo_salon" }));
  }

  return {
    ok: checks.every((item) => item.ok),
    checks,
  };
}

export async function validateProvisionFlow({ db, baseUrl, token, demoSalonSlug = "totem-demo-salon" }) {
  const safeBaseUrl = normalizeText(baseUrl).replace(/\/$/, "");
  const safeToken = normalizeText(token);

  const dbChecks = await validateDbChecks(db);
  const routeChecks = await validateRouteChecks({
    baseUrl: safeBaseUrl,
    token: safeToken,
    demoSalonSlug,
  });
  const publicChecks = await validatePublicChecks({
    baseUrl: safeBaseUrl,
    demoSalonSlug,
  });
  const nonRegression = await runProvisionFlowChecks({
    baseUrl: safeBaseUrl,
    token: safeToken,
  });

  const checks = {
    db_checks: dbChecks,
    route_checks: routeChecks,
    public_access_checks: publicChecks,
    non_regression: nonRegression,
  };

  return {
    ok: Object.values(checks).every((section) => section.ok),
    ...checks,
  };
}
