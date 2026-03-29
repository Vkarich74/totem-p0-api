import { Router } from "express";

export default function buildOneTimeChargeHistoryRouter({
  pool
}) {
  const r = Router();

  r.get("/billing/one-time-charge/history", async (req, res) => {
    const db = await pool.connect();

    try {

      const ownerType = String(req.query?.owner_type || "").trim();
      const ownerId = Number(req.query?.owner_id);

      let filter = "";
      let params = [];

      if (ownerType && ownerId) {
        if (!["salon", "master"].includes(ownerType)) {
          return res.status(400).json({ ok: false, error: "INVALID_OWNER_TYPE" });
        }

        if (!Number.isInteger(ownerId) || ownerId <= 0) {
          return res.status(400).json({ ok: false, error: "INVALID_OWNER_ID" });
        }

        filter = `
AND w.owner_type = $1
AND w.owner_id = $2
`;
        params = [ownerType, ownerId];
      }

      const result = await db.query(`
SELECT
le.wallet_id,
w.owner_type,
w.owner_id,
le.amount_cents AS amount,
le.reference_id AS idempotency_key,
le.purpose AS reason,
le.created_at
FROM totem_test.ledger_entries le
JOIN totem_test.wallets w ON w.id = le.wallet_id
WHERE le.reference_type = 'platform_fee'
AND le.direction = 'debit'
${filter}
ORDER BY le.created_at DESC
LIMIT 100
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