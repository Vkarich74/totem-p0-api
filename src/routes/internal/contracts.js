import express from "express";

function normalizeContractText(value, fallback){
const text = String(value ?? '').trim();
return text || fallback;
}

function normalizeContractNumber(value, errorCode){
const n = Number(value);
if(!Number.isFinite(n)){
throw new Error(errorCode);
}
return n;
}

function normalizePositiveAmount(value, errorCode){
const n = normalizeContractNumber(value, errorCode);
if(n <= 0){
throw new Error(errorCode);
}
return n;
}

function normalizePositiveInteger(value, errorCode){
const n = Number(value);
if(!Number.isInteger(n) || n <= 0){
throw new Error(errorCode);
}
return n;
}

function normalizeNonNegativeNumber(value, errorCode, fallback = 0){
const n = normalizeContractNumber(value ?? fallback, errorCode);
if(n < 0){
throw new Error(errorCode);
}
return n;
}

function normalizeCurrency(terms){
return normalizeContractText(terms?.currency, 'KGS').toUpperCase();
}

function normalizePayoutSchedule(terms){
return normalizeContractText(terms?.payout_schedule, 'manual');
}

function validatePercentSplit(terms){
const master = normalizeNonNegativeNumber(terms?.master_percent, 'INVALID_PERCENT_NUMBER');
const salon = normalizeNonNegativeNumber(terms?.salon_percent, 'INVALID_PERCENT_NUMBER');
const platform = normalizeNonNegativeNumber(terms?.platform_percent, 'INVALID_PERCENT_NUMBER');
const total = master + salon + platform;
if(Math.abs(total - 100) > 0.000001){
throw new Error('INVALID_PERCENT_TOTAL');
}
return {
master_percent: master,
salon_percent: salon,
platform_percent: platform
};
}

function normalizeTermsObject(terms){
if(typeof terms === 'string'){
try{
return JSON.parse(terms || '{}');
}catch{
throw new Error('INVALID_TERMS_JSON');
}
}
if(!terms || typeof terms !== 'object' || Array.isArray(terms)){
throw new Error('INVALID_TERMS_JSON');
}
return terms;
}

function validateTerms(terms){
terms = normalizeTermsObject(terms || {});
const model = normalizeContractText(terms.model, 'percentage').toLowerCase();

if(!['percentage','fixed_rent','salary','hybrid'].includes(model)){
throw new Error('INVALID_CONTRACT_MODEL');
}

if(model === 'percentage'){
const split = validatePercentSplit(terms);
return {
...terms,
model: 'percentage',
...split,
payout_schedule: normalizePayoutSchedule(terms),
...(terms.currency ? { currency: normalizeCurrency(terms) } : {})
};
}

if(model === 'fixed_rent'){
return {
...terms,
model: 'fixed_rent',
rent_amount: normalizePositiveAmount(terms.rent_amount, 'INVALID_RENT_AMOUNT'),
rent_period: normalizeContractText(terms.rent_period, 'monthly'),
currency: normalizeCurrency(terms),
payout_schedule: normalizePayoutSchedule(terms),
settlement_mode: normalizeContractText(terms.settlement_mode, 'accrued')
};
}

if(model === 'salary'){
return {
...terms,
model: 'salary',
salary_amount: normalizePositiveAmount(terms.salary_amount, 'INVALID_SALARY_AMOUNT'),
salary_period: normalizeContractText(terms.salary_period, 'monthly'),
currency: normalizeCurrency(terms),
payout_schedule: normalizePayoutSchedule(terms),
bonus_percent: normalizeNonNegativeNumber(terms.bonus_percent, 'INVALID_BONUS_PERCENT', 0)
};
}

const baseType = normalizeContractText(terms.base_type, 'salary').toLowerCase();
if(!['salary','fixed_rent'].includes(baseType)){
throw new Error('INVALID_HYBRID_BASE_TYPE');
}

return {
...terms,
model: 'hybrid',
base_type: baseType,
base_amount: normalizePositiveAmount(terms.base_amount, 'INVALID_HYBRID_BASE_AMOUNT'),
base_period: normalizeContractText(terms.base_period, 'monthly'),
currency: normalizeCurrency(terms),
...validatePercentSplit(terms),
payout_schedule: normalizePayoutSchedule(terms)
};
}

function normalizeDate(date){
  try{
    return date ? new Date(date) : new Date();
  }catch{
    return new Date();
  }
}

function safeInt(value){
const n = Number(value);
if(!Number.isInteger(n) || n <= 0){
return null;
}
return n;
}

function getIdentitySalonIds(identity){
const ids = new Set();

if(Array.isArray(identity?.salons)){
for(const item of identity.salons){
if(item && typeof item === "object"){
const id = safeInt(item.id ?? item.salon_id ?? item.owner_id);
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
if(ownerType !== "salon"){
continue;
}

const id = safeInt(item.owner_id ?? item.salon_id ?? item.id);
if(id){
ids.add(id);
}
}
}

return ids;
}

function hasSalonOwnership(req, salonId){
if(req?.auth?.role === "system"){
return true;
}

const targetSalonId = safeInt(salonId);
if(!targetSalonId){
return false;
}

const identitySalonIds = getIdentitySalonIds(req?.identity);
return identitySalonIds.has(targetSalonId);
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

function parseQueryDate(value, errorCode){
const raw = String(value ?? '').trim();
if(!raw){
return null;
}

const date = new Date(raw);
if(Number.isNaN(date.getTime())){
throw new Error(errorCode);
}

return date.toISOString();
}

function parseStatusFilter(value){
const raw = String(value ?? '').trim();
if(!raw){
return [];
}

return raw
.split(',')
.map((item) => item.trim())
.filter(Boolean);
}

function buildRentObligationsSummary(rows){
const summary = {
open_count: 0,
paid_count: 0,
cancelled_count: 0,
voided_count: 0,
open_amount: 0,
paid_amount: 0
};

for(const row of rows){
const amount = Number(row.amount || 0);
const status = String(row.status || '').toLowerCase();

if(status === 'open'){
summary.open_count += 1;
summary.open_amount += amount;
continue;
}

if(status === 'paid'){
summary.paid_count += 1;
summary.paid_amount += amount;
continue;
}

if(status === 'cancelled'){
summary.cancelled_count += 1;
continue;
}

if(status === 'voided'){
summary.voided_count += 1;
}
}

return summary;
}

function buildSalaryObligationsSummary(rows){
const summary = {
open_count: 0,
open_amount: 0,
paid_count: 0,
paid_amount: 0,
cancelled_count: 0,
cancelled_amount: 0,
voided_count: 0,
voided_amount: 0
};

for(const row of rows){
const amount = Number(row.amount || 0);
const status = String(row.status || '').toLowerCase();

if(status === 'open'){
summary.open_count += 1;
summary.open_amount += amount;
continue;
}

if(status === 'paid'){
summary.paid_count += 1;
summary.paid_amount += amount;
continue;
}

if(status === 'cancelled'){
summary.cancelled_count += 1;
summary.cancelled_amount += amount;
continue;
}

if(status === 'voided'){
summary.voided_count += 1;
summary.voided_amount += amount;
}
}

return summary;
}

async function fetchRentObligationsByOwner({
db,
ownerColumn,
ownerId,
filters = {}
}){
const values = [ownerId];
const clauses = [`${ownerColumn} = $1`];

const statusList = parseStatusFilter(filters.status);
if(statusList.length){
values.push(statusList);
clauses.push(`status = ANY($${values.length}::text[])`);
}

const from = parseQueryDate(filters.from, 'INVALID_FROM_DATE');
if(from){
values.push(from);
clauses.push(`period_start >= $${values.length}::timestamptz`);
}

const to = parseQueryDate(filters.to, 'INVALID_TO_DATE');
if(to){
values.push(to);
clauses.push(`period_start <= $${values.length}::timestamptz`);
}

const query = `
SELECT
id,
contract_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
period_start,
period_end,
amount,
currency,
status,
due_at,
paid_at,
created_at,
updated_at,
cancelled_at,
metadata
FROM public.contract_rent_obligations
WHERE ${clauses.join(' AND ')}
ORDER BY due_at ASC NULLS LAST, period_start DESC
`;

const result = await db.query(query, values);
return result.rows;
}

async function fetchSalaryObligationsByOwner({
db,
ownerColumn,
ownerId,
filters = {}
}){
const values = [ownerId];
const clauses = [`ro.${ownerColumn} = $1`];

const statusList = parseStatusFilter(filters.status);
if(statusList.length){
values.push(statusList);
clauses.push(`ro.status = ANY($${values.length}::text[])`);
}

const from = parseQueryDate(filters.from, 'INVALID_FROM_DATE');
if(from){
values.push(from);
clauses.push(`ro.period_start >= $${values.length}::timestamptz`);
}

const to = parseQueryDate(filters.to, 'INVALID_TO_DATE');
if(to){
values.push(to);
clauses.push(`ro.period_start <= $${values.length}::timestamptz`);
}

const query = `
SELECT
ro.id,
ro.contract_id,
ro.contract_salon_id,
ro.contract_master_id,
ro.salon_id,
ro.master_id,
ro.period_start,
ro.period_end,
ro.amount,
ro.currency,
ro.status,
ro.due_at,
ro.paid_at,
ro.created_at,
ro.updated_at,
ro.cancelled_at,
ro.metadata,
COALESCE(m.name, m.slug, ro.contract_master_id) AS master_name,
COALESCE(s.name, s.slug, ro.contract_salon_id) AS salon_name
FROM public.contract_salary_obligations ro
LEFT JOIN masters m ON m.id = ro.master_id
LEFT JOIN salons s ON s.id = ro.salon_id
WHERE ${clauses.join(' AND ')}
ORDER BY ro.due_at ASC NULLS LAST, ro.created_at DESC
`;

const result = await db.query(query, values);
return result.rows;
}

function isUuidLike(value){
return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function resolveFixedRentPeriodStart(contract){
const rawStart = contract?.effective_from || contract?.created_at || null;
const startDate = rawStart ? new Date(rawStart) : new Date();

if(Number.isNaN(startDate.getTime())){
const err = new Error("FIXED_RENT_PERIOD_NOT_SUPPORTED");
err.code = "FIXED_RENT_PERIOD_NOT_SUPPORTED";
throw err;
}

return startDate.toISOString();
}

async function resolveFixedRentOwnership(db, contract){
const salonTextId = String(contract?.salon_id ?? "").trim();
const masterTextId = String(contract?.master_id ?? "").trim();
const salonNumericId = safeInt(salonTextId);
const masterNumericId = safeInt(masterTextId);

if(!salonNumericId || !masterNumericId){
const err = new Error("FIXED_RENT_PARTIES_RESOLVE_FAILED");
err.code = "FIXED_RENT_PARTIES_RESOLVE_FAILED";
throw err;
}

const salon = await db.query(
`SELECT id
 FROM salons
 WHERE id=$1
 LIMIT 1`,
[salonNumericId]
);

const master = await db.query(
`SELECT id
 FROM masters
 WHERE id=$1
 LIMIT 1`,
[masterNumericId]
);

if(!salon.rows.length || !master.rows.length){
const err = new Error("FIXED_RENT_PARTIES_RESOLVE_FAILED");
err.code = "FIXED_RENT_PARTIES_RESOLVE_FAILED";
throw err;
}

return {
contract_salon_id: salonTextId,
contract_master_id: masterTextId,
salon_id: salon.rows[0].id,
master_id: master.rows[0].id
};
}

async function upsertFixedRentObligation(db, contract, source, createdByFlow){
if(String(contract?.terms_json?.model || "").trim().toLowerCase() !== "fixed_rent"){
const err = new Error("FIXED_RENT_MODEL_REQUIRED");
err.code = "FIXED_RENT_MODEL_REQUIRED";
throw err;
}

const rentPeriod = normalizeContractText(contract?.terms_json?.rent_period, "monthly").toLowerCase();
if(rentPeriod !== "monthly"){
const err = new Error("FIXED_RENT_PERIOD_NOT_SUPPORTED");
err.code = "FIXED_RENT_PERIOD_NOT_SUPPORTED";
throw err;
}

const amount = normalizePositiveAmount(contract?.terms_json?.rent_amount, "FIXED_RENT_AMOUNT_INVALID");
const currency = normalizeCurrency(contract?.terms_json || {});
const ownership = await resolveFixedRentOwnership(db, contract);
const periodStart = resolveFixedRentPeriodStart(contract);
const metadata = JSON.stringify({
source,
rent_period: rentPeriod,
created_by_flow: createdByFlow
});

const inserted = await db.query(
`INSERT INTO public.contract_rent_obligations (
contract_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
period_start,
period_end,
amount,
currency,
status,
due_at,
metadata
)
VALUES (
$1,
$2,
$3,
$4,
$5,
$6::timestamptz,
$6::timestamptz + interval '1 month',
$7,
$8,
'open',
$6::timestamptz,
$9::jsonb
)
ON CONFLICT (contract_id, period_start, period_end)
DO NOTHING
RETURNING *
`,
[
contract.id,
ownership.contract_salon_id,
ownership.contract_master_id,
ownership.salon_id,
ownership.master_id,
periodStart,
amount,
currency,
metadata
]
);

if(inserted.rows.length){
return inserted.rows[0];
}

const existing = await db.query(
`SELECT
id,
contract_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
period_start,
period_end,
amount,
currency,
status,
due_at,
paid_at,
created_at,
updated_at,
cancelled_at,
metadata
FROM public.contract_rent_obligations
WHERE contract_id=$1
AND period_start=$2::timestamptz
AND period_end=($2::timestamptz + interval '1 month')
LIMIT 1`,
[contract.id, periodStart]
);

return existing.rows[0] || null;
}

async function confirmFixedRentPayment({
client,
salonSlug,
contract,
obligation,
amount,
currency,
provider,
paymentMethod,
idempotencyKey
}){
const paymentConfirmedAt = new Date().toISOString();
const paymentMetadata = {
source: "fixed_rent_manual_confirm",
created_by_flow: "salon_rent_payment_confirm",
salon_slug: salonSlug
};

const existingByKey = await client.query(
`SELECT
id,
contract_id,
obligation_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
amount,
currency,
provider,
payment_method,
status,
idempotency_key,
confirmed_at,
voided_at,
cancelled_at,
created_at,
updated_at,
metadata
FROM public.contract_rent_payments
WHERE provider=$1
AND idempotency_key=$2
LIMIT 1
FOR UPDATE`,
[provider, idempotencyKey]
);

if(existingByKey.rows.length){
const existing = existingByKey.rows[0];

if(String(existing.obligation_id || "") !== String(obligation.id)){
const err = new Error("RENT_PAYMENT_IDEMPOTENCY_CONFLICT");
err.code = "RENT_PAYMENT_IDEMPOTENCY_CONFLICT";
throw err;
}

if(String(existing.status || "").toLowerCase() !== "confirmed"){
await client.query(
`UPDATE public.contract_rent_payments
SET status='confirmed',
    confirmed_at = COALESCE(confirmed_at, $1::timestamptz),
    updated_at = now(),
    payment_method = COALESCE(payment_method, $2),
    metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
WHERE id=$4`,
[paymentConfirmedAt, paymentMethod, JSON.stringify(paymentMetadata), existing.id]
);
}

const paymentRow = await client.query(
`SELECT
id,
contract_id,
obligation_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
amount,
currency,
provider,
payment_method,
status,
idempotency_key,
confirmed_at,
voided_at,
cancelled_at,
created_at,
updated_at,
metadata
FROM public.contract_rent_payments
WHERE id=$1
LIMIT 1`,
[existing.id]
);

return {
payment: paymentRow.rows[0],
idempotent: true
};
}

const inserted = await client.query(
`INSERT INTO public.contract_rent_payments (
contract_id,
obligation_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
amount,
currency,
provider,
payment_method,
status,
idempotency_key,
confirmed_at,
metadata
)
VALUES (
$1,
$2,
$3,
$4,
$5,
$6,
$7,
$8,
$9,
$10,
'confirmed',
$11,
$12::timestamptz,
$13::jsonb
)
ON CONFLICT (provider, idempotency_key)
DO UPDATE SET
status='confirmed',
confirmed_at = COALESCE(public.contract_rent_payments.confirmed_at, EXCLUDED.confirmed_at),
updated_at = now(),
payment_method = COALESCE(public.contract_rent_payments.payment_method, EXCLUDED.payment_method),
metadata = COALESCE(public.contract_rent_payments.metadata, '{}'::jsonb) || EXCLUDED.metadata
RETURNING
id,
contract_id,
obligation_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
amount,
currency,
provider,
payment_method,
status,
idempotency_key,
confirmed_at,
voided_at,
cancelled_at,
created_at,
updated_at,
metadata`,
[
contract.id,
obligation.id,
obligation.contract_salon_id,
obligation.contract_master_id,
obligation.salon_id,
obligation.master_id,
amount,
currency,
provider,
paymentMethod,
idempotencyKey,
paymentConfirmedAt,
JSON.stringify(paymentMetadata)
]
);

const payment = inserted.rows[0];

if(!payment || String(payment.obligation_id || "") !== String(obligation.id)){
const err = new Error("RENT_PAYMENT_IDEMPOTENCY_CONFLICT");
err.code = "RENT_PAYMENT_IDEMPOTENCY_CONFLICT";
throw err;
}

return {
payment,
idempotent: false
};
}

async function activateFixedRentContract(db, contract, source){
await db.query(
`UPDATE contracts
 SET status='archived',
 archived_at=NOW()
 WHERE salon_id=$1
 AND master_id=$2
 AND status='active'
 AND id<>$3`,
[contract.salon_id, contract.master_id, contract.id]
);

const activated = await db.query(
`UPDATE contracts
 SET status='active',
 archived_at=NULL
 WHERE id=$1
 RETURNING *`,
[contract.id]
);

const activeContract = activated.rows[0] || contract;
const obligation = await upsertFixedRentObligation(
db,
activeContract,
source,
source === "fixed_rent_accept" ? "contract_accept" : source
);

return {
contract: activeContract,
obligation
};
}

async function resolveSalaryOwnership(db, contract){
const salonTextId = String(contract?.salon_id ?? "").trim();
const masterTextId = String(contract?.master_id ?? "").trim();
const salonNumericId = safeInt(salonTextId);
const masterNumericId = safeInt(masterTextId);

if(!salonNumericId || !masterNumericId){
const err = new Error("SALARY_PARTIES_RESOLVE_FAILED");
err.code = "SALARY_PARTIES_RESOLVE_FAILED";
throw err;
}

const salon = await db.query(
`SELECT id
 FROM salons
 WHERE id=$1
 LIMIT 1`,
[salonNumericId]
);

const master = await db.query(
`SELECT id
 FROM masters
 WHERE id=$1
 LIMIT 1`,
[masterNumericId]
);

if(!salon.rows.length || !master.rows.length){
const err = new Error("SALARY_PARTIES_RESOLVE_FAILED");
err.code = "SALARY_PARTIES_RESOLVE_FAILED";
throw err;
}

return {
contract_salon_id: salonTextId,
contract_master_id: masterTextId,
salon_id: salon.rows[0].id,
master_id: master.rows[0].id
};
}

function resolveSalaryPeriodStart(contract){
const rawStart = contract?.effective_from || contract?.created_at || null;
const startDate = rawStart ? new Date(rawStart) : new Date();

if(Number.isNaN(startDate.getTime())){
const err = new Error("SALARY_PERIOD_NOT_SUPPORTED");
err.code = "SALARY_PERIOD_NOT_SUPPORTED";
throw err;
}

return startDate.toISOString();
}

async function upsertSalaryObligation(db, contract, source, createdByFlow){
if(String(contract?.terms_json?.model || "").trim().toLowerCase() !== "salary"){
const err = new Error("SALARY_MODEL_REQUIRED");
err.code = "SALARY_MODEL_REQUIRED";
throw err;
}

const salaryPeriod = String(contract?.terms_json?.salary_period || "monthly").trim().toLowerCase();
if(!["weekly", "monthly"].includes(salaryPeriod)){
const err = new Error("SALARY_PERIOD_NOT_SUPPORTED");
err.code = "SALARY_PERIOD_NOT_SUPPORTED";
throw err;
}

const salaryAmount = Number(contract?.terms_json?.salary_amount);
if(!Number.isInteger(salaryAmount) || salaryAmount <= 0){
const err = new Error("SALARY_AMOUNT_INVALID");
err.code = "SALARY_AMOUNT_INVALID";
throw err;
}

const ownership = await resolveSalaryOwnership(db, contract);
const periodStart = resolveSalaryPeriodStart(contract);
const periodStartDate = new Date(periodStart);
const periodEndDate = new Date(periodStartDate.getTime());
if(salaryPeriod === "weekly"){
periodEndDate.setUTCDate(periodEndDate.getUTCDate() + 7);
}else{
periodEndDate.setUTCMonth(periodEndDate.getUTCMonth() + 1);
}
const periodEnd = periodEndDate.toISOString();
const currency = String(contract?.terms_json?.currency || "KGS").trim().toUpperCase();
const metadata = JSON.stringify({
source,
salary_period: salaryPeriod,
created_by_flow: createdByFlow,
direction: "salon_to_master"
});

const inserted = await db.query(
`INSERT INTO public.contract_salary_obligations (
contract_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
period_start,
period_end,
amount,
currency,
status,
due_at,
metadata
)
VALUES (
$1,
$2,
$3,
$4,
$5,
$6::timestamptz,
$7::timestamptz,
$8,
$9,
'open',
$7::timestamptz,
$10::jsonb
)
ON CONFLICT (contract_id, period_start, period_end)
DO NOTHING
RETURNING *`,
[
contract.id,
ownership.contract_salon_id,
ownership.contract_master_id,
ownership.salon_id,
ownership.master_id,
periodStart,
periodEnd,
salaryAmount,
currency,
metadata
]
);

if(inserted.rows.length){
return inserted.rows[0];
}

const existing = await db.query(
`SELECT
 id,
 contract_id,
 contract_salon_id,
 contract_master_id,
 salon_id,
 master_id,
 period_start,
 period_end,
 amount,
 currency,
 status,
 due_at,
paid_at,
created_at,
updated_at,
cancelled_at,
metadata
FROM public.contract_salary_obligations
WHERE contract_id=$1
AND period_start=$2::timestamptz
AND period_end=$3::timestamptz
LIMIT 1`,
[contract.id, periodStart, periodEnd]
);

return existing.rows[0] || null;
}

function normalizeHybridBaseConfig(contract){
const model = String(contract?.terms_json?.model || "").trim().toLowerCase();
if(model !== "hybrid"){
const err = new Error("HYBRID_MODEL_REQUIRED");
err.code = "HYBRID_MODEL_REQUIRED";
throw err;
}

const baseType = normalizeContractText(contract?.terms_json?.base_type, "").toLowerCase();
if(!["salary", "fixed_rent"].includes(baseType)){
const err = new Error("HYBRID_BASE_TYPE_NOT_SUPPORTED");
err.code = "HYBRID_BASE_TYPE_NOT_SUPPORTED";
throw err;
}

const baseAmount = normalizePositiveAmount(contract?.terms_json?.base_amount, "HYBRID_BASE_AMOUNT_INVALID");
const basePeriod = normalizeContractText(contract?.terms_json?.base_period, "monthly").toLowerCase();

if(baseType === "fixed_rent"){
if(basePeriod !== "monthly"){
const err = new Error("HYBRID_BASE_PERIOD_NOT_SUPPORTED");
err.code = "HYBRID_BASE_PERIOD_NOT_SUPPORTED";
throw err;
}
}
else if(!["weekly", "monthly"].includes(basePeriod)){
const err = new Error("HYBRID_BASE_PERIOD_NOT_SUPPORTED");
err.code = "HYBRID_BASE_PERIOD_NOT_SUPPORTED";
throw err;
}

return {
baseType,
baseAmount,
basePeriod
};
}

async function upsertHybridObligation(db, contract, source, createdByFlow){
const { baseType, baseAmount, basePeriod } = normalizeHybridBaseConfig(contract);

if(baseType === "salary"){
const derivedContract = {
...contract,
terms_json: {
...contract.terms_json,
model: "salary",
salary_amount: baseAmount,
salary_period: basePeriod
}
};

try{
return await upsertSalaryObligation(db, derivedContract, source, createdByFlow);
}catch(err){
if(err?.code === "SALARY_PARTIES_RESOLVE_FAILED"){
const hybridErr = new Error("HYBRID_PARTIES_RESOLVE_FAILED");
hybridErr.code = "HYBRID_PARTIES_RESOLVE_FAILED";
throw hybridErr;
}

throw err;
}
}

const derivedContract = {
...contract,
terms_json: {
...contract.terms_json,
model: "fixed_rent",
rent_amount: baseAmount,
rent_period: basePeriod,
settlement_mode: normalizeContractText(contract?.terms_json?.settlement_mode, "accrued")
}
};

try{
return await upsertFixedRentObligation(db, derivedContract, source, createdByFlow);
}catch(err){
if(err?.code === "FIXED_RENT_PARTIES_RESOLVE_FAILED"){
const hybridErr = new Error("HYBRID_PARTIES_RESOLVE_FAILED");
hybridErr.code = "HYBRID_PARTIES_RESOLVE_FAILED";
throw hybridErr;
}

throw err;
}
}

async function activateHybridContract(db, contract, source){
await db.query(
`UPDATE contracts
 SET status='archived',
 archived_at=NOW()
 WHERE salon_id=$1
 AND master_id=$2
 AND status='active'
 AND id<>$3`,
[contract.salon_id, contract.master_id, contract.id]
);

const activated = await db.query(
`UPDATE contracts
 SET status='active',
 archived_at=NULL
 WHERE id=$1
 RETURNING *`,
[contract.id]
);

const activeContract = activated.rows[0] || contract;
const obligation = await upsertHybridObligation(
db,
activeContract,
source,
source === "hybrid_accept" ? "contract_accept" : source
);

return {
contract: activeContract,
obligation
};
}

async function activateSalaryContract(db, contract, source){
await db.query(
`UPDATE contracts
 SET status='archived',
 archived_at=NOW()
 WHERE salon_id=$1
 AND master_id=$2
 AND status='active'
 AND id<>$3`,
[contract.salon_id, contract.master_id, contract.id]
);

const activated = await db.query(
`UPDATE contracts
 SET status='active',
 archived_at=NULL
 WHERE id=$1
 RETURNING *`,
[contract.id]
);

const activeContract = activated.rows[0] || contract;
const obligation = await upsertSalaryObligation(
db,
activeContract,
source,
source === "salary_accept" ? "contract_accept" : source
);

return {
contract: activeContract,
obligation
};
}

export default function buildContractsRouter(pool, internalReadRateLimit){

const r = express.Router();

/* ============================= */
/* CONTRACT ENGINE               */
/* ============================= */

async function createContract({ db, salonId, master_id, terms_json, effective_from }){

if(!master_id){
throw new Error("MASTER_ID_REQUIRED");
}

const validatedTerms = validateTerms(terms_json || {});
const effectiveDate = normalizeDate(effective_from);

const existing = await db.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
LIMIT 1
`,[salonId, master_id]);

if(existing.rows.length){
const err = new Error("ACTIVE_CONTRACT_EXISTS");
err.contract_id = existing.rows[0].id;
throw err;
}

const contract = await db.query(`
INSERT INTO contracts(
salon_id,
master_id,
status,
version,
terms_json,
effective_from,
created_at
)
VALUES(
$1,$2,'pending',1,$3,$4,NOW()
)
RETURNING *
`,[
salonId,
master_id,
validatedTerms,
effectiveDate
]);

return contract.rows[0];

}

/* CREATE */
r.post("/contracts", async (req,res)=>{

const {
salon_id,
master_id,
terms_json,
effective_from
} = req.body;

try{

if(!salon_id){
return res.status(400).json({ok:false,error:"SALON_ID_REQUIRED"});
}

const contract = await createContract({
db: pool,
salonId: salon_id,
master_id,
terms_json,
effective_from
});

res.json({ ok:true, contract });

}catch(err){

if(err.message === "ACTIVE_CONTRACT_EXISTS"){
return res.status(409).json({
ok:false,
error:err.message,
contract_id:err.contract_id
});
}

if(err.message.startsWith("INVALID_") || err.message === "MASTER_ID_REQUIRED"){
return res.status(400).json({ ok:false, error:err.message });
}

console.error("CONTRACT_CREATE_ERROR",err);

res.status(500).json({ ok:false, error:"CONTRACT_CREATE_FAILED" });

}

});

/* SALON CONTRACTS */
r.get("/salons/:slug/contracts", async (req,res)=>{

const { slug } = req.params;

try{

const salon = await pool.query(
`SELECT id FROM salons WHERE slug=$1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const contracts = await pool.query(`
SELECT
c.id,
c.master_id,
COALESCE(m.slug, c.master_id::text) AS master_slug,
c.status,
c.version,
c.terms_json,
COALESCE((c.terms_json->>'master_percent')::int, 0) AS share_percent,
c.created_at
FROM contracts c
LEFT JOIN masters m ON m.id::text = c.master_id::text
WHERE c.salon_id=$1
ORDER BY c.created_at DESC
`,[salon.rows[0].id]);

res.json({ ok:true, contracts:contracts.rows });

}catch(err){

console.error("SALON_CONTRACTS_FETCH_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_CONTRACTS_FETCH_FAILED"
});

}

});

/* CREATE FROM SALON */
r.post("/salons/:slug/contracts", async (req,res)=>{

const { slug } = req.params;
const { master_id, terms_json, effective_from } = req.body;

try{

const salon = await pool.query(
`SELECT id FROM salons WHERE slug=$1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
}

const contract = await createContract({
db: pool,
salonId: salon.rows[0].id,
master_id,
terms_json,
effective_from
});

res.json({ ok:true, contract });

}catch(err){

if(err.message === "ACTIVE_CONTRACT_EXISTS"){
return res.status(409).json({
ok:false,
error:err.message,
contract_id:err.contract_id
});
}

if(err.message.startsWith("INVALID_") || err.message === "MASTER_ID_REQUIRED"){
return res.status(400).json({ ok:false, error:err.message });
}

console.error("SALON_CONTRACT_CREATE_ERROR",err);

res.status(500).json({
ok:false,
error:"SALON_CONTRACT_CREATE_FAILED"
});

}

});

/* ACCEPT */
r.post("/contracts/:id/accept", async (req,res)=>{

const { id } = req.params;
const db = await pool.connect();

try{

await db.query("BEGIN");

const contract = await db.query(`
SELECT *
FROM contracts
WHERE id=$1
FOR UPDATE
LIMIT 1
`,[id]);

if(!contract.rows.length){
await db.query("ROLLBACK");
return res.status(404).json({ok:false,error:"CONTRACT_NOT_FOUND"});
}

const currentContract = contract.rows[0];
const salonId = currentContract.salon_id;
const masterId = currentContract.master_id;
const acceptModel = String(currentContract.terms_json?.model || "percentage").toLowerCase();

if(acceptModel === "salary"){
try{
const activated = await activateSalaryContract(db, currentContract, "salary_accept");

await db.query("COMMIT");

return res.json({
ok:true,
contract:activated.contract,
obligation:activated.obligation
});
}catch(err){
try{ await db.query("ROLLBACK"); }catch(e){}

if(err.message === "SALARY_AMOUNT_INVALID"
|| err.message === "SALARY_PARTIES_RESOLVE_FAILED"
|| err.message === "SALARY_PERIOD_NOT_SUPPORTED"
|| err.message === "SALARY_MODEL_REQUIRED"){
return res.status(400).json({
ok:false,
error:err.message
});
}

console.error("CONTRACT_ACCEPT_SALARY_ERROR", err);

return res.status(500).json({
ok:false,
error:"CONTRACT_ACCEPT_FAILED"
});
}
}

if(acceptModel === "fixed_rent"){
try{
const activated = await activateFixedRentContract(db, currentContract, "fixed_rent_accept");

await db.query("COMMIT");

return res.json({
ok:true,
contract:activated.contract,
obligation:activated.obligation
});
}catch(err){
try{ await db.query("ROLLBACK"); }catch(e){}

if(err.message === "FIXED_RENT_AMOUNT_INVALID"
|| err.message === "FIXED_RENT_PARTIES_RESOLVE_FAILED"
|| err.message === "FIXED_RENT_PERIOD_NOT_SUPPORTED"
|| err.message === "FIXED_RENT_MODEL_REQUIRED"){
return res.status(400).json({
ok:false,
error:err.message
});
}

console.error("CONTRACT_ACCEPT_FIXED_RENT_ERROR", err);

return res.status(500).json({
ok:false,
error:"CONTRACT_ACCEPT_FAILED"
});
}
}

if(acceptModel === "hybrid"){
try{
const activated = await activateHybridContract(db, currentContract, "hybrid_accept");

await db.query("COMMIT");

return res.json({
ok:true,
contract:activated.contract,
obligation:activated.obligation
});
}catch(err){
try{ await db.query("ROLLBACK"); }catch(e){}

if(err.message === "HYBRID_BASE_TYPE_NOT_SUPPORTED"
|| err.message === "HYBRID_BASE_AMOUNT_INVALID"
|| err.message === "HYBRID_BASE_PERIOD_NOT_SUPPORTED"
|| err.message === "HYBRID_PARTIES_RESOLVE_FAILED"
|| err.message === "HYBRID_MODEL_REQUIRED"){
return res.status(400).json({
ok:false,
error:err.message
});
}

console.error("CONTRACT_ACCEPT_HYBRID_ERROR", err);

return res.status(500).json({
ok:false,
error:"CONTRACT_ACCEPT_FAILED"
});
}
}

if(acceptModel !== "percentage"){
await db.query("ROLLBACK");
return res.status(409).json({
ok:false,
error:"CONTRACT_ACCEPT_MODEL_NOT_MONEY_READY",
message:"Активация расчётов пока доступна только для процентной модели. Договор сохранён, но salary/fixed_rent/hybrid не переводятся в активный расчётный контур до расширения money-core.",
model:acceptModel
});
}

await db.query(`
UPDATE contracts
SET status='archived',
archived_at=NOW()
WHERE salon_id=$1
AND master_id=$2
AND status='active'
AND id<>$3
`,[salonId, masterId, id]);

const activated = await db.query(`
UPDATE contracts
SET status='active',
archived_at=NULL
WHERE id=$1
RETURNING *
`,[id]);

await db.query("COMMIT");

res.json({ ok:true, contract:activated.rows[0] });

}catch(err){

try{ await db.query("ROLLBACK"); }catch(e){}

console.error("CONTRACT_ACCEPT_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_ACCEPT_FAILED"
});

}finally{

db.release();

}

});

/* ARCHIVE */
r.post("/contracts/:id/archive", async (req,res)=>{

const { id } = req.params;

try{

const contract = await pool.query(`
UPDATE contracts
SET status='archived',
archived_at=NOW()
WHERE id=$1
RETURNING *
`,[id]);

if(!contract.rows.length){
return res.status(404).json({ok:false,error:"CONTRACT_NOT_FOUND"});
}

res.json({ ok:true, contract:contract.rows[0] });

}catch(err){

console.error("CONTRACT_ARCHIVE_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_ARCHIVE_FAILED"
});

}

});

/* RENT OBLIGATIONS FOR SALON */
r.get("/salons/:slug/rent-obligations", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const salon = await pool.query(
`SELECT id
 FROM salons
 WHERE slug=$1
 LIMIT 1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ ok:false, error:"SALON_NOT_FOUND" });
}

if(!hasSalonOwnership(req, salon.rows[0].id)){
return res.status(403).json({ ok:false, error:"FORBIDDEN" });
}

const obligations = await fetchRentObligationsByOwner({
db: pool,
ownerColumn: 'salon_id',
ownerId: salon.rows[0].id,
filters: req.query || {}
});

return res.json({
ok:true,
obligations,
summary: buildRentObligationsSummary(obligations)
});

}catch(err){

if(err.message === 'INVALID_FROM_DATE' || err.message === 'INVALID_TO_DATE'){
return res.status(400).json({
ok:false,
error:err.message
});
}

console.error("SALON_RENT_OBLIGATIONS_FETCH_ERROR", err);

return res.status(500).json({
ok:false,
error:"RENT_OBLIGATIONS_FETCH_FAILED"
});

}

});

/* RENT OBLIGATIONS FOR MASTER */
r.get("/masters/:slug/rent-obligations", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id
 FROM masters
 WHERE slug=$1
 LIMIT 1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ ok:false, error:"MASTER_NOT_FOUND" });
}

if(!hasMasterOwnership(req, master.rows[0].id)){
return res.status(403).json({ ok:false, error:"FORBIDDEN" });
}

const obligations = await fetchRentObligationsByOwner({
db: pool,
ownerColumn: 'master_id',
ownerId: master.rows[0].id,
filters: req.query || {}
});

return res.json({
ok:true,
obligations,
summary: buildRentObligationsSummary(obligations)
});

}catch(err){

if(err.message === 'INVALID_FROM_DATE' || err.message === 'INVALID_TO_DATE'){
return res.status(400).json({
ok:false,
error:err.message
});
}

console.error("MASTER_RENT_OBLIGATIONS_FETCH_ERROR", err);

return res.status(500).json({
ok:false,
error:"RENT_OBLIGATIONS_FETCH_FAILED"
});

}

});

/* SALARY OBLIGATIONS FOR SALON */
r.get("/salons/:slug/salary-obligations", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const salon = await pool.query(
`SELECT id, name, slug
 FROM salons
 WHERE slug=$1
 LIMIT 1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ ok:false, error:"SALON_NOT_FOUND" });
}

if(!hasSalonOwnership(req, salon.rows[0].id)){
return res.status(403).json({ ok:false, error:"SALON_ACCESS_DENIED" });
}

const obligations = await fetchSalaryObligationsByOwner({
db: pool,
ownerColumn: 'salon_id',
ownerId: salon.rows[0].id,
filters: req.query || {}
});

return res.json({
ok:true,
summary: buildSalaryObligationsSummary(obligations),
obligations
});

}catch(err){

if(err.message === 'INVALID_FROM_DATE' || err.message === 'INVALID_TO_DATE'){
return res.status(400).json({
ok:false,
error:err.message
});
}

console.error("SALON_SALARY_OBLIGATIONS_FETCH_ERROR", err);

return res.status(500).json({
ok:false,
error:"SALARY_OBLIGATIONS_FETCH_FAILED"
});

}

});

/* SALARY OBLIGATIONS FOR MASTER */
r.get("/masters/:slug/salary-obligations", internalReadRateLimit, async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id, name, slug
 FROM masters
 WHERE slug=$1
 LIMIT 1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ ok:false, error:"MASTER_NOT_FOUND" });
}

if(!hasMasterOwnership(req, master.rows[0].id)){
return res.status(403).json({ ok:false, error:"MASTER_ACCESS_DENIED" });
}

const obligations = await fetchSalaryObligationsByOwner({
db: pool,
ownerColumn: 'master_id',
ownerId: master.rows[0].id,
filters: req.query || {}
});

return res.json({
ok:true,
summary: buildSalaryObligationsSummary(obligations),
obligations
});

}catch(err){

if(err.message === 'INVALID_FROM_DATE' || err.message === 'INVALID_TO_DATE'){
return res.status(400).json({
ok:false,
error:err.message
});
}

console.error("MASTER_SALARY_OBLIGATIONS_FETCH_ERROR", err);

return res.status(500).json({
ok:false,
error:"SALARY_OBLIGATIONS_FETCH_FAILED"
});

}

});

r.post("/salons/:slug/rent-payments/confirm", async (req,res)=>{

const { slug } = req.params;
const body = req.body || {};
const obligationId = String(body.obligation_id ?? body.obligationId ?? "").trim();
const amount = normalizePositiveInteger(body.amount, "RENT_PAYMENT_AMOUNT_INVALID");
const rawCurrency = normalizeContractText(body.currency, "");
const currency = String(rawCurrency || "").trim().toUpperCase();
const provider = normalizeContractText(body.provider, "manual");
const paymentMethod = normalizeContractText(body.payment_method, "cash");
const idempotencyKey = String(body.idempotency_key ?? body.idempotencyKey ?? "").trim();

if(!obligationId || !isUuidLike(obligationId)){
return res.status(400).json({ ok:false, error:"RENT_OBLIGATION_ID_REQUIRED" });
}

if(!currency){
return res.status(400).json({ ok:false, error:"RENT_PAYMENT_CURRENCY_INVALID" });
}

if(!idempotencyKey){
return res.status(400).json({ ok:false, error:"RENT_PAYMENT_IDEMPOTENCY_KEY_REQUIRED" });
}

let client = null;

try{

const salon = await pool.query(
`SELECT id, slug
 FROM salons
 WHERE slug=$1
 LIMIT 1`,
[slug]
);

if(!salon.rows.length){
return res.status(404).json({ ok:false, error:"SALON_NOT_FOUND" });
}

if(!hasSalonOwnership(req, salon.rows[0].id)){
return res.status(403).json({ ok:false, error:"SALON_ACCESS_DENIED" });
}

client = await pool.connect();
await client.query("BEGIN");

const obligationResult = await client.query(
`SELECT ro.*
 FROM public.contract_rent_obligations ro
 WHERE ro.id=$1
 FOR UPDATE`,
[obligationId]
);

if(!obligationResult.rows.length){
await client.query("ROLLBACK");
return res.status(404).json({ ok:false, error:"RENT_OBLIGATION_NOT_FOUND" });
}

const obligation = obligationResult.rows[0];

if(Number(obligation.salon_id) !== Number(salon.rows[0].id)){
await client.query("ROLLBACK");
return res.status(403).json({ ok:false, error:"RENT_OBLIGATION_SALON_MISMATCH" });
}

if(!['open','paid'].includes(String(obligation.status || "").toLowerCase())){
await client.query("ROLLBACK");
return res.status(409).json({ ok:false, error:"RENT_OBLIGATION_STATUS_INVALID" });
}

if(Number(obligation.amount) !== amount){
await client.query("ROLLBACK");
return res.status(409).json({ ok:false, error:"RENT_PAYMENT_AMOUNT_MISMATCH" });
}

if(String(obligation.currency || "").trim().toUpperCase() !== currency){
await client.query("ROLLBACK");
return res.status(409).json({ ok:false, error:"RENT_PAYMENT_CURRENCY_MISMATCH" });
}

const contractResult = await client.query(
`SELECT *
 FROM public.contracts
 WHERE id=$1
 LIMIT 1`,
[obligation.contract_id]
);

if(!contractResult.rows.length){
await client.query("ROLLBACK");
return res.status(404).json({ ok:false, error:"RENT_CONTRACT_NOT_FOUND" });
}

const contract = contractResult.rows[0];
if(String(contract.status || "").toLowerCase() !== "active"){
await client.query("ROLLBACK");
return res.status(409).json({ ok:false, error:"RENT_CONTRACT_NOT_ACTIVE" });
}

if(String(contract.terms_json?.model || "").trim().toLowerCase() !== "fixed_rent"){
await client.query("ROLLBACK");
return res.status(409).json({ ok:false, error:"RENT_CONTRACT_MODEL_NOT_FIXED_RENT" });
}

const confirmedBeforeResult = await client.query(
`SELECT
id,
contract_id,
obligation_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
amount,
currency,
provider,
payment_method,
status,
idempotency_key,
confirmed_at,
voided_at,
cancelled_at,
created_at,
updated_at,
metadata
FROM public.contract_rent_payments
WHERE obligation_id=$1
AND status='confirmed'
LIMIT 1`,
[obligation.id]
);

let paymentResult = null;
let idempotent = false;

if(confirmedBeforeResult.rows.length){
paymentResult = confirmedBeforeResult.rows[0];
idempotent = true;
} else {
const rentPaymentResult = await confirmFixedRentPayment({
client,
salonSlug: slug,
contract,
obligation,
amount,
currency,
provider,
paymentMethod,
idempotencyKey
});

paymentResult = rentPaymentResult.payment;
idempotent = rentPaymentResult.idempotent;
}

if(String(paymentResult?.obligation_id || "") !== String(obligation.id)){
await client.query("ROLLBACK");
return res.status(409).json({ ok:false, error:"RENT_PAYMENT_IDEMPOTENCY_CONFLICT" });
}

const paidAtValue = paymentResult?.confirmed_at || new Date().toISOString();
const paidObligationResult = await client.query(
`UPDATE public.contract_rent_obligations
SET status='paid',
    paid_at = COALESCE(paid_at, $1::timestamptz),
    updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'paid_by_flow', 'salon_rent_payment_confirm',
      'rent_payment_id', $2::text
    )
WHERE id=$3
AND status IN ('open','paid')
RETURNING
id,
contract_id,
contract_salon_id,
contract_master_id,
salon_id,
master_id,
period_start,
period_end,
amount,
currency,
status,
due_at,
paid_at,
created_at,
updated_at,
cancelled_at,
metadata`,
[paidAtValue, String(paymentResult.id), obligation.id]
);

if(!paidObligationResult.rows.length){
await client.query("ROLLBACK");
return res.status(409).json({ ok:false, error:"RENT_OBLIGATION_STATUS_INVALID" });
}

await client.query("COMMIT");

return res.json({
ok:true,
payment: paymentResult,
obligation: paidObligationResult.rows[0],
idempotent
});

}catch(err){

if(client){
try{ await client.query("ROLLBACK"); }catch(e){}
}

if(err?.code === "RENT_PAYMENT_IDEMPOTENCY_CONFLICT" || err?.message === "RENT_PAYMENT_IDEMPOTENCY_CONFLICT"){
return res.status(409).json({ ok:false, error:"RENT_PAYMENT_IDEMPOTENCY_CONFLICT" });
}

if(err?.message === "RENT_PAYMENT_AMOUNT_INVALID"){
return res.status(400).json({ ok:false, error:"RENT_PAYMENT_AMOUNT_INVALID" });
}

console.error("RENT_PAYMENT_CONFIRM_ERROR", err);

return res.status(500).json({
ok:false,
error:"RENT_PAYMENT_CONFIRM_FAILED"
});

}finally{

if(client){
client.release();
}

}

});

/* ============================= */
/* MASTER CONTRACTS (FIX)        */
/* ============================= */

/* ACTIVE CONTRACT FOR MASTER */
r.get("/contracts/master/:slug/active", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const contract = await pool.query(`
SELECT *
FROM contracts
WHERE master_id=$1
AND status='active'
ORDER BY created_at DESC
LIMIT 1
`,[master.rows[0].id]);

res.json({
ok:true,
contract: contract.rows[0] || null
});

}catch(err){

console.error("MASTER_ACTIVE_CONTRACT_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_ACTIVE_CONTRACT_FAILED"
});

}

});

/* CONTRACT HISTORY FOR MASTER */
r.get("/contracts/master/:slug/history", async (req,res)=>{

const { slug } = req.params;

try{

const master = await pool.query(
`SELECT id FROM masters WHERE slug=$1`,
[slug]
);

if(!master.rows.length){
return res.status(404).json({ok:false,error:"MASTER_NOT_FOUND"});
}

const contracts = await pool.query(`
SELECT *
FROM contracts
WHERE master_id=$1
ORDER BY created_at DESC
`,[master.rows[0].id]);

res.json({
ok:true,
contracts: contracts.rows
});

}catch(err){

console.error("MASTER_CONTRACT_HISTORY_ERROR",err);

res.status(500).json({
ok:false,
error:"MASTER_CONTRACT_HISTORY_FAILED"
});

}

});

return r;

}
