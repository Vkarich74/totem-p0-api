import { Router } from "express";

export default function buildOneTimeChargeRouter({
  pool,
  getOrCreateSystemWallet,
  getWalletBalanceById
}) {
  const r = Router();

  /*
   * Legacy one-time wallet charge is quarantined.
   * The former route accepted owner and amount from the request body and
   * wrote platform_fee debits/credits into the legacy totem_test ledger.
   * Historical platform_fee entries remain read-only for reconciliation.
   */
  r.post("/billing/one-time-charge", (req,res)=>{
    return res.status(410).json({
      ok:false,
      error:"LEGACY_ONE_TIME_CHARGE_DISABLED"
    });
  });

  return r;
}
