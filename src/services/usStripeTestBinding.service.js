// US-PAY-C11: server-held TEST connected-account verification and binding refresh.
// Only a preprovisioned account ID is read from DB; clients cannot inject IDs.
// This does NOT establish salon/merchant onboarding consent by itself.
// It must not activate checkout or alter legacy payments.
import { verifyStripeTestConnectedAccount } from "./usStripeTestVerification.js";

function safePositiveId(raw) {
  const s = String(raw ?? "");
  if (!/^[1-9]\d*$/.test(s)) return null;
  const id = Number(s);
  return Number.isSafeInteger(id) ? id : null;
}

export async function reverifyUsStripeTestBinding(pool, {
  bindingId, secretKey, fetchImpl,
} = {}) {
  const id = safePositiveId(bindingId);
  if (!id) throw new Error("US_STRIPE_TEST_BINDING_ID_INVALID");
  if (typeof secretKey !== "string" || !secretKey.startsWith("sk_test_")) {
    throw new Error("US_STRIPE_TEST_SECRET_REQUIRED_AND_LIVE_KEY_FORBIDDEN");
  }

  const existing = await pool.query(
    `SELECT sb.id, sb.market_id, sb.owner_type, sb.owner_id,
            sb.stripe_mode, sb.stripe_connected_account_id, sb.verification_status,
            m.code AS market_code, m.default_currency AS market_currency
       FROM public.us_stripe_merchant_bindings sb
       JOIN public.markets m ON m.id = sb.market_id
      WHERE sb.id=$1
      LIMIT 1`,
    [id]
  );
  const row = existing.rows[0];
  if (!row || row.stripe_mode !== "TEST" ||
      row.verification_status === "revoked" ||
      row.market_code !== "US" || row.market_currency !== "USD") {
    throw new Error("US_STRIPE_TEST_BINDING_NOT_ELIGIBLE");
  }

  const verification = await verifyStripeTestConnectedAccount({
    connectedAccountId: row.stripe_connected_account_id,
    secretKey,
    ...(fetchImpl ? { fetchImpl } : {}),
  });

  // Account ID and owner attribution are immutable at DB level.
  // Compare-and-swap on mode/account prevents reassignment races.
  const updated = await pool.query(
    `UPDATE public.us_stripe_merchant_bindings
        SET verification_status=$3,
            card_payments_status=$4,
            charges_enabled=$5,
            payouts_enabled=$6,
            details_submitted=$7,
            last_checked_at=now(),
            verified_at=CASE WHEN $3='verified' THEN now() ELSE NULL END
      WHERE id=$1 AND stripe_connected_account_id=$2
        AND stripe_mode='TEST' AND verification_status<>'revoked'
      RETURNING id, market_id, owner_type, owner_id, verification_status,
                card_payments_status, last_checked_at`,
    [
      id, row.stripe_connected_account_id,
      verification.verified ? "verified" : "pending",
      verification.verified ? "active" : "inactive",
      verification.verified === true,
      verification.verified === true,
      verification.verified === true,
    ]
  );
  if (updated.rows.length !== 1) {
    throw new Error("US_STRIPE_TEST_BINDING_CHANGED_DURING_VERIFICATION");
  }
  return {
    binding_id: Number(updated.rows[0].id),
    market_code: "US",
    owner_type: updated.rows[0].owner_type,
    owner_id: Number(updated.rows[0].owner_id),
    stripe_mode: "TEST",
    verified: updated.rows[0].verification_status === "verified",
    last_checked_at: updated.rows[0].last_checked_at,
    // Never return connected account ID, Stripe key or banking details.
  };
}
