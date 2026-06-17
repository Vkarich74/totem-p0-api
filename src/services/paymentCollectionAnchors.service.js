const DEFAULT_TIMEZONE = "Asia/Bishkek";
const ALLOWED_ANCHOR_STATUSES = new Set(["open", "closed", "not_needed", "unknown", "conflict"]);

function safeInt(value){
const n = Number(value);
if(!Number.isInteger(n) || n <= 0){
return null;
}
return n;
}

function normalizeText(value){
return String(value || "").trim();
}

function parseCollectionAnchorsDate(value, errorCode){
const raw = normalizeText(value);
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
const parsed = new Date(Date.UTC(year, month - 1, day));

if(
!Number.isInteger(year) ||
!Number.isInteger(month) ||
!Number.isInteger(day) ||
parsed.getUTCFullYear() !== year ||
parsed.getUTCMonth() !== month - 1 ||
parsed.getUTCDate() !== day
){
const err = new Error(errorCode);
err.code = errorCode;
throw err;
}

return raw;
}

function normalizeCollectionAnchorStatusFilter(status, openOnly = false){
if(openOnly){
return ["open"];
}

if(status === undefined || status === null){
return [];
}

const values = Array.isArray(status) ? status : String(status).split(",");
const normalized = [];

for(const value of values){
const raw = normalizeText(value).toLowerCase();
if(!raw){
continue;
}

if(!ALLOWED_ANCHOR_STATUSES.has(raw)){
const err = new Error("COLLECTION_ANCHOR_STATUS_INVALID");
err.code = "COLLECTION_ANCHOR_STATUS_INVALID";
throw err;
}

if(!normalized.includes(raw)){
normalized.push(raw);
}
}

return normalized;
}

function normalizeCollectionAnchorOwnerType(value){
const raw = normalizeText(value).toLowerCase();
if(!raw){
return null;
}

if(["master", "salon", "unknown", "conflict"].includes(raw)){
return raw;
}

return null;
}

function normalizeCollectionAnchorRow(row){
if(!row){
return null;
}

return {
id: row.id || null,
payment_id: row.payment_id === null || row.payment_id === undefined ? null : Number(row.payment_id),
booking_id: row.booking_id === null || row.booking_id === undefined ? null : Number(row.booking_id),
salon_id: row.salon_id === null || row.salon_id === undefined ? null : Number(row.salon_id),
beneficiary_master_id: row.beneficiary_master_id === null || row.beneficiary_master_id === undefined ? null : Number(row.beneficiary_master_id),
amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
currency: row.currency || "KGS",
provider: row.provider || null,
method: row.method || null,
collector_owner_type: row.collector_owner_type || null,
collector_owner_id: row.collector_owner_id === null || row.collector_owner_id === undefined ? null : Number(row.collector_owner_id),
anchor_status: row.anchor_status || null,
source_type: row.source_type || null,
source_id: row.source_id || null,
closed_at: row.closed_at || null,
closed_by_user_id: row.closed_by_user_id === null || row.closed_by_user_id === undefined ? null : Number(row.closed_by_user_id),
close_note: row.close_note || null,
close_batch_id: row.close_batch_id || null,
created_at: row.created_at || null,
updated_at: row.updated_at || null,
metadata_json: row.metadata_json || {},
existing_anchor_id: row.existing_anchor_id || null,
existing_anchor_status: row.existing_anchor_status || null,
existing_collector_owner_type: row.existing_collector_owner_type || null,
existing_collector_owner_id: row.existing_collector_owner_id === null || row.existing_collector_owner_id === undefined ? null : Number(row.existing_collector_owner_id)
};
}

function resolveCollectionAnchorClassification({
explicitCollectorOwnerType = null,
explicitCollectorOwnerId = null,
paymentCollectorOwnerType = null,
paymentCollectorOwnerId = null,
bookingMasterId = null,
bookingSalonId = null
}){
const explicitType = normalizeCollectionAnchorOwnerType(explicitCollectorOwnerType);
const explicitId = safeInt(explicitCollectorOwnerId);

if(explicitType){
if(explicitType === "master" && explicitId && explicitId === safeInt(bookingMasterId)){
return {
collector_owner_type: "master",
collector_owner_id: explicitId,
anchor_status: "not_needed"
};
}

if(explicitType === "salon" && explicitId && explicitId === safeInt(bookingSalonId)){
return {
collector_owner_type: "salon",
collector_owner_id: explicitId,
anchor_status: "open"
};
}

return {
collector_owner_type: "conflict",
collector_owner_id: explicitId || null,
anchor_status: "conflict"
};
}

const paymentType = normalizeCollectionAnchorOwnerType(paymentCollectorOwnerType);
const paymentId = safeInt(paymentCollectorOwnerId);
const bookingMaster = safeInt(bookingMasterId);
const bookingSalon = safeInt(bookingSalonId);

if(!paymentType){
const normalizedCollectorRaw = normalizeText(paymentCollectorOwnerType);
if(normalizedCollectorRaw){
return {
collector_owner_type: "conflict",
collector_owner_id: paymentId || null,
anchor_status: "conflict"
};
}

return {
collector_owner_type: "unknown",
collector_owner_id: null,
anchor_status: "unknown"
};
}

if(paymentType === "master" && paymentId && paymentId === bookingMaster){
return {
collector_owner_type: "master",
collector_owner_id: paymentId,
anchor_status: "not_needed"
};
}

if(paymentType === "salon" && paymentId && paymentId === bookingSalon){
return {
collector_owner_type: "salon",
collector_owner_id: paymentId,
anchor_status: "open"
};
}

if(paymentType === "unknown"){
return {
collector_owner_type: "unknown",
collector_owner_id: null,
anchor_status: "unknown"
};
}

return {
collector_owner_type: "conflict",
collector_owner_id: paymentId || null,
anchor_status: "conflict"
};
}

export async function upsertPaymentCollectionAnchorForPayment(dbOrPool, input = {}){
if(!dbOrPool || typeof dbOrPool.query !== "function"){
throw new Error("PAYMENT_COLLECTION_ANCHOR_DB_REQUIRED");
}

const paymentId = safeInt(input.paymentId ?? input.payment_id ?? input.id);
if(!paymentId){
throw new Error("PAYMENT_COLLECTION_ANCHOR_PAYMENT_ID_INVALID");
}

const sourceType = normalizeText(input.sourceType ?? input.source_type);
if(!sourceType){
throw new Error("PAYMENT_COLLECTION_ANCHOR_SOURCE_TYPE_REQUIRED");
}

const sourceId = normalizeText(input.sourceId ?? input.source_id) || null;
const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
? input.metadata
: {};

const result = await dbOrPool.query(`
SELECT
  p.id AS payment_id,
  p.booking_id AS payment_booking_id,
  p.amount,
  p.provider,
  p.method,
  p.status AS payment_status,
  p.collector_owner_type AS payment_collector_owner_type,
  p.collector_owner_id AS payment_collector_owner_id,
  p.is_test AS payment_is_test,
  p.created_at AS payment_created_at,
  p.confirmed_by_user_id,
  p.confirmed_at,
  p.money_core_source_uid,
  b.id AS booking_id,
  b.salon_id,
  b.master_id,
  b.status AS booking_status,
  b.is_test AS booking_is_test,
  a.id AS existing_anchor_id,
  a.collector_owner_type AS existing_collector_owner_type,
  a.collector_owner_id AS existing_collector_owner_id,
  a.anchor_status AS existing_anchor_status,
  a.source_type AS existing_source_type,
  a.source_id AS existing_source_id,
  a.created_at AS existing_created_at,
  a.updated_at AS existing_updated_at,
  a.closed_at AS existing_closed_at,
  a.closed_by_user_id AS existing_closed_by_user_id,
  a.close_note AS existing_close_note,
  a.close_batch_id AS existing_close_batch_id,
  a.metadata_json AS existing_metadata_json
FROM public.payments p
JOIN public.bookings b ON b.id = p.booking_id
LEFT JOIN public.payment_collection_anchors a ON a.payment_id = p.id
WHERE p.id = $1
LIMIT 1
`, [paymentId]);

if(!result.rows.length){
return {
ok: true,
inserted: false,
skipped: true,
reason: "NOT_ELIGIBLE_OR_ALREADY_EXISTS",
anchor: null
};
}

const row = result.rows[0];
const eligible =
String(row.payment_status || "").trim().toLowerCase() === "confirmed"
|| String(row.payment_status || "").trim().toLowerCase() === "paid"
|| String(row.payment_status || "").trim().toLowerCase() === "captured";
const bookingStatus = String(row.booking_status || "").trim().toLowerCase();
const bookingExcluded = ["cancelled", "canceled", "отмена"].includes(bookingStatus);
const paymentAmount = Number(row.amount ?? 0) || 0;
const paymentIsTest = row.payment_is_test === true;
const bookingIsTest = row.booking_is_test === true;
const hasEligibleSource =
eligible
&& !bookingExcluded
&& paymentAmount > 0
&& row.payment_booking_id !== null
&& row.master_id !== null
&& row.salon_id !== null
&& !paymentIsTest
&& !bookingIsTest;

if(!hasEligibleSource){
return {
ok: true,
inserted: false,
skipped: true,
reason: "NOT_ELIGIBLE_OR_ALREADY_EXISTS",
anchor: null
};
}

if(row.existing_anchor_id){
return {
ok: true,
inserted: false,
skipped: true,
reason: "ALREADY_EXISTS",
anchor: normalizeCollectionAnchorRow(row)
};
}

const classification = resolveCollectionAnchorClassification({
explicitCollectorOwnerType: input.collectorOwnerType ?? input.collector_owner_type ?? null,
explicitCollectorOwnerId: input.collectorOwnerId ?? input.collector_owner_id ?? null,
paymentCollectorOwnerType: row.payment_collector_owner_type,
paymentCollectorOwnerId: row.payment_collector_owner_id,
bookingMasterId: row.master_id,
bookingSalonId: row.salon_id
});

const metadataJson = {
source: sourceType,
source_id: sourceId,
payment_id: paymentId,
payment_status: row.payment_status,
booking_id: Number(row.booking_id),
booking_status: row.booking_status,
amount: paymentAmount,
collector_owner_type: classification.collector_owner_type,
collector_owner_id: classification.collector_owner_id,
anchor_status: classification.anchor_status,
...metadata
};

const inserted = await dbOrPool.query(`
INSERT INTO public.payment_collection_anchors (
  payment_id,
  booking_id,
  salon_id,
  beneficiary_master_id,
  amount,
  currency,
  provider,
  method,
  collector_owner_type,
  collector_owner_id,
  anchor_status,
  source_type,
  source_id,
  metadata_json
)
SELECT
  p.id,
  b.id,
  b.salon_id,
  b.master_id,
  p.amount,
  'KGS',
  p.provider,
  p.method,
  $2::text,
  $3::integer,
  $4::text,
  $5::text,
  $6::text,
  $7::jsonb
FROM public.payments p
JOIN public.bookings b ON b.id = p.booking_id
WHERE p.id = $1
  AND p.status IN ('confirmed', 'paid', 'captured')
  AND LOWER(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'отмена')
  AND p.amount > 0
  AND p.booking_id IS NOT NULL
  AND b.master_id IS NOT NULL
  AND b.salon_id IS NOT NULL
  AND p.is_test IS NOT TRUE
  AND b.is_test IS NOT TRUE
ON CONFLICT (payment_id) DO NOTHING
RETURNING
  id,
  payment_id,
  booking_id,
  salon_id,
  beneficiary_master_id,
  amount,
  currency,
  provider,
  method,
  collector_owner_type,
  collector_owner_id,
  anchor_status,
  source_type,
  source_id,
  closed_at,
  closed_by_user_id,
  close_note,
  close_batch_id,
  created_at,
  updated_at,
  metadata_json
`, [
  paymentId,
  classification.collector_owner_type,
  classification.collector_owner_id,
  classification.anchor_status,
  sourceType,
  sourceId,
  JSON.stringify(metadataJson)
]);

if(!inserted.rows.length){
return {
ok: true,
inserted: false,
skipped: true,
reason: "ALREADY_EXISTS",
anchor: null
};
}

return {
ok: true,
inserted: true,
skipped: false,
reason: null,
anchor: normalizeCollectionAnchorRow(inserted.rows[0])
};
}

export function buildCollectionAnchorBackfillPreviewSql(){
return `
SELECT
  p.id AS payment_id,
  b.id AS booking_id,
  p.amount,
  p.provider,
  p.method,
  b.status AS booking_status,
  b.salon_id,
  b.master_id AS beneficiary_master_id,
  p.collector_owner_type,
  p.collector_owner_id,
  CASE
    WHEN p.collector_owner_type = 'master'
      AND p.collector_owner_id = b.master_id THEN 'master'
    WHEN p.collector_owner_type = 'salon'
      AND p.collector_owner_id = b.salon_id THEN 'salon'
    WHEN p.collector_owner_type IS NULL THEN 'unknown'
    ELSE 'conflict'
  END AS calculated_collector_owner_type,
  CASE
    WHEN p.collector_owner_type = 'master'
      AND p.collector_owner_id = b.master_id THEN 'not_needed'
    WHEN p.collector_owner_type = 'salon'
      AND p.collector_owner_id = b.salon_id THEN 'open'
    WHEN p.collector_owner_type IS NULL THEN 'unknown'
    ELSE 'conflict'
  END AS calculated_anchor_status
FROM public.payments p
JOIN public.bookings b ON b.id = p.booking_id
WHERE p.status IN ('confirmed', 'paid', 'captured')
  AND LOWER(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'отмена')
  AND p.amount > 0
  AND p.booking_id IS NOT NULL
  AND b.master_id IS NOT NULL
  AND b.salon_id IS NOT NULL
  AND p.is_test IS NOT TRUE
  AND b.is_test IS NOT TRUE
ORDER BY p.created_at ASC, p.id ASC
`.trim();
}

function buildCollectionAnchorRow(row){
const amount = Number(row.amount ?? 0) || 0;

return {
anchor_id: row.anchor_id,
payment_id: Number(row.payment_id),
booking_id: Number(row.booking_id),
booking_code: row.booking_code || null,
booking_status: row.booking_status || null,
booking_start_at: row.booking_start_at || null,
booking_created_at: row.booking_created_at || null,
salon_id: Number(row.salon_id),
salon_slug: row.salon_slug || null,
master_id: Number(row.master_id),
master_slug: row.master_slug || null,
master_name: row.master_name || null,
amount,
currency: row.currency || "KGS",
provider: row.provider || null,
method: row.method || null,
collector_owner_type: row.collector_owner_type || null,
collector_owner_id: row.collector_owner_id === null || row.collector_owner_id === undefined ? null : Number(row.collector_owner_id),
anchor_status: row.anchor_status || "unknown",
open_to_transfer: row.anchor_status === "open",
closed_at: row.closed_at || null,
closed_by_user_id: row.closed_by_user_id === null || row.closed_by_user_id === undefined ? null : Number(row.closed_by_user_id),
close_note: row.close_note || null,
source_type: row.source_type || null,
source_id: row.source_id || null,
payment_created_at: row.payment_created_at || null,
confirmed_by_user_id: row.confirmed_by_user_id === null || row.confirmed_by_user_id === undefined ? null : Number(row.confirmed_by_user_id),
confirmed_at: row.confirmed_at || null,
anchor_created_at: row.anchor_created_at || null,
anchor_updated_at: row.anchor_updated_at || null
};
}

function createSalonSummary(){
return {
total_paid_by_masters: 0,
collected_by_salon: 0,
open_to_transfer: 0,
closed_transfers: 0,
collected_by_master: 0,
unknown: 0,
conflict: 0,
row_count: 0,
payment_count: 0,
open_count: 0,
closed_count: 0,
unknown_count: 0,
conflict_count: 0
};
}

function createMasterSummary(){
return {
total_paid_for_my_services: 0,
collected_by_master: 0,
open_at_salon: 0,
closed_by_salon: 0,
unknown: 0,
conflict: 0,
row_count: 0,
payment_count: 0,
open_count: 0,
closed_count: 0,
unknown_count: 0,
conflict_count: 0
};
}

function updateSalonSummary(summary, row){
const amount = Number(row.amount ?? 0) || 0;
const status = String(row.anchor_status || "unknown").trim().toLowerCase();

summary.row_count += 1;
summary.payment_count += 1;

switch(status){
case "open":
summary.open_to_transfer += amount;
summary.collected_by_salon += amount;
summary.open_count += 1;
break;
case "closed":
summary.closed_transfers += amount;
summary.collected_by_salon += amount;
summary.closed_count += 1;
break;
case "not_needed":
summary.collected_by_master += amount;
break;
case "unknown":
summary.unknown += amount;
summary.unknown_count += 1;
break;
case "conflict":
default:
summary.conflict += amount;
summary.conflict_count += 1;
break;
}

summary.total_paid_by_masters = summary.collected_by_master + summary.collected_by_salon + summary.unknown + summary.conflict;
}

function updateMasterSummary(summary, row){
const amount = Number(row.amount ?? 0) || 0;
const status = String(row.anchor_status || "unknown").trim().toLowerCase();

summary.row_count += 1;
summary.payment_count += 1;

switch(status){
case "not_needed":
summary.collected_by_master += amount;
break;
case "open":
summary.open_at_salon += amount;
summary.open_count += 1;
break;
case "closed":
summary.closed_by_salon += amount;
summary.closed_count += 1;
break;
case "unknown":
summary.unknown += amount;
summary.unknown_count += 1;
break;
case "conflict":
default:
summary.conflict += amount;
summary.conflict_count += 1;
break;
}

summary.total_paid_for_my_services = summary.collected_by_master + summary.open_at_salon + summary.closed_by_salon + summary.unknown + summary.conflict;
}

function buildSalonMasterBreakdown(){
return {
master_id: null,
master_slug: null,
master_name: null,
total_paid: 0,
collected_by_salon: 0,
open_to_transfer: 0,
closed_transfers: 0,
collected_by_master: 0,
unknown: 0,
conflict: 0,
payment_count: 0,
open_count: 0,
closed_count: 0,
unknown_count: 0,
conflict_count: 0
};
}

function updateSalonMasterBreakdown(summary, row){
const amount = Number(row.amount ?? 0) || 0;
const status = String(row.anchor_status || "unknown").trim().toLowerCase();

summary.payment_count += 1;

switch(status){
case "open":
summary.open_to_transfer += amount;
summary.collected_by_salon += amount;
summary.open_count += 1;
break;
case "closed":
summary.closed_transfers += amount;
summary.collected_by_salon += amount;
summary.closed_count += 1;
break;
case "not_needed":
summary.collected_by_master += amount;
break;
case "unknown":
summary.unknown += amount;
summary.unknown_count += 1;
break;
case "conflict":
default:
summary.conflict += amount;
summary.conflict_count += 1;
break;
}

summary.total_paid = summary.collected_by_master + summary.collected_by_salon + summary.unknown + summary.conflict;
}

function sortSalonBreakdownRows(rows){
return rows.sort((a, b)=>{
if(b.total_paid !== a.total_paid){
return b.total_paid - a.total_paid;
}

if(b.payment_count !== a.payment_count){
return b.payment_count - a.payment_count;
}

return String(a.master_name || a.master_slug || a.master_id).localeCompare(String(b.master_name || b.master_slug || b.master_id));
});
}

export async function getCollectionAnchors(pool, {
scopeType,
scopeRow,
scopeId,
masterFilterRow = null,
from = null,
to = null,
status = null,
openOnly = false,
timezone = DEFAULT_TIMEZONE
}){
const queryValues = [scopeId];
const queryClauses = [];

if(scopeType === "salon"){
queryClauses.push(`a.salon_id = $1`);
}else if(scopeType === "master"){
queryClauses.push(`a.beneficiary_master_id = $1`);
}else{
const err = new Error("COLLECTION_ANCHOR_SCOPE_INVALID");
err.code = "COLLECTION_ANCHOR_SCOPE_INVALID";
throw err;
}

const normalizedStatus = normalizeCollectionAnchorStatusFilter(status, openOnly);
if(normalizedStatus.length){
queryValues.push(normalizedStatus);
queryClauses.push(`a.anchor_status = ANY($${queryValues.length}::text[])`);
}

const fromDate = parseCollectionAnchorsDate(from, "COLLECTION_ANCHORS_FROM_DATE_INVALID");
const toDate = parseCollectionAnchorsDate(to, "COLLECTION_ANCHORS_TO_DATE_INVALID");

if(fromDate){
queryValues.push(fromDate);
queryClauses.push(`(a.created_at AT TIME ZONE '${timezone}')::date >= $${queryValues.length}::date`);
}

if(toDate){
queryValues.push(toDate);
queryClauses.push(`(a.created_at AT TIME ZONE '${timezone}')::date <= $${queryValues.length}::date`);
}

const parsedMasterIdFilter = masterFilterRow && masterFilterRow.id !== undefined && masterFilterRow.id !== null ? safeInt(masterFilterRow.id) : null;
if(masterFilterRow && !parsedMasterIdFilter){
const err = new Error("COLLECTION_ANCHOR_MASTER_ID_INVALID");
err.code = "COLLECTION_ANCHOR_MASTER_ID_INVALID";
throw err;
}

if(parsedMasterIdFilter){
queryValues.push(parsedMasterIdFilter);
queryClauses.push(`a.beneficiary_master_id = $${queryValues.length}`);
}

const result = await pool.query(`
SELECT
  a.id AS anchor_id,
  a.payment_id,
  a.booking_id,
  a.salon_id,
  a.beneficiary_master_id AS master_id,
  a.amount,
  a.currency,
  a.provider,
  a.method,
  a.collector_owner_type,
  a.collector_owner_id,
  a.anchor_status,
  a.source_type,
  a.source_id,
  a.closed_at,
  a.closed_by_user_id,
  a.close_note,
  a.close_batch_id,
  a.created_at AS anchor_created_at,
  a.updated_at AS anchor_updated_at,
  p.created_at AS payment_created_at,
  p.confirmed_by_user_id,
  p.confirmed_at,
  b.status AS booking_status,
  b.start_at AS booking_start_at,
  b.created_at AS booking_created_at,
  'BR-' || LPAD(b.id::text, 5, '0') AS booking_code,
  s.slug AS salon_slug,
  s.name AS salon_name,
  m.slug AS master_slug,
  m.name AS master_name
FROM public.payment_collection_anchors a
JOIN public.payments p ON p.id = a.payment_id
JOIN public.bookings b ON b.id = a.booking_id
JOIN public.salons s ON s.id = a.salon_id
JOIN public.masters m ON m.id = a.beneficiary_master_id
WHERE ${queryClauses.join(" AND ")}
ORDER BY a.created_at DESC, a.id DESC
`, queryValues);

const rawRows = result.rows || [];
const rows = rawRows.map(buildCollectionAnchorRow);

if(scopeType === "master"){
const summary = createMasterSummary();
for(const row of rawRows){
updateMasterSummary(summary, row);
}

return {
ok: true,
scope: {
type: "master",
master_id: Number(scopeRow.id),
master_slug: scopeRow.slug
},
filters: {
from: fromDate,
to: toDate,
status: normalizedStatus,
open_only: openOnly === true,
timezone,
 master_id: parsedMasterIdFilter || null,
 master_slug: masterFilterRow?.slug || null,
 master_name: masterFilterRow?.name || null
},
summary,
rows,
close_actions_available: false
};
}

const summary = createSalonSummary();
const byMasterMap = new Map();

for(const row of rawRows){
updateSalonSummary(summary, row);

const masterKey = String(row.master_id);
const current = byMasterMap.get(masterKey) || (() => {
const item = buildSalonMasterBreakdown();
item.master_id = Number(row.master_id);
item.master_slug = row.master_slug || null;
item.master_name = row.master_name || null;
return item;
})();

updateSalonMasterBreakdown(current, row);
byMasterMap.set(masterKey, current);
}

const byMaster = sortSalonBreakdownRows(Array.from(byMasterMap.values()));

return {
ok: true,
scope: {
type: "salon",
salon_id: Number(scopeRow.id),
salon_slug: scopeRow.slug
},
filters: {
from: fromDate,
to: toDate,
status: normalizedStatus,
open_only: openOnly === true,
timezone,
 master_id: parsedMasterIdFilter || null,
 master_slug: masterFilterRow?.slug || null,
 master_name: masterFilterRow?.name || null
},
summary,
by_master: byMaster,
rows,
close_actions_available: true
};
}
