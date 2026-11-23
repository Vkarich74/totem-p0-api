// Source-correlation helper for the EXISTING Core owner_opening_requests.
// Not an endpoint, alternate registration system, CRM bridge, or payment grant.
// Must be wired only after a trusted server-side Odoo readback is implemented.
// The callback creates the normal Owner Opening request + moderation + audit.
const SOURCE_NAMESPACE = "odoo_online";

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`US_ODOO_PROOF_${label}_INVALID`);
  }
  return number;
}

function normalizeVerifiedProof(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("US_ODOO_VERIFIED_SOURCE_REQUIRED");
  }
  if (input.source_namespace !== SOURCE_NAMESPACE) {
    throw new Error("US_ODOO_SOURCE_NAMESPACE_INVALID");
  }
  const companyId = positiveInteger(input.company_id, "COMPANY");
  const websiteId = positiveInteger(input.website_id, "WEBSITE");
  const partnerId = positiveInteger(input.partner_id, "PARTNER");
  if (companyId !== 4 || websiteId !== 5) {
    throw new Error("US_ODOO_SOURCE_SCOPE_INVALID");
  }
  const sourceId = String(input.source_request_id ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sourceId)) {
    throw new Error("US_ODOO_SOURCE_REQUEST_ID_INVALID");
  }
  if (input.owner_type !== "salon" && input.owner_type !== "master") {
    throw new Error("US_ODOO_SOURCE_OWNER_TYPE_INVALID");
  }
  return Object.freeze({
    source_namespace: SOURCE_NAMESPACE,
    source_company_id: companyId,
    source_website_id: websiteId,
    source_partner_id: partnerId,
    source_request_id: sourceId,
    owner_type: input.owner_type,
  });
}

const GET_EXISTING = `
  SELECT id, status, source_partner_id
  FROM public.owner_opening_requests
  WHERE source_namespace = $1
    AND source_company_id = $2
    AND source_website_id = $3
    AND source_request_id = $4
    AND owner_type = $5
  FOR UPDATE
`;

export async function registerVerifiedUsOdooSource({
  pool,
  candidate,
  readVerifiedOdooSource,
  createExistingOpeningRequest,
} = {}) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("US_ODOO_POSTGRES_POOL_REQUIRED");
  }
  if (typeof readVerifiedOdooSource !== "function" ||
      typeof createExistingOpeningRequest !== "function") {
    throw new Error("US_ODOO_TRUSTED_CALLBACKS_REQUIRED");
  }

  // Never accept candidate payload as proof. T2 must perform authenticated
  // Odoo API readback and return an approved, role-scoped source identity.
  // The network readback deliberately occurs BEFORE the PostgreSQL lock.
  const proof = normalizeVerifiedProof(await readVerifiedOdooSource(candidate));
  const key = [
    proof.source_namespace, proof.source_company_id,
    proof.source_website_id, proof.source_request_id, proof.owner_type,
  ].join(":");
  const tuple = [
    proof.source_namespace, proof.source_company_id,
    proof.source_website_id, proof.source_request_id, proof.owner_type,
  ];

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // Serialize identical source/role attempts BEFORE creating business rows.
    // Hash collisions only serialize unrelated requests; UNIQUE is authority.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);

    const existing = await db.query(GET_EXISTING, tuple);
    if (existing.rows.length) {
      const record = existing.rows[0];
      if (Number(record.source_partner_id) !== proof.source_partner_id) {
        throw new Error("US_ODOO_SOURCE_PARTNER_MISMATCH");
      }
      await db.query("COMMIT");
      return Object.freeze({
        request_id: Number(record.id),
        status: record.status,
        duplicate: true,
        owner_type: proof.owner_type,
      });
    }

    // The callback MUST call the existing Core canonical request creation,
    // moderation and audit using the SAME db client, without BEGIN/COMMIT.
    const created = await createExistingOpeningRequest(db, proof);
    const requestId = Number(created?.id);
    if (!Number.isSafeInteger(requestId) || requestId <= 0) {
      throw new Error("US_ODOO_CANONICAL_REQUEST_NOT_CREATED");
    }

    const bound = await db.query(
      `UPDATE public.owner_opening_requests SET
         source_namespace = $2,
         source_company_id = $3,
         source_website_id = $4,
         source_request_id = $5,
         source_partner_id = $6,
         updated_at = NOW()
       WHERE id = $1 AND owner_type = $7
         AND source_namespace IS NULL AND source_company_id IS NULL
         AND source_request_id IS NULL
       RETURNING id, status`,
      [
        requestId, proof.source_namespace, proof.source_company_id,
        proof.source_website_id, proof.source_request_id,
        proof.source_partner_id, proof.owner_type,
      ],
    );
    if (bound.rows.length !== 1) {
      throw new Error("US_ODOO_CANONICAL_REQUEST_SOURCE_BIND_FAILED");
    }
    await db.query("COMMIT");
    return Object.freeze({
      request_id: requestId,
      status: bound.rows[0].status,
      duplicate: false,
      owner_type: proof.owner_type,
    });
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
