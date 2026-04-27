import express from "express";

const OWNER_TYPES = ["salon", "master"];

const REQUEST_STATUSES = [
  "draft",
  "validated",
  "validation_failed",
  "approved",
  "provisioning",
  "provisioned",
  "email_ready",
  "email_sent",
  "email_failed",
  "activated",
  "rejected",
  "suspended",
  "failed",
];

const EMAIL_STATUSES = [
  "not_ready",
  "ready",
  "sent",
  "failed",
];

function toCountMap(rows = [], keyName = "key"){
  return Object.fromEntries(
    (rows || []).map((row) => [
      String(row?.[keyName] || ""),
      Number(row?.count || 0),
    ]).filter(([key]) => Boolean(key))
  );
}

export default function buildAdminOpenOwnerRouter(pool, internalReadRateLimit){
  const r = express.Router();

  if(internalReadRateLimit){
    r.use(internalReadRateLimit);
  }

  r.get("/stats", async (req,res)=>{
    try{
      const totalResult = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM public.owner_opening_requests
      `);

      const statusResult = await pool.query(`
        SELECT status, COUNT(*)::int AS count
        FROM public.owner_opening_requests
        GROUP BY status
        ORDER BY status
      `);

      const ownerTypeResult = await pool.query(`
        SELECT owner_type, COUNT(*)::int AS count
        FROM public.owner_opening_requests
        GROUP BY owner_type
        ORDER BY owner_type
      `);

      const emailStatusResult = await pool.query(`
        SELECT email_status, COUNT(*)::int AS count
        FROM public.owner_opening_requests
        GROUP BY email_status
        ORDER BY email_status
      `);

      return res.status(200).json({
        ok: true,
        feature: "admin_open_owner",
        engine: "db",
        total: Number(totalResult.rows[0]?.count || 0),
        counts: {
          by_status: toCountMap(statusResult.rows, "status"),
          by_owner_type: toCountMap(ownerTypeResult.rows, "owner_type"),
          by_email_status: toCountMap(emailStatusResult.rows, "email_status"),
        },
        contract: {
          owner_types: OWNER_TYPES,
          request_statuses: REQUEST_STATUSES,
          email_statuses: EMAIL_STATUSES,
        },
      });
    }catch(err){
      console.error("ADMIN_OPEN_OWNER_STATS_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_STATS_FAILED",
      });
    }
  });

  return r;
}
