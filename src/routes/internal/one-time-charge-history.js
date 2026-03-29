import { Router } from "express";

export default function buildOneTimeChargeHistoryRouter({
  pool
}) {
  const r = Router();

  r.get("/billing/one-time-charge/history", async (req, res) => {
    const db = await pool.connect();

    try {

      const ownerType = String(req.query?.owner_type || "").trim();
      const ownerIdRaw = String(req.query?.owner_id || "").trim();
      const limitRaw = Number(req.query?.limit);

      if (ownerType && !["salon", "master"].includes(ownerType)) {
        return res.status(400).json({ ok: false, error: "INVALID_OWNER_TYPE" });
      }

      let ownerId = null;

      if (ownerIdRaw) {
        ownerId = Number(ownerIdRaw);

        if (!Number.isInteger(ownerId) || ownerId <= 0) {
          return res.status(400).json({ ok: false, error: "INVALID_OWNER_ID" });
        }
      }

      const limit = Number.isInteger(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 200)
        : 100;

      const params = [];
      let where = `
WHERE le.reference_type='platform_fee'
AND le.direction='debit'
`;

      if (ownerType) {
        params.push(ownerType);
        where += `
AND w.owner_type=$${params.length}
`;
      }

      if (ownerId !== null) {
        params.push(ownerId);
        where += `
AND w.owner_id=$${params.length}
`;
      }

      params.push(limit);

      const result = await db.query(`
SELECT
le.id,
le.wallet_id,
w.owner_type,
w.owner_id::int AS owner_id,
le.amount_cents::int AS amount,
'KGS' AS currency,
le.reference_type,
le.reference_id AS idempotency_key,
le.purpose AS reason,
le.created_at
FROM totem_test.ledger_entries le
JOIN totem_test.wallets w
ON w.id = le.wallet_id
${where}
ORDER BY le.created_at DESC, le.id DESC
LIMIT $${params.length}
`, params);

      return res.json({
        ok: true,
        count: result.rows.length,
        items: result.rows
      });

    } catch (err) {

      console.error("ONE_TIME_CHARGE_HISTORY_ERROR", err);

      return res.status(500).json({
        ok: false,
        error: "ONE_TIME_CHARGE_HISTORY_FAILED"
      });

    } finally {
      db.release();
    }
  });

  return r;
}