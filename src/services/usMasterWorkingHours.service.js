// US-03 existing per-branch working-hours table: strict weekly contract.
// NO new table, market resolver, calendar or KG/KZ working-hours handler.
import crypto from "node:crypto";
import { parseUsMinutes } from "./usSlots.service.js";

export function usHoursProblem(code, statusCode = 400) {
  return Object.assign(new Error(code), { code, statusCode });
}

const REVISION = /^[a-f0-9]{64}$/;
const DAY_NAMES = Object.freeze([
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
]);
const INPUT_KEYS = new Set([
  "weekday","start_time","end_time","break_start","break_end",
]);

function clock(value) {
  if (typeof value !== "string" ||
      !/^([01][0-9]|2[0-3]):[0-5][0-9](?::00(?:\.0+)?)?$/.test(value)) {
    throw usHoursProblem("US_HOURS_TIME_INVALID");
  }
  const minutes = parseUsMinutes(value);
  if (!Number.isInteger(minutes)) throw usHoursProblem("US_HOURS_TIME_INVALID");
  return String(Math.floor(minutes / 60)).padStart(2,"0") + ":" +
    String(minutes % 60).padStart(2,"0");
}

export function normalizeUsWeeklyHours(hours) {
  if (!Array.isArray(hours) || hours.length > 7) {
    throw usHoursProblem("US_HOURS_BODY_INVALID");
  }
  const seen = new Set();
  const normalized = hours.map(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
        Object.keys(raw).some(key => !INPUT_KEYS.has(key)) ||
        !Number.isInteger(raw.weekday) ||
        raw.weekday < 0 || raw.weekday > 6 ||
        seen.has(raw.weekday)) {
      throw usHoursProblem("US_HOURS_WEEKDAY_INVALID");
    }
    seen.add(raw.weekday);
    const start = clock(raw.start_time);
    const end = clock(raw.end_time);
    if (parseUsMinutes(end) <= parseUsMinutes(start)) {
      throw usHoursProblem("US_HOURS_ORDER_INVALID");
    }
    const noBreak = raw.break_start == null && raw.break_end == null;
    if (!noBreak && (raw.break_start == null || raw.break_end == null)) {
      throw usHoursProblem("US_HOURS_BREAK_INVALID");
    }
    const breakStart = noBreak ? null : clock(raw.break_start);
    const breakEnd = noBreak ? null : clock(raw.break_end);
    if (breakStart && (
      parseUsMinutes(breakStart) < parseUsMinutes(start) ||
      parseUsMinutes(breakEnd) > parseUsMinutes(end) ||
      parseUsMinutes(breakEnd) <= parseUsMinutes(breakStart))) {
      throw usHoursProblem("US_HOURS_BREAK_INVALID");
    }
    return {
      weekday: raw.weekday, start_time:start, end_time:end,
      break_start:breakStart, break_end:breakEnd,
    };
  });
  return normalized.sort((a,b) => a.weekday-b.weekday);
}

export function validateUsHoursWriteBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !Object.hasOwn(body,"revision") || !Object.hasOwn(body,"hours") ||
      typeof body.revision !== "string" || !REVISION.test(body.revision)) {
    throw usHoursProblem("US_HOURS_BODY_INVALID");
  }
  return {revision:body.revision,hours:normalizeUsWeeklyHours(body.hours)};
}

export function usHoursRevision(hours) {
  const normal = normalizeUsWeeklyHours(hours);
  return crypto.createHash("sha256").update(JSON.stringify(normal)).digest("hex");
}

export function weeklyHoursDisplay(hours) {
  const byWeekday = new Map(normalizeUsWeeklyHours(hours).map(
    row=>[row.weekday,row]
  ));
  return DAY_NAMES.map((weekday_name,weekday) => ({
    weekday, weekday_name, configured:byWeekday.has(weekday),
    ...(byWeekday.get(weekday) || {
      start_time:null,end_time:null,break_start:null,break_end:null,
    }),
  }));
}

export async function readUsMasterWeeklyHours(db, locationId, masterId) {
  const result = await db.query(
    `SELECT weekday,start_time::text,end_time::text,
            break_start::text,break_end::text
       FROM public.us_location_master_working_hours
      WHERE location_id=$1 AND master_id=$2
      ORDER BY weekday`,
    [locationId,masterId]
  );
  const hours = normalizeUsWeeklyHours(result.rows);
  return { hours, revision:usHoursRevision(hours),
    week:weeklyHoursDisplay(hours) };
}

export async function replaceUsMasterWeeklyHours(db, {
  locationId,masterId,revision,hours,
} = {}) {
  const expected=validateUsHoursWriteBody({revision,hours});
  const before=await readUsMasterWeeklyHours(db,locationId,masterId);
  if (before.revision !== expected.revision) {
    throw usHoursProblem("US_HOURS_REVISION_CONFLICT",409);
  }
  const requested=expected.hours;
  if (JSON.stringify(before.hours) === JSON.stringify(requested)) {
    return {...before,changed:false};
  }
  // Conservative until exact future booking intersection validation exists:
  // Never invalidate an existing future reservation by overwriting weekly hours.
  const upcoming=await db.query(
    `SELECT b.id
       FROM public.bookings b
       JOIN public.us_booking_location_links link ON link.booking_id=b.id
      WHERE b.master_id=$1 AND link.location_id=$2 AND b.end_at>now()
        AND lower(b.status) IN ('reserved','pending','confirmed')
      LIMIT 1`,
    [masterId,locationId]
  );
  if (upcoming.rows.length) {
    throw usHoursProblem("US_HOURS_FUTURE_BOOKINGS_CONFLICT",409);
  }

  await db.query(
    `DELETE FROM public.us_location_master_working_hours
      WHERE location_id=$1 AND master_id=$2`,[locationId,masterId]
  );
  for(const item of requested) {
    await db.query(
      `INSERT INTO public.us_location_master_working_hours
          (location_id,master_id,weekday,start_time,end_time,break_start,break_end)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [locationId,masterId,item.weekday,item.start_time,
        item.end_time,item.break_start,item.break_end]
    );
  }
  const after=await readUsMasterWeeklyHours(db,locationId,masterId);
  if(JSON.stringify(after.hours) !== JSON.stringify(requested)) {
    throw usHoursProblem("US_HOURS_READBACK_MISMATCH",409);
  }
  return {...after,changed:true};
}
