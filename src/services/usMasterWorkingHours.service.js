// US-03 existing per-branch working-hours table: strict weekly contract.
// NO new table, market resolver, calendar or KG/KZ working-hours handler.
import crypto from "node:crypto";
import { parseUsMinutes } from "./usSlots.service.js";
import {
  getUsLocalDate, getUsWallParts, getUsLocalInstantCandidates,
} from "./usTime.service.js";

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

// Compare only weekday intervals the proposed version actually changes.
// UTC instants are resolved through the existing strict US IANA service;
// "browser today", UTC weekday and global US timezone are never used.
export function changedUsHourWeekdays(oldHours,newHours) {
  const before = new Map(normalizeUsWeeklyHours(oldHours).map(row=>[row.weekday,row]));
  const after = new Map(normalizeUsWeeklyHours(newHours).map(row=>[row.weekday,row]));
  const changed = new Set();
  for(let weekday=0;weekday<7;weekday++){
    if(JSON.stringify(before.get(weekday)||null)!==
       JSON.stringify(after.get(weekday)||null)) changed.add(weekday);
  }
  return changed;
}

const utcWeekday = localDate =>
  new Date(localDate+"T00:00:00.000Z").getUTCDay();

function bookingWallMinutes(wall) {
  return Number(wall.hour)*60+Number(wall.minute);
}

function clockOffset(instant,timezone) {
  const f=new Intl.DateTimeFormat("en-US",{
    timeZone:timezone,timeZoneName:"shortOffset",
  });
  return f.formatToParts(instant)
    .find(part=>part.type==="timeZoneName")?.value||null;
}

// Each existing future booking is an immutable occupied UTC interval.
// Return true only when the *proposed* weekly pattern retains the booking
// inside one shift, outside its break, on its physical location local date.
export function usBookingFitsChangedHours(raw,{timezone,changedWeekdays,hours}={}){
  if(!(changedWeekdays instanceof Set)||!changedWeekdays.size) return true;
  const start=new Date(raw?.start_at),end=new Date(raw?.end_at);
  const startMs=start.getTime(),endMs=end.getTime();
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||
     endMs<=startMs || endMs-startMs>7*86400_000){
    throw usHoursProblem("US_HOURS_EXISTING_BOOKING_INVALID",409);
  }
  const startDay=getUsLocalDate(start,timezone);
  const lastDay=getUsLocalDate(new Date(endMs-1),timezone);
  // Iterate physical local calendar days, not elapsed 24-hour UTC periods.
  const affected=[];
  for(let day=startDay,i=0;day<=lastDay;i++){
    if(i>7) throw usHoursProblem("US_HOURS_EXISTING_BOOKING_INVALID",409);
    if(changedWeekdays.has(utcWeekday(day))) affected.push(day);
    const d=new Date(day+"T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate()+1);
    day=d.toISOString().slice(0,10);
  }
  if(!affected.length) return true;
  // A cross-midnight or DST-fold booking cannot be revalidated against a
  // single (start_time,end_time) US-03 weekday row: fail closed if touched.
  if(startDay!==lastDay || getUsLocalDate(end,timezone)!==startDay){
    return false;
  }
  if(start.getUTCSeconds()!==0||end.getUTCSeconds()!==0||
     start.getUTCMilliseconds()!==0||end.getUTCMilliseconds()!==0){
    return false;
  }
  const startWall=getUsWallParts(start,timezone);
  const endWall=getUsWallParts(end,timezone);
  if(startWall.second!==0||endWall.second!==0) return false;
  const startClock=String(startWall.hour).padStart(2,"0")+":"+
    String(startWall.minute).padStart(2,"0");
  const endClock=String(endWall.hour).padStart(2,"0")+":"+
    String(endWall.minute).padStart(2,"0");
  // No silently picking one of the two 01:30 instants during autumn DST.
  const choicesStart=getUsLocalInstantCandidates(startDay,startClock,timezone);
  const choicesEnd=getUsLocalInstantCandidates(startDay,endClock,timezone);
  if(choicesStart.length!==1||choicesEnd.length!==1 ||
     choicesStart[0]!==start.toISOString()||
     choicesEnd[0]!==end.toISOString()||
     clockOffset(start,timezone)!==clockOffset(end,timezone)){
    return false;
  }
  const proposed=new Map(normalizeUsWeeklyHours(hours).map(row=>[row.weekday,row]))
    .get(utcWeekday(startDay));
  if(!proposed) return false;
  const from=bookingWallMinutes(startWall);
  const until=bookingWallMinutes(endWall);
  if(from>=until||from<parseUsMinutes(proposed.start_time)||
     until>parseUsMinutes(proposed.end_time)) return false;
  if(proposed.break_start!==null &&
     from<parseUsMinutes(proposed.break_end) &&
     until>parseUsMinutes(proposed.break_start)) return false;
  return true;
}

export async function replaceUsMasterWeeklyHours(db, {
  locationId,masterId,revision,hours,timezone,
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
  const changed=changedUsHourWeekdays(before.hours,requested);
  if(changed.size===0)return {...before,changed:false};
  if(typeof timezone!=="string" || !timezone ||
     timezone==="UTC" || timezone==="Etc/UTC") {
    throw usHoursProblem("US_HOURS_LOCATION_TIMEZONE_INVALID",409);
  }
  // US bookings and editor both serialize on (973103, masterId); see
  // canonical src/routes/publicCreateBooking.js. Acquired by the ROUTER
  // before this query, preventing a newly inserted booking phantom.
  // Row-level SHARE protects existing bookings during interval validation.
  const upcoming=await db.query(
    `SELECT b.id,b.start_at,b.end_at,b.status
       FROM public.bookings b
       JOIN public.us_booking_location_links link ON link.booking_id=b.id
      WHERE b.master_id=$1 AND link.location_id=$2
        AND COALESCE(b.end_at,b.start_at)>now()
        AND lower(COALESCE(b.status,'')) NOT IN
          ('cancelled','canceled','rejected','failed','refunded','completed')
      ORDER BY b.start_at,b.id LIMIT 5001 FOR SHARE OF b`,
    [masterId,locationId]
  );
  if(upcoming.rows.length>5000) {
    throw usHoursProblem("US_HOURS_BOOKINGS_LIMIT_EXCEEDED",409);
  }
  for(const existing of upcoming.rows) {
    if(!usBookingFitsChangedHours(existing,{
      timezone,changedWeekdays:changed,hours:requested,
    })){
      throw usHoursProblem("US_HOURS_FUTURE_BOOKINGS_CONFLICT",409);
    }
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
