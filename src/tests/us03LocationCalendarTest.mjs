import assert from "node:assert/strict";
import { buildUsSalonCalendarResponse } from "../services/usCalendar.service.js";
import { resolveUsSalonLocation } from "../services/usLocation.service.js";
import { buildUsAvailableSlots } from "../services/usSlots.service.js";

const MARKET = Object.freeze({ market_code:"US", country_code:"US", timezone:"Etc/UTC" });
const salonRow = { id: 50001, slug:"us03-sandbox", name:"US-03 Unit Salon" };
const master = { id: 50002, slug:"us03-master", name:"US-03 Unit Master" };
const FIXED_NOW = Date.parse("2026-01-01T00:00:00.000Z");

function makeDb(locationCode, day, { enabled = true, busy = [], configured = true } = {}) {
  const zones = {
    ny: { id: 91, state_code: "NY", timezone_name:"America/New_York", city_name:"New York", postal_code:"10001" },
    az: { id: 92, state_code: "AZ", timezone_name:"America/Phoenix", city_name:"Phoenix", postal_code:"85001" },
  };
  const locations = new Map([
    ["ny", { ...zones.ny, salon_id:salonRow.id, location_code:"ny", enabled }],
    ["az", { ...zones.az, salon_id:salonRow.id, location_code:"az", enabled }],
  ]);
  const calls = [];
  return {
    calls,
    async query(sql, parameters = []) {
      const normalized = sql.replace(/\s+/g," ").toLowerCase();
      calls.push({ sql: normalized, parameters });
      if (normalized.includes("from public.us_salon_locations l")) {
        const chosen = locations.get(parameters[1]);
        return { rows: chosen ? [chosen] : [] };
      }
      if (normalized.includes("from public.master_salon ms")) {
        return { rows: [master] };
      }
      if (normalized.includes("from public.us_location_master_working_hours")) {
        return { rows: configured ? [
          { master_id: master.id, weekday: parameters[1],
            start_time: day === "spring" ? "01:00:00" : day === "fall" ? "00:30:00" : "09:00:00",
            end_time: day === "spring" ? "04:00:00" : day === "fall" ? "03:00:00" : "10:00:00",
            break_start: null, break_end: null }
        ] : [] };
      }
      if (normalized.includes("join public.us_booking_location_links link")) {
        return { rows: [] };
      }
      if (normalized.includes("from public.bookings b")) {
        return { rows: busy.map(row => ({ master_id:master.id,...row })) };
      }
      throw new Error("UNMOCKED_SQL "+normalized);
    }
  };
}

const springDb = makeDb("ny","spring", {
  busy: [{ start_at:"2026-03-08T06:00:00.000Z",end_at:"2026-03-08T06:30:00.000Z" }],
});
const spring = await buildUsSalonCalendarResponse(springDb, {
  salonRow, requestedDate:"2026-03-08", locationCode:"ny",marketContext:MARKET,
});
assert.equal(spring.market_code,"US");
assert.equal(spring.location.timezone,"America/New_York");
assert.equal(spring.date.timezone,"America/New_York");
assert.equal(spring.date.range_start_utc,"2026-03-08T05:00:00.000Z");
assert.equal(spring.date.range_end_utc,"2026-03-09T04:00:00.000Z");
assert.equal(spring.busy_intervals.length,1);
const springSlots = buildUsAvailableSlots(spring,{masterId: master.id, durationMin: 30, stepMin:15, nowMs:FIXED_NOW});
assert.ok(springSlots.length > 1);
assert.ok(!springSlots.some(s=>s.local_time.startsWith("02:")));
assert.ok(!springSlots.some(s=>s.local_time==="01:00" || s.local_time==="01:15"));
assert.ok(springSlots.some(s=>s.local_time==="01:30" && s.start_at==="2026-03-08T06:30:00.000Z"));
assert.ok(springSlots.every(s=>s.location_code==="ny"));
assert.ok(springDb.calls.some(c=>c.sql.includes("from public.us_location_master_working_hours")));
assert.ok(springDb.calls.some(c=>c.sql.includes("join public.us_booking_location_links link")));

const fallDb = makeDb("ny","fall");
const fall = await buildUsSalonCalendarResponse(fallDb, {
  salonRow, requestedDate:"2026-11-01",locationCode:"ny",marketContext:MARKET,
});
assert.equal(fall.date.range_start_utc,"2026-11-01T04:00:00.000Z");
assert.equal(fall.date.range_end_utc,"2026-11-02T05:00:00.000Z");
const fallSlots=buildUsAvailableSlots(fall,{
  masterId:master.id,durationMin:30,stepMin:15,nowMs:FIXED_NOW,
});
assert.ok(fallSlots.length>0);
assert.ok(!fallSlots.some(s=>s.local_time.startsWith("01:")));
assert.ok(fallSlots.some(s=>s.local_time==="02:00" && s.start_at==="2026-11-01T07:00:00.000Z"));

const azDb=makeDb("az","normal");
const az = await buildUsSalonCalendarResponse(azDb,{
  salonRow,requestedDate:"2026-07-15",locationCode:"az",marketContext:MARKET,
});
assert.equal(az.date.timezone,"America/Phoenix");
assert.equal(az.location.state_code,"AZ");
const azSlots=buildUsAvailableSlots(az,{
  masterId:master.id,durationMin:30,stepMin:15,nowMs:FIXED_NOW,
});
assert.equal(azSlots[0].start_at,"2026-07-15T16:00:00.000Z");

const noScheduleDb=makeDb("az","normal",{configured:false});
const noSchedule = await buildUsSalonCalendarResponse(noScheduleDb,{
  salonRow,requestedDate:"2026-07-15",locationCode:"az",marketContext:MARKET,
});
assert.equal(noSchedule.working_hours[0].availability_status,"unknown");
assert.deepEqual(buildUsAvailableSlots(noSchedule,{
  masterId:master.id,durationMin:30,stepMin:15,nowMs:FIXED_NOW,
}),[]);

async function checkError(fn,expected) {
  await assert.rejects(fn,e=>e.code===expected,`Expected ${expected}`);
}
await checkError(()=>resolveUsSalonLocation(azDb,{salonId:salonRow.id,
  locationCode:"",marketContext:MARKET}),"US_LOCATION_CODE_REQUIRED");
await checkError(()=>resolveUsSalonLocation(azDb,{salonId:salonRow.id,
  locationCode:"pr",marketContext:MARKET}),"US_LOCATION_NOT_FOUND");
await checkError(()=>resolveUsSalonLocation(azDb,{salonId:salonRow.id,
  locationCode:"az",marketContext:{market_code:"KG",country_code:"KG"}}),
  "US_LOCATION_MARKET_MISMATCH");
await checkError(()=>resolveUsSalonLocation(makeDb("az","normal",{enabled:false}),{
  salonId:salonRow.id,locationCode:"az",marketContext:MARKET,
}),"US_LOCATION_INACTIVE");

console.log("US03_LOCATION_CALENDAR_UNIT=PASS", JSON.stringify({
  independent_locations:2, spring_hours:23,fall_hours:25,
  no_dst_gap_slots:true,no_dst_fold_slots:true,
  other_location_master_busy:true,no_legacy_default_schedule:true,
  location_disabled_guard:true,
}));
