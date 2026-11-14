// US-03: strict IANA wall-clock conversions. No legacy KG/KZ code is changed.
// Gaps (spring) and folds (autumn) are explicitly rejected for new US slots.
const FORMATTERS = new Map();

function usTimeError(code, statusCode = 409) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function getUsFormatter(timezone) {
  const zone = String(timezone || "").trim();
  if (!zone || zone === "Etc/UTC" || zone === "UTC") {
    throw usTimeError("US_LOCATION_TIMEZONE_REQUIRED");
  }
  if (!FORMATTERS.has(zone)) {
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      // Intl may canonicalize aliases, but validation itself is fail-closed.
      formatter.format(new Date());
      FORMATTERS.set(zone, formatter);
    } catch {
      throw usTimeError("US_LOCATION_TIMEZONE_INVALID");
    }
  }
  return FORMATTERS.get(zone);
}

function getUsWallParts(instant, timezone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) {
    throw usTimeError("US_INSTANT_INVALID", 400);
  }
  const parts = Object.create(null);
  for (const part of getUsFormatter(timezone).formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return Object.freeze({
    year: parts.year, month: parts.month, day: parts.day,
    hour: parts.hour, minute: parts.minute, second: parts.second,
  });
}

function parseUsLocalDateTime(date, time) {
  const d = String(date || "").match(/^(20[0-9]{2})-([0-9]{2})-([0-9]{2})$/);
  const t = String(time || "").match(/^([0-9]{2}):([0-9]{2})$/);
  if (!d || !t) throw usTimeError("US_LOCAL_DATETIME_INVALID", 400);
  const wall = {
    year: Number(d[1]), month: Number(d[2]), day: Number(d[3]),
    hour: Number(t[1]), minute: Number(t[2]),
  };
  if (wall.month < 1 || wall.month > 12 || wall.hour > 23 || wall.minute > 59) {
    throw usTimeError("US_LOCAL_DATETIME_INVALID", 400);
  }
  const utc = Date.UTC(wall.year, wall.month - 1, wall.day);
  const parsed = new Date(utc);
  if (parsed.getUTCFullYear() !== wall.year || parsed.getUTCMonth() + 1 !== wall.month ||
      parsed.getUTCDate() !== wall.day) {
    throw usTimeError("US_LOCAL_DATETIME_INVALID", 400);
  }
  return Object.freeze(wall);
}

function sameWall(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day &&
    a.hour === b.hour && a.minute === b.minute;
}

function getUsLocalInstantCandidates(date, time, timezone) {
  const wall = parseUsLocalDateTime(date, time);
  // Validate the zone before calculating offsets.
  getUsFormatter(timezone);
  const desired = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const offsets = new Set();
  // Sample both sides of every possible U.S. DST boundary around this date.
  // ±36h also covers UTC offsets in Alaska/Hawaii and the Aleutian Islands.
  for (const hours of [-36, -18, -6, 0, 6, 18, 36]) {
    const sample = desired + hours * 3600000;
    const observed = getUsWallParts(sample, timezone);
    const observedAsUtc = Date.UTC(
      observed.year, observed.month - 1, observed.day,
      observed.hour, observed.minute, observed.second
    );
    offsets.add(observedAsUtc - Math.trunc(sample / 1000) * 1000);
  }
  const instants = new Set();
  for (const offset of offsets) {
    const candidate = desired - offset;
    const roundTrip = getUsWallParts(candidate, timezone);
    if (sameWall(roundTrip, wall) && roundTrip.second === 0) {
      instants.add(candidate);
    }
  }
  return Object.freeze([...instants].sort((a, b) => a - b).map(ms => new Date(ms).toISOString()));
}

function resolveUsLocalToUtc(date, time, timezone) {
  const candidates = getUsLocalInstantCandidates(date, time, timezone);
  if (!candidates.length) throw usTimeError("US_DST_GAP");
  if (candidates.length !== 1) throw usTimeError("US_DST_FOLD");
  return candidates[0];
}

function getUsLocalDate(instant, timezone) {
  const parts = getUsWallParts(instant, timezone);
  const pad = num => String(num).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function getUsLocalTime(instant, timezone) {
  const parts = getUsWallParts(instant, timezone);
  const pad = num => String(num).padStart(2, "0");
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function getUsLocalDayRange(date, timezone) {
  parseUsLocalDateTime(date, "00:00");
  const [year, month, day] = String(date).split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return Object.freeze({
    start: resolveUsLocalToUtc(date, "00:00", timezone),
    end: resolveUsLocalToUtc(nextDate, "00:00", timezone),
  });
}

// Accept a canonical offered slot. If client also sends date/time, it must
// match the same instant. Ambiguous/nonexistent wall times never auto-resolve.
function normalizeUsBookingStart({ date, time, start_at }, timezone) {
  const rawStart = String(start_at || "").trim();
  const hasDate = Boolean(date);
  const hasTime = Boolean(time);
  if (hasDate !== hasTime) throw usTimeError("US_LOCAL_DATETIME_REQUIRED", 400);
  if (!rawStart && !hasDate) throw usTimeError("US_BOOKING_TIME_REQUIRED", 400);
  let picked = null;
  if (rawStart) {
    if (!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.000)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(rawStart)) {
      throw usTimeError("US_EXPLICIT_INSTANT_REQUIRED", 400);
    }
    const instant = new Date(rawStart);
    if (!Number.isFinite(instant.getTime()) || instant.getUTCSeconds() !== 0 ||
        instant.getUTCMilliseconds() !== 0) {
      throw usTimeError("US_INSTANT_INVALID", 400);
    }
    picked = instant.toISOString();
  }
  const effectiveDate = hasDate ? String(date) :
    getUsLocalDate(picked, timezone);
  const effectiveTime = hasTime ? String(time) :
    getUsLocalTime(picked, timezone);
  const canonical = resolveUsLocalToUtc(effectiveDate, effectiveTime, timezone);
  if (picked && canonical !== picked) throw usTimeError("US_BOOKING_INSTANT_MISMATCH", 409);
  return Object.freeze({ date: effectiveDate, time: effectiveTime, startAt: canonical });
}

export {
  getUsWallParts, getUsLocalDate, getUsLocalTime, getUsLocalDayRange,
  getUsLocalInstantCandidates, resolveUsLocalToUtc,
  normalizeUsBookingStart, usTimeError,
};
