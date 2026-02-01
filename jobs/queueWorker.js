// jobs/queueWorker.js
import pool from "../db/index.js";

/**
 * Process async jobs (DB-backed queue)
 */
export async function runQueueWorker({ limit = 5 } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      SELECT *
      FROM async_jobs
      WHERE status = 'pending'
        AND run_at <= now()
      ORDER BY id
      LIMIT $1
      FOR UPDATE SKIP LOCKED
      `,
      [limit]
    );

    for (const job of rows) {
      try {
        // === DISPATCH ===
        if (job.job_type === "example_log") {
          console.log("[ASYNC_JOB]", job.payload);
        } else {
          throw new Error("UNKNOWN_JOB_TYPE");
        }

        await client.query(
          `
          UPDATE async_jobs
          SET status='done', updated_at=now()
          WHERE id=$1
          `,
          [job.id]
        );
      } catch (err) {
        const attempts = job.attempts + 1;
        const failed = attempts >= job.max_attempts;
        const nextRun = new Date(Date.now() + attempts * 60_000); // backoff

        await client.query(
          `
          UPDATE async_jobs
          SET
            attempts=$2,
            status=$3,
            last_error=$4,
            run_at=$5,
            updated_at=now()
          WHERE id=$1
          `,
          [
            job.id,
            attempts,
            failed ? "failed" : "pending",
            err.message,
            nextRun,
          ]
        );
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
