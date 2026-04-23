import express from "express";
import crypto from "crypto";
import { google } from "googleapis";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
// import nodemailer from "nodemailer";  // quarantined sender
import { xpayCreateQR, xpayCheckStatus } from "../payments/xpay.js";
import { rateLimit } from "../middleware/rateLimit.js";
import buildReportsRouter from "./internal/reports.js";
import buildPaymentsRouter from "./internal/payments.js";
import buildSettlementsRouter from "./internal/settlements.js";
import buildContractsRouter from "./internal/contracts.js";
import buildWithdrawsRouter from "./internal/withdraws.js";
import buildXpayRouter from "./internal/xpay.js";
import buildContractAliasRouter from "./internal/contract-alias.js";
import buildPayoutsProcessorRouter from "./internal/payouts-processor.js";
import buildFinanceEngineRouter from "./internal/finance-engine.js";
import buildWithdrawsProcessorRouter from "./internal/withdraws-processor.js";
import buildMastersRouter from "./internal/masters.js";
import buildSalonsRouter from "./internal/salons.js";
import buildAdminRouter from "./internal/admin.js";
import leadsRouter from "./admin.leads.js";
import moderationRouter from "./admin.moderation.js";
import messagesRouter from "./admin.messages.js";
import buildOneTimeChargeRouter from "./internal/one-time-charge.js";
import buildOneTimeChargeHistoryRouter from "./internal/one-time-charge-history.js";
import buildProvisionRouter from "./internal/provision.js";
import buildEntryRouter from "./internal/entry.js";
import buildTemplatesRouter from "./internal/templates.js";

export function createInternalRouter({ rlInternal } = {}){

const r = express.Router();

const adminContainer = express.Router();

adminContainer.use('/leads', leadsRouter);
adminContainer.use('/moderation', moderationRouter);
adminContainer.use('/messages', messagesRouter);

const internalReadRateLimit =
  rlInternal ||
  ((req, res, next) => {
    const redis = req.app?.locals?.redis ?? null;
    return rateLimit({
      windowMs: 60_000,
      max: 60,
      keyPrefix: "internal-read",
      redis,
    })(req, res, next);
  });

const AUTH_OTP_TTL_MINUTES = 30;
const AUTH_OTP_BLOCK_MINUTES = 10;
const AUTH_OTP_RESEND_SECONDS = 60;

function buildTransport(){
  // sender switched to Gmail API OAuth; SMTP transport remains disabled
  return null;
}

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || "";
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || "";
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || "";
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || "http://localhost";
const GMAIL_SENDER_EMAIL = process.env.GMAIL_SENDER_EMAIL || "kantotemus@gmail.com";

const gmailClient = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REDIRECT_URI
);

gmailClient.setCredentials({
  refresh_token: GMAIL_REFRESH_TOKEN
});

function assertGmailConfig(){
  if(!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN){
    const error = new Error("GMAIL_CONFIG_MISSING");
    error.code = "GMAIL_CONFIG_MISSING";
    throw error;
  }
}

async function sendOtpEmail({to, code}){
  assertGmailConfig();

  const gmail = google.gmail({ version: "v1", auth: gmailClient });
  const subject = "=?UTF-8?B?" + Buffer.from("Код входа TOTEM").toString("base64") + "?=";
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:16px;color:#111827">
      <h2>Код входа TOTEM</h2>
      <p>Ваш код подтверждения:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</div>
      <p>Код действует ${AUTH_OTP_TTL_MINUTES} минут.</p>
    </div>
  `;

  const message = [
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    `From: Totem <${GMAIL_SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "",
    html
  ].join("\n");

  const raw = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw }
  });
}

const AUTH_SUPPORTED_ROLES = new Set(["master", "salon_admin"]);

function normalizeRequestedAuthRole(value){
const raw = String(value || "").trim().toLowerCase();

if(raw === "salon"){
return "salon_admin";
}

if(AUTH_SUPPORTED_ROLES.has(raw)){
return raw;
}

return "master";
}

function normalizeRequestedOwnerSlug(role, body = {}){
const requestedSlug = String(
body?.owner_slug ||
(role === "salon_admin" ? body?.salon_slug : body?.master_slug) ||
body?.slug ||
""
).trim().toLowerCase();

if(!requestedSlug){
return `${role === "salon_admin" ? "salon" : "master"}_${Date.now()}`;
}

const normalizedSlug = requestedSlug
.replace(/[^a-z0-9_-]+/g, "-")
.replace(/-{2,}/g, "-")
.replace(/^[-_]+|[-_]+$/g, "");

return normalizedSlug || `${role === "salon_admin" ? "salon" : "master"}_${Date.now()}`;
}

function uniqueNumberList(values = []){
return [...new Set(
(values || [])
.map((value) => Number(value))
.filter((value) => Number.isInteger(value) && value > 0)
)];
}

function isAuthResolveSessionExpired(auth){
if(!auth?.session_expires_at){
return false;
}

const exp = new Date(auth.session_expires_at).getTime();
if(!Number.isFinite(exp)){
return false;
}

return exp < Date.now();
}

function isAuthResolveIdleExpired(auth){
if(!auth?.idle_timeout_at){
return false;
}

const idle = new Date(auth.idle_timeout_at).getTime();
if(!Number.isFinite(idle)){
return false;
}

return idle < Date.now();
}

function normalizeAuthIdentifier(value){
return String(value || "").trim().toLowerCase();
}

function normalizePhone(value){
const raw = String(value || "").trim();
if(!raw){
return null;
}

const digits = raw.replace(/\D/g, "");
if(digits.startsWith("996") && digits.length === 12){
const local = digits.slice(3);
if(local[0] === "0"){
return null;
}
return `+996${local}`;
}

if(raw.startsWith("+996")){
const local = raw.slice(4).replace(/\D/g, "");
if(local.length !== 9 || local[0] === "0"){
return null;
}
return `+996${local}`;
}

return null;
}

function normalizeEmail(value){
const email = normalizeAuthIdentifier(value);
if(!email || !email.includes("@")){
return null;
}
return email;
}

function resolveAuthTarget(body = {}){
const phone = normalizePhone(body?.phone);
if(phone){
return {
channel: "whatsapp",
lookup: "phone",
value: phone
};
}

const email = normalizeEmail(body?.email || body?.login);
if(email){
return {
channel: "email",
lookup: "email",
value: email
};
}

return null;
}

function buildNeutralAuthStartResponse({ channel, purpose }){
return {
ok:true,
sent:true,
channel,
purpose,
neutral:true
};
}

function selectBestAuthUserCandidate(rows, { requestedRole = "", requestedOwnerSlug = "" } = {}){
const safeRequestedRole = String(requestedRole || "").trim().toLowerCase();
const safeRequestedOwnerSlug = String(requestedOwnerSlug || "").trim().toLowerCase();
const candidates = Array.isArray(rows) ? rows : [];

if(!candidates.length){
return null;
}

function scoreCandidate(row){
const role = String(row?.role || "").trim().toLowerCase();
const masterSlug = String(row?.master_slug || "").trim().toLowerCase();
const salonSlug = String(row?.salon_slug || "").trim().toLowerCase();
let score = 0;

if(safeRequestedRole === "master"){
  if(role === "master" && safeRequestedOwnerSlug && masterSlug === safeRequestedOwnerSlug){
    score += 1000;
  }else if(role === "master"){
    score += 700;
  }else if(role === "salon_admin"){
    score += 300;
  }else{
    score += 100;
  }
}else if(safeRequestedRole === "salon_admin"){
  if(role === "salon_admin" && safeRequestedOwnerSlug && salonSlug === safeRequestedOwnerSlug){
    score += 1000;
  }else if(role === "salon_admin"){
    score += 700;
  }else if(role === "master"){
    score += 300;
  }else{
    score += 100;
  }
}else{
  if(role === "master" || role === "salon_admin"){
    score += 200;
  }
}

if(row?.enabled){
  score += 50;
}

if(row?.password_hash){
  score += 10;
}

return score;
}

return candidates
.map((row) => ({ row, score: scoreCandidate(row) }))
.sort((a, b) => {
  if(b.score !== a.score){
    return b.score - a.score;
  }
  return Number(a.row?.id || 0) - Number(b.row?.id || 0);
})
[0]?.row || null;
}

async function findLoginUser(db, { email, phone, requestedRole = "", requestedOwnerSlug = "" }){
const selectMasterSlug = await authUsersHasColumn(db, "master_slug");
const selectSalonSlug = await authUsersHasColumn(db, "salon_slug");

const fields = ["id", "email", "role", "enabled", "password_hash", "phone"];
if(selectMasterSlug){
fields.push("master_slug");
}
if(selectSalonSlug){
fields.push("salon_slug");
}

if(email){
const result = await db.query(
`SELECT ${fields.join(", ")}
 FROM public.auth_users
 WHERE lower(email)=lower($1)`,
[email]
);
return selectBestAuthUserCandidate(result.rows, { requestedRole, requestedOwnerSlug });
}

if(phone){
const result = await db.query(
`SELECT ${fields.join(", ")}
 FROM public.auth_users
 WHERE phone=$1`,
[phone]
);
return selectBestAuthUserCandidate(result.rows, { requestedRole, requestedOwnerSlug });
}

return null;
}

async function createAuthSession(db, userId){
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000));
const lastSeenAt = new Date();

const sessionColumnsRes = await db.query(
`SELECT column_name
 FROM information_schema.columns
 WHERE table_schema='public'
   AND table_name='auth_sessions'`
);

const sessionColumns = new Set(
(sessionColumnsRes.rows || []).map((row) => String(row.column_name || "").trim())
);

const insertColumns = [];
const insertValues = [];
const insertParams = [];
let paramIndex = 1;

function pushValue(columnName, value, { useNow = false, useNull = false } = {}){
insertColumns.push(columnName);

if(useNow){
  insertValues.push('NOW()');
  return;
}

if(useNull){
  insertValues.push('NULL');
  return;
}

insertValues.push(`$${paramIndex}`);
insertParams.push(value);
paramIndex += 1;
}

if(sessionColumns.has('id')){
pushValue('id', sessionId);
}

if(sessionColumns.has('user_id')){
pushValue('user_id', userId);
}

if(sessionColumns.has('created_at')){
pushValue('created_at', null, { useNow: true });
}

if(sessionColumns.has('expires_at')){
pushValue('expires_at', expiresAt);
}

if(sessionColumns.has('last_seen_at')){
pushValue('last_seen_at', lastSeenAt);
}

if(sessionColumns.has('revoked_at')){
pushValue('revoked_at', null, { useNull: true });
}

if(sessionColumns.has('revoked_reason')){
pushValue('revoked_reason', null, { useNull: true });
}

if(sessionColumns.has('ip_address')){
pushValue('ip_address', null, { useNull: true });
}

if(sessionColumns.has('user_agent')){
pushValue('user_agent', null, { useNull: true });
}

if(!insertColumns.length || !sessionColumns.has('id') || !sessionColumns.has('user_id') || !sessionColumns.has('expires_at')){
throw new Error('AUTH_SESSIONS_SCHEMA_INVALID');
}

await db.query(
`INSERT INTO public.auth_sessions (${insertColumns.join(', ')})
 VALUES (${insertValues.join(', ')})`,
insertParams
);

return {
id: sessionId,
expires_at: expiresAt.toISOString(),
last_seen_at: lastSeenAt.toISOString(),
idle_timeout_at: new Date(lastSeenAt.getTime() + (24 * 60 * 60 * 1000)).toISOString()
};
}


async function authUsersHasColumn(db, columnName){
const result = await db.query(
`SELECT 1
 FROM information_schema.columns
 WHERE table_schema='public'
   AND table_name='auth_users'
   AND column_name=$1
 LIMIT 1`,
[columnName]
);

return result.rows.length > 0;
}

async function applyAuthVerificationState(db, userId, target){
const hasPhoneVerifiedAt = await authUsersHasColumn(db, "phone_verified_at");
const hasEmailVerifiedAt = await authUsersHasColumn(db, "email_verified_at");
const hasPreferredLoginChannel = await authUsersHasColumn(db, "preferred_login_channel");

const updates = [];
const params = [];
let paramIndex = 1;

if(target?.lookup === "phone" && hasPhoneVerifiedAt){
updates.push(`phone_verified_at=COALESCE(phone_verified_at, NOW())`);
}

if(target?.lookup === "email" && hasEmailVerifiedAt){
updates.push(`email_verified_at=COALESCE(email_verified_at, NOW())`);
}

if(hasPreferredLoginChannel){
updates.push(`preferred_login_channel=$${paramIndex}`);
params.push(target?.channel === "email" ? "email" : "whatsapp");
paramIndex += 1;
}

if(!updates.length){
return;
}

params.push(Number(userId));

await db.query(`
UPDATE public.auth_users
SET ${updates.join(",\n    ")}
WHERE id=$${paramIndex}
`, params);
}

async function applyPasswordLifecycleState(db, userId, { preferredLoginChannel = null } = {}){
const hasPasswordChangedAt = await authUsersHasColumn(db, "password_changed_at");
const hasPreferredLoginChannel = await authUsersHasColumn(db, "preferred_login_channel");

const updates = ["password_hash=$1", "must_set_password=false"];
const params = [];
let paramIndex = 2;

if(hasPasswordChangedAt){
updates.push("password_changed_at=NOW()");
}

if(hasPreferredLoginChannel && preferredLoginChannel){
updates.push(`preferred_login_channel=$${paramIndex}`);
params.push(preferredLoginChannel);
paramIndex += 1;
}

return {
updates,
params,
nextParamIndex: paramIndex
};
}

async function getAuthUserByTarget(db, target, { requestedRole = "", requestedOwnerSlug = "" } = {}){
const selectMasterSlug = await authUsersHasColumn(db, "master_slug");
const selectSalonSlug = await authUsersHasColumn(db, "salon_slug");

const fields = ["id", "role"];
if(selectMasterSlug){
fields.push("master_slug");
}
if(selectSalonSlug){
fields.push("salon_slug");
}

const whereClause = target?.lookup === "email"
? "lower(email)=lower($1)"
: "phone=$1";

const userRes = await db.query(`
SELECT ${fields.join(", ")}
FROM public.auth_users
WHERE ${whereClause}
FOR UPDATE
`,[target?.value]);

return selectBestAuthUserCandidate(userRes.rows, { requestedRole, requestedOwnerSlug });
}


async function issueAuthOtp(db, { target, purpose, channel }){
const activeOtpRes = await db.query(`
  SELECT id, resend_available_at
  FROM public.auth_otps
  WHERE target=$1
    AND purpose=$2
    AND consumed_at IS NULL
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE
`,[target, purpose]);

const activeOtp = activeOtpRes.rows[0] || null;

if(activeOtp?.resend_available_at && new Date(activeOtp.resend_available_at).getTime() > Date.now()){
  return {
    ok:false,
    error:"OTP_RESEND_NOT_AVAILABLE",
    resend_available_at: activeOtp.resend_available_at
  };
}

const code = String(Math.floor(100000 + Math.random()*900000));
const codeHash = await bcrypt.hash(code, 10);

await db.query(`
  UPDATE public.auth_otps
  SET consumed_at=NOW()
  WHERE target=$1
    AND purpose=$2
    AND consumed_at IS NULL
`,[target, purpose]);

await db.query(`
  INSERT INTO public.auth_otps(
    channel,
    target,
    purpose,
    code_hash,
    expires_at,
    attempts_used,
    max_attempts,
    blocked_until,
    resend_available_at,
    consumed_at,
    created_at
  )
  VALUES(
    $1,
    $2,
    $3,
    $4,
    NOW() + ($5 || ' minutes')::interval,
    0,
    5,
    NULL,
    NOW() + ($6 || ' seconds')::interval,
    NULL,
    NOW()
  )
`,[channel, target, purpose, codeHash, AUTH_OTP_TTL_MINUTES, AUTH_OTP_RESEND_SECONDS]);

console.log("OTP_CODE", target, purpose, code);
if(channel==="email"){
  Promise.resolve()
    .then(() => sendOtpEmail({to:target, code}))
    .catch((e) => {
      console.error("EMAIL_SEND_FAILED", e);
    });
}

return {
  ok:true,
  sent:true,
  target,
  purpose,
  channel
};
}

async function createAuthUserForRole(db, { target, role, ownerSlug }){
const hasMasterSlug = await authUsersHasColumn(db, "master_slug");
const hasSalonSlug = await authUsersHasColumn(db, "salon_slug");
const hasPhoneVerifiedAt = await authUsersHasColumn(db, "phone_verified_at");
const hasEmailVerifiedAt = await authUsersHasColumn(db, "email_verified_at");
const hasPreferredLoginChannel = await authUsersHasColumn(db, "preferred_login_channel");

const email = target?.lookup === "email"
? target.value
: `${String(target?.value || "").replace("+","")}@totem.local`;
const phone = target?.lookup === "phone" ? target.value : null;

const columns = ["email", "role", "enabled", "must_set_password"];
const values = [email, role, true, true];

if(phone){
columns.push("phone");
values.push(phone);
}

if(target?.lookup === "phone" && hasPhoneVerifiedAt){
columns.push("phone_verified_at");
values.push(new Date().toISOString());
}

if(target?.lookup === "email" && hasEmailVerifiedAt){
columns.push("email_verified_at");
values.push(new Date().toISOString());
}

if(hasPreferredLoginChannel){
columns.push("preferred_login_channel");
values.push(target?.channel === "email" ? "email" : "whatsapp");
}

if(role === "master" && hasMasterSlug){
columns.push("master_slug");
values.push(ownerSlug);
}

if(role === "salon_admin" && hasSalonSlug){
columns.push("salon_slug");
values.push(ownerSlug);
}

const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");

const created = await db.query(`
INSERT INTO public.auth_users(
  ${columns.join(",\n  ")}
)
VALUES(${placeholders})
RETURNING id, role
`, values);

return created.rows[0] || null;
}

function isPgUniqueViolation(err){
return String(err?.code || "").trim() === "23505";
}

async function resolveOrCreateAuthUserForVerify(db, { authTarget, channel, requestedRole, requestedOwnerSlug }){
let user = await getAuthUserByTarget(db, authTarget, {
requestedRole,
requestedOwnerSlug
});

if(user){
  return user;
}

try{
  user = await createAuthUserForRole(db, {
    target: {
      ...authTarget,
      channel
    },
    role: requestedRole,
    ownerSlug: requestedOwnerSlug
  });

  if(user){
    return user;
  }
}catch(err){
  if(!isPgUniqueViolation(err)){
    throw err;
  }
}

return await getAuthUserByTarget(db, authTarget, {
requestedRole,
requestedOwnerSlug
});
}

r.get("/auth/session/resolve", async (req,res)=>{
try{
const auth = req.auth || null;
const identity = req.identity || null;
const hasAuth = Boolean(auth?.user_id && auth?.role);
const sessionExpired = isAuthResolveSessionExpired(auth);
const idleExpired = isAuthResolveIdleExpired(auth);
const authenticated = hasAuth && !sessionExpired && !idleExpired;

if(!authenticated){
return res.status(200).json({
ok:true,
authenticated:false,
role:"public",
reason:sessionExpired ? "SESSION_EXPIRED" : idleExpired ? "IDLE_TIMEOUT" : "NO_AUTH",
auth:null,
identity:{
user_id:null,
role:"public",
salons:[],
masters:[],
ownership:[]
}
});
}

const salons = uniqueNumberList(Array.isArray(identity?.salons) ? identity.salons : []);
const masters = uniqueNumberList(Array.isArray(identity?.masters) ? identity.masters : []);
const ownership = Array.isArray(identity?.ownership) ? identity.ownership : [];

return res.status(200).json({
ok:true,
authenticated:true,
role:String(auth?.role || "public"),
auth:{
user_id:Number(auth?.user_id),
role:String(auth?.role || "public"),
source:auth?.source || null,
session_id:auth?.session_id || null,
session_source:auth?.session_source || null,
session_expires_at:auth?.session_expires_at || null,
last_seen_at:auth?.last_seen_at || null,
idle_timeout_at:auth?.idle_timeout_at || null
},
identity:{
user_id:Number(identity?.user_id || auth?.user_id),
role:String(identity?.role || auth?.role || "public"),
salons,
masters,
ownership
}
});
}catch(err){
console.error("AUTH_SESSION_RESOLVE_ROUTE_ERROR", err);
return res.status(500).json({
ok:false,
error:"auth_session_resolve_failed"
});
}
});

r.post("/auth/login", async (req,res)=>{
const db = await pool.connect();

try{
const email = normalizeAuthIdentifier(req.body?.email);
const phone = normalizePhone(req.body?.phone);
const password = String(req.body?.password || "");
const requestedRole = normalizeRequestedAuthRole(req.body?.role || req.body?.owner_type);
const requestedOwnerSlug = normalizeRequestedOwnerSlug(requestedRole, req.body);

if((!email && !phone) || !password){
return res.status(400).json({
ok:false,
error:"LOGIN_PAYLOAD_INVALID"
});
}

const user = await findLoginUser(db, {
email,
phone,
requestedRole,
requestedOwnerSlug
});

if(!user || !user.enabled || !user.password_hash){
return res.status(401).json({
ok:false,
error:"INVALID_CREDENTIALS"
});
}

const passwordOk = await bcrypt.compare(password, user.password_hash);

if(!passwordOk){
return res.status(401).json({
ok:false,
error:"INVALID_CREDENTIALS"
});
}

await db.query("BEGIN");

const preferredLoginChannel = phone ? "whatsapp" : "email";
const hasPreferredLoginChannel = await authUsersHasColumn(db, "preferred_login_channel");
if(hasPreferredLoginChannel){
await db.query(`
  UPDATE public.auth_users
  SET preferred_login_channel=$1
  WHERE id=$2
`, [preferredLoginChannel, Number(user.id)]);
}

const session = await createAuthSession(db, Number(user.id));

const secret = String(process.env.JWT_SECRET || "").trim();
if(!secret){
throw new Error("JWT_SECRET_NOT_SET");
}

const accessToken = jwt.sign(
{
user_id: Number(user.id),
role: String(user.role),
session_id: session.id
},
secret
);

await db.query("COMMIT");

return res.status(200).json({
ok:true,
access_token: accessToken,
token_type: "Bearer",
auth: {
user_id: Number(user.id),
role: String(user.role),
source: "password_login",
session_id: session.id,
session_source: "auth_sessions",
session_expires_at: session.expires_at,
last_seen_at: session.last_seen_at,
idle_timeout_at: session.idle_timeout_at
}
});
}catch(err){
try{ await db.query("ROLLBACK"); }catch(e){}
console.error("AUTH_LOGIN_ROUTE_ERROR", err);
return res.status(500).json({
ok:false,
error:"AUTH_LOGIN_FAILED"
});
}finally{
db.release();
}
});

const reportsRouter = buildReportsRouter(pool, internalReadRateLimit);

r.use(reportsRouter);

async function getOrCreateSystemWallet(db){
const systemWallet = await db.query(`
SELECT wallet_id
FROM totem_test.system_wallets
FOR UPDATE
LIMIT 1
`);

if(systemWallet.rows.length){
return systemWallet.rows[0].wallet_id;
}

const existingWallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type='system'
AND owner_id=0
FOR UPDATE
LIMIT 1
`);

let walletId = existingWallet.rows[0]?.id || null;

if(!walletId){
const createdWallet = await db.query(`
INSERT INTO totem_test.wallets(
owner_type,
owner_id,
currency
)
VALUES('system',0,'KGS')
RETURNING id
`);

walletId = createdWallet.rows[0].id;
}

await db.query(`
INSERT INTO totem_test.system_wallets(wallet_id)
SELECT $1
WHERE NOT EXISTS (
SELECT 1
FROM totem_test.system_wallets
WHERE wallet_id=$1
)
`,[walletId]);

return walletId;
}

async function getSystemWalletId(db){
return getOrCreateSystemWallet(db);
}

async function getSalonWalletId(db, salonId){
const wallet = await db.query(`
SELECT w.id
FROM totem_test.wallets w
WHERE w.owner_type='salon'
AND w.owner_id=$1
LIMIT 1
`,[salonId]);

if(!wallet.rows.length){
throw new Error("SALON_WALLET_NOT_FOUND");
}

return wallet.rows[0].id;
}

async function setBookingConfirmedIfNeeded(db, bookingId){
await db.query(`
UPDATE bookings
SET status='confirmed'
WHERE id=$1
AND status IN ('reserved','pending')
`,[bookingId]);
}

const paymentsRouter = buildPaymentsRouter({
  pool,
  getSalonWalletId,
  getSystemWalletId,
  setBookingConfirmedIfNeeded,
});

r.use(paymentsRouter);

const settlementsRouter = buildSettlementsRouter(pool);

r.use(settlementsRouter);

const contractsRouter = buildContractsRouter(pool, internalReadRateLimit);

r.use(contractsRouter);

const withdrawsRouter = buildWithdrawsRouter(pool, internalReadRateLimit);
r.use(withdrawsRouter);

const xpayRouter = buildXpayRouter({
  pool,
  xpayCreateQR,
  xpayCheckStatus,
});

r.use(xpayRouter);

const contractAliasRouter = buildContractAliasRouter(pool);
r.use(contractAliasRouter);

const payoutsProcessorRouter = buildPayoutsProcessorRouter(pool, getOrCreateSystemWallet);
r.use(payoutsProcessorRouter);

const financeEngineRouter = buildFinanceEngineRouter(pool);
r.use(financeEngineRouter);

const withdrawsProcessorRouter = buildWithdrawsProcessorRouter(pool);
r.use(withdrawsProcessorRouter);

const mastersRouter = buildMastersRouter(pool, internalReadRateLimit);
r.use(mastersRouter);

const salonsRouter = buildSalonsRouter(pool, internalReadRateLimit);
r.use(salonsRouter);

const adminRouter = buildAdminRouter(pool, internalReadRateLimit);
adminContainer.use('/', adminRouter);
r.use("/admin", adminContainer);

const provisionRouter = buildProvisionRouter(pool);
r.use(provisionRouter);

const entryRouter = buildEntryRouter(pool);
r.use(entryRouter);

const templatesRouter = buildTemplatesRouter(pool, internalReadRateLimit);
r.use(templatesRouter);

async function getBillingWalletId(db, ownerType, ownerId){
const wallet = await db.query(`
SELECT id
FROM totem_test.wallets
WHERE owner_type=$1
AND owner_id=$2
LIMIT 1
`,[ownerType, ownerId]);

if(!wallet.rows.length){
return null;
}

return wallet.rows[0].id;
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

const oneTimeChargeRouter = buildOneTimeChargeRouter({
  pool,
  getOrCreateSystemWallet,
  getWalletBalanceById
});
r.use(oneTimeChargeRouter);

const oneTimeChargeHistoryRouter = buildOneTimeChargeHistoryRouter({
  pool
});
r.use(oneTimeChargeHistoryRouter);

async function getDueBillingSubscriptions(db){
const due = await db.query(`
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
WHERE owner_type IN ('salon','master')
AND billing_model='subscription'
AND subscription_status='active'
AND wallet_only=true
AND next_charge_at IS NOT NULL
AND next_charge_at <= NOW()
FOR UPDATE
`);

return due.rows;
}

async function runBillingAutoCharge(db){
const due = await getDueBillingSubscriptions(db);
const systemWalletId = await getOrCreateSystemWallet(db);

let processed = 0;
let charged = 0;
let skipped_no_wallet = 0;
let skipped_insufficient_balance = 0;
let skipped_invalid_amount = 0;
let skipped_not_due = 0;
const results = [];

for(const billing of due){
processed++;

const ownerType = String(billing.owner_type || "");
const ownerId = Number(billing.owner_id);
const amount = Number(billing.amount || 0);

if(!Number.isFinite(amount) || amount <= 0){
skipped_invalid_amount++;
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:false,
error:"SUBSCRIPTION_AMOUNT_INVALID"
});
continue;
}

if(billing.next_charge_at && new Date(billing.next_charge_at).getTime() > Date.now()){
skipped_not_due++;
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:false,
error:"SUBSCRIPTION_NOT_DUE"
});
continue;
}

const walletId = await getBillingWalletId(db, ownerType, ownerId);

if(!walletId){
skipped_no_wallet++;
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:false,
error:(ownerType === "salon" ? "SALON_WALLET_NOT_FOUND" : "MASTER_WALLET_NOT_FOUND")
});
continue;
}

const balance = await getWalletBalanceById(db, walletId);

if(balance < amount){
const graceDays = Number(billing.grace_period_days || 0);

await db.query(`
UPDATE public.billing_subscriptions
SET
last_charge_status='failed',
grace_until=CASE
WHEN $2 > 0 THEN NOW() + ($2 || ' days')::interval
ELSE NULL
END,
updated_at=NOW()
WHERE id=$1
AND subscription_status='active'
`,[
billing.id,
graceDays
]);

skipped_insufficient_balance++;
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:false,
error:"INSUFFICIENT_WALLET_BALANCE",
balance,
amount
});
continue;
}

const exists = await db.query(`
SELECT 1
FROM totem_test.ledger_entries
WHERE wallet_id=$1
AND reference_type='subscription'
AND reference_id=$2
AND direction='debit'
LIMIT 1
`,[walletId, String(billing.id)]);

if(exists.rows.length){
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:true,
skipped:true,
reason:"ALREADY_CHARGED"
});
continue;
}

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
walletId,
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

const billingUpdate = await db.query(`
UPDATE public.billing_subscriptions
SET
last_charge_at=NOW(),
last_charge_status='success',
grace_until=NULL,
current_period_start=COALESCE(next_charge_at, NOW()),
current_period_end=COALESCE(next_charge_at, NOW()) + (COALESCE(subscription_period_days,30) || ' days')::interval,
next_charge_at=COALESCE(next_charge_at, NOW()) + (COALESCE(subscription_period_days,30) || ' days')::interval,
updated_at=NOW()
WHERE id=$1
AND subscription_status='active'
RETURNING id
`,[billing.id]);

if(!billingUpdate.rows.length){
throw new Error("BILLING_STATUS_CHANGED_DURING_AUTO_CHARGE");
}

charged++;
results.push({
billing_id:String(billing.id),
owner_type:ownerType,
owner_id:ownerId,
ok:true,
charged:true,
amount
});
}

return {
processed,
charged,
skipped_no_wallet,
skipped_insufficient_balance,
skipped_invalid_amount,
skipped_not_due,
results
};
}

r.post("/billing/auto-charge/run", async (req,res)=>{
const db = await pool.connect();

try{

await db.query("BEGIN");

const summary = await runBillingAutoCharge(db);

await db.query("COMMIT");

return res.json({
ok:true,
engine:"billing_auto_charge_manual",
processed:summary.processed,
charged:summary.charged,
skipped_no_wallet:summary.skipped_no_wallet,
skipped_insufficient_balance:summary.skipped_insufficient_balance,
skipped_invalid_amount:summary.skipped_invalid_amount,
skipped_not_due:summary.skipped_not_due,
results:summary.results
});

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("BILLING_AUTO_CHARGE_RUN_ERROR",err);

return res.status(500).json({
ok:false,
error:"BILLING_AUTO_CHARGE_RUN_FAILED"
});

}finally{

db.release();

}

});

/*
ARCHITECTURE CONTRACT (CRITICAL)

Payout ledger is written ONLY by backend (this processor).
Withdraw ledger is written ONLY by backend withdraw routes/processors.

Database trigger:
trg_bridge_payout_paid_to_wallet_ledger
MUST remain DISABLED.

Reason:
Prevent duplicate ledger entries (double-write conflict)
which breaks enforce_ledger_double_entry_row() invariant.

If this trigger is enabled -> system will break.

DO NOT CHANGE WITHOUT FULL FINANCE REFACTOR.
*/

r.post("/auth/logout", async (req,res)=>{
  const db = await pool.connect();
  try{
    const sessionId = req.auth?.session_id;

    if(!sessionId){
      return res.status(401).json({
        ok:false,
        error:"NO_SESSION"
      });
    }

    await db.query(`
      UPDATE public.auth_sessions
      SET revoked_at=NOW(),
          revoked_reason='logout'
      WHERE id=$1
      AND revoked_at IS NULL
    `,[sessionId]);

    return res.json({ ok:true });

  }catch(err){
    console.error("AUTH_LOGOUT_ERROR", err);
    return res.status(500).json({
      ok:false,
      error:"AUTH_LOGOUT_FAILED"
    });
  }finally{
    db.release();
  }
});

r.post("/auth/logout-all", async (req,res)=>{
  const db = await pool.connect();
  try{
    const userId = req.auth?.user_id;

    if(!userId){
      return res.status(401).json({
        ok:false,
        error:"NO_AUTH"
      });
    }

    await db.query(`
      UPDATE public.auth_sessions
      SET revoked_at=NOW(),
          revoked_reason='logout_all'
      WHERE user_id=$1
      AND revoked_at IS NULL
    `,[userId]);

    return res.json({ ok:true });

  }catch(err){
    console.error("AUTH_LOGOUT_ALL_ERROR", err);
    return res.status(500).json({
      ok:false,
      error:"AUTH_LOGOUT_ALL_FAILED"
    });
  }finally{
    db.release();
  }
});

r.post("/auth/start", async (req,res)=>{
  const db = await pool.connect();
  try{
    const authTarget = resolveAuthTarget(req.body || {});
    const requestedPurpose = String(req.body?.purpose || "").trim().toLowerCase();
    const purpose =
      requestedPurpose === "password_reset"
        ? "password_reset"
        : requestedPurpose === "signup_verify"
          ? "signup_verify"
          : requestedPurpose === "email_verify"
            ? "email_verify"
            : requestedPurpose === "phone_verify"
              ? "phone_verify"
              : "login_verify";
    const requestedChannel = String(req.body?.channel || "").trim().toLowerCase();
    const channel = requestedChannel === "email" ? "email" : authTarget?.channel || "whatsapp";

    if(!authTarget?.value){
      return res.status(400).json({
        ok:false,
        error:"AUTH_TARGET_INVALID"
      });
    }

    await db.query("BEGIN");

    const otpResult = await issueAuthOtp(db, {
      target: authTarget.value,
      purpose,
      channel
    });

    if(!otpResult.ok){
      await db.query("ROLLBACK");
      return res.status(429).json(otpResult);
    }

    await db.query("COMMIT");

    return res.json(otpResult);

  }catch(err){
    try{ await db.query("ROLLBACK"); }catch(e){}
    console.error("AUTH_START_ERROR", err);
    return res.status(500).json({
      ok:false,
      error:"AUTH_START_FAILED"
    });
  }finally{
    db.release();
  }
});

r.post("/auth/verify", async (req,res)=>{
  const db = await pool.connect();
  try{
    const authTarget = resolveAuthTarget(req.body || {});
    const code = String(req.body?.code || "").trim();
    const requestedPurpose = String(req.body?.purpose || "").trim().toLowerCase();
    const requestedRole = normalizeRequestedAuthRole(req.body?.role || req.body?.owner_type);
    const requestedOwnerSlug = normalizeRequestedOwnerSlug(requestedRole, req.body);
    const requestedChannel = String(req.body?.channel || "").trim().toLowerCase();
    const channel = requestedChannel === "email" ? "email" : authTarget?.channel || "whatsapp";
    const purpose =
      requestedPurpose === "password_reset"
        ? "password_reset"
        : requestedPurpose === "signup_verify"
          ? "signup_verify"
          : requestedPurpose === "email_verify"
            ? "email_verify"
            : requestedPurpose === "phone_verify"
              ? "phone_verify"
              : "login_verify";

    if(!authTarget?.value || !code){
      return res.status(400).json({
        ok:false,
        error:"VERIFY_PAYLOAD_INVALID"
      });
    }

    await db.query("BEGIN");

    const otpRes = await db.query(`
      SELECT *
      FROM public.auth_otps
      WHERE target=$1
        AND purpose=$2
        AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `,[authTarget.value, purpose]);

    const otp = otpRes.rows[0] || null;

    if(!otp){
      await db.query("ROLLBACK");
      return res.status(401).json({
        ok:false,
        error:"OTP_INVALID"
      });
    }

    if(otp.blocked_until && new Date(otp.blocked_until).getTime() > Date.now()){
      await db.query("ROLLBACK");
      return res.status(429).json({
        ok:false,
        error:"OTP_BLOCKED",
        blocked_until: otp.blocked_until
      });
    }

    if(otp.expires_at && new Date(otp.expires_at).getTime() <= Date.now()){
      await db.query("ROLLBACK");
      return res.status(401).json({
        ok:false,
        error:"OTP_EXPIRED"
      });
    }

    const attemptsUsed = Number(otp.attempts_used || 0);
    const maxAttempts = Number(otp.max_attempts || 5);

    if(attemptsUsed >= maxAttempts){
      await db.query(`
        UPDATE public.auth_otps
        SET blocked_until = COALESCE(blocked_until, NOW() + ($2 || ' minutes')::interval)
        WHERE id=$1
      `,[otp.id, AUTH_OTP_BLOCK_MINUTES]);

      await db.query("COMMIT");
      return res.status(429).json({
        ok:false,
        error:"OTP_BLOCKED"
      });
    }

    const codeOk = await bcrypt.compare(code, String(otp.code_hash || ""));

    if(!codeOk){
      const updatedAttempts = attemptsUsed + 1;
      const shouldBlock = updatedAttempts >= maxAttempts;

      const failedUpdate = await db.query(`
        UPDATE public.auth_otps
        SET attempts_used=$2,
            blocked_until=CASE
              WHEN $3 THEN NOW() + ($4 || ' minutes')::interval
              ELSE blocked_until
            END
        WHERE id=$1
        RETURNING attempts_used, max_attempts, blocked_until
      `,[otp.id, updatedAttempts, shouldBlock, AUTH_OTP_BLOCK_MINUTES]);

      await db.query("COMMIT");

      return res.status(401).json({
        ok:false,
        error: shouldBlock ? "OTP_BLOCKED" : "OTP_INVALID",
        attempts_used: Number(failedUpdate.rows[0]?.attempts_used || updatedAttempts),
        max_attempts: Number(failedUpdate.rows[0]?.max_attempts || maxAttempts),
        blocked_until: failedUpdate.rows[0]?.blocked_until || null
      });
    }

    await db.query(`
      UPDATE public.auth_otps
      SET consumed_at=NOW()
      WHERE id=$1
    `,[otp.id]);

    let user = await resolveOrCreateAuthUserForVerify(db, {
      authTarget,
      channel,
      requestedRole,
      requestedOwnerSlug
    });

    if(!user?.id){
      throw new Error("AUTH_USER_RESOLVE_FAILED");
    }

    // FIX: verify не должен менять role, чтобы не ломать DB constraint

    await applyAuthVerificationState(db, Number(user.id), {
      ...authTarget,
      channel
    });

    const session = await createAuthSession(db, Number(user.id));

    const secret = String(process.env.JWT_SECRET || "").trim();
    if(!secret){
      throw new Error("JWT_SECRET_NOT_SET");
    }

    const accessToken = jwt.sign(
      {
        user_id: Number(user.id),
        role: String(user.role),
        session_id: session.id
      },
      secret
    );

    await db.query("COMMIT");

    return res.json({
      ok:true,
      access_token: accessToken,
      token_type:"Bearer",
      auth:{
        user_id:Number(user.id),
        role:String(user.role),
        source:"otp_login",
        session_id:session.id,
        session_source:"auth_sessions",
        session_expires_at:session.expires_at,
        last_seen_at:session.last_seen_at,
        idle_timeout_at:session.idle_timeout_at
      }
    });

  }catch(err){
    try{ await db.query("ROLLBACK"); }catch(e){}
    console.error("AUTH_VERIFY_ERROR", err);
    return res.status(500).json({
      ok:false,
      error:"AUTH_VERIFY_FAILED"
    });
  }finally{
    db.release();
  }
});

r.post("/auth/password/reset/start", async (req,res)=>{
  const db = await pool.connect();
  try{
    const authTarget = resolveAuthTarget(req.body || {});
    const requestedChannel = String(req.body?.channel || "").trim().toLowerCase();
    const channel = requestedChannel === "email" ? "email" : authTarget?.channel || "whatsapp";

    if(!authTarget?.value){
      return res.status(400).json({
        ok:false,
        error:"AUTH_TARGET_INVALID"
      });
    }

    await db.query("BEGIN");

    const user = await findLoginUser(db, {
      email: authTarget.lookup === "email" ? authTarget.value : null,
      phone: authTarget.lookup === "phone" ? authTarget.value : null
    });

    if(!user || !user.enabled){
      await db.query("ROLLBACK");
      return res.status(200).json(buildNeutralAuthStartResponse({
        channel,
        purpose: "password_reset"
      }));
    }

    const otpResult = await issueAuthOtp(db, {
      target: authTarget.value,
      purpose:"password_reset",
      channel
    });

    if(!otpResult.ok){
      await db.query("ROLLBACK");
      return res.status(429).json(otpResult);
    }

    await db.query("COMMIT");

    return res.json(buildNeutralAuthStartResponse({
      channel,
      purpose: "password_reset"
    }));
  }catch(err){
    try{ await db.query("ROLLBACK"); }catch(e){}
    console.error("AUTH_PASSWORD_RESET_START_ERROR", err);
    return res.status(500).json({
      ok:false,
      error:"AUTH_PASSWORD_RESET_START_FAILED"
    });
  }finally{
    db.release();
  }
});

r.post("/auth/password/reset/finish", async (req,res)=>{
  const db = await pool.connect();
  try{
    const authTarget = resolveAuthTarget(req.body || {});
    const code = String(req.body?.code || "").trim();
    const password = String(req.body?.password || "");

    if(!authTarget?.value || !code){
      return res.status(400).json({
        ok:false,
        error:"VERIFY_PAYLOAD_INVALID"
      });
    }

    if(!password || password.length < 8){
      return res.status(400).json({
        ok:false,
        error:"PASSWORD_INVALID"
      });
    }

    await db.query("BEGIN");

    const otpRes = await db.query(`
      SELECT *
      FROM public.auth_otps
      WHERE target=$1
        AND purpose='password_reset'
        AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `,[authTarget.value]);

    const otp = otpRes.rows[0] || null;

    if(!otp){
      await db.query("ROLLBACK");
      return res.status(401).json({
        ok:false,
        error:"OTP_INVALID"
      });
    }

    if(otp.blocked_until && new Date(otp.blocked_until).getTime() > Date.now()){
      await db.query("ROLLBACK");
      return res.status(429).json({
        ok:false,
        error:"OTP_BLOCKED",
        blocked_until: otp.blocked_until
      });
    }

    if(otp.expires_at && new Date(otp.expires_at).getTime() <= Date.now()){
      await db.query("ROLLBACK");
      return res.status(401).json({
        ok:false,
        error:"OTP_EXPIRED"
      });
    }

    const attemptsUsed = Number(otp.attempts_used || 0);
    const maxAttempts = Number(otp.max_attempts || 5);

    if(attemptsUsed >= maxAttempts){
      await db.query(`
        UPDATE public.auth_otps
        SET blocked_until = COALESCE(blocked_until, NOW() + ($2 || ' minutes')::interval)
        WHERE id=$1
      `,[otp.id, AUTH_OTP_BLOCK_MINUTES]);

      await db.query("COMMIT");
      return res.status(429).json({
        ok:false,
        error:"OTP_BLOCKED"
      });
    }

    const codeOk = await bcrypt.compare(code, String(otp.code_hash || ""));

    if(!codeOk){
      const updatedAttempts = attemptsUsed + 1;
      const shouldBlock = updatedAttempts >= maxAttempts;

      const failedUpdate = await db.query(`
        UPDATE public.auth_otps
        SET attempts_used=$2,
            blocked_until=CASE
              WHEN $3 THEN NOW() + ($4 || ' minutes')::interval
              ELSE blocked_until
            END
        WHERE id=$1
        RETURNING attempts_used, max_attempts, blocked_until
      `,[otp.id, updatedAttempts, shouldBlock, AUTH_OTP_BLOCK_MINUTES]);

      await db.query("COMMIT");

      return res.status(401).json({
        ok:false,
        error: shouldBlock ? "OTP_BLOCKED" : "OTP_INVALID",
        attempts_used: Number(failedUpdate.rows[0]?.attempts_used || updatedAttempts),
        max_attempts: Number(failedUpdate.rows[0]?.max_attempts || maxAttempts),
        blocked_until: failedUpdate.rows[0]?.blocked_until || null
      });
    }

    const userRes = await db.query(`
      SELECT id, phone, email
      FROM public.auth_users
      WHERE ${authTarget.lookup === "email" ? "lower(email)=lower($1)" : "phone=$1"}
      LIMIT 1
      FOR UPDATE
    `,[authTarget.value]);

    const user = userRes.rows[0] || null;

    if(!user){
      await db.query("ROLLBACK");
      return res.status(404).json({
        ok:false,
        error:"AUTH_USER_NOT_FOUND"
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const passwordState = await applyPasswordLifecycleState(db, Number(user.id), {
      preferredLoginChannel: authTarget.channel === "email" ? "email" : "whatsapp"
    });

    await db.query(`
      UPDATE public.auth_users
      SET ${passwordState.updates.join(",\n          ")}
      WHERE id=$${passwordState.nextParamIndex}
    `,[hash, ...passwordState.params, Number(user.id)]);

    await db.query(`
      UPDATE public.auth_sessions
      SET revoked_at=NOW(),
          revoked_reason='password_reset'
      WHERE user_id=$1
      AND revoked_at IS NULL
    `,[Number(user.id)]);

    await db.query(`
      UPDATE public.auth_otps
      SET consumed_at=NOW()
      WHERE target=$1
        AND consumed_at IS NULL
    `,[authTarget.value]);

    await db.query("COMMIT");

    return res.json({ ok:true });
  }catch(err){
    try{ await db.query("ROLLBACK"); }catch(e){}
    console.error("AUTH_PASSWORD_RESET_FINISH_ERROR", err);
    return res.status(500).json({
      ok:false,
      error:"AUTH_PASSWORD_RESET_FINISH_FAILED"
    });
  }finally{
    db.release();
  }
});

r.post("/auth/set-password", async (req,res)=>{
  const db = await pool.connect();
  try{
    const userId = req.auth?.user_id;
    const password = String(req.body?.password || "");

    if(!userId){
      return res.status(401).json({
        ok:false,
        error:"NO_AUTH"
      });
    }

    if(!password || password.length < 8){
      return res.status(400).json({
        ok:false,
        error:"PASSWORD_INVALID"
      });
    }

    await db.query("BEGIN");

    const userRes = await db.query(`
      SELECT id, phone, email
      FROM public.auth_users
      WHERE id=$1
      LIMIT 1
      FOR UPDATE
    `,[userId]);

    const user = userRes.rows[0] || null;

    if(!user){
      await db.query("ROLLBACK");
      return res.status(404).json({
        ok:false,
        error:"AUTH_USER_NOT_FOUND"
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const preferredLoginChannel = user.email ? "email" : user.phone ? "whatsapp" : null;
    const passwordState = await applyPasswordLifecycleState(db, Number(user.id), {
      preferredLoginChannel
    });

    await db.query(`
      UPDATE public.auth_users
      SET ${passwordState.updates.join(",\n          ")}
      WHERE id=$${passwordState.nextParamIndex}
    `,[hash, ...passwordState.params, userId]);

    await db.query(`
      UPDATE public.auth_sessions
      SET revoked_at=NOW(),
          revoked_reason='password_changed'
      WHERE user_id=$1
      AND revoked_at IS NULL
    `,[userId]);

    if(user.phone){
      await db.query(`
        UPDATE public.auth_otps
        SET consumed_at=NOW()
        WHERE target=$1
          AND consumed_at IS NULL
      `,[String(user.phone)]);
    }

    if(user.email){
      await db.query(`
        UPDATE public.auth_otps
        SET consumed_at=NOW()
        WHERE lower(target)=lower($1)
          AND consumed_at IS NULL
      `,[String(user.email)]);
    }

    await db.query("COMMIT");

    return res.json({ ok:true });

  }catch(err){
    try{ await db.query("ROLLBACK"); }catch(e){}
    console.error("AUTH_SET_PASSWORD_ERROR", err);
    return res.status(500).json({
      ok:false,
      error:"AUTH_SET_PASSWORD_FAILED"
    });
  }finally{
    db.release();
  }
});

return r;

}
