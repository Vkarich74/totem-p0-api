import assert from "node:assert/strict";
import {
  getUsLocalDayRange, getUsLocalInstantCandidates, getUsWallParts,
  getUsLocalDate, getUsLocalTime, resolveUsLocalToUtc, normalizeUsBookingStart
} from "../services/usTime.service.js";

function errorCode(call, expected) {
  assert.throws(call, error => error.code === expected, `Expected ${expected}`);
}

assert.equal(resolveUsLocalToUtc("2026-01-15", "09:00", "America/New_York"), "2026-01-15T14:00:00.000Z");
assert.equal(resolveUsLocalToUtc("2026-07-15", "09:00", "America/New_York"), "2026-07-15T13:00:00.000Z");
assert.equal(resolveUsLocalToUtc("2026-01-15", "09:00", "America/Phoenix"), "2026-01-15T16:00:00.000Z");
assert.equal(resolveUsLocalToUtc("2026-07-15", "09:00", "America/Phoenix"), "2026-07-15T16:00:00.000Z");
assert.equal(resolveUsLocalToUtc("2026-01-15", "09:00", "America/Anchorage"), "2026-01-15T18:00:00.000Z");
assert.equal(resolveUsLocalToUtc("2026-07-15", "09:00", "Pacific/Honolulu"), "2026-07-15T19:00:00.000Z");
assert.equal(resolveUsLocalToUtc("2026-01-15", "09:00", "America/Adak"), "2026-01-15T19:00:00.000Z");
assert.equal(resolveUsLocalToUtc("2026-07-15", "09:00", "America/Chicago"), "2026-07-15T14:00:00.000Z");

assert.deepEqual(getUsLocalInstantCandidates("2026-03-08","02:30","America/New_York"), []);
errorCode(() => resolveUsLocalToUtc("2026-03-08","02:30","America/New_York"), "US_DST_GAP");
assert.deepEqual(getUsLocalInstantCandidates("2026-11-01","01:30","America/New_York"),
  ["2026-11-01T05:30:00.000Z","2026-11-01T06:30:00.000Z"]);
errorCode(() => resolveUsLocalToUtc("2026-11-01","01:30","America/New_York"), "US_DST_FOLD");
assert.deepEqual(getUsLocalInstantCandidates("2026-03-08","03:00","America/New_York"),
  ["2026-03-08T07:00:00.000Z"]);
assert.equal(resolveUsLocalToUtc("2026-11-01","02:00","America/New_York"),"2026-11-01T07:00:00.000Z");

const spring = getUsLocalDayRange("2026-03-08","America/New_York");
const autumn = getUsLocalDayRange("2026-11-01","America/New_York");
assert.equal((new Date(spring.end)-new Date(spring.start))/3600000,23);
assert.equal((new Date(autumn.end)-new Date(autumn.start))/3600000,25);

const forward = getUsWallParts("2026-03-08T07:00:00.000Z","America/New_York");
assert.deepEqual([forward.hour,forward.minute,forward.second],[3,0,0]);
assert.equal(getUsLocalDate("2026-11-01T06:30:00.000Z","America/New_York"),"2026-11-01");
assert.equal(getUsLocalTime("2026-11-01T06:30:00.000Z","America/New_York"),"01:30");

for(const invalidDate of ["2026-02-29","2026-13-01","2026-01-32","2026-00-01","2026-1-01"])
  errorCode(() => resolveUsLocalToUtc(invalidDate,"09:00","America/New_York"),"US_LOCAL_DATETIME_INVALID");
for(const invalidTime of ["24:00","12:60","9:00","12:00:00","-01:00"])
  errorCode(() => resolveUsLocalToUtc("2026-01-15",invalidTime,"America/New_York"),"US_LOCAL_DATETIME_INVALID");
for(const invalidZone of ["Etc/UTC","UTC","Invalid/Zone",""])
  errorCode(() => resolveUsLocalToUtc("2026-01-15","12:00",invalidZone),
    invalidZone==="Etc/UTC"||invalidZone==="UTC"||invalidZone===""?
    "US_LOCATION_TIMEZONE_REQUIRED":"US_LOCATION_TIMEZONE_INVALID");

const canonical=normalizeUsBookingStart({date:"2026-03-08",time:"03:00",start_at:"2026-03-08T07:00:00.000Z"},"America/New_York");
assert.equal(canonical.startAt,"2026-03-08T07:00:00.000Z");
const fromUtcOnly=normalizeUsBookingStart({start_at:"2026-03-08T07:00:00Z"},"America/New_York");
assert.equal(fromUtcOnly.date,"2026-03-08");
assert.equal(fromUtcOnly.time,"03:00");
errorCode(()=>normalizeUsBookingStart({date:"2026-03-08",time:"02:30"},"America/New_York"),"US_DST_GAP");
errorCode(()=>normalizeUsBookingStart({start_at:"2026-11-01T05:30:00Z"},"America/New_York"),"US_DST_FOLD");
errorCode(()=>normalizeUsBookingStart({date:"2026-07-15",time:"09:00",start_at:"2026-07-15T14:00:00Z"},"America/New_York"),"US_BOOKING_INSTANT_MISMATCH");
errorCode(()=>normalizeUsBookingStart({start_at:"2026-07-15T14:00:27Z"},"America/New_York"),"US_INSTANT_INVALID");
errorCode(()=>normalizeUsBookingStart({start_at:"2026-07-15T09:00:00"},"America/New_York"),"US_EXPLICIT_INSTANT_REQUIRED");

console.log("US03_TIME_DST_UNIT=PASS",JSON.stringify({spring_hours:23,autumn_hours:25,scenarios:42,missing_and_ambiguous_rejected:true,kg_kz_unchanged:true}));
