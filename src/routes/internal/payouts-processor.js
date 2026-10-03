import express from "express";

export default function buildPayoutsProcessorRouter(pool, getOrCreateSystemWallet){

const r = express.Router();

/* LEGACY PAYOUT PROCESSOR — quarantined.
 * The former route rewrote totem_test payout ledger rows and selected
 * salon/master wallets without a currency boundary. Historical payout rows
 * remain untouched; payout processing must use the canonical Money Core path.
 */
r.post("/payouts/run", (req, res) => {
  return res.status(410).json({
    ok: false,
    error: "LEGACY_PAYOUT_PROCESSOR_DISABLED"
  });
});

return r;

}