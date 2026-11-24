// Isolated PostgreSQL only; no Production env, no Odoo network, no CRM.
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { registerVerifiedUsOdooSource } from
  "../src/services/provision/usOdooSourceRegistration.js";

const url = process.env.G5_TEST_DATABASE_URL;
if (!url) throw new Error("G5_TEST_DATABASE_URL_REQUIRED");
const target = new URL(url);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname) ||
    target.pathname !== "/g5_queue_test") {
  throw new Error("G5_ISOLATED_POSTGRES_ONLY");
}
const db = new pg.Pool({ connectionString: url, max: 25 });
before(async () => {
  const r = await db.query("SELECT current_database() AS name");
  assert.equal(r.rows[0].name, "g5_queue_test");
});
beforeEach(async () => {
  await db.query("DELETE FROM public.owner_opening_requests");
});
after(async () => { await db.end(); });

function verified(sourceId, ownerType = "salon", partnerId = 41) {
  return {
    source_namespace: "odoo_online",
    company_id: 4,
    website_id: 5,
    partner_id: partnerId,
    source_request_id: sourceId,
    owner_type: ownerType,
  };
}
let createdCount = 0;
async function createNormal(dbClient, proof) {
  createdCount++;
  const r = await dbClient.query(
    `INSERT INTO public.owner_opening_requests (owner_type, status,name,email)
     VALUES ($1, 'validated','fixture','fixture@example.invalid') RETURNING id, status`,
    [proof.owner_type],
  );
  return r.rows[0];
}
function register(candidate, readVerifiedOdooSource = async c => c, create = createNormal) {
  return registerVerifiedUsOdooSource({
    pool: db, candidate, readVerifiedOdooSource,
    createExistingOpeningRequest: create,
  });
}

test("same approved Odoo source + role is one Core request", async () => {
  createdCount = 0;
  const a = await register(verified("3001"));
  const b = await register(verified("3001"));
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(b.request_id, a.request_id);
  assert.equal(createdCount, 1);
  const count = await db.query("SELECT count(*)::int AS n FROM public.owner_opening_requests");
  assert.equal(count.rows[0].n, 1);
});

test("50 concurrent repeated Odoo notifications create one request", async () => {
  createdCount = 0;
  const results = await Promise.all(Array.from({ length: 50 },
    () => register(verified("3010"))));
  assert.equal(new Set(results.map(x => x.request_id)).size, 1);
  assert.equal(results.filter(x => !x.duplicate).length, 1);
  assert.equal(createdCount, 1);
});

test("one own-salon source gives distinct legal salon/master Core requests", async () => {
  createdCount = 0;
  const salon = await register(verified("3020", "salon"));
  const master = await register(verified("3020", "master"));
  assert.notEqual(salon.request_id, master.request_id);
  assert.equal(master.duplicate, false);
  assert.equal(createdCount, 2);
});

test("partner mismatch on identical source role is blocked", async () => {
  await register(verified("3030", "salon", 41));
  await assert.rejects(
    () => register(verified("3030", "salon", 42)),
    /SOURCE_PARTNER_MISMATCH/,
  );
  const rows = await db.query("SELECT source_partner_id FROM public.owner_opening_requests");
  assert.equal(Number(rows.rows[0].source_partner_id), 41);
});

test("failed canonical creation rolls back without orphan source", async () => {
  await assert.rejects(
    () => register(verified("3040"), async c => c, async (dbc, proof) => {
      await createNormal(dbc, proof);
      throw new Error("SIMULATED_MODERATION_FAILURE");
    }),
    /SIMULATED_MODERATION_FAILURE/,
  );
  const count = await db.query("SELECT count(*)::int AS n FROM public.owner_opening_requests");
  assert.equal(count.rows[0].n, 0);
  const good = await register(verified("3040"));
  assert.equal(good.duplicate, false);
});

test("unverified callbacks are forbidden and mismatched scope is rejected", async () => {
  await assert.rejects(
    () => registerVerifiedUsOdooSource({
      pool: db, candidate: verified("3050"),
      createExistingOpeningRequest: createNormal,
    }),
    /TRUSTED_CALLBACKS_REQUIRED/,
  );
  await assert.rejects(
    () => register({ ...verified("3051"), company_id: 1 }),
    /SOURCE_SCOPE_INVALID/,
  );
  await assert.rejects(
    () => register({ ...verified("3052"), owner_type: "salon_admin" }),
    /SOURCE_OWNER_TYPE_INVALID/,
  );
});

test("failed source readback performs no local DB registration", async () => {
  await assert.rejects(
    () => register(verified("3060"), async () => {
      throw new Error("ODOO_READBACK_UNAVAILABLE");
    }),
    /READBACK_UNAVAILABLE/,
  );
  const r = await db.query("SELECT count(*)::int AS n FROM public.owner_opening_requests");
  assert.equal(r.rows[0].n, 0);
});

test("legacy un-attributed Odoo request is untouched by source uniqueness", async () => {
  const historical = await db.query(
    `INSERT INTO public.owner_opening_requests(owner_type,status,precheck_result_json,name,email)
     VALUES ('salon','validated',$1::jsonb,'fixture','fixture@example.invalid') RETURNING id`,
    [JSON.stringify({ source: "odoo_core_form", odoo_request_id: "3070" })],
  );
  const newer = await register(verified("3070"));
  assert.notEqual(newer.request_id, Number(historical.rows[0].id));
  const old = await db.query(
    "SELECT source_namespace FROM public.owner_opening_requests WHERE id=$1",
    [historical.rows[0].id],
  );
  assert.equal(old.rows[0].source_namespace, null);
});

test("database unique index protects against uncoordinated same-source inserts", async () => {
  const source = verified("3080");
  await register(source);
  await assert.rejects(
    () => db.query(
      `INSERT INTO public.owner_opening_requests
       (owner_type,status,source_namespace,source_company_id,source_website_id,
        source_partner_id,source_request_id,name,email)
       VALUES ('salon','validated','odoo_online',4,5,41,'3080','fixture','fixture@example.invalid')`,
    ),
    error => error.code === "23505",
  );
});

test("migration cannot store incomplete source tuple", async () => {
  await assert.rejects(
    () => db.query(
      `INSERT INTO public.owner_opening_requests
       (owner_type,status,source_namespace,source_request_id,name,email)
       VALUES ('master','validated','odoo_online','3090','fixture','fixture@example.invalid')`,
    ),
    error => error.code === "23514",
  );
});
