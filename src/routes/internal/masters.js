import {readUsOwnSalonMasterAuthority} from "../../services/provision/usMasterRoleAuthority.js";
import {readUsOwnSalonProfileAccess,usSharedMasterProfileEnabled,readUsOwnSalonHoursAccess,readUsOwnSalonServicesAccess,usSharedMasterServicesEnabled,usSharedMasterPriceEnabled,usSharedMasterHoursEnabled,usSharedMasterBookingEnabled} from "../../auth/usOwnSalonRoleContext.js";
import express from "express";
import { getUsSaasAccess,readUsSaasProjectionPolicy } from "../../services/billing/usSaasEntitlementProjection.js";
import crypto from "crypto";
import {
countUnread,
listNotificationsForTarget,
markNotificationRead
} from "../../services/notifications/notificationService.js";
import {
revokeOwnerPushSubscription,
saveOwnerPushSubscription
} from "../../services/push/webPushService.js";
import {
listOwnerQrPaymentsForOwner
} from "../../money-core/ownerQrPayments.service.js";
import {
buildPaymentProjectionResponse as buildSharedPaymentProjectionResponse,
getPaymentProjectionList
} from "./paymentProjection.js";
import {
getCollectionAnchors
} from "../../services/paymentCollectionAnchors.service.js";
import { normalizePhoneForMarket, requireCurrencyCode, resolveBusinessMarketContext, resolveOwnerMarketContext } from "../../market-context/BusinessContext.js";
import { rejectLegacyUsServiceMutation, rejectLegacyUsMasterServiceCreation } from "../../services/usServiceLink.service.js";
import {
  canonicalOwnerProfile, ownerProfileRevision,
  validateOwnerProfilePatch, ownerProfilePayload
} from "../../services/ownerCabinetProfile.service.js";
import {
  usHoursProblem, validateUsHoursWriteBody,
  readUsMasterWeeklyHours, replaceUsMasterWeeklyHours,
} from "../../services/usMasterWorkingHours.service.js";

// Existing legacy master quick-booking endpoint cannot provide the
// US location, IANA slot and authoritative USD price snapshot contracts.
// Fail closed BEFORE any client, slot or booking is written. KG/KZ unchanged.
export async function checkMasterQuickBookingMarket(db, salonId) {
  if(!Number.isSafeInteger(Number(salonId)) || Number(salonId)<1) {
    return {ok:false,status:409,error:"MASTER_QUICK_BOOKING_MARKET_UNRESOLVED"};
  }
  const market=await db.query(
    `SELECT mk.code AS market_code, mk.country_code, mk.default_currency, mk.active
       FROM public.tenant_market_settings t
       JOIN public.markets mk ON mk.id=t.market_id
       WHERE t.salon_id=$1
       LIMIT 1`,
    [Number(salonId)]
  );
  if(market.rows.length!==1 || market.rows[0].active!==true) {
    return {ok:false,status:409,error:"MASTER_QUICK_BOOKING_MARKET_UNRESOLVED"};
  }
  const code=String(market.rows[0].market_code||"").trim().toUpperCase();
  if(code==="US") {
    return {ok:false,status:409,error:"US_QUICK_BOOKING_LOCATION_PRICE_REQUIRED"};
  }
  if(code!=="KG" && code!=="KZ") {
    return {ok:false,status:409,error:"MASTER_QUICK_BOOKING_MARKET_UNSUPPORTED"};
  }
  return {ok:true,market_code:code};
}

export default function buildMastersRouter(pool, internalReadRateLimit){

const r = express.Router();

function safeInt(v){
const n = Number(v);
if(!Number.isInteger(n) || n <= 0){
return null;
}
return n;
}



function getIdentityMasterIds(identity){
const ids = new Set();

if(Array.isArray(identity?.masters)){
for(const item of identity.masters){
if(item && typeof item === "object"){
const id = safeInt(item.id ?? item.master_id ?? item.owner_id);
if(id){
ids.add(id);
}
continue;
}

const id = safeInt(item);
if(id){
ids.add(id);
}
}

}

if(Array.isArray(identity?.ownership)){
for(const item of identity.ownership){
if(!item || typeof item !== "object"){
continue;
}

const ownerType = String(item.owner_type || item.type || "").trim();
if(ownerType !== "master"){
continue;
}

const id = safeInt(item.owner_id ?? item.master_id ?? item.id);
if(id){
ids.add(id);
}
}
}

return ids;
}

function hasMasterOwnership(req, masterId){
if(req?.auth?.role === "system"){
return true;
}

const targetMasterId = safeInt(masterId);
if(!targetMasterId){
return false;
}

const identityMasterIds = getIdentityMasterIds(req?.identity);
return identityMasterIds.has(targetMasterId);
}

function roundProjectionMoney(value){
const numeric = Number(value);
if(!Number.isFinite(numeric)){
return 0;
}

return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function normalizeProjectionDate(value){
if(!value){
return null;
}

const date = value instanceof Date ? value : new Date(value);
if(Number.isNaN(date.getTime())){
return null;
}

return date.toISOString();
}

function normalizeProjectionPercent(value){
const numeric = Number(value);
return Number.isFinite(numeric) ? numeric : 0;
}

async function getMasterBillingAccess(dbOrPool, masterId){
const us=await getUsSaasAccess(dbOrPool,{ownerType:"master",ownerId:masterId,
  policy:readUsSaasProjectionPolicy()});
const billing = await dbOrPool.query(`
SELECT
id,
owner_type,
owner_id,
billing_model,
subscription_status,
subscription_period_days,
amount,
currency,
wallet_only,
current_period_start,
current_period_end,
grace_period_days,
grace_until,
last_charge_at,
next_charge_at,
last_charge_status,
blocked_at,
created_at,
updated_at
FROM public.billing_subscriptions
WHERE owner_type='master'
AND owner_id=$1
LIMIT 1
`,[masterId]);

if(us.managed)return {exists:Boolean(billing.rows.length),
  subscription_status:us.subscription_status,access_state:us.access_state,
  can_write:us.can_write,can_withdraw:us.can_withdraw,
  billing:billing.rows[0]||null};
if(!billing.rows.length){
return {
exists:false,
subscription_status:"active",
access_state:"active",
can_write:true,
can_withdraw:true,
billing:null
};
}

const row = billing.rows[0];
const status = row.subscription_status || "active";
const accessState = resolveBillingAccessState(row);
const canWrite = accessState === "active" || accessState === "grace";
const canWithdraw = accessState === "active";

return {
exists:true,
subscription_status:status,
access_state:accessState,
can_write:canWrite,
can_withdraw:canWithdraw,
billing:row
};
}

async function ensureMasterWriteAllowed(db, masterId){
const access = await getMasterBillingAccess(db, masterId);

if(!access.can_write){
const err = new Error("BILLING_BLOCKED");
err.code = "BILLING_BLOCKED";
err.access = {
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
};
throw err;
}

return access;
}

async function getMasterBySlug(dbOrPool, slug){
const master = await dbOrPool.query(`
SELECT
m.id,
m.name,
m.slug,
m.user_id
FROM masters m
WHERE m.slug=$1
LIMIT 1
`,[slug]);

if(!master.rows.length){
return null;
}

return master.rows[0];
}

function getBookingPaymentLabelRu(provider, status, hasPayment){
if(!hasPayment){
return "Оплата не выбрана";
}

const normalizedProvider = String(provider || "").trim().toLowerCase();
const normalizedStatus = String(status || "").trim().toLowerCase();

if(normalizedStatus === "failed"){
return "Оплата не прошла";
}

if(normalizedStatus === "refunded"){
return "Оплата возвращена";
}

if(normalizedProvider === "direct" && normalizedStatus === "pending"){
return "Наличные ожидают подтверждения";
}

if(normalizedProvider === "direct" && normalizedStatus === "confirmed"){
return "Оплата наличными подтверждена";
}

if(normalizedProvider === "xpay" && normalizedStatus === "pending"){
return "Ожидаем оплату XPAY";
}

if(normalizedProvider === "xpay" && normalizedStatus === "confirmed"){
return "Оплата получена";
}

return "Оплата не выбрана";
}

async function getMasterWalletRow(dbOrPool, masterId){
const wallet = await dbOrPool.query(`
SELECT
w.id,
w.owner_type,
w.owner_id,
w.currency,
COALESCE(SUM(CASE
  WHEN le.id IS NULL THEN 0
  WHEN le.reference_type='payment'
    AND pay.provider='direct'
    AND pay.status='confirmed'
    AND (pay.collector_owner_type IS NULL OR pay.collector_owner_id IS NULL)
  THEN 0
  WHEN le.direction='credit' THEN COALESCE(le.amount_cents,0)
  WHEN le.direction='debit' THEN -COALESCE(le.amount_cents,0)
  ELSE 0
END),0)::int AS balance
FROM totem_test.wallets w
LEFT JOIN totem_test.ledger_entries le ON le.wallet_id=w.id
LEFT JOIN public.payments pay ON pay.id::text=le.reference_id::text
WHERE w.owner_type='master'
AND w.owner_id=$1
GROUP BY w.id, w.owner_type, w.owner_id, w.currency
LIMIT 1
`,[masterId]);

if(!wallet.rows.length){
return null;
}

return wallet.rows[0];
}


async function getSystemWalletId(db, currency){
const normalizedCurrency = requireCurrencyCode(currency, "SYSTEM_WALLET_CURRENCY_REQUIRED");
const wallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type='system'
AND currency=$1
ORDER BY id ASC
LIMIT 1
`,[normalizedCurrency]);

if(!wallet.rows.length){
const err = new Error("SYSTEM_WALLET_NOT_FOUND");
err.code = "SYSTEM_WALLET_NOT_FOUND";
throw err;
}

return wallet.rows[0].id;
}

async function getMasterWalletRowForCharge(db, masterId, currency){
const wallet = await db.query(`
SELECT
id,
owner_type,
owner_id,
currency
FROM totem_test.wallets
WHERE owner_type='master'
AND owner_id=$1
AND currency=$2
FOR UPDATE
LIMIT 1
`,[masterId, requireCurrencyCode(currency, "WALLET_CURRENCY_REQUIRED")]);

if(!wallet.rows.length){
const err = new Error("MASTER_WALLET_NOT_FOUND");
err.code = "MASTER_WALLET_NOT_FOUND";
throw err;
}

return wallet.rows[0];
}

async function getWalletBalanceById(db, walletId){
const balance = await db.query(`
SELECT
COALESCE(computed_balance_cents,0)::int AS balance
FROM totem_test.v_wallet_balance_computed
WHERE wallet_id=$1
LIMIT 1
`,[walletId]);

return Number(balance.rows[0]?.balance || 0);
}

async function ensureMasterBillingSubscription(db, masterId){
const ownerContext = await resolveOwnerMarketContext(db, { ownerType: "master", ownerId: masterId });
const billingCurrency = requireCurrencyCode(ownerContext.currency_code, "BILLING_CURRENCY_REQUIRED");
const existing = await db.query(`
SELECT
id,
owner_type,
owner_id,
billing_model,
subscription_status,
subscription_period_days,
amount,
currency,
wallet_only,
current_period_start,
current_period_end,
grace_period_days,
grace_until,
last_charge_at,
next_charge_at,
last_charge_status,
blocked_at,
created_at,
updated_at
FROM public.billing_subscriptions
WHERE owner_type='master'
AND owner_id=$1
FOR UPDATE
LIMIT 1
`,[masterId, billingCurrency]);

if(existing.rows.length){
return existing.rows[0];
}

const created = await db.query(`
INSERT INTO public.billing_subscriptions(
owner_type,
owner_id,
billing_model,
subscription_status,
subscription_period_days,
amount,
currency,
wallet_only,
current_period_start,
current_period_end,
grace_period_days,
grace_until,
last_charge_at,
next_charge_at,
last_charge_status,
blocked_at,
created_at,
updated_at
)
VALUES(
'master',
$1,
'subscription',
'active',
30,
1000,
$2,
true,
NULL,
NULL,
3,
NULL,
NULL,
NULL,
NULL,
NULL,
NOW(),
NOW()
)
RETURNING
id,
owner_type,
owner_id,
billing_model,
subscription_status,
subscription_period_days,
amount,
currency,
wallet_only,
current_period_start,
current_period_end,
grace_period_days,
grace_until,
last_charge_at,
next_charge_at,
last_charge_status,
blocked_at,
created_at,
updated_at
`,[masterId]);

return created.rows[0];
}

function resolveBillingAccessState(billing){
if(!billing){
return "active";
}

if(billing.blocked_at){
return "blocked";
}

const now = Date.now();
const nextChargeAt = billing.next_charge_at ? new Date(billing.next_charge_at).getTime() : null;
const graceUntil = billing.grace_until ? new Date(billing.grace_until).getTime() : null;

if(nextChargeAt && nextChargeAt < now){
if(graceUntil && graceUntil >= now){
return "grace";
}
return "overdue";
}

return billing.subscription_status || "active";
}

/*
MASTER SUBSCRIPTION MANUAL CHARGE
*/
r.post("/masters/:slug/subscription/charge", async (req,res)=>{

const { slug } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const master = await getMasterBySlug(db, slug);

if(!master){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

if(!hasMasterOwnership(req, master.id)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const billing = await ensureMasterBillingSubscription(db, master.id);

if(billing.subscription_status !== "active"){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SUBSCRIPTION_NOT_ACTIVE"});
}

const amount = Number(billing.amount);
if(!Number.isFinite(amount) || amount <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SUBSCRIPTION_AMOUNT_INVALID"});
}

const billingCurrency = requireCurrencyCode(billing.currency, "BILLING_CURRENCY_REQUIRED");

const masterWallet = await getMasterWalletRowForCharge(db, master.id, billingCurrency);
const masterWalletId = masterWallet.id;
const masterBalance = await getWalletBalanceById(db, masterWalletId);

if(masterBalance < amount){
await db.query("ROLLBACK");
return res.status(400).json({
ok:false,
error:"INSUFFICIENT_WALLET_BALANCE",
balance:masterBalance,
amount
});
}

if(billing.next_charge_at && new Date(billing.next_charge_at).getTime() > Date.now()){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"SUBSCRIPTION_ALREADY_ACTIVE_FOR_CURRENT_PERIOD",
next_charge_at:billing.next_charge_at,
last_charge_at:billing.last_charge_at
});
}

const systemWalletId = await getSystemWalletId(db, billingCurrency);

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id,
created_at
)
VALUES($1,'debit',$2,'subscription',$3,NOW())
`,[
masterWalletId,
amount,
String(billing.id)
]);

await db.query(`
INSERT INTO totem_test.ledger_entries(
wallet_id,
direction,
amount_cents,
reference_type,
reference_id,
created_at
)
VALUES($1,'credit',$2,'subscription',$3,NOW())
`,[
systemWalletId,
amount,
String(billing.id)
]);

await db.query(`
UPDATE public.billing_subscriptions
SET
last_charge_at=NOW(),
last_charge_status='success',
current_period_start=COALESCE(next_charge_at, NOW()),
current_period_end=COALESCE(next_charge_at, NOW()) + (COALESCE(subscription_period_days,30) || ' days')::interval,
next_charge_at=COALESCE(next_charge_at, NOW()) + (COALESCE(subscription_period_days,30) || ' days')::interval,
updated_at=NOW()
WHERE id=$1
`,[billing.id]);

await db.query("COMMIT");

const billing_access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
charged:true,
owner_type:"master",
owner_id:master.id,
amount,
currency:requireCurrencyCode(billing.currency, "BILLING_CURRENCY_REQUIRED"),
reference_type:"subscription",
reference_id:String(billing.id),
billing_access
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

if(err.code === "SYSTEM_WALLET_NOT_FOUND"){
return res.status(500).json({
ok:false,
error:"SYSTEM_WALLET_NOT_FOUND"
});
}

if(err.code === "MASTER_WALLET_NOT_FOUND"){
return res.status(404).json({
ok:false,
error:"MASTER_WALLET_NOT_FOUND"
});
}

console.error("MASTER_SUBSCRIPTION_CHARGE_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_SUBSCRIPTION_CHARGE_FAILED"
});

}finally{

db.release();

}

});



/*
MASTER BILLING
*/
r.get("/masters/:slug/billing", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await getMasterBySlug(pool, slug);

if(!master){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

if(!hasMasterOwnership(req, master.id)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
owner_type:"master",
owner_id:master.id,
owner_slug:master.slug,
exists:access.exists,
subscription_status:access.subscription_status,
access_state:access.access_state,
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
});

}catch(err){

console.error("MASTER_BILLING_FETCH_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_BILLING_FETCH_FAILED"
});

}

});

r.post("/masters/:slug/billing/block", async (req,res)=>{

const { slug } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const master = await getMasterBySlug(db, slug);

if(!master){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

if(!hasMasterOwnership(req, master.id)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const billing = await ensureMasterBillingSubscription(db, master.id);

await db.query(`
UPDATE public.billing_subscriptions
SET
blocked_at=NOW(),
subscription_status='blocked',
updated_at=NOW()
WHERE id=$1
`,[billing.id]);

await db.query("COMMIT");

const access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
blocked:true,
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:resolveBillingAccessState(access.billing),
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("MASTER_BILLING_BLOCK_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_BILLING_BLOCK_FAILED"
});

}finally{

db.release();

}

});

r.post("/masters/:slug/billing/unblock", async (req,res)=>{

const { slug } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const master = await getMasterBySlug(db, slug);

if(!master){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

if(!hasMasterOwnership(req, master.id)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const billing = await ensureMasterBillingSubscription(db, master.id);

await db.query(`
UPDATE public.billing_subscriptions
SET
blocked_at=NULL,
subscription_status='active',
updated_at=NOW()
WHERE id=$1
`,[billing.id]);

await db.query("COMMIT");

const access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
blocked:false,
billing_access:{
exists:access.exists,
subscription_status:access.subscription_status,
access_state:resolveBillingAccessState(access.billing),
can_write:access.can_write,
can_withdraw:access.can_withdraw,
billing:access.billing
}
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("MASTER_BILLING_UNBLOCK_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_BILLING_UNBLOCK_FAILED"
});

}finally{

db.release();

}

});


/*
GET MASTER BY SLUG
*/
r.get("/masters/:slug", internalReadRateLimit, async (req,res)=>{
  const {slug}=req.params;
  try{
    const found=await pool.query(
      `SELECT m.id,m.name,m.slug,m.user_id FROM public.masters m WHERE m.slug=$1`,
      [slug]
    );
    if(!found.rows.length)return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
    const master=found.rows[0];
    if(!hasMasterOwnership(req,master.id)){
      return res.status(403).json({ok:false,error:"FORBIDDEN"});
    }
    let shared=null;
    if(req.auth?.us_role_context==="own_salon_master_v1"){
      shared=await readUsOwnSalonMasterAuthority(pool,req.auth.master_request_id);
      if(shared.masterId!==Number(master.id)||shared.principalAuthUserId!==Number(req.auth.user_id))
        return res.status(403).json({ok:false,error:"US_ROLE_CONTEXT_SCOPE_MISMATCH"});
    }
    let sharedProfileWrite=false;
    if(shared&&usSharedMasterProfileEnabled()){
      const access=await readUsOwnSalonProfileAccess(pool,{auth:req.auth,slug});
      sharedProfileWrite=access.masterId===Number(master.id);
    }
    // Paid shared subscription readback does not unlock unaudited legacy
    // commercial/master write routes. Existing limited context is read-only.
    const billing_access=shared?{exists:true,subscription_status:"active",access_state:"active",
      can_write:false,can_withdraw:false,billing:null,shared_salon_subscription:true,
      salon_owner_id:shared.salonId,paid_until:shared.paidUntil,role_context_limited:true,
      shared_operations:{profile:sharedProfileWrite,services:usSharedMasterServicesEnabled(),
        price:usSharedMasterPriceEnabled(),hours:usSharedMasterHoursEnabled(),
        booking:usSharedMasterBookingEnabled(),finance:false}}
      :await getMasterBillingAccess(pool,master.id);
    const masterSalon=await pool.query(
      `SELECT ms.salon_id,s.slug AS salon_slug
         FROM public.master_salon ms
         JOIN public.salons s ON s.id=ms.salon_id
        WHERE ms.master_id=$1 AND ms.status='active'
        ORDER BY ms.activated_at DESC NULLS LAST,ms.id DESC LIMIT 1`,
      [master.id]
    );
    const salonRelation=masterSalon.rows[0]||null;
    let profile={};
    if(req.auth?.role==="master" && req.auth?.source==="session" &&
       String(req.auth.user_id)===String(master.user_id)){
      const auth=await pool.query(
        `SELECT email FROM public.auth_users
          WHERE id=$1 AND role=$2 AND enabled=true LIMIT 1`,
        [master.user_id,(shared||req.auth.kg_shared_master_request_id)?"salon_admin":"master"]
      );
      if(auth.rows.length){
        profile=ownerProfilePayload("master",slug,master,auth.rows[0].email,
          shared?sharedProfileWrite:billing_access.can_write);
      }
    }
    return res.json({
      ok:true,
      master:{...master,salon_id:salonRelation?.salon_id||null,
        salon_slug:salonRelation?.salon_slug||null,
        salonSlug:salonRelation?.salon_slug||null},
      billing_access,...profile
    });
  }catch(err){
    console.error("MASTER_FETCH_ERROR",err);
    return res.status(500).json({ok:false,error:"MASTER_FETCH_FAILED"});
  }
});




/* US master weekly hours. SAME master router, existing US-03 table.
   Never run or reinterpret legacy KG/KZ master_working_hours here. */
const US_MASTER_LOCATION_ROWS = `
  SELECT l.id AS location_id, l.salon_id, s.slug AS salon_slug,
         s.name AS salon_name, l.location_code, l.city_name, l.state_code,
         l.timezone_name, l.is_primary
    FROM public.master_salon ms
    JOIN public.salons s ON s.id=ms.salon_id
    JOIN public.us_salon_locations l ON l.salon_id=s.id
    JOIN public.tenant_market_settings t ON t.salon_id=s.id
    JOIN public.markets mk ON mk.id=t.market_id
    JOIN public.us_timezones z ON z.name=l.timezone_name
   WHERE ms.master_id=$1 AND ms.status='active'
     AND s.status='active' AND s.enabled=true
     AND l.enabled=true AND mk.code='US' AND mk.active=true
     AND mk.country_code='US' AND mk.default_currency='USD'
     AND mk.country_pack_code='US' AND mk.country_pack_version='1'
`;

function usHoursHttpError(res,err){
  if([403,409].includes(err?.status)&&/^US_(ROLE_CONTEXT|MASTER_|SAAS_)/.test(String(err?.code||err?.message||"")))
    return res.status(403).json({ok:false,error:"US_HOURS_BILLING_BLOCKED"});
  const known=Number.isInteger(err?.statusCode) && err?.code?.startsWith("US_");
  if (known) return res.status(err.statusCode).json({ok:false,error:err.code});
  if(err?.code==="BILLING_BLOCKED")
    return res.status(403).json({ok:false,error:"BILLING_BLOCKED"});
  if(["23503","23505","23514","40001","40P01"].includes(err?.code))
    return res.status(409).json({ok:false,error:"US_HOURS_DB_CONFLICT"});
  console.error("MASTER_US_WORKING_HOURS_FAILED",String(err?.code||"UNKNOWN"));
  return res.status(503).json({ok:false,error:"US_HOURS_STORAGE_UNAVAILABLE"});
}

function parseUsHoursScope(query={},requireScope=false){
  const keys=Object.keys(query||{});
  if(keys.some(k=>!["salon_slug","location_code"].includes(k))) {
    throw usHoursProblem("US_HOURS_SCOPE_INVALID");
  }
  const salonSlug=query.salon_slug;
  const code=query.location_code;
  if(!requireScope && keys.length===0)return null;
  if(keys.length!==2 || typeof salonSlug!=="string" ||
     typeof code!=="string" ||
     !/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/.test(salonSlug) ||
     !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)){
    throw usHoursProblem("US_HOURS_SCOPE_INVALID");
  }
  return {salon_slug:salonSlug,location_code:code};
}

async function checkedUsMasterHoursActor(db,req,lock=false){
  if(req.auth?.source!=="session" || req.auth?.role!=="master" ||
     !Number.isSafeInteger(Number(req.auth.user_id)) ||
     Number(req.auth.user_id)<1) {
    throw usHoursProblem("US_HOURS_MASTER_SESSION_REQUIRED",403);
  }
  const master=await db.query(
    "SELECT id,user_id,active FROM public.masters WHERE slug=$1 LIMIT 1",
    [req.params.slug]
  );
  const row=master.rows[0];
  if(!row)throw usHoursProblem("US_HOURS_MASTER_NOT_FOUND",404);
  if(row.active!==true ||
     String(row.user_id)!==String(req.auth.user_id) ||
     !hasMasterOwnership(req,row.id)){
    throw usHoursProblem("US_HOURS_MASTER_FORBIDDEN",403);
  }
  if(req.auth.us_role_context==="own_salon_master_v1"){
    const shared=await readUsOwnSalonHoursAccess(db,{auth:req.auth,slug:req.params.slug,lock});
    if(shared.masterId!==Number(row.id))
      throw usHoursProblem("US_HOURS_MASTER_FORBIDDEN",403);
    return {master_id:shared.masterId,master_slug:String(req.params.slug),shared_salon_id:shared.salonId};
  }
  const validAuth=await db.query(
    "SELECT 1 FROM public.auth_users WHERE id=$1 AND enabled=true AND role='master' LIMIT 1",
    [row.user_id]
  );
  if(validAuth.rows.length!==1){
    throw usHoursProblem("US_HOURS_MASTER_SESSION_INVALID",403);
  }
  return {master_id:Number(row.id),master_slug:String(req.params.slug)};
}

function validateUsLocationHoursRow(row){
  if (!row || !Number.isSafeInteger(Number(row.location_id)) ||
      Number(row.location_id)<1 ||
      !row.timezone_name || row.timezone_name==="UTC" ||
      row.timezone_name==="Etc/UTC") {
    throw usHoursProblem("US_HOURS_LOCATION_TIMEZONE_INVALID",409);
  }
  try{
    new Intl.DateTimeFormat("en-US",{timeZone:row.timezone_name})
      .format(new Date("2026-07-15T12:00:00Z"));
  }catch{
    throw usHoursProblem("US_HOURS_LOCATION_TIMEZONE_INVALID",409);
  }
  return {
    location_id:Number(row.location_id),salon_id:Number(row.salon_id),
    salon_slug:String(row.salon_slug),salon_name:String(row.salon_name||""),
    location_code:String(row.location_code),city_name:String(row.city_name||""),
    state_code:String(row.state_code||""),
    timezone:String(row.timezone_name),is_primary:row.is_primary===true,
  };
}

async function listUsMasterHoursLocations(db,masterId,sharedSalonId=null){
  const found=await db.query(
    US_MASTER_LOCATION_ROWS+
    (sharedSalonId?" AND s.id=$2":"")+
    " ORDER BY s.slug,l.is_primary DESC,l.location_code LIMIT 101",
    [masterId,...(sharedSalonId?[sharedSalonId]:[])]
  );
  if(found.rows.length>100)
    throw usHoursProblem("US_HOURS_TOO_MANY_LOCATIONS",409);
  return found.rows.map(validateUsLocationHoursRow);
}

async function selectLockedUsHoursLocation(db,masterId,scope,sharedSalonId=null){
  const result=await db.query(
    US_MASTER_LOCATION_ROWS+
    " AND s.slug=$2 AND l.location_code=$3"+
    (sharedSalonId?" AND s.id=$4":"")+" LIMIT 1"+
    " FOR UPDATE OF l FOR SHARE OF ms,s",
    [masterId,scope.salon_slug,scope.location_code,...(sharedSalonId?[sharedSalonId]:[])]
  );
  if(result.rows.length!==1){
    throw usHoursProblem("US_HOURS_LOCATION_RELATION_NOT_FOUND",404);
  }
  return validateUsLocationHoursRow(result.rows[0]);
}

function usMasterHoursPayload(actor,location,stored,saved=false){
  return {
    ok:true,market_code:"US",owner_type:"master",
    owner_slug:actor.master_slug,master_id:actor.master_id,
    location,revision:stored.revision,hours:stored.hours,week:stored.week,
    saved,weekday_mapping:{
      0:"sunday",1:"monday",2:"tuesday",3:"wednesday",
      4:"thursday",5:"friday",6:"saturday",
    },
  };
}

// Without explicit scope, the endpoint returns ONLY the actual US locations
// of the authenticated existing master. No synthetic salon or schedule.
r.get("/masters/:slug/us-working-hours",internalReadRateLimit,async(req,res)=>{
  res.set("Cache-Control","no-store");
  try{
    const scope=parseUsHoursScope(req.query,false);
    const actor=await checkedUsMasterHoursActor(pool,req);
    if(!scope){
      const locations=await listUsMasterHoursLocations(pool,actor.master_id,actor.shared_salon_id);
      return res.json({
        ok:true,market_code:"US",owner_type:"master",
        owner_slug:actor.master_slug,locations,
      });
    }
    const locations=await listUsMasterHoursLocations(pool,actor.master_id,actor.shared_salon_id);
    const location=locations.find(item=>
      item.salon_slug===scope.salon_slug &&
      item.location_code===scope.location_code);
    if(!location){
      return res.status(404).json({
        ok:false,error:"US_HOURS_LOCATION_RELATION_NOT_FOUND",
      });
    }
    const stored=await readUsMasterWeeklyHours(
      pool,location.location_id,actor.master_id);
    return res.json(usMasterHoursPayload(actor,location,stored));
  }catch(err){
    return usHoursHttpError(res,err);
  }
});

r.put("/masters/:slug/us-working-hours",async(req,res)=>{
  res.set("Cache-Control","no-store");
  let client=null,started=false;
  try{
    const scope=parseUsHoursScope(req.query,true);
    const desired=validateUsHoursWriteBody(req.body);
    client=await pool.connect();
    await client.query("BEGIN");
    started=true;
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '2000ms'");
    // Shared authority locks master/membership/market rows BEFORE the
    // advisory lock: public booking already holds SHARE on these rows
    // when acquiring 973103. Inverting this order risks a deadlock.
    const actor=await checkedUsMasterHoursActor(client,req,true);
    // Reuse the EXACT US public-booking transaction advisory lock (master
    // key 973103); acquire before location row locks for consistent order.
    // No KG/KZ endpoint acquires this lock.
    await client.query(
      "SELECT pg_advisory_xact_lock($1::integer, $2::integer)",
      [973103,actor.master_id]
    );
    const location=await selectLockedUsHoursLocation(
      client,actor.master_id,scope,actor.shared_salon_id);
    // Explicit US-only location: never fall back to legacy wallet/missing=active.
    if(!actor.shared_salon_id){
      const entitlement=await getUsSaasAccess(client,{ownerType:"master",ownerId:actor.master_id,
        policy:readUsSaasProjectionPolicy()});
      if(entitlement.managed!==true||entitlement.can_write!==true){
        const error=new Error("BILLING_BLOCKED");error.code="BILLING_BLOCKED";throw error;
      }
    }
    const saved=await replaceUsMasterWeeklyHours(client,{
      locationId:location.location_id,masterId:actor.master_id,
      revision:desired.revision,hours:desired.hours,
      timezone:location.timezone,
    });
    if(actor.shared_salon_id){
      const final=await readUsOwnSalonHoursAccess(client,{auth:req.auth,slug:req.params.slug,lock:true});
      if(final.masterId!==actor.master_id||final.salonId!==actor.shared_salon_id)
        throw usHoursProblem("US_HOURS_MASTER_FORBIDDEN",403);
    }
    await client.query("COMMIT");
    started=false;
    return res.json(usMasterHoursPayload(actor,location,saved,true));
  }catch(err){
    if(client && started){
      try{await client.query("ROLLBACK");}catch(_ignored){}
    }
    return usHoursHttpError(res,err);
  }finally{
    client?.release();
  }
});

/* Canonical master profile write. Only the confirmed masters.name column. */
r.patch("/masters/:slug", async(req,res)=>{
  if(req.auth?.role!=="master" || req.auth?.source!=="session"){
    return res.status(403).json({ok:false,error:"PROFILE_SESSION_REQUIRED"});
  }
  const input=validateOwnerProfilePatch("master",req.body);
  if(!input.ok)return res.status(400).json({ok:false,error:input.error});
  const db=await pool.connect();
  try{
    await db.query("BEGIN");
    await db.query("SET LOCAL statement_timeout = '5000ms'");
    await db.query("SET LOCAL lock_timeout = '2000ms'");
    const sharedContext=req.auth.us_role_context==="own_salon_master_v1";
    const shared=sharedContext?await readUsOwnSalonProfileAccess(db,{auth:req.auth,slug:req.params.slug,lock:true}):null;
    const before=await db.query(
      `SELECT id,name,slug,user_id FROM public.masters
        WHERE slug=$1 LIMIT 1 FOR UPDATE`,
      [req.params.slug]
    );
    if(!before.rows.length){
      await db.query("ROLLBACK");
      return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
    }
    const master=before.rows[0];
    if(!hasMasterOwnership(req,master.id) ||
       String(req.auth.user_id)!==String(master.user_id)||shared&&shared.masterId!==Number(master.id)){
      await db.query("ROLLBACK");
      return res.status(403).json({ok:false,error:"FORBIDDEN"});
    }
    const auth=await db.query(
      `SELECT email FROM public.auth_users WHERE id=$1 AND enabled=true
          AND role=$2 LIMIT 1`,
      [master.user_id,(shared||req.auth.kg_shared_master_request_id)?"salon_admin":"master"]
    );
    if(auth.rows.length!==1){
      await db.query("ROLLBACK");
      return res.status(403).json({ok:false,error:"PROFILE_SESSION_INVALID"});
    }
    if(!shared)await ensureMasterWriteAllowed(db,master.id);
    if(ownerProfileRevision("master",master)!==input.revision){
      await db.query("ROLLBACK");
      return res.status(409).json({ok:false,error:"PROFILE_REVISION_CONFLICT"});
    }
    await db.query("UPDATE public.masters SET name=$2 WHERE id=$1",
      [master.id,input.values.name]);
    const after=await db.query(
      "SELECT id,name,slug,user_id FROM public.masters WHERE id=$1",[master.id]);
    if(after.rows.length!==1 ||
       JSON.stringify(canonicalOwnerProfile("master",after.rows[0])) !==
       JSON.stringify(input.values)){
      await db.query("ROLLBACK");
      return res.status(409).json({ok:false,error:"PROFILE_STORAGE_READBACK_MISMATCH"});
    }
    // Recheck paid period and session immediately before commit.
    if(shared)await readUsOwnSalonProfileAccess(db,{auth:req.auth,slug:req.params.slug,lock:true});
    const profile=ownerProfilePayload("master",req.params.slug,after.rows[0],
      auth.rows[0].email,true,true);
    await db.query("COMMIT");
    return res.json({ok:true,master:after.rows[0],...profile});
  }catch(err){
    try{await db.query("ROLLBACK");}catch(_ignored){}
    if(err.code==="BILLING_BLOCKED"||req.auth?.us_role_context==="own_salon_master_v1"&&[403,409].includes(err?.status)){
      return res.status(403).json({ok:false,error:"PROFILE_BILLING_BLOCKED"});
    }
    console.error("MASTER_PROFILE_UPDATE_FAILED",err);
    return res.status(503).json({ok:false,error:"PROFILE_STORAGE_UNAVAILABLE"});
  }finally{
    db.release();
  }
});

/*
MASTER NOTIFICATIONS
*/
r.get("/masters/:slug/notifications", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const limitValue = Number.parseInt(String(req.query.limit ?? 20), 10);
const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 20;
const readerId = String(masterId);

const items = await listNotificationsForTarget(pool,{
target_type:"master",
target_id:String(masterId),
channel:"in_app",
status:"sent",
limit
});

const unread_count = await countUnread(pool,{
reader_type:"master",
reader_id:String(masterId),
target_type:"master",
target_id:String(masterId)
});

const notificationIds = items
.map((item)=>item?.id)
.filter((id)=>Number.isInteger(Number(id)) && Number(id) > 0)
.map((id)=>Number(id));

let readsByNotificationId = new Map();

if(notificationIds.length){
const readsRes = await pool.query(
`
SELECT notification_id, read_at
FROM public.app_notification_reads
WHERE reader_type='master'
AND reader_id=$1
AND notification_id = ANY($2::bigint[])
`,
[readerId, notificationIds]
);

readsByNotificationId = new Map(
(readsRes.rows || []).map((row)=>[String(row.notification_id), row.read_at || null])
);
}

return res.json({
ok:true,
notifications:items.map((item)=>{
const readAt = readsByNotificationId.get(String(item.id)) || item.read_at || null;

return {
...item,
read_at:readAt,
is_read:Boolean(readAt)
};
}),
unread_count
});
}catch(err){
console.error("MASTER_NOTIFICATIONS_ERROR",err);
return res.status(500).json({ok:false,error:"MASTER_NOTIFICATIONS_FETCH_FAILED"});
}
});

r.post("/masters/:slug/notifications/:notificationUid/read", internalReadRateLimit, async (req,res)=>{

const { slug, notificationUid } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const safeNotificationUid = String(notificationUid || "").trim();
if(!safeNotificationUid){
return res.status(400).json({ok:false,error:"NOTIFICATION_UID_REQUIRED"});
}

const read = await markNotificationRead(pool, safeNotificationUid,{
reader_type:"master",
reader_id:String(masterId)
});

if(!read){
return res.status(404).json({ok:false,error:"NOTIFICATION_NOT_FOUND"});
}

return res.json({
ok:true,
read
});
}catch(err){
console.error("MASTER_NOTIFICATION_READ_ERROR",err);
return res.status(500).json({ok:false,error:"MASTER_NOTIFICATION_READ_FAILED"});
}
});

r.post("/masters/:slug/push-subscriptions", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const body = req.body && typeof req.body === "object" ? req.body : {};
const result = await saveOwnerPushSubscription(pool,{
user_type:"master",
user_id:String(masterId),
device_id:body.device_id,
platform:body.platform,
subscription:body.subscription,
user_agent:body.user_agent
});

if(!result.ok){
return res.status(result.status || 400).json({ok:false,error:result.error || "PUSH_SUBSCRIPTION_SAVE_FAILED"});
}

return res.json({
ok:true,
user_type:"master",
user_id:String(masterId),
device_id:result.device_id,
enabled:true
});
}catch(err){
console.error("MASTER_PUSH_SUBSCRIPTION_SAVE_ERROR",err);
return res.status(500).json({ok:false,error:"PUSH_SUBSCRIPTION_SAVE_FAILED"});
}
});

r.delete("/masters/:slug/push-subscriptions/:device_id", internalReadRateLimit, async (req,res)=>{

const { slug, device_id } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const result = await revokeOwnerPushSubscription(pool,{
user_type:"master",
user_id:String(masterId),
device_id
});

if(!result.ok){
return res.status(result.status || 400).json({ok:false,error:result.error || "PUSH_SUBSCRIPTION_REVOKE_FAILED"});
}

return res.json({
ok:true,
user_type:"master",
user_id:String(masterId),
device_id:String(device_id || ""),
revoked:Boolean(result.revoked)
});
}catch(err){
console.error("MASTER_PUSH_SUBSCRIPTION_REVOKE_ERROR",err);
return res.status(500).json({ok:false,error:"PUSH_SUBSCRIPTION_REVOKE_FAILED"});
}
});

/*
MASTER METRICS
*/
r.get("/masters/:slug/metrics", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const bookingsToday = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE master_id=$1
AND DATE(start_at)=CURRENT_DATE
`,[masterId]);

const bookingsWeek = await pool.query(`
SELECT COUNT(*)::int AS v
FROM bookings
WHERE master_id=$1
AND start_at >= NOW() - INTERVAL '7 days'
`,[masterId]);

const clientsTotal = await pool.query(`
SELECT COUNT(*)::int AS v
FROM clients
WHERE id IN (
SELECT client_id FROM bookings WHERE master_id=$1
)
`,[masterId]);

const cashPendingExposure = await pool.query(`
SELECT
COUNT(*) FILTER (
  WHERE pay.provider = 'direct'
    AND pay.status = 'pending'
    AND pay.is_active = true
)::int AS cash_pending_exposure_count,
COALESCE(SUM(pay.amount) FILTER (
  WHERE pay.provider = 'direct'
    AND pay.status = 'pending'
    AND pay.is_active = true
), 0) AS cash_pending_exposure_amount
FROM bookings b
LEFT JOIN LATERAL (
  SELECT
    p.provider,
    p.status,
    p.is_active,
    p.amount
  FROM public.payments p
  WHERE p.booking_id=b.id
    AND p.is_active=true
  ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
  LIMIT 1
) pay ON true
WHERE b.master_id=$1
`,[masterId]);

const billing_access = await getMasterBillingAccess(pool, masterId);

res.json({
ok:true,
metrics:{
bookings_today:bookingsToday.rows[0].v,
bookings_week:bookingsWeek.rows[0].v,
clients_total:clientsTotal.rows[0].v,
cash_pending_exposure_count:Number(cashPendingExposure.rows[0].cash_pending_exposure_count || 0),
cash_pending_exposure_amount:cashPendingExposure.rows[0].cash_pending_exposure_amount || 0
},
billing_access
});

}catch(err){

console.error("MASTER_METRICS_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_METRICS_FAILED"
});

}

});

/*
MASTER SERVICES
*/
r.get("/masters/:slug/services", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

if(req.auth?.us_role_context==="own_salon_master_v1"){
  try{
    const shared=await readUsOwnSalonServicesAccess(pool,{auth:req.auth,slug});
    if(shared.masterId!==Number(masterId))return res.status(403).json({ok:false,error:"FORBIDDEN"});
    const scoped=await pool.query(`
      SELECT sms.id,sms.service_pk,sms.salon_id,sms.master_id,
        salon.slug AS salon_slug,sms.currency_code,'US' AS market_code,
        s.service_id AS catalog_service_id,s.name,sms.duration_min,sms.active
      FROM public.salon_master_services sms JOIN public.services s ON s.id=sms.service_pk
      JOIN public.salons salon ON salon.id=sms.salon_id
      JOIN public.tenant_market_settings tm ON tm.salon_id=sms.salon_id
      JOIN public.markets mk ON mk.id=tm.market_id
      WHERE sms.master_id=$1 AND sms.salon_id=$2 AND sms.active=true AND sms.currency_code='USD'
      AND mk.code='US' AND mk.active=true AND mk.default_currency='USD'
      ORDER BY sms.id DESC LIMIT 300`,[shared.masterId,shared.salonId]);
    return res.json({ok:true,services:scoped.rows,billing_access:{can_write:false,can_withdraw:false,role_context_limited:true}});
  }catch(e){
    if([403,409].includes(e?.status))return res.status(403).json({ok:false,error:"US_ROLE_CONTEXT_OPERATION_HOLD"});
    throw e;
  }
}
const services = await pool.query(`
SELECT
sms.id,
sms.service_pk,
sms.salon_id,
salon.slug AS salon_slug,
sms.currency_code,
mk.code AS market_code,
s.service_id AS catalog_service_id,
s.name,
sms.price,
sms.duration_min,
sms.active
FROM salon_master_services sms
JOIN services s ON s.id=sms.service_pk
LEFT JOIN public.salons salon ON salon.id=sms.salon_id
LEFT JOIN public.tenant_market_settings tm ON tm.salon_id=sms.salon_id
LEFT JOIN public.markets mk ON mk.id=tm.market_id
WHERE sms.master_id=$1
ORDER BY sms.id DESC
`,[masterId]);

const billing_access = await getMasterBillingAccess(pool, masterId);

res.json({
ok:true,
services:services.rows,
billing_access
});

}catch(err){

console.error("MASTER_SERVICES_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_SERVICES_FETCH_FAILED"
});

}

});

/*
CREATE MASTER SERVICE
*/
r.post("/masters/:slug/services", async (req,res)=>{

const { slug } = req.params;
const { name, price, duration_min } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

const safeName = String(name || "").trim();
const safePrice = Number(price);
const safeDuration = Number(duration_min);

if(!safeName){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"NAME_REQUIRED"});
}

if(!Number.isFinite(safePrice) || safePrice < 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"PRICE_INVALID"});
}

if(!Number.isFinite(safeDuration) || safeDuration <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"DURATION_INVALID"});
}

const master = await db.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const mixedMarketBlock = await rejectLegacyUsMasterServiceCreation(db,masterId);
if(mixedMarketBlock){
  await db.query("ROLLBACK");
  return res.status(mixedMarketBlock.status).json({ok:false,error:mixedMarketBlock.error});
}

const billing_access = await ensureMasterWriteAllowed(db, masterId);

const relation = await db.query(`
SELECT salon_id
FROM master_salon
WHERE master_id=$1
AND status='active'
ORDER BY activated_at DESC NULLS LAST, id DESC
LIMIT 1
`,[masterId]);

if(!relation.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"MASTER_ACTIVE_SALON_REQUIRED"});
}

const salonId = relation.rows[0].salon_id;
const blockedUs = await rejectLegacyUsServiceMutation(db,salonId);
if(blockedUs){await db.query("ROLLBACK");return res.status(blockedUs.status).json({ok:false,error:blockedUs.error});}

const nextServiceId = await db.query(`
SELECT COALESCE(MAX(service_id::int),0)+1 AS next_service_id
FROM services
WHERE service_id ~ '^[0-9]+$'
`);

const serviceCode = String(nextServiceId.rows[0]?.next_service_id || 1);

const service = await db.query(`
INSERT INTO services(
service_id,
name,
duration_min,
price
)
VALUES($1,$2,$3,$4)
RETURNING id,service_id,name,duration_min,price
`,[
serviceCode,
safeName,
safeDuration,
safePrice
]);

const servicePk = service.rows[0].id;

const linked = await db.query(`
INSERT INTO salon_master_services(
salon_id,
master_id,
service_pk,
price,
duration_min,
active
)
VALUES($1,$2,$3,$4,$5,true)
RETURNING id,service_pk AS service_id,price,duration_min,active
`,[
salonId,
masterId,
servicePk,
safePrice,
safeDuration
]);

await db.query("COMMIT");

return res.json({
ok:true,
service:{
id:linked.rows[0].id,
service_pk:linked.rows[0].service_id,
catalog_service_id:service.rows[0].service_id,
name:service.rows[0].name,
price:linked.rows[0].price,
duration_min:linked.rows[0].duration_min,
active:linked.rows[0].active
},
billing_access
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

if(err.code === "BILLING_BLOCKED"){
return res.status(403).json({
ok:false,
error:"BILLING_BLOCKED",
billing_access:{
exists:err.access.exists,
subscription_status:err.access.subscription_status,
access_state:err.access.access_state,
can_write:err.access.can_write,
can_withdraw:err.access.can_withdraw,
billing:err.access.billing
}
});
}

console.error("MASTER_SERVICE_CREATE_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_SERVICE_CREATE_FAILED"
});

}finally{

db.release();

}

});

/*
UPDATE MASTER SERVICE
*/
r.patch("/masters/:slug/services/:id", async (req,res)=>{

const { slug, id } = req.params;
const { name, price, duration_min, active } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

const master = await db.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const billing_access = await ensureMasterWriteAllowed(db, masterId);

const existing = await db.query(`
SELECT
sms.id,
sms.salon_id,
sms.service_pk,
sms.price,
sms.duration_min,
sms.active,
s.name
FROM salon_master_services sms
JOIN services s ON s.id=sms.service_pk
WHERE sms.id=$1
AND sms.master_id=$2
FOR UPDATE
LIMIT 1
`,[
id,
masterId
]);

if(!existing.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_SERVICE_NOT_FOUND"});
}

const current = existing.rows[0];
const blockedUs = await rejectLegacyUsServiceMutation(db,current.salon_id);
if(blockedUs){await db.query("ROLLBACK");return res.status(blockedUs.status).json({ok:false,error:blockedUs.error});}

const nextName =
  typeof name === "string" ? String(name).trim() : current.name;

const nextPrice =
  price === undefined ? Number(current.price) : Number(price);

const nextDuration =
  duration_min === undefined ? Number(current.duration_min) : Number(duration_min);

const nextActive =
  typeof active === "boolean" ? active : current.active;

if(!nextName){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"NAME_REQUIRED"});
}

if(!Number.isFinite(nextPrice) || nextPrice < 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"PRICE_INVALID"});
}

if(!Number.isFinite(nextDuration) || nextDuration <= 0){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"DURATION_INVALID"});
}

await db.query(`
UPDATE services
SET name=$2
WHERE id=$1
`,[
current.service_pk,
nextName
]);

const updated = await db.query(`
UPDATE salon_master_services
SET
price=$2,
duration_min=$3,
active=$4
WHERE id=$1
RETURNING id,service_pk AS service_id,price,duration_min,active
`,[
id,
nextPrice,
nextDuration,
nextActive
]);

await db.query("COMMIT");

return res.json({
ok:true,
service:{
id:updated.rows[0].id,
service_pk:updated.rows[0].service_id,
name:nextName,
price:updated.rows[0].price,
duration_min:updated.rows[0].duration_min,
active:updated.rows[0].active
},
billing_access
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

if(err.code === "BILLING_BLOCKED"){
return res.status(403).json({
ok:false,
error:"BILLING_BLOCKED",
billing_access:{
exists:err.access.exists,
subscription_status:err.access.subscription_status,
access_state:err.access.access_state,
can_write:err.access.can_write,
can_withdraw:err.access.can_withdraw,
billing:err.access.billing
}
});
}

console.error("MASTER_SERVICE_UPDATE_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_SERVICE_UPDATE_FAILED"
});

}finally{

db.release();

}

});

/*
DELETE MASTER SERVICE
*/
r.delete("/masters/:slug/services/:id", async (req,res)=>{

const { slug, id } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const master = await db.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const billing_access = await ensureMasterWriteAllowed(db, masterId);

const existing = await db.query(`
SELECT
sms.id,
sms.service_pk,
sms.salon_id
FROM salon_master_services sms
WHERE sms.id=$1
AND sms.master_id=$2
FOR UPDATE
LIMIT 1
`,[
id,
masterId
]);

if(!existing.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_SERVICE_NOT_FOUND"});
}

const servicePk = existing.rows[0].service_pk;
const blockedUs = await rejectLegacyUsServiceMutation(db,existing.rows[0].salon_id);
if(blockedUs){await db.query("ROLLBACK");return res.status(blockedUs.status).json({ok:false,error:blockedUs.error});}

await db.query(`
DELETE FROM salon_master_services
WHERE id=$1
`,[id]);

const serviceLinks = await db.query(`
SELECT COUNT(*)::int AS v
FROM salon_master_services
WHERE service_pk=$1
`,[servicePk]);

if((serviceLinks.rows[0]?.v || 0) === 0){
await db.query(`
DELETE FROM services
WHERE id=$1
`,[servicePk]);
}

await db.query("COMMIT");

return res.json({
ok:true,
deleted:true,
id:Number(id),
billing_access
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

if(err.code === "BILLING_BLOCKED"){
return res.status(403).json({
ok:false,
error:"BILLING_BLOCKED",
billing_access:{
exists:err.access.exists,
subscription_status:err.access.subscription_status,
access_state:err.access.access_state,
can_write:err.access.can_write,
can_withdraw:err.access.can_withdraw,
billing:err.access.billing
}
});
}

console.error("MASTER_SERVICE_DELETE_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_SERVICE_DELETE_FAILED"
});

}finally{

db.release();

}

});

/*
MASTER BOOKINGS
*/
r.get("/masters/:slug/bookings", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

// Only an explicit US master-cabinet read opts into per-booking IANA
// location metadata. The existing KG/KZ feed is left untouched.
const usLocationScope = req.query?.calendar_scope === "us_location";
if(usLocationScope){
  // Preserve the original KG/KZ master lookup byte-for-byte.
  const assigned = await pool.query(
    "SELECT user_id FROM masters WHERE id=$1 LIMIT 1",[masterId]
  );
  if(req.auth?.role !== "master" || req.auth?.source !== "session" ||
     assigned.rows.length !== 1 ||
     String(req.auth?.user_id) !== String(assigned.rows[0].user_id)){
    return res.status(403).json({ok:false,error:"MASTER_US_SESSION_REQUIRED"});
  }
  // One master may serve several US locations and IANA zones.
  // Match the COUNTRY of every active salon, never demand one shared zone.
  const markets = await pool.query(
    `SELECT DISTINCT mk.code
       FROM public.master_salon ms
       JOIN public.tenant_market_settings t ON t.salon_id=ms.salon_id
       JOIN public.markets mk ON mk.id=t.market_id
      WHERE ms.master_id=$1 AND ms.status='active'`,
    [masterId]
  );
  if(markets.rows.length !== 1 || markets.rows[0].code !== "US"){
    // Distinguish a real US + non-US affiliation from a KG/KZ-only
    // master. Only the opt-in US read returns this extra guard code.
    // The existing KG/KZ booking endpoint and its response are unchanged.
    const hasUs=markets.rows.some(row=>row.code==="US");
    const hasOther=markets.rows.some(row=>row.code!=="US");
    return res.status(409).json({
      ok:false,
      error:hasUs && hasOther
        ? "MASTER_US_MIXED_MARKETS"
        : "MASTER_US_MARKET_SCOPE_REQUIRED",
    });
  }
}

const bookings = await pool.query(`
SELECT
b.id,
b.status,
b.start_at,
b.end_at,
c.name AS client_name,
c.phone,
pay.id AS payment_id,
pay.provider AS payment_provider,
pay.status AS payment_status,
COALESCE(pay.is_active, false) AS payment_is_active,
pay.amount AS payment_amount
FROM bookings b
LEFT JOIN clients c ON c.id=b.client_id
LEFT JOIN LATERAL (
SELECT
p.id,
p.provider,
p.status,
p.is_active,
p.amount
FROM public.payments p
WHERE p.booking_id=b.id
AND p.is_active=true
ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
LIMIT 1
) pay ON true
WHERE b.master_id=$1
ORDER BY b.start_at DESC
`,[masterId]);

let bookingsRows = bookings.rows.map((booking)=>({
...booking,
payment_label_ru:getBookingPaymentLabelRu(
booking.payment_provider,
booking.payment_status,
Boolean(booking.payment_id)
),
cash_pending_alert:String(booking.payment_provider || "").toLowerCase()==="direct" && String(booking.payment_status || "").toLowerCase()==="pending" && Boolean(booking.payment_is_active)
}));

if(usLocationScope && bookingsRows.length){
  // Reuse the existing booking relation and US booking→location link.
  // No independent US booking, timezone table, or status mutation.
  const related = await pool.query(
    `SELECT b.id AS booking_id, b.salon_id,
            l.location_code, l.timezone_name AS location_timezone,
            sl.slug AS salon_slug, sl.name AS salon_name
       FROM public.bookings b
       JOIN public.us_booking_location_links link ON link.booking_id=b.id
       JOIN public.us_salon_locations l
         ON l.id=link.location_id AND l.salon_id=b.salon_id
       JOIN public.salons sl ON sl.id=b.salon_id
       JOIN public.tenant_market_settings t ON t.salon_id=b.salon_id
       JOIN public.markets mk ON mk.id=t.market_id AND mk.code='US'
      WHERE b.master_id=$1 AND b.id=ANY($2::int[])`,
    [masterId,bookingsRows.map(row=>Number(row.id))]
  );
  // A missing immutable location link must never be replaced by
  // browser timezone or a default market zone.
  if(related.rows.length !== bookingsRows.length){
    return res.status(409).json({ok:false,error:"MASTER_US_BOOKING_LOCATION_REQUIRED"});
  }
  const byId = new Map(related.rows.map(row=>[Number(row.booking_id),row]));
  if(byId.size !== bookingsRows.length){
    return res.status(409).json({ok:false,error:"MASTER_US_BOOKING_LOCATION_DUPLICATE"});
  }
  for(const item of related.rows){
    const zone=String(item.location_timezone||"").trim();
    if(!zone || zone === "UTC" || zone === "Etc/UTC"){
      return res.status(409).json({ok:false,error:"MASTER_US_BOOKING_TIMEZONE_INVALID"});
    }
    try{
      new Intl.DateTimeFormat("en-US",{timeZone:zone}).format(new Date());
    }catch(_ignored){
      return res.status(409).json({ok:false,error:"MASTER_US_BOOKING_TIMEZONE_INVALID"});
    }
  }
  bookingsRows = bookingsRows.map(booking=>{
    const scope=byId.get(Number(booking.id));
    return {...booking,
      salon_id:Number(scope.salon_id),
      salon_slug:String(scope.salon_slug),
      salon_name:String(scope.salon_name||""),
      location_code:String(scope.location_code),
      location_timezone:String(scope.location_timezone)
    };
  });
}

const billing_access = await getMasterBillingAccess(pool, masterId);

res.json({
ok:true,
bookings:bookingsRows,
billing_access,
...(usLocationScope ? {calendar_scope:"us_location",market_code:"US"} : {})
});

}catch(err){

console.error("MASTER_BOOKINGS_ERROR", err);

res.status(500).json({
ok:false,
error:"MASTER_BOOKINGS_FETCH_FAILED"
});

}

});

/*
MASTER PENDING CASH BOOKINGS
*/
r.get("/masters/:slug/pending-cash-bookings", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const pendingCash = await pool.query(`
SELECT
b.id,
b.start_at,
b.start_at AS datetime_start,
b.status,
s.name AS service_name,
sal.name AS salon_name,
b.price_snapshot,
pay.id AS payment_id,
pay.provider AS payment_provider,
pay.status AS payment_status,
COALESCE(pay.is_active, false) AS payment_is_active,
pay.amount AS payment_amount
FROM bookings b
LEFT JOIN services s ON s.id=b.service_id
LEFT JOIN salons sal ON sal.id=b.salon_id
LEFT JOIN LATERAL (
SELECT
p.id,
p.provider,
p.status,
p.is_active,
p.amount
FROM public.payments p
WHERE p.booking_id=b.id
AND p.is_active=true
ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
LIMIT 1
) pay ON true
WHERE b.master_id=$1
AND LOWER(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'отмена')
AND pay.provider='direct'
AND pay.status='pending'
AND pay.is_active=true
ORDER BY b.start_at DESC
`,[masterId]);

const bookingsRows = pendingCash.rows.map((booking)=>({
...booking,
payment_label_ru:getBookingPaymentLabelRu(
booking.payment_provider,
booking.payment_status,
Boolean(booking.payment_id)
),
cash_pending_alert:true
}));

const amount = bookingsRows.reduce((sum, booking)=>{
const value = Number(booking.payment_amount ?? booking.price_snapshot ?? 0);
return sum + (Number.isFinite(value) ? value : 0);
},0);

return res.json({
ok:true,
bookings:bookingsRows,
count:bookingsRows.length,
amount
});
}catch(err){

console.error("MASTER_PENDING_CASH_BOOKINGS_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_PENDING_CASH_BOOKINGS_FAILED"
});

}
});

/* MASTER PAYMENT PROJECTION */
r.get("/masters/:slug/payments/:paymentId/projection", internalReadRateLimit, async (req,res)=>{

const { slug, paymentId } = req.params;

try{

const master = await pool.query(
`SELECT id, name, slug FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterRow = master.rows[0];

if(!hasMasterOwnership(req, masterRow.id)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const targetPaymentId = safeInt(paymentId);
if(!targetPaymentId){
return res.status(400).json({ok:false,error:"INVALID_PAYMENT_ID"});
}

const projection = await pool.query(`
SELECT
p.id AS payment_id,
b.id AS booking_id,
p.amount AS gross_amount,
p.currency_code,
p.provider AS payment_provider,
p.status AS payment_status,
p.method,
p.confirmed_by_user_id,
p.confirmed_at,
p.collector_owner_type,
p.collector_owner_id,
p.created_at AS payment_created_at,
b.salon_id,
b.master_id,
b.status AS booking_status,
b.start_at AS booking_start_at,
b.end_at AS booking_end_at,
b.created_at AS booking_created_at,
b.service_id,
COALESCE(svc.name, b.service_id::text) AS service_name,
COALESCE(cli.name, b.client_id::text) AS client_name,
COALESCE(sal.name, sal.slug, b.salon_id::text) AS salon_name,
COALESCE(mas.name, mas.slug, b.master_id::text) AS master_name
FROM public.payments p
JOIN public.bookings b ON b.id = p.booking_id
LEFT JOIN public.clients cli ON cli.id = b.client_id
LEFT JOIN public.services svc ON svc.id = b.service_id
LEFT JOIN public.salons sal ON sal.id = b.salon_id
LEFT JOIN public.masters mas ON mas.id = b.master_id
WHERE p.id = $1
AND b.master_id = $2
LIMIT 1
`,[
targetPaymentId,
masterRow.id
]);

if(!projection.rows.length){
return res.status(404).json({ok:false,error:"PAYMENT_NOT_FOUND"});
}

const payment = projection.rows[0];

const bookingAnchor = payment.booking_created_at ? normalizeProjectionDate(payment.booking_created_at) : null;
const paymentAnchor = payment.payment_created_at ? normalizeProjectionDate(payment.payment_created_at) : null;
const anchor = bookingAnchor || paymentAnchor || null;
const paymentMarketContext = await resolveBusinessMarketContext(pool, { salonId: payment.salon_id });
let contract = null;

if(anchor){
const contractResult = await pool.query(`
SELECT
c.id,
c.terms_json,
c.created_at,
c.effective_from,
c.archived_at,
c.status
FROM public.contracts c
WHERE c.salon_id::text = $1::text
AND c.master_id::text = $2::text
AND LOWER(COALESCE(c.terms_json->>'model', '')) IN ('percentage', 'hybrid')
AND c.created_at <= $3::timestamptz
AND (
  c.effective_from IS NULL
  OR (c.effective_from AT TIME ZONE $4) <= $3::timestamptz
)
AND (c.archived_at IS NULL OR c.archived_at > $3::timestamptz)
ORDER BY COALESCE(c.effective_from, c.created_at) DESC, c.created_at DESC, c.id DESC
LIMIT 1
`,[
String(payment.salon_id),
String(payment.master_id),
anchor,
paymentMarketContext.timezone
]);

contract = contractResult.rows[0] || null;
}

const response = buildSharedPaymentProjectionResponse({
payment,
contract,
scopeMasters: masterRow,
scopeSalons: {
name: payment.salon_name,
slug: String(payment.salon_id)
}
});

res.json(response);

}catch(err){

console.error("MASTER_PAYMENT_PROJECTION_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_PAYMENT_PROJECTION_FAILED"
});

}

});

/* MASTER PAYMENT PROJECTIONS */
r.get("/masters/:slug/payments/projection", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id, name, slug FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterRow = master.rows[0];

if(!hasMasterOwnership(req, masterRow.id)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const response = await getPaymentProjectionList(pool, {
scopeType: "master",
scopeRow: masterRow,
scopeId: masterRow.id,
from: req.query.from ?? null,
to: req.query.to ?? null,
status: req.query.status ?? null
});

res.json(response);

}catch(err){

console.error("MASTER_PAYMENT_PROJECTION_LIST_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_PAYMENT_PROJECTION_LIST_FAILED"
});

}

});

function parseLostProfitDate(value, errorCode){
const raw = String(value || "").trim();
if(!raw){
return null;
}

if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)){
const err = new Error(errorCode);
err.code = errorCode;
throw err;
}

const [yearText, monthText, dayText] = raw.split("-");
const year = Number(yearText);
const month = Number(monthText);
const day = Number(dayText);
const date = new Date(Date.UTC(year, month - 1, day));

if(
!Number.isInteger(year) ||
!Number.isInteger(month) ||
!Number.isInteger(day) ||
date.getUTCFullYear() !== year ||
date.getUTCMonth() !== month - 1 ||
date.getUTCDate() !== day
){
const err = new Error(errorCode);
err.code = errorCode;
throw err;
}

return raw;
}

function getBusinessMonthRange(referenceDate = new Date(), timezone){
const formatter = new Intl.DateTimeFormat("en-CA", {
timeZone: timezone,
year: "numeric",
month: "2-digit",
day: "2-digit"
});

const parts = formatter.formatToParts(referenceDate).reduce((acc, part)=>{
if(part.type !== "literal"){
acc[part.type] = part.value;
}
return acc;
}, {});

const year = Number(parts.year);
const month = Number(parts.month);
const from = `${year}-${String(month).padStart(2, "0")}-01`;
const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

return { from, to };
}

function normalizeLostProfitLimit(value){
if(value === undefined || value === null || String(value).trim() === ""){
return 50;
}

const limit = safeInt(value);
if(!limit || limit > 200){
const err = new Error("LOST_PROFIT_LIMIT_INVALID");
err.code = "LOST_PROFIT_LIMIT_INVALID";
throw err;
}

return limit;
}

function buildLostProfitSummary(rows, currency){
const summary = {
cancelled_count: 0,
lost_profit_amount: 0,
currency,
missing_price_count: 0
};

for(const row of rows){
summary.cancelled_count += 1;
summary.lost_profit_amount += Number(row.price_snapshot ?? 0) || 0;
if(row.price_snapshot === null || row.price_snapshot === undefined){
summary.missing_price_count += 1;
}
}

return summary;
}

function buildLostProfitRow(row, currency){
const lostProfitAmount = Number(row.price_snapshot ?? 0) || 0;

return {
booking_id: Number(row.booking_id),
booking_code: row.booking_code,
salon_id: Number(row.salon_id),
master_id: Number(row.master_id),
master_slug: row.master_slug || null,
master_name: row.master_name || null,
service_id: Number(row.service_id),
service_name: row.service_name || null,
start_at: row.start_at,
local_start_at: row.local_start_at,
canceled_at: row.canceled_at,
status: row.status,
lost_profit_amount: lostProfitAmount,
currency,
missing_price: row.price_snapshot === null || row.price_snapshot === undefined,
is_test: row.is_test === true
};
}

/* MASTER LOST PROFIT */
r.get("/masters/:slug/lost-profit", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id, name, slug FROM masters WHERE slug=$1 LIMIT 1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ ok:false, error:"MASTER_NOT_FOUND" });
}

const masterRow = master.rows[0];

if(!hasMasterOwnership(req, masterRow.id)){
return res.status(403).json({ ok:false, error:"MASTER_ACCESS_DENIED" });
}

const marketContext = await resolveOwnerMarketContext(pool, { ownerType: "master", ownerId: masterRow.id });
const timezone = marketContext.timezone;
const currency = requireCurrencyCode(req.query.currency || marketContext.currency_code, "LOST_PROFIT_CURRENCY_INVALID");

const limit = normalizeLostProfitLimit(req.query.limit);

const fromProvided = req.query.from !== undefined && req.query.from !== null && String(req.query.from).trim() !== "";
const toProvided = req.query.to !== undefined && req.query.to !== null && String(req.query.to).trim() !== "";
let from = fromProvided ? parseLostProfitDate(req.query.from, "LOST_PROFIT_FROM_DATE_INVALID") : null;
let to = toProvided ? parseLostProfitDate(req.query.to, "LOST_PROFIT_TO_DATE_INVALID") : null;

if(from && to && from > to){
return res.status(400).json({ ok:false, error:"LOST_PROFIT_DATE_RANGE_INVALID" });
}

if(!from && !to){
const monthRange = getBusinessMonthRange(new Date(), timezone);
from = monthRange.from;
to = monthRange.to;
}

// Currency is used in the response, not the SQL: an unused $3 caused
// PostgreSQL 42P18 when reading the lost-profit report.
const values = [masterRow.id, timezone];
const clauses = ["b.master_id = $1", "LOWER(COALESCE(b.status, '')) IN ('cancelled','canceled','отмена')"];

if(from){
values.push(from);
clauses.push(`(b.start_at AT TIME ZONE $2)::date >= $${values.length}::date`);
}

if(to){
values.push(to);
clauses.push(`(b.start_at AT TIME ZONE $2)::date <= $${values.length}::date`);
}

const rowsResult = await pool.query(`
SELECT
b.id AS booking_id,
b.salon_id,
b.master_id,
b.service_id,
b.status,
b.start_at,
b.canceled_at,
b.price_snapshot,
b.currency_code,
b.is_test,
to_char(b.start_at AT TIME ZONE $2, 'YYYY-MM') AS month_key,
'BR-' || LPAD(b.id::text, 5, '0') AS booking_code,
to_char(b.start_at AT TIME ZONE $2, 'YYYY-MM-DD HH24:MI:SS') AS local_start_at,
COALESCE(s.name, s.service_id, b.service_id::text) AS service_name,
COALESCE(m.name, m.slug, b.master_id::text) AS master_name,
m.slug AS master_slug
FROM public.bookings b
LEFT JOIN public.services s ON s.id = b.service_id
LEFT JOIN public.masters m ON m.id = b.master_id
WHERE ${clauses.join(" AND ")}
ORDER BY b.start_at DESC, b.created_at DESC, b.id DESC
`, values);

const allRows = rowsResult.rows || [];
const summary = buildLostProfitSummary(allRows, currency);
const rows = allRows.slice(0, limit).map((row)=>buildLostProfitRow(row, currency));
const monthlyMap = new Map();

for(const row of allRows){
const monthKey = String(row.month_key || "").trim();
if(!monthKey){
continue;
}

const existingMonth = monthlyMap.get(monthKey) || {
month: monthKey,
cancelled_count: 0,
lost_profit_amount: 0,
currency,
missing_price_count: 0
};

existingMonth.cancelled_count += 1;
existingMonth.lost_profit_amount += Number(row.price_snapshot ?? 0) || 0;
if(row.price_snapshot === null || row.price_snapshot === undefined){
existingMonth.missing_price_count += 1;
}
monthlyMap.set(monthKey, existingMonth);
}

const monthly = Array.from(monthlyMap.values()).sort((a, b)=>String(a.month).localeCompare(String(b.month)));

return res.json({
ok: true,
scope: {
type: "master",
master_id: Number(masterRow.id),
master_slug: masterRow.slug,
master_name: masterRow.name || null
},
filters: {
from,
to,
status: ["cancelled", "canceled", "отмена"],
timezone,
currency,
limit
},
summary,
monthly,
rows
});

}catch(err){

const controlledBadRequestCodes = new Set([
"LOST_PROFIT_LIMIT_INVALID",
"LOST_PROFIT_FROM_DATE_INVALID",
"LOST_PROFIT_TO_DATE_INVALID"
]);

if(controlledBadRequestCodes.has(err?.code || err?.message)){
return res.status(400).json({ ok:false, error: err.code || err.message });
}

console.error("MASTER_LOST_PROFIT_FETCH_ERROR", err);

return res.status(500).json({
ok:false,
error:"MASTER_LOST_PROFIT_FETCH_FAILED"
});

}

});

/* MASTER COLLECTION ANCHORS */
r.get("/masters/:slug/collection-anchors", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id, name, slug FROM masters WHERE slug=$1 LIMIT 1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ ok:false, error:"MASTER_NOT_FOUND" });
}

const masterRow = master.rows[0];

if(!hasMasterOwnership(req, masterRow.id)){
return res.status(403).json({ ok:false, error:"MASTER_ACCESS_DENIED" });
}

const openOnlyRaw = String(req.query.open_only ?? "").trim().toLowerCase();
const openOnly = openOnlyRaw === "true" || openOnlyRaw === "1" || openOnlyRaw === "yes";

const response = await getCollectionAnchors(pool, {
scopeType: "master",
scopeRow: masterRow,
scopeId: masterRow.id,
from: req.query.from ?? null,
to: req.query.to ?? null,
status: req.query.status ?? null,
openOnly
});

res.json(response);

}catch(err){

const controlledBadRequestCodes = new Set([
"COLLECTION_ANCHORS_FROM_DATE_INVALID",
"COLLECTION_ANCHORS_TO_DATE_INVALID",
"COLLECTION_ANCHOR_STATUS_INVALID",
"COLLECTION_ANCHOR_MASTER_ID_INVALID"
]);

if(controlledBadRequestCodes.has(err?.code || err?.message)){
return res.status(400).json({ ok:false, error: err.code || err.message });
}

console.error("MASTER_COLLECTION_ANCHORS_ERROR", err);

res.status(500).json({
ok:false,
error:"MASTER_COLLECTION_ANCHORS_FAILED"
});

}

});

/* MASTER OWNER QR PAYMENTS */
r.get("/masters/:slug/owner-qr-payments", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const payments = await listOwnerQrPaymentsForOwner({
pool,
ownerType: "master",
ownerId: masterId
});

res.json({
ok:true,
payments
});

}catch(err){

console.error("MASTER_OWNER_QR_PAYMENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_OWNER_QR_PAYMENTS_FETCH_FAILED"
});

}

});

/*
MASTER CLIENTS
*/
r.get("/masters/:slug/clients", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const clients = await pool.query(`
SELECT
c.id,
c.name,
c.phone,
COUNT(b.id)::int AS visits
FROM clients c
JOIN bookings b ON b.client_id=c.id
WHERE b.master_id=$1
GROUP BY c.id,c.name,c.phone
ORDER BY c.id DESC
`,[masterId]);

const billing_access = await getMasterBillingAccess(pool, masterId);

res.json({
ok:true,
clients:clients.rows,
billing_access
});

}catch(err){

console.error("MASTER_CLIENTS_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_CLIENTS_FETCH_FAILED"
});

}

});

/*
MASTER QUICK BOOKING CREATE
*/
r.post("/masters/:slug/bookings", async (req,res)=>{

const { slug } = req.params;
const { client_name, phone, start_at, service_id } = req.body;

const db = await pool.connect();

try{

await db.query("BEGIN");

if(!start_at){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"START_AT_REQUIRED"});
}

if(!service_id){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SERVICE_ID_REQUIRED"});
}

const start = new Date(start_at);

if(Number.isNaN(start.getTime())){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"INVALID_START_AT"});
}

const master = await db.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const masterId = master.rows[0].id;

if(!hasMasterOwnership(req, masterId)){
await db.query("ROLLBACK");
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const billing_access = await ensureMasterWriteAllowed(db, masterId);

const serviceLink = await db.query(`
SELECT
sms.salon_id,
sms.price,
sms.service_pk,
s.slug
FROM salon_master_services sms
JOIN salons s ON s.id=sms.salon_id
WHERE sms.master_id=$1
AND sms.id=$2
AND sms.active=true
LIMIT 1
`,[
masterId,
service_id
]);

if(!serviceLink.rows.length){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:"SERVICE_INACTIVE"});
}

const salonId = serviceLink.rows[0].salon_id;
const bookingMarket = await checkMasterQuickBookingMarket(db,salonId);
if(!bookingMarket.ok){
  await db.query("ROLLBACK");
  return res.status(bookingMarket.status).json({ok:false,error:bookingMarket.error});
}
const salonSlug = serviceLink.rows[0].slug;
const servicePk = Number(serviceLink.rows[0].service_pk);
const priceSnapshot = Number(serviceLink.rows[0].price);

const safeName = String(client_name || "").trim() || "client";
const normalizedPhone = await normalizePhoneForMarket(db, phone, { salonId });

if(!normalizedPhone.ok){
await db.query("ROLLBACK");
return res.status(400).json({ok:false,error:normalizedPhone.error});
}

const safePhone = normalizedPhone.phone;

let clientId = null;

const existingClient = await db.query(
`SELECT id
FROM clients
WHERE salon_id=$1 AND phone=$2
LIMIT 1`,
[salonId, safePhone]
);

if(existingClient.rows.length){
clientId = existingClient.rows[0].id;
}

if(!clientId){

const createdClient = await db.query(`
INSERT INTO clients(
salon_id,
name,
phone
)
VALUES($1,$2,$3)
RETURNING id
`,[
salonId,
safeName,
safePhone
]);

clientId = createdClient.rows[0].id;

}

const end = new Date(start.getTime() + 30 * 60000);

let slotId = null;

const existingSlot = await db.query(`
SELECT id
FROM calendar_slots
WHERE master_id=$1
AND start_at=$2
AND end_at=$3
LIMIT 1
`,[
masterId,
start,
end
]);

if(existingSlot.rows.length){

slotId = existingSlot.rows[0].id;

const existingBooking = await db.query(`
SELECT id
FROM bookings
WHERE calendar_slot_id=$1
LIMIT 1
`,[slotId]);

if(existingBooking.rows.length){

await db.query("ROLLBACK");

return res.status(409).json({
ok:false,
error:"BOOKING_ALREADY_EXISTS_FOR_SLOT",
slot_id:slotId
});

}

}else{

const slot = await db.query(`
INSERT INTO calendar_slots(
salon_id,
master_id,
start_at,
end_at,
status,
request_id
)
VALUES($1,$2,$3,$4,'reserved',$5)
RETURNING id
`,[
salonId,
masterId,
start,
end,
crypto.randomUUID()
]);

slotId = slot.rows[0].id;

}

const requestId = crypto.randomUUID();

const booking = await db.query(`
INSERT INTO bookings(
salon_id,
salon_slug,
master_id,
start_at,
end_at,
status,
request_id,
calendar_slot_id,
client_id,
service_id,
price_snapshot
)
VALUES($1,$2,$3,$4,$5,'reserved',$6,$7,$8,$9,$10)
RETURNING *
`,[
salonId,
salonSlug,
masterId,
start,
end,
requestId,
slotId,
clientId,
servicePk,
priceSnapshot
]);

await db.query("COMMIT");

res.json({
ok:true,
booking:booking.rows[0],
billing_access
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

if(err.code === "BILLING_BLOCKED"){
return res.status(403).json({
ok:false,
error:"BILLING_BLOCKED",
billing_access:{
exists:err.access.exists,
subscription_status:err.access.subscription_status,
access_state:err.access.access_state,
can_write:err.access.can_write,
can_withdraw:err.access.can_withdraw,
billing:err.access.billing
}
});
}

console.error("BOOKING_ENGINE_ERROR",err);

res.status(500).json({
ok:false,
error:"BOOKING_CREATE_FAILED"
});

}finally{

db.release();

}

});

/*
MASTER WALLET BALANCE
*/
r.get("/masters/:slug/wallet-balance", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await getMasterBySlug(pool, slug);

if(!master){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

if(!hasMasterOwnership(req, master.id)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const wallet = await getMasterWalletRow(pool, master.id);


const billing_access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
wallet_id:wallet?.id || null,
balance:Number(wallet?.balance || 0),
currency:requireCurrencyCode(wallet?.currency, "WALLET_CURRENCY_REQUIRED"),
billing_access
});

}catch(err){

console.error("MASTER_WALLET_BALANCE_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_WALLET_BALANCE_FAILED"
});

}

});

/*
MASTER LEDGER
*/
r.get("/masters/:slug/ledger", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await getMasterBySlug(pool, slug);

if(!master){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

if(!hasMasterOwnership(req, master.id)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const ledger = await pool.query(`
SELECT
le.id,
le.wallet_id,
le.direction,
COALESCE(le.amount_cents,0)::int AS amount,
le.reference_type,
le.reference_id,
le.created_at
FROM totem_test.ledger_entries le
JOIN totem_test.wallets w ON w.id=le.wallet_id
WHERE w.owner_type='master'
AND w.owner_id=$1
ORDER BY le.created_at DESC
LIMIT 100
`,[master.id]);

const billing_access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
ledger:ledger.rows,
billing_access
});

}catch(err){

console.error("MASTER_LEDGER_FETCH_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_LEDGER_FETCH_FAILED"
});

}

});

/*
MASTER SETTLEMENTS
*/
r.get("/masters/:slug/settlements", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await getMasterBySlug(pool, slug);

if(!master){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

if(!hasMasterOwnership(req, master.id)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const settlements = await pool.query(`
SELECT DISTINCT ON (sp.id)
sp.id,
sp.period_start,
sp.period_end,
sp.status,
sp.closed_at,
sp.created_at
FROM settlement_periods sp
LEFT JOIN payouts p ON p.settlement_period_id=sp.id
LEFT JOIN bookings b ON b.id=p.booking_id
WHERE b.master_id=$1
AND sp.is_archived=false
ORDER BY sp.id, sp.period_start DESC, sp.created_at DESC
LIMIT 50
`,[master.id]);

const billing_access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
settlements:settlements.rows,
billing_access
});

}catch(err){

console.error("MASTER_SETTLEMENTS_FETCH_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_SETTLEMENTS_FETCH_FAILED"
});

}

});

/*
MASTER PAYOUTS
*/
r.get("/masters/:slug/payouts", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await getMasterBySlug(pool, slug);

if(!master){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

if(!hasMasterOwnership(req, master.id)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

const payouts = await pool.query(`
SELECT
p.id,
p.amount,
p.status,
p.created_at
FROM payouts p LEFT JOIN bookings b ON b.id=p.booking_id
LEFT JOIN LATERAL (
  SELECT
    pay.provider,
    pay.status,
    pay.collector_owner_type,
    pay.collector_owner_id
  FROM public.payments pay
  WHERE pay.booking_id=p.booking_id
    AND pay.is_active=true
  ORDER BY pay.updated_at DESC NULLS LAST, pay.id DESC
  LIMIT 1
) pay ON true
WHERE b.master_id=$1
AND (pay.provider IS NULL OR NOT (pay.provider='direct' AND pay.status='confirmed' AND (pay.collector_owner_type IS NULL OR pay.collector_owner_id IS NULL)))
ORDER BY p.created_at DESC
LIMIT 50
`,[master.id]);

const billing_access = await getMasterBillingAccess(pool, master.id);

return res.json({
ok:true,
payouts:payouts.rows,
billing_access
});

}catch(err){

console.error("MASTER_PAYOUTS_FETCH_ERROR",err);

return res.status(500).json({
ok:false,
error:"MASTER_PAYOUTS_FETCH_FAILED"
});

}

});

return r;

}
