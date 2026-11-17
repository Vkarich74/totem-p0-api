// US-PAY-C11 LIVE seller onboarding: direct signed-in owner consent only.
// Stripe Standard direct-charge seller; never creates merchant accounts for
// someone else, never makes a charge/transfer/refund or marks booking paid.
// A salon owner can only onboard THEIR salon; a master only THEIR master.
// Backend and migrations must ship together, behind an OFF-by-default flag.
import { randomUUID } from "node:crypto";
import {
  verifyUsConnectPlatform, createUsStandardSeller, getUsStandardSeller,
  createUsStandardOnboardingLink, liveSellerReadiness,
} from "./usPayC11LiveStripeApi.js";

const OWNER_TYPES = new Set(["salon","master"]);
const ACCOUNT = /^acct_[a-zA-Z0-9]{8,}$/;

function positiveId(raw) {
  const text = String(raw ?? "");
  if (!/^[1-9]\d*$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}

function trustedActor(auth, ownerType) {
  if (!OWNER_TYPES.has(ownerType) ||
      !auth || auth.source !== "session" ||
      auth.role !== (ownerType === "salon" ? "salon_admin" : "master") ||
      !positiveId(auth.user_id) ||
      !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(String(auth.session_id||""))) {
    return null;
  }
  return { userId: positiveId(auth.user_id), sessionId: auth.session_id };
}

function reject(status, code) {
  return { status, body: { ok:false, error:code } };
}

function payload(binding, ownerType, ownerId) {
  return {
    ok: true,
    contract_version: "US-PAY-C11-live-connect-v1",
    market_code: "US", stripe_mode: "LIVE",
    account_type: "standard",
    owner_type: ownerType, owner_id: ownerId,
    onboarding_started: Boolean(binding?.stripe_account_id),
    verification_status: binding?.verification_status || "not_started",
    charges_enabled: binding?.charges_enabled === true,
    payouts_enabled: binding?.payouts_enabled === true,
    details_submitted: binding?.details_submitted === true,
    verified: binding?.verification_status === "verified",
    payment_ready: false,
  };
}

async function withTx(pool, cb, readOnly = false) {
  const db = await pool.connect();
  let open = false;
  let releaseError = null;
  try {
    await db.query(readOnly ? "BEGIN READ ONLY" : "BEGIN");
    open = true;
    await db.query("SET LOCAL statement_timeout='5000ms'");
    await db.query("SET LOCAL lock_timeout='2000ms'");
    const result = await cb(db);
    if (result?.status >= 200 && result.status < 300 && !readOnly) {
      await db.query("COMMIT");
      open = false;
    }
    return result;
  } finally {
    if (open) {
      try { await db.query("ROLLBACK"); }
      catch (error) { releaseError = error; }
    }
    db.release(releaseError || undefined);
  }
}

async function ownerScope(db, actor, ownerType, ownerId) {
  // Revalidate against real auth_users + unrevoked auth_sessions on EVERY
  // operation. JWT alone and req.identity.ownership are never sufficient.
  const session = await db.query(
    `SELECT 1 FROM public.auth_sessions sess
        JOIN public.auth_users usr ON usr.id=sess.user_id
      WHERE sess.id::text=$1 AND sess.user_id=$2
        AND sess.revoked_at IS NULL AND sess.expires_at>now()
        AND sess.last_seen_at>now()-interval '24 hours'
        AND usr.enabled IS TRUE AND usr.role=$3
      LIMIT 1`,
    [actor.sessionId,actor.userId,
      ownerType === "salon" ? "salon_admin" : "master"]
  );
  if (!session.rows.length) return null;

  let r;
  if (ownerType === "salon") {
    r = await db.query(
      `SELECT m.id AS market_id, s.slug
         FROM public.salons s
         JOIN public.owner_salon os ON os.salon_id=s.id
         JOIN public.tenant_market_settings tms ON tms.salon_id=s.id
         JOIN public.markets m ON m.id=tms.market_id
        WHERE s.id=$1 AND os.owner_id::text=$2
          AND m.code='US' AND m.active IS TRUE
          AND m.default_currency='USD'
        LIMIT 1`,
      [ownerId,String(actor.userId)]
    );
  } else {
    r = await db.query(
      `SELECT m.id AS market_id, mas.slug
         FROM public.masters mas
         JOIN public.master_salon ms ON ms.master_id=mas.id
         JOIN public.tenant_market_settings tms ON tms.salon_id=ms.salon_id
         JOIN public.markets m ON m.id=tms.market_id
        WHERE mas.id=$1 AND mas.user_id=$2
          AND ms.status='active' AND m.code='US'
          AND m.active IS TRUE AND m.default_currency='USD'
        ORDER BY m.id
        LIMIT 1`,
      [ownerId,actor.userId]
    );
  }
  return r.rows[0] || null;
}

async function getBinding(db,ownerType,ownerId,lock=false) {
  const r=await db.query(
    `SELECT id,market_id,owner_type,owner_id,created_by_user_id,
            provisioning_token,stripe_account_id,verification_status,
            charges_enabled,payouts_enabled,details_submitted,
            card_payments_status,transfers_status,created_at,last_checked_at
       FROM public.us_stripe_live_seller_bindings
      WHERE owner_type=$1 AND owner_id=$2 AND stripe_mode='LIVE'
      LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [ownerType,ownerId]
  );
  return r.rows[0] || null;
}

async function event(db,bindingId,actorUserId,name) {
  await db.query(
    `INSERT INTO public.us_stripe_live_seller_events
       (binding_id,actor_user_id,event,stripe_mode)
       VALUES ($1,$2,$3,'LIVE')`,
    [bindingId,actorUserId,name]
  );
}

function validRequest(ownerType,ownerId,auth) {
  const id = positiveId(ownerId);
  const actor = trustedActor(auth,ownerType);
  return { id,actor,valid:Boolean(id&&actor) };
}

function callbackUrls(ownerType,slug) {
  // Callback destinations are constructed ONLY from verified owner DB slug.
  // Never accept callback URL, account ID or platform domain from browser.
  if (typeof slug !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(slug)) {
    throw new Error("US_CONNECT_OWNER_SLUG_INVALID");
  }
  const base=`https://app.totemv.com/#/${ownerType}/${encodeURIComponent(slug)}/finance`;
  return {
    returnUrl: base+"?us_connect=return",
    refreshUrl: base+"?us_connect=refresh",
  };
}

export async function getLiveSellerConnection(pool,{auth,ownerType,ownerId}={}) {
  const {id,actor,valid}=validRequest(ownerType,ownerId,auth);
  if(!valid) return reject(403,"US_CONNECT_OWNER_SESSION_REQUIRED");
  return withTx(pool,async db=>{
    const scope=await ownerScope(db,actor,ownerType,id);
    if(!scope) return reject(404,"US_CONNECT_US_OWNER_NOT_FOUND");
    const binding=await getBinding(db,ownerType,id);
    return {status:200,body:payload(binding,ownerType,id)};
  },true);
}

export async function startLiveSellerOnboarding(pool,{
  auth,ownerType,ownerId,consent,secretKey,fetchImpl,
}={}) {
  const {id,actor,valid}=validRequest(ownerType,ownerId,auth);
  if(!valid) return reject(403,"US_CONNECT_OWNER_SESSION_REQUIRED");
  // The caller must actively opt in. Browser must NOT submit legal
  // representative data. Stripe itself collects KYC & service agreement.
  if(consent !== true) return reject(400,"US_CONNECT_EXPLICIT_CONSENT_REQUIRED");
  if(typeof secretKey!=="string" || !secretKey.startsWith("sk_live_")) {
    return reject(503,"US_CONNECT_LIVE_CREDENTIAL_NOT_CONFIGURED");
  }
  // Reject non-owners in PostgreSQL before spending any Stripe API quota.
  const eligibility=await withTx(pool,async db=>{
    const scope=await ownerScope(db,actor,ownerType,id);
    if(!scope) return reject(404,"US_CONNECT_US_OWNER_NOT_FOUND");
    return {status:200,body:{ok:true}};
  },true);
  if(eligibility.status!==200) return eligibility;

  // Independently pin the configured LIVE key to TOTEM USA Connect.
  await verifyUsConnectPlatform({secretKey,fetchImpl});

  const reservation=await withTx(pool,async db=>{
    const scope=await ownerScope(db,actor,ownerType,id);
    if(!scope) return reject(404,"US_CONNECT_US_OWNER_NOT_FOUND");
    const urls=callbackUrls(ownerType,scope.slug);
    const token=randomUUID();

    const inserted=await db.query(
      `INSERT INTO public.us_stripe_live_seller_bindings
         (market_id,owner_type,owner_id,created_by_user_id,provisioning_token)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (owner_type,owner_id,stripe_mode) DO NOTHING
       RETURNING id`,
      [scope.market_id,ownerType,id,actor.userId,token]
    );
    const binding=await getBinding(db,ownerType,id,true);
    if(!binding) throw new Error("US_CONNECT_RESERVATION_FAILED");
    if(inserted.rows.length) await event(db,binding.id,actor.userId,"owner_consent");
    if(binding.verification_status==="revoked") {
      return reject(409,"US_CONNECT_SELLER_REVOKED");
    }
    if(binding.verification_status==="verified") {
      return reject(409,"US_CONNECT_SELLER_ALREADY_VERIFIED");
    }
    if(!binding.stripe_account_id &&
       Date.now()-new Date(binding.created_at).getTime() > 20*60*60*1000) {
      // Stripe idempotency keys may expire after 24 hours. No risk
      // of duplicate REAL sellers: require controlled reconciliation.
      return reject(409,"US_CONNECT_PROVISION_RECONCILIATION_REQUIRED");
    }
    return {
      status:200,body:{ok:true,
        bindingId:String(binding.id),
        token:String(binding.provisioning_token),
        stripeAccountId:binding.stripe_account_id,
        urls,
      },
    };
  });
  if(reservation.status!==200) return reservation;

  let accountId=reservation.body.stripeAccountId;
  if (!accountId) {
    accountId=await createUsStandardSeller({
      secretKey,provisioningToken:reservation.body.token,fetchImpl,
    });
    await withTx(pool,async db=>{
      const scope=await ownerScope(db,actor,ownerType,id);
      if(!scope) return reject(403,"US_CONNECT_OWNER_SESSION_INVALID");
      const updated=await db.query(
        `UPDATE public.us_stripe_live_seller_bindings
            SET stripe_account_id=$2, verification_status='onboarding'
          WHERE id=$1 AND stripe_account_id IS NULL
            AND verification_status='initiated'
          RETURNING id`,
        [reservation.body.bindingId,accountId]
      );
      if(updated.rows.length===1) {
        await event(db,reservation.body.bindingId,actor.userId,"account_provisioned");
      } else {
        const current=await getBinding(db,ownerType,id,true);
        if(!current || current.stripe_account_id!==accountId) {
          throw new Error("US_CONNECT_PROVISION_BINDING_CONFLICT");
        }
      }
      return {status:200,body:{ok:true}};
    });
  }
  if(!ACCOUNT.test(accountId)) throw new Error("US_CONNECT_ACCOUNT_ID_UNEXPECTED");

  // Recheck session/owner before issuing ephemeral sensitive account link.
  const stillOwner=await withTx(pool,async db=>{
    const scope=await ownerScope(db,actor,ownerType,id);
    const row=await getBinding(db,ownerType,id);
    return {status:scope && row?.stripe_account_id===accountId &&
        row.verification_status!=="revoked" ? 200:403,
      body:{ok:Boolean(scope),error:"US_CONNECT_OWNER_SESSION_INVALID"}};
  },true);
  if(stillOwner.status!==200) return stillOwner;

  const link=await createUsStandardOnboardingLink({
    secretKey,stripeAccountId:accountId,...reservation.body.urls,
    idempotencyKey:"totem-c11-link-"+randomUUID(),fetchImpl,
  });
  await withTx(pool,async db=>{
    const scope=await ownerScope(db,actor,ownerType,id);
    if(!scope) return reject(403,"US_CONNECT_OWNER_SESSION_INVALID");
    await event(db,reservation.body.bindingId,actor.userId,"onboarding_link_issued");
    return {status:200,body:{ok:true}};
  });

  return {
    status:200,
    body:{
      ...payload({stripe_account_id:accountId,verification_status:"onboarding"},
        ownerType,id),
      onboarding_url:link.url,
      onboarding_expires_at:link.expires_at,
      // This URL is sensitive and one-time. It MUST NOT be sent in emails,
      // SMS, analytics, server logs or stored in PostgreSQL.
    },
  };
}

export async function refreshLiveSellerVerification(pool,{
  auth,ownerType,ownerId,secretKey,fetchImpl,
}={}) {
  const {id,actor,valid}=validRequest(ownerType,ownerId,auth);
  if(!valid) return reject(403,"US_CONNECT_OWNER_SESSION_REQUIRED");
  if(typeof secretKey!=="string" || !secretKey.startsWith("sk_live_")) {
    return reject(503,"US_CONNECT_LIVE_CREDENTIAL_NOT_CONFIGURED");
  }

  const current=await withTx(pool,async db=>{
    const scope=await ownerScope(db,actor,ownerType,id);
    if(!scope) return reject(404,"US_CONNECT_US_OWNER_NOT_FOUND");
    const binding=await getBinding(db,ownerType,id);
    if(!binding || !binding.stripe_account_id) {
      return reject(409,"US_CONNECT_ONBOARDING_NOT_STARTED");
    }
    if(binding.verification_status==="revoked") {
      return reject(409,"US_CONNECT_SELLER_REVOKED");
    }
    return {status:200,body:{ok:true,
      bindingId:String(binding.id),marketId:String(binding.market_id),
      stripeAccountId:binding.stripe_account_id,
    }};
  },true);
  if(current.status!==200) return current;

  const account=await getUsStandardSeller({
    secretKey,stripeAccountId:current.body.stripeAccountId,fetchImpl,
  });
  const ready=liveSellerReadiness(account,current.body.stripeAccountId);

  return withTx(pool,async db=>{
    const scope=await ownerScope(db,actor,ownerType,id);
    if(!scope || String(scope.market_id)!==current.body.marketId)
      return reject(403,"US_CONNECT_OWNER_SESSION_INVALID");
    const binding=await getBinding(db,ownerType,id,true);
    if(!binding || binding.stripe_account_id!==current.body.stripeAccountId ||
       binding.verification_status==="revoked") {
      return reject(409,"US_CONNECT_BINDING_CHANGED");
    }
    const updated=await db.query(
      `UPDATE public.us_stripe_live_seller_bindings
          SET verification_status=$2, charges_enabled=$3,
              payouts_enabled=$4,details_submitted=$5,
              card_payments_status=$6,transfers_status=$7,
              verified_at=CASE WHEN $2='verified' THEN now() ELSE NULL END,
              last_checked_at=now()
        WHERE id=$1 AND stripe_account_id=$8
        RETURNING id,verification_status,charges_enabled,
                  payouts_enabled,details_submitted`,
      [
        binding.id,ready.state,
        ready.charges_enabled===true,ready.payouts_enabled===true,
        ready.details_submitted===true,
        ready.card_payments_status||"unknown",
        ready.transfers_status||"unknown",
        current.body.stripeAccountId,
      ]
    );
    if(updated.rows.length!==1) throw new Error("US_CONNECT_REFRESH_CONFLICT");
    if(binding.verification_status!==ready.state) {
      await event(db,binding.id,actor.userId,
        ready.ready ? "stripe_verified" : "stripe_restricted");
    }

    // Bind ONLY an already owner-authorized selection for this seller.
    // No payment status, payout, price, booking or KG/KZ money is changed.
    if(ready.ready) {
      await db.query(
        `UPDATE public.us_booking_payment_collectors col
            SET verification_status='verified',verified_at=now()
          FROM public.bookings booking
          WHERE col.booking_id=booking.id
            AND booking.status IN ('reserved','confirmed')
            AND col.market_id=$1
            AND col.collector_owner_type=$2
            AND col.collector_owner_id=$3
            AND col.selection_source='owner_authorized'
            AND col.verification_status='pending'
            AND EXISTS (
              SELECT 1 FROM public.us_booking_price_snapshots snap
               WHERE snap.booking_id=col.booking_id AND snap.market_id=$1
            )`,
        [scope.market_id,ownerType,id]
      );
    } else {
      await db.query(
        `UPDATE public.us_booking_payment_collectors
            SET verification_status='pending',verified_at=NULL
          WHERE market_id=$1 AND collector_owner_type=$2
            AND collector_owner_id=$3 AND verification_status='verified'`,
        [scope.market_id,ownerType,id]
      );
    }
    return {status:200,body:payload(updated.rows[0],ownerType,id)};
  });
}
