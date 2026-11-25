/**
 * US-PAY-C11: Connect an EXISTING Stripe Standard merchant via real owner-
 * initiated OAuth, not by reassigning an acct_* ID or creating a duplicate.
 *
 * No account is connected until Stripe redirects back with a one-use code,
 * the exact server-held random CSRF state is consumed, live OAuth exchange
 * returns an account ID and that account is re-read on TOTEM's LIVE platform.
 *
 * The first genuine salon/master authorizes this flow LATER. Never create
 * a test or actual merchant to make an artificial acceptance pass.
 *
 * No PaymentIntent, charge, payout, transfer, refund or KG/KZ write.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { verifyUsLiveSellerOwnerScope } from "./usPayC11LiveSellerOnboarding.service.js";
import {checkUsSaasTransactionalWrite} from "./billing/usSaasTransactionalWriteGuard.js";
const checkCommercial=(db,scope)=>checkUsSaasTransactionalWrite(db,scope.ownerType,{owner_id:scope.ownerId,market_id:scope.marketId});
import {
  verifyUsConnectPlatform,
  getUsStandardSeller,
  isLiveUsStandardAccount,
  liveSellerReadiness,
} from "./usPayC11LiveStripeApi.js";

export const US_CONNECT_LIVE_OAUTH_CALLBACK =
  "https://api.totemv.com/stripe/connect/us-pay-c11/live/oauth/callback";
const US_APP = "https://app.totemv.com/";
const US_OAUTH_AUTHORITY = "https://connect.stripe.com/oauth/authorize";
const US_OAUTH_TOKEN = "https://connect.stripe.com/oauth/token";
const ACCOUNT_ID = /^acct_[A-Za-z0-9]{8,}$/;
const CLIENT_ID = /^ca_[A-Za-z0-9]{8,}$/;
const CSRF_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_AGE_MS = 10 * 60 * 1000;

function sha256(raw) {
  return createHash("sha256").update(raw).digest("hex");
}
function reject(status, error) {
  return { status, body: { ok: false, error } };
}
function configured({secretKey,clientId,redirectUri}) {
  return typeof secretKey === "string" && /^sk_live_[A-Za-z0-9_]+$/.test(secretKey) &&
    CLIENT_ID.test(String(clientId || "")) &&
    redirectUri === US_CONNECT_LIVE_OAUTH_CALLBACK;
}

async function tx(pool,cb) {
  const db=await pool.connect();
  let open=false,releaseError;
  try {
    await db.query("BEGIN");
    open=true;
    await db.query("SET LOCAL statement_timeout='5000ms'");
    await db.query("SET LOCAL lock_timeout='2000ms'");
    const r=await cb(db);
    if(r?.status>=400){await db.query("ROLLBACK");open=false;return r;}
    await db.query("COMMIT");
    open=false;
    return r;
  } finally {
    if(open) {
      try {await db.query("ROLLBACK");}catch(e){releaseError=e;}
    }
    db.release(releaseError || undefined);
  }
}

async function bindingForOwner(db,scope,lock=false) {
  const r=await db.query(
    `SELECT id,market_id,owner_type,owner_id,provisioning_token,
            created_by_user_id,stripe_account_id,verification_status
       FROM public.us_stripe_live_seller_bindings
      WHERE owner_type=$1 AND owner_id=$2 AND stripe_mode='LIVE'
      LIMIT 1${lock?" FOR UPDATE":""}`,
    [scope.ownerType,scope.ownerId]
  );
  return r.rows[0]||null;
}

function ownerPayload(scope,{status="initiated",oauthUrl}={}) {
  return {
    ok:true,contract_version:"US-PAY-C11-live-connect-v1",
    market_code:"US",stripe_mode:"LIVE",account_type:"standard",
    owner_type:scope.ownerType,owner_id:scope.ownerId,
    onboarding_started:false,
    verification_status:status,
    charges_enabled:false,payouts_enabled:false,details_submitted:false,
    verified:false,payment_ready:false,
    ...(oauthUrl?{oauth_authorize_url:oauthUrl}:{}),
  };
}

function callbackRedirect(scope,result) {
  if(!scope || !["salon","master"].includes(scope.ownerType) ||
     !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(String(scope.slug||""))) {
    return US_APP;
  }
  const status=["linked","denied","failed"].includes(result)?result:"failed";
  // HashRouter route: no authorization code, CSRF state or merchant ID.
  return US_APP+"#/"+scope.ownerType+"/"+scope.slug+
    "/settings?us_connect="+status;
}

export async function beginExistingUsStripeOAuth(pool,{
  auth,ownerType,ownerId,consent,secretKey,clientId,
  redirectUri=US_CONNECT_LIVE_OAUTH_CALLBACK,
  fetchImpl,
}={}) {
  if(consent!==true) return reject(400,"US_CONNECT_EXPLICIT_CONSENT_REQUIRED");
  if(!configured({secretKey,clientId,redirectUri})) {
    return reject(503,"US_CONNECT_OAUTH_NOT_CONFIGURED");
  }

  // Verify actual owner and US market before any LIVE Stripe API request.
  const checked=await tx(pool,async db=>{
    const scope=await verifyUsLiveSellerOwnerScope(db,{auth,ownerType,ownerId,lock:true});
    if(!scope)return reject(404,"US_CONNECT_US_OWNER_NOT_FOUND");
    return (await checkCommercial(db,scope))||{status:200,body:scope};
  });
  if(checked.status!==200) return checked;
  await verifyUsConnectPlatform({secretKey,fetchImpl});

  const state=randomBytes(32).toString("base64url");
  const stateHash=sha256(state);

  const r=await tx(pool,async db=>{
    const scope=await verifyUsLiveSellerOwnerScope(db,{auth,ownerType,ownerId,lock:true});
    if(!scope || String(scope.marketId)!==String(checked.body.marketId) ||
       scope.slug!==checked.body.slug) {
      return reject(403,"US_CONNECT_OWNER_SESSION_CHANGED");
    }

    const denied=await checkCommercial(db,scope);if(denied)return denied;
    let binding=await bindingForOwner(db,scope,true);
    if(!binding) {
      const created=await db.query(
        `INSERT INTO public.us_stripe_live_seller_bindings
           (market_id,owner_type,owner_id,created_by_user_id,provisioning_token)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(owner_type,owner_id,stripe_mode) DO NOTHING
         RETURNING id`,
        [scope.marketId,scope.ownerType,scope.ownerId,scope.userId,randomUUID()]
      );
      binding=await bindingForOwner(db,scope,true);
      if(!binding) throw new Error("US_CONNECT_BINDING_CREATE_FAILED");
    }
    if(binding.stripe_account_id || binding.verification_status==="revoked" ||
       binding.verification_status!=="initiated") {
      return reject(409,"US_CONNECT_SELLER_ALREADY_BOUND_OR_RESTRICTED");
    }
    if(String(binding.market_id)!==String(scope.marketId)) {
      return reject(409,"US_CONNECT_BINDING_MARKET_CHANGED");
    }

    const uncertain=await db.query("SELECT 1 FROM public.us_stripe_live_oauth_attempts WHERE binding_id=$1 AND result='exchange_pending' LIMIT 1",[binding.id]);
    if(uncertain.rows.length)return reject(409,"US_CONNECT_OAUTH_RECONCILIATION_REQUIRED");
    const attempts=await db.query(
      `SELECT COUNT(*)::int AS n
         FROM public.us_stripe_live_oauth_attempts
        WHERE binding_id=$1 AND created_at>now()-interval '10 minutes'`,
      [binding.id]
    );
    if(attempts.rows[0].n>=3) {
      return reject(429,"US_CONNECT_OAUTH_RATE_LIMITED");
    }

    // Exactly one pending CSRF state per seller. Older links become invalid.
    await db.query(
      `UPDATE public.us_stripe_live_oauth_attempts
          SET consumed_at=now(),result='superseded'
        WHERE binding_id=$1 AND consumed_at IS NULL`,
      [binding.id]
    );
    await db.query(
      `INSERT INTO public.us_stripe_live_oauth_attempts
       (state_hash,binding_id,actor_user_id,session_id,
        owner_type,owner_id,market_id,owner_slug,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '10 minutes')`,
      [
        stateHash,binding.id,scope.userId,scope.sessionId,
        scope.ownerType,scope.ownerId,scope.marketId,scope.slug,
      ]
    );
    await db.query(
      `INSERT INTO public.us_stripe_live_seller_events
       (binding_id,actor_user_id,event,stripe_mode)
       VALUES($1,$2,'owner_consent','LIVE')`,
      [binding.id,scope.userId]
    );
    return (await checkCommercial(db,scope))||{status:200,body:ownerPayload(scope)};
  });
  if(r.status!==200)return r;

  const url=new URL(US_OAUTH_AUTHORITY);
  url.searchParams.set("response_type","code");
  url.searchParams.set("client_id",clientId);
  url.searchParams.set("redirect_uri",redirectUri);
  url.searchParams.set("scope","read_write");
  url.searchParams.set("state",state);
  // No email, phone or identifying seller details leave TOTEM here.
  url.searchParams.set("stripe_user[country]","US");
  return {
    ...r,
    body:{...r.body,oauth_authorize_url:url.href},
  };
}

async function consumeOAuthAttempt(pool, stateHash, requestedOutcome) {
  return tx(pool,async db=>{
    const r=await db.query(
      `SELECT a.*,b.stripe_account_id AS bound_account_id,
              b.verification_status AS binding_status
         FROM public.us_stripe_live_oauth_attempts a
         JOIN public.us_stripe_live_seller_bindings b ON b.id=a.binding_id
        WHERE a.state_hash=$1 LIMIT 1 FOR UPDATE OF a,b`,
      [stateHash]
    );
    const row=r.rows[0];
    if(!row || row.result!=="pending" || row.consumed_at ||
       Date.now()>new Date(row.expires_at).getTime()) {
      return null;
    }
    const scope=await verifyUsLiveSellerOwnerScope(db,{
      auth:{
        source:"session",user_id:row.actor_user_id,session_id:row.session_id,
        role:row.owner_type==="salon"?"salon_admin":"master",
      },
      ownerType:row.owner_type,ownerId:row.owner_id,lock:true,
    });
    const matches=scope &&
      scope.userId===row.actor_user_id &&
      String(scope.marketId)===String(row.market_id) &&
      scope.slug===row.owner_slug &&
      row.bound_account_id==null &&
      row.binding_status==="initiated";
    const commercialDenied=matches&&requestedOutcome==="exchange_pending"?await checkCommercial(db,scope):null;
    const outcome=matches&&!commercialDenied?requestedOutcome:"invalidated";
    await db.query(
      `UPDATE public.us_stripe_live_oauth_attempts
          SET consumed_at=now(),result=$2
        WHERE state_hash=$1 AND consumed_at IS NULL`,
      [stateHash,outcome]
    );
    if(!matches||commercialDenied) return null;
    return {scope,bindingId:row.binding_id,stateHash};
  });
}

export async function exchangeExistingUsStripeOAuthCode({
  code,secretKey,fetchImpl=globalThis.fetch,
}={}) {
  if(typeof code!=="string" || !/^ac_[A-Za-z0-9_]{8,256}$/.test(code) ||
     typeof secretKey!=="string" || !/^sk_live_[A-Za-z0-9_]+$/.test(secretKey) ||
     typeof fetchImpl!=="function") {
    throw new Error("US_CONNECT_OAUTH_EXCHANGE_INPUT_INVALID");
  }
  // Never log or store OAuth authorization code, access token or refresh token.
  // One-use code exchange has NO idempotency; never auto-retry this POST.
  const response=await fetchImpl(US_OAUTH_TOKEN,{
    method:"POST",
    headers:{
      Authorization:"Basic "+Buffer.from(secretKey+":").toString("base64"),
      "Content-Type":"application/x-www-form-urlencoded",
      Accept:"application/json",
    },
    body:new URLSearchParams({
      grant_type:"authorization_code",
      code,
    }).toString(),
    signal:AbortSignal.timeout(12000),
    redirect:"error",
  });
  if(!response.ok) throw new Error("US_CONNECT_OAUTH_EXCHANGE_FAILED");
  const out=await response.json();
  if(!ACCOUNT_ID.test(String(out?.stripe_user_id||"")) ||
     out.livemode!==true || out.scope!=="read_write") {
    throw new Error("US_CONNECT_OAUTH_SCOPE_OR_MODE_INVALID");
  }
  return out.stripe_user_id;
}

async function markAttempt(pool,stateHash,result) {
  await tx(pool,async db=>{
    await db.query(
      `UPDATE public.us_stripe_live_oauth_attempts
          SET result=$2
        WHERE state_hash=$1 AND result='exchange_pending'`,
      [stateHash,result]
    );
  });
}

export async function finishExistingUsStripeOAuth(pool,{
  state,code,error,secretKey,clientId,
  redirectUri=US_CONNECT_LIVE_OAUTH_CALLBACK,
  fetchImpl,
}={}) {
  if(!CSRF_TOKEN.test(String(state||""))) {
    return {redirectTo:US_APP,result:"invalid_state"};
  }
  const stateHash=sha256(state);
  const cancelled=error==="access_denied" && code==null;
  const codeValid=!error && typeof code==="string" &&
    /^ac_[A-Za-z0-9_]{8,256}$/.test(code);
  if(!cancelled&&!codeValid) {
    // Never exchange an unrecognised code. Consume the state anyway.
    const entry=await consumeOAuthAttempt(pool,stateHash,"failed");
    return {redirectTo:callbackRedirect(entry?.scope,"failed"),result:"rejected"};
  }
  const started=await consumeOAuthAttempt(pool,stateHash,
    cancelled?"denied":"exchange_pending");
  if(!started) return {redirectTo:US_APP,result:"invalid_or_expired_state"};
  if(cancelled) {
    return {redirectTo:callbackRedirect(started.scope,"denied"),result:"denied"};
  }
  if(!configured({secretKey,clientId,redirectUri})) {
    await markAttempt(pool,stateHash,"failed");
    return {redirectTo:callbackRedirect(started.scope,"failed"),result:"not_configured"};
  }

  try {
    // LIVE platform key: must be specifically TOTEM USA Connect.
    await verifyUsConnectPlatform({secretKey,fetchImpl});
    const accountId=await exchangeExistingUsStripeOAuthCode({
      code,secretKey,fetchImpl,
    });
    const account=await getUsStandardSeller({
      secretKey,stripeAccountId:accountId,fetchImpl,
    });
    if(!isLiveUsStandardAccount(account,accountId)) {
      throw new Error("US_CONNECT_OAUTH_ACCOUNT_NOT_US_STANDARD");
    }
    const readiness=liveSellerReadiness(account,accountId);
    const result=await tx(pool,async db=>{
      const scope=await verifyUsLiveSellerOwnerScope(db,{
        auth:{
          source:"session",user_id:started.scope.userId,
          session_id:started.scope.sessionId,
          role:started.scope.ownerType==="salon"?"salon_admin":"master",
        },
        ownerType:started.scope.ownerType,
        ownerId:started.scope.ownerId,lock:true,
      });
      if(!scope || scope.slug!==started.scope.slug ||
         String(scope.marketId)!==String(started.scope.marketId)) {
        throw new Error("US_CONNECT_OAUTH_OWNER_REVOKED");
      }
      const denied=await checkCommercial(db,scope);
      if(denied)throw Error(denied.body.error);
      const locked=await db.query(
        `SELECT id,stripe_account_id,verification_status
           FROM public.us_stripe_live_seller_bindings
          WHERE id=$1 AND market_id=$2 AND owner_type=$3 AND owner_id=$4
            AND stripe_mode='LIVE' AND account_type='standard'
          LIMIT 1 FOR UPDATE`,
        [started.bindingId,scope.marketId,scope.ownerType,scope.ownerId]
      );
      const b=locked.rows[0];
      if(!b || b.stripe_account_id!=null ||
         b.verification_status!=="initiated") {
        throw new Error("US_CONNECT_OAUTH_BINDING_CHANGED");
      }
      const resultRow=await db.query(
        `UPDATE public.us_stripe_live_seller_bindings
            SET stripe_account_id=$2,connection_method='oauth_existing',
                verification_status=$3,charges_enabled=$4,
                payouts_enabled=$5,details_submitted=$6,
                card_payments_status=$7,transfers_status=$8,
                last_checked_at=now(),
                verified_at=CASE WHEN $3='verified' THEN now() ELSE NULL END
          WHERE id=$1 AND stripe_account_id IS NULL
          RETURNING id`,
        [
          b.id,accountId,readiness.state,
          readiness.charges_enabled===true,
          readiness.payouts_enabled===true,
          readiness.details_submitted===true,
          readiness.card_payments_status||"unknown",
          readiness.transfers_status||"unknown",
        ]
      );
      if(resultRow.rows.length!==1) {
        throw new Error("US_CONNECT_OAUTH_BINDING_UPDATE_FAILED");
      }
      await db.query(
        `UPDATE public.us_stripe_live_oauth_attempts
            SET result='linked',stripe_account_id=$2
          WHERE state_hash=$1 AND result='exchange_pending'`,
        [stateHash,accountId]
      );
      await db.query(
        `INSERT INTO public.us_stripe_live_seller_events
           (binding_id,actor_user_id,event,stripe_mode)
         VALUES($1,$2,'account_provisioned','LIVE')`,
        [b.id,scope.userId]
      );
      if(readiness.ready) {
        await db.query(
          `INSERT INTO public.us_stripe_live_seller_events
             (binding_id,actor_user_id,event,stripe_mode)
           VALUES($1,$2,'stripe_verified','LIVE')`,
          [b.id,scope.userId]
        );
        // Promote ONLY previously chosen, owner-authorized US recipients.
        await db.query(
          `UPDATE public.us_booking_payment_collectors c
              SET verification_status='verified',verified_at=now()
            FROM public.bookings bk
           WHERE c.booking_id=bk.id AND bk.status IN ('reserved','confirmed')
             AND c.market_id=$1
             AND c.collector_owner_type=$2
             AND c.collector_owner_id=$3
             AND c.selection_source='owner_authorized'
             AND c.selected_by_user_id IS NOT NULL
             AND c.verification_status='pending'
             AND EXISTS (
               SELECT 1 FROM public.us_booking_price_snapshots s
                WHERE s.booking_id=c.booking_id AND s.market_id=$1
             )`,
          [scope.marketId,scope.ownerType,scope.ownerId]
        );
      }
      const commitDenied=await checkCommercial(db,scope);
      if(commitDenied)throw Error(commitDenied.body.error);
      return {linked:true};
    });
    return {redirectTo:callbackRedirect(started.scope,
      result.linked?"linked":"failed"),result:"linked"};
  } catch {
    // Exchange may already have succeeded remotely. Retain exchange_pending;
    // both onboarding and OAuth initiation block until controlled readback.
    // Never retry or discard an uncertain external binding.
    return {redirectTo:callbackRedirect(started.scope,"failed"),result:"failed"};
  }
}
