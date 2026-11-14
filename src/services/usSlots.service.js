// US-03: conservative, location-scoped available slots.
// DST gaps/folds never become bookable; durations use real elapsed UTC minutes.
import {
  getUsLocalDate, getUsWallParts, resolveUsLocalToUtc,
} from "./usTime.service.js";

function parseUsMinutes(value) {
  const match = String(value ?? "").match(/^([0-9]{2}):([0-9]{2})(?::00(?:\.0+)?)?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function asClock(totalMinutes) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function intersects(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function buildUsAvailableSlots(calendar, {
  masterId, durationMin, stepMin = 15, nowMs = Date.now(),
} = {}) {
  if (calendar?.market_code !== "US" || !calendar?.location?.id ||
      !calendar?.date?.requested_date || !calendar?.date?.timezone) {
    return [];
  }
  const id = Number(masterId);
  const minutes = Number(durationMin);
  if (!Number.isSafeInteger(id) || id <= 0 ||
      !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440 ||
      !Number.isSafeInteger(stepMin) || stepMin < 1 || stepMin > 120) {
    return [];
  }
  const hours = (calendar.working_hours || []).find(row =>
    Number(row.master_id) === id && row.availability_status === "configured");
  if (!hours) return [];
  const startWork = parseUsMinutes(hours.start_time);
  const endWork = parseUsMinutes(hours.end_time);
  const breakStart = hours.break_start == null ? null : parseUsMinutes(hours.break_start);
  const breakEnd = hours.break_end == null ? null : parseUsMinutes(hours.break_end);
  if (startWork === null || endWork === null || endWork <= startWork ||
      (breakStart === null) !== (breakEnd === null) ||
      (breakStart !== null && (breakEnd <= breakStart ||
        breakStart < startWork || breakEnd > endWork))) {
    return [];
  }
  const date = calendar.date.requested_date;
  const timezone = calendar.date.timezone;
  const busy = (calendar.busy_intervals || [])
    .filter(row => Number(row.master_id) === id)
    .map(row => [new Date(row.start_at).getTime(), new Date(row.end_at).getTime()])
    .filter(pair => pair.every(Number.isFinite) && pair[0] < pair[1]);
  const slots = [];

  for (let minute = startWork; minute < endWork; minute += stepMin) {
    const localTime = asClock(minute);
    let startAt;
    try {
      startAt = resolveUsLocalToUtc(date, localTime, timezone);
    } catch (error) {
      // A nonexistent or duplicated clock reading cannot identify exactly
      // one physical instant. Do not guess "earlier/later" for a booking.
      if (error?.code === "US_DST_GAP" || error?.code === "US_DST_FOLD") continue;
      throw error;
    }
    const start = new Date(startAt).getTime();
    const end = start + minutes * 60000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < nowMs) continue;
    if (getUsLocalDate(end, timezone) !== date) continue;
    const endParts = getUsWallParts(end, timezone);
    const endWall = endParts.hour * 60 + endParts.minute;
    if (endWall > endWork) continue;
    if (endParts.second !== 0) continue;
    if (breakStart !== null &&
        intersects(minute, endWall, breakStart, breakEnd)) continue;
    if (busy.some(pair => intersects(start, end, pair[0], pair[1]))) continue;

    slots.push(Object.freeze({
      start_at: startAt,
      end_at: new Date(end).toISOString(),
      local_time: localTime,
      location_code: calendar.location.location_code,
    }));
  }
  return slots;
}

export { buildUsAvailableSlots, parseUsMinutes };
