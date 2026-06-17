function normalizeText(value){
return String(value || "").trim();
}

function safeInt(value){
const n = Number(value);
return Number.isInteger(n) && n > 0 ? n : null;
}

function isIanaTimeZone(value) {
const zone = normalizeText(value);
if (!zone) {
return false;
}

try {
new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
return true;
} catch (error) {
return false;
}
}

function resolveSalonCalendarTimeZone(salonRow = {}){
const explicitZone = normalizeText(salonRow.timezone || salonRow.time_zone || salonRow.tz);
if(isIanaTimeZone(explicitZone)){
return explicitZone;
}

const city = normalizeText(salonRow.city).toLowerCase();
const slug = normalizeText(salonRow.slug).toLowerCase();

if(city === "бишкек" || city === "bishkek"){
return "Asia/Bishkek";
}

if(slug === "master-prime"){
return "Asia/Bishkek";
}

return "Asia/Bishkek";
}

function getLocalDateString(date, timeZone){
const parts = formatZoneParts(date, timeZone);
const pad = (n) => String(n).padStart(2, "0");
return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function addDays(dateString, deltaDays){
const parts = normalizeText(dateString).split("-");
if(parts.length !== 3){
return null;
}

const year = Number(parts[0]);
const month = Number(parts[1]);
const day = Number(parts[2]);
if(!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)){
return null;
}

const date = new Date(Date.UTC(year, month - 1, day + deltaDays));
return date.toISOString().slice(0, 10);
}

function parseCalendarDateOrThrow(value){
const raw = normalizeText(value);
if(!raw){
return null;
}

if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)){
const err = new Error("BAD_CALENDAR_DATE");
err.code = "BAD_CALENDAR_DATE";
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
const err = new Error("BAD_CALENDAR_DATE");
err.code = "BAD_CALENDAR_DATE";
throw err;
}

return raw;
}

function formatZoneParts(date, timeZone) {
const formatter = new Intl.DateTimeFormat("en-CA", {
timeZone,
hour12: false,
year: "numeric",
month: "2-digit",
day: "2-digit",
hour: "2-digit",
minute: "2-digit",
second: "2-digit"
});

const parts = formatter.formatToParts(date);
const lookup = Object.create(null);

for (const part of parts) {
if (part.type !== "literal") {
lookup[part.type] = part.value;
}
}

return {
year: Number(lookup.year || 0),
month: Number(lookup.month || 0),
day: Number(lookup.day || 0),
hour: Number(lookup.hour || 0),
minute: Number(lookup.minute || 0),
second: Number(lookup.second || 0)
};
}

function localDateTimeToUtcIso(dateValue, timeValue, timeZone) {
const dateParts = normalizeText(dateValue).split("-");
const timeParts = normalizeText(timeValue).split(":");

if(dateParts.length !== 3 || timeParts.length < 2){
return null;
}

const year = Number(dateParts[0]);
const month = Number(dateParts[1]);
const day = Number(dateParts[2]);
const hour = Number(timeParts[0]);
const minute = Number(timeParts[1]);

if(
!Number.isInteger(year) ||
!Number.isInteger(month) ||
!Number.isInteger(day) ||
!Number.isInteger(hour) ||
!Number.isInteger(minute)
){
return null;
}

const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
const zoneParts = formatZoneParts(guess, timeZone);
const desiredMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
const zoneMs = Date.UTC(
zoneParts.year,
zoneParts.month - 1,
zoneParts.day,
zoneParts.hour,
zoneParts.minute,
zoneParts.second || 0,
0
);
const offsetMs = zoneMs - desiredMs;

return new Date(guess.getTime() - offsetMs).toISOString();
}

function formatLocalDateTime(date, timeZone){
const parts = formatZoneParts(date, timeZone);
const pad = (n) => String(n).padStart(2, "0");
return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function normalizeWeekdayFromDate(dateString){
const parts = normalizeText(dateString).split("-");
if(parts.length !== 3){
return null;
}

const year = Number(parts[0]);
const month = Number(parts[1]);
const day = Number(parts[2]);

if(!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)){
return null;
}

return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function buildSyntheticWorkingRow(master){
return {
master_id: Number(master.id),
status: "unknown",
weekday: null,
start_time: null,
end_time: null,
break_start: null,
break_end: null,
availability_status: "unknown"
};
}

function buildConfiguredWorkingRow(row){
return {
master_id: Number(row.master_id),
status: "configured",
weekday: Number(row.weekday),
start_time: row.start_time || null,
end_time: row.end_time || null,
break_start: row.break_start || null,
break_end: row.break_end || null,
availability_status: "configured"
};
}

function normalizeEventRow(row, timeZone){
const startAt = row.start_at ? new Date(row.start_at) : null;
const endAt = row.end_at ? new Date(row.end_at) : null;

return {
booking_id: Number(row.booking_id),
booking_code: row.booking_code || null,
master_id: Number(row.master_id),
start_at: startAt ? startAt.toISOString() : null,
end_at: endAt ? endAt.toISOString() : null,
start_local: startAt ? formatLocalDateTime(startAt, timeZone) : null,
end_local: endAt ? formatLocalDateTime(endAt, timeZone) : null,
status: row.status || null,
occupancy_status: row.occupancy_status || null,
slot_status: row.slot_status || null,
client_name: row.client_name || null,
client_phone: row.client_phone || null,
service_id: row.service_id === null || row.service_id === undefined ? null : Number(row.service_id),
service_name: row.service_name || null,
duration_min: row.duration_min === null || row.duration_min === undefined ? null : Number(row.duration_min),
price: row.price === null || row.price === undefined ? null : Number(row.price)
};
}

export async function buildSalonCalendarResponse(pool, { salonRow, requestedDate } = {}) {
if(!salonRow || !pool){
throw new Error("SALON_CALENDAR_INVALID_INPUT");
}

const timeZone = resolveSalonCalendarTimeZone(salonRow);
const currentToday = getLocalDateString(new Date(), timeZone);
const requested = parseCalendarDateOrThrow(requestedDate) || currentToday;

const rangeStartUtc = localDateTimeToUtcIso(requested, "00:00", timeZone);
const rangeEndUtc = localDateTimeToUtcIso(addDays(requested, 1), "00:00", timeZone);

if(!rangeStartUtc || !rangeEndUtc){
const err = new Error("BAD_CALENDAR_DATE");
err.code = "BAD_CALENDAR_DATE";
throw err;
}

const activeMastersRes = await pool.query(
`SELECT
   m.id,
   m.slug,
   m.name,
   ms.status AS relation_status,
   COALESCE(m.active, true) AS active
 FROM master_salon ms
 JOIN masters m ON m.id = ms.master_id
 WHERE ms.salon_id = $1
   AND ms.status = 'active'
   AND COALESCE(m.active, true) = true
 ORDER BY m.id ASC`,
[salonRow.id]
);

const activeMasters = activeMastersRes.rows.map((row) => ({
id: Number(row.id),
slug: row.slug,
name: row.name,
relation_status: row.relation_status || "active",
active: Boolean(row.active),
calendar_status: "unknown"
}));

const activeMasterIds = activeMasters.map((row) => row.id);

let workingRows = [];
if(activeMasterIds.length){
const weekday = normalizeWeekdayFromDate(requested);
const workingRes = await pool.query(
`SELECT
   master_id,
   weekday,
   start_time,
   end_time,
   break_start,
   break_end
 FROM master_working_hours
 WHERE salon_id = $1
   AND master_id = ANY($2::int[])
   AND weekday = $3
 ORDER BY master_id ASC, weekday ASC`,
[salonRow.id, activeMasterIds, weekday]
);
workingRows = workingRes.rows;
}

const workingByMaster = new Map();
for(const row of workingRows){
workingByMaster.set(Number(row.master_id), buildConfiguredWorkingRow(row));
}

const workingHours = activeMasters.map((master) => {
const configured = workingByMaster.get(master.id);
if(configured){
master.calendar_status = "configured";
return configured;
}
return buildSyntheticWorkingRow(master);
});

const eventsRes = activeMasterIds.length ? await pool.query(
`SELECT
   b.id AS booking_id,
   ('BR-' || LPAD(b.id::text, 5, '0')) AS booking_code,
   b.master_id,
   b.start_at,
   COALESCE(
     b.end_at,
     b.start_at + make_interval(mins => COALESCE(sms.duration_min, s.duration_min, 30))
   ) AS end_at,
   b.status,
   CASE
     WHEN LOWER(COALESCE(b.status, '')) IN ('pending','confirmed','completed') THEN 'occupied'
     ELSE 'not_occupied'
   END AS occupancy_status,
   COALESCE(cs.status, 'reserved') AS slot_status,
   c.name AS client_name,
   c.phone AS client_phone,
   b.service_id,
   COALESCE(s.name, b.service_id::text) AS service_name,
   COALESCE(sms.duration_min, s.duration_min, 30) AS duration_min,
   COALESCE(b.price_snapshot, sms.price, s.price, 0) AS price
 FROM bookings b
 LEFT JOIN clients c ON c.id = b.client_id
 LEFT JOIN services s ON s.id = b.service_id
 LEFT JOIN salon_master_services sms
   ON sms.salon_id = b.salon_id
  AND sms.master_id = b.master_id
  AND sms.service_pk = b.service_id
 LEFT JOIN calendar_slots cs ON cs.id = b.calendar_slot_id
 WHERE b.salon_id = $1
   AND b.master_id = ANY($2::int[])
   AND b.start_at >= $3::timestamptz
   AND b.start_at < $4::timestamptz
 ORDER BY b.start_at ASC, b.id ASC`,
[salonRow.id, activeMasterIds, rangeStartUtc, rangeEndUtc]
) : { rows: [] };

const events = eventsRes.rows.map((row) => normalizeEventRow(row, timeZone));

const summary = {
masters_count: activeMasters.length,
active_masters_count: activeMasters.length,
events_count: events.length,
occupied_count: events.filter((row) => row.occupancy_status === "occupied").length,
cancelled_count: events.filter((row) => ["cancelled","canceled","rejected","failed","refunded"].includes(String(row.status || "").toLowerCase())).length,
available_slots_count: 0,
unknown_availability_count: workingHours.filter((row) => row.availability_status === "unknown").length
};

return {
ok: true,
salon: {
id: Number(salonRow.id),
slug: salonRow.slug,
name: salonRow.name,
city: salonRow.city || null,
timezone: timeZone
},
date: {
requested_date: requested,
salon_today: currentToday,
timezone: timeZone,
prev_date: addDays(requested, -1),
next_date: addDays(requested, 1),
range_start_utc: rangeStartUtc,
range_end_utc: rangeEndUtc
},
masters: activeMasters,
working_hours: workingHours,
events,
summary
};
}

export default buildSalonCalendarResponse;
