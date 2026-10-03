import express from "express";

export default function buildWithdrawsProcessorRouter(pool){
  const r = express.Router();

  function legacyWithdrawMutationDisabled(req, res){
    return res.status(410).json({
      ok: false,
      error: "LEGACY_WITHDRAW_PROCESSOR_DISABLED"
    });
  }

  /*
   * Legacy withdraw mutation routes are quarantined.
   * The former processor could move pending withdrawals through processing
   * to completed with an auto-generated reference and without payout evidence.
   * Historical public.withdraws rows remain read-only for reconciliation.
   */
  r.post("/withdraws/run", legacyWithdrawMutationDisabled);
  r.post("/withdraws/:id/complete", legacyWithdrawMutationDisabled);
  r.post("/withdraws/:id/fail", legacyWithdrawMutationDisabled);
  r.post("/withdraws/:id/retry", legacyWithdrawMutationDisabled);

  return r;
}
