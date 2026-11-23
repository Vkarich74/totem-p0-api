// Run only against an ISOLATED local PostgreSQL database named g5_queue_test.
// Requires G5_TEST_DATABASE_URL; never uses the Production DATABASE_URL.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { enqueueJob } from "../utils/enqueueJob.js";
import { runQueueWorker } from "../jobs/queueWorker.js";

const conn = process.env.G5_TEST_DATABASE_URL;
if (!conn) throw new Error("G5_ISOLATED_POSTGRES_REQUIRED");
const target = new URL(conn);
if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    target.pathname !== "/g5_queue_test") {
  throw new Error("G5_TEST_REFUSES_NON_LOCAL_OR_PRODUCTION_DATABASE");
}
const db = new pg.Pool({ connectionString: conn, max: 5 });

before(async () => {
  const { rows } = await db.query("SELECT current_database() AS db");
  assert.equal(rows[0].db, "g5_queue_test");
});
beforeEach(async () => {
  await db.query("DELETE FROM public.async_jobs WHERE job_type LIKE 'g5_%'");
});
after(async () => { await db.end(); });

test("partial UNIQUE matches ON CONFLICT and duplicates are not enqueued", async () => {
  const a = await enqueueJob({ dbClient: db, job_type: "g5_queue",
    payload: { request_id: 12 }, idempotency_key: "same-core-request" });
  const b = await enqueueJob({ dbClient: db, job_type: "g5_queue",
    payload: { request_id: 12 }, idempotency_key: "same-core-request" });
  assert.equal(a.enqueued, true);
  assert.equal(b.enqueued, false);
  const r = await db.query("SELECT count(*)::int AS count FROM public.async_jobs WHERE job_type='g5_queue'");
  assert.equal(r.rows[0].count, 1);
});

test("producer joins canonical business transaction and rollback", async () => {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await enqueueJob({ dbClient: c, job_type: "g5_rollback",
      payload: { req_id: 17 }, idempotency_key: "rollback-17" });
    await c.query("ROLLBACK");
  } finally { c.release(); }
  const r = await db.query("SELECT count(*)::int AS count FROM public.async_jobs WHERE job_type='g5_rollback'");
  assert.equal(r.rows[0].count, 0);
});

test("US logical job requires stable idempotency key", async () => {
  await assert.rejects(() => enqueueJob({ dbClient: db, job_type: "us_opening_provision",
    payload: { request_id: 5 } }), /REQUIRES_STABLE/);
});

test("parallel workers lock one job only; unknown jobs remain untouched", async () => {
  await enqueueJob({ dbClient: db, job_type: "g5_parallel", payload: { id: 1 },
    idempotency_key: "test-parallel" });
  await enqueueJob({ dbClient: db, job_type: "g5_unknown", payload: { id: 2 },
    idempotency_key: "other" });
  let calls = 0;
  const handlers = { g5_parallel: async () => { calls++; await delay(120); } };
  const [a, b] = await Promise.all([
    runQueueWorker({ db, limit: 1, handlers, leaseMs: 1200 }),
    runQueueWorker({ db, limit: 1, handlers, leaseMs: 1200 }),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.claimed + b.claimed, 1);
  const r = await db.query("SELECT job_type,status FROM public.async_jobs ORDER BY id");
  assert.equal(r.rows.find(x => x.job_type === "g5_parallel").status, "done");
  assert.equal(r.rows.find(x => x.job_type === "g5_unknown").status, "pending");
});

test("expired lease safely reclaimed without changing other markets", async () => {
  await enqueueJob({ dbClient: db, job_type: "g5_reclaim", payload: { id: 1 },
    idempotency_key: "recover" });
  await db.query(`UPDATE public.async_jobs SET status='processing',
    attempts=1, lease_token=gen_random_uuid(), lease_until=now()-interval '5 seconds'
    WHERE job_type='g5_reclaim'`);
  let calls = 0;
  const r = await runQueueWorker({ db, handlers: {
    g5_reclaim: async () => { calls++; },
  } });
  assert.equal(calls, 1);
  assert.equal(r.done, 1);
  const state = await db.query("SELECT status,attempts FROM public.async_jobs WHERE job_type='g5_reclaim'");
  assert.equal(state.rows[0].status, "done");
  assert.equal(state.rows[0].attempts, 2);
});

test("handler errors retry safely then stop at max_attempts", async () => {
  await enqueueJob({ dbClient: db, job_type: "g5_fail", payload: { id: 1 },
    idempotency_key: "fail", max_attempts: 2 });
  const handlers = { g5_fail: async () => { throw Object.assign(new Error("secret"), { code: "EXPECTED_FAILURE" }); } };
  const first = await runQueueWorker({ db, handlers });
  assert.equal(first.retried, 1);
  const queued = await db.query("SELECT status,attempts,last_error FROM public.async_jobs WHERE job_type='g5_fail'");
  assert.equal(queued.rows[0].status, "pending");
  assert.equal(queued.rows[0].attempts, 1);
  assert.equal(queued.rows[0].last_error, "EXPECTED_FAILURE");
  await db.query("UPDATE public.async_jobs SET run_at = (now() AT TIME ZONE 'UTC')-interval '1 second' WHERE job_type='g5_fail'");
  const second = await runQueueWorker({ db, handlers });
  assert.equal(second.failed, 1);
  const ended = await db.query("SELECT status,attempts FROM public.async_jobs WHERE job_type='g5_fail'");
  assert.deepEqual([ended.rows[0].status, ended.rows[0].attempts], ["failed", 2]);
});

test("heartbeat protects a long-running handler from duplicate claims", async () => {
  await enqueueJob({ dbClient: db, job_type: "g5_heartbeat",
    payload: { id: 1 }, idempotency_key: "heartbeat" });
  let calls = 0;
  const handler = async () => { calls++; await delay(2400); };
  const w1 = runQueueWorker({ db, limit: 1, leaseMs: 1100,
    handlers: { g5_heartbeat: handler } });
  await delay(1700);
  const w2 = await runQueueWorker({ db, limit: 1, leaseMs: 1100,
    handlers: { g5_heartbeat: handler } });
  const first = await w1;
  assert.equal(first.done, 1);
  assert.equal(w2.claimed, 0);
  assert.equal(calls, 1);
});
