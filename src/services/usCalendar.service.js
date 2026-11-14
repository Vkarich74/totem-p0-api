// US-03 location-scoped calendar. All SQL targets US-specific additive tables.
// KG/KZ retain their existing calendar implementation unchanged.
import { resolveUsSalonLocation } from "./usLocation.service.js";
import {
  getUsLocalDate, getUsLocalDayRange, getUsWallParts,
} from "./usTime.service.js";

function formatLocal(instant, timezone) {
  const p = getUsWallParts(instant, timezone);
  const pad = value => String(value).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

function nextDay(date, step) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + step)).toISOString().slice(0, 10);
}

async function buildUsSalonCalendarResponse(db, {
  salonRow, requestedDate, locationCode, marketContext,
} = {}) {
  if (!db || !salonRow) {
    const err = new Error("US_CALENDAR_INPUT_REQUIRED");
    err.code = "US_CALENDAR_INPUT_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  const location = await resolveUsSalonLocation(db, {
    salonId: salonRow.id, locationCode, marketContext,
  });
  const timezone = location.timezone;
  const requested = String(requestedDate || "").trim() ||
    getUsLocalDate(new Date(), timezone);
  const range = getUsLocalDayRange(requested, timezone);
  const weekday = new Date(requested + "T00:00:00.000Z").getUTCDay();
  const masterResult = await db.query(
    `SELECT m.id, m.slug, m.name, ms.status AS relation_status
       FROM public.master_salon ms
       JOIN public.masters m ON m.id=ms.master_id
       WHERE ms.salon_id=$1 AND ms.status='active'
         AND COALESCE(m.active,true)=true
       ORDER BY m.id`,
    [Number(salonRow.id)]
  );
  const masters = masterResult.rows.map(row => ({
    id: Number(row.id), slug: row.slug, name: row.name,
    relation_status: "active", active: true, calendar_status: "unknown",
  }));
  const masterIds = masters.map(master => master.id);
  let hours = [];
  let events = [];
  let busyIntervals = [];

  if (masterIds.length) {
    const hoursResult = await db.query(
      `SELECT master_id, weekday, start_time::text, end_time::text,
              break_start::text, break_end::text
         FROM public.us_location_master_working_hours
         WHERE location_id=$1 AND weekday=$2
           AND master_id=ANY($3::int[])
         ORDER BY master_id`,
      [location.id, weekday, masterIds]
    );
    const byMaster = new Map(hoursResult.rows.map(row => [Number(row.master_id), row]));
    hours = masters.map(master => {
      const row = byMaster.get(master.id);
      if (!row) {
        return {
          master_id: master.id, status: "unconfigured", weekday,
          start_time: null, end_time: null,
          break_start: null, break_end: null,
          availability_status: "unknown",
        };
      }
      master.calendar_status = "configured";
      return {
        master_id: master.id, status: "configured", weekday,
        start_time: row.start_time,
        end_time: row.end_time,
        break_start: row.break_start,
        break_end: row.break_end,
        availability_status: "configured",
      };
    });

    const eventResult = await db.query(
      `SELECT b.id AS booking_id, b.master_id, b.start_at, b.end_at,
              b.status, b.service_id, b.price_snapshot
         FROM public.bookings b
         JOIN public.us_booking_location_links link ON link.booking_id=b.id
         WHERE b.salon_id=$1 AND link.location_id=$2
           AND b.master_id=ANY($3::int[])
           AND b.start_at < $5::timestamptz
           AND b.end_at > $4::timestamptz
         ORDER BY b.start_at,b.id`,
      [Number(salonRow.id), location.id, masterIds, range.start, range.end]
    );
    events = eventResult.rows.map(row => ({
      booking_id: Number(row.booking_id),
      booking_code: `BR-${String(row.booking_id).padStart(5, "0")}`,
      master_id: Number(row.master_id),
      start_at: new Date(row.start_at).toISOString(),
      end_at: new Date(row.end_at).toISOString(),
      start_local: formatLocal(row.start_at, timezone),
      end_local: formatLocal(row.end_at, timezone),
      status: row.status,
      occupancy_status: ["reserved", "pending", "confirmed", "completed"]
        .includes(String(row.status || "").toLowerCase()) ? "occupied" : "not_occupied",
      service_id: row.service_id == null ? null : Number(row.service_id),
      price: row.price_snapshot == null ? null : Number(row.price_snapshot),
    }));

    // A master is never offered at two overlapping locations, even if the
    // other booking belongs to a different salon. Do not expose client data.
    const busyResult = await db.query(
      `SELECT b.master_id, b.start_at, b.end_at
         FROM public.bookings b
         WHERE b.master_id=ANY($1::int[])
           AND lower(b.status) IN ('reserved','pending','confirmed','completed')
           AND b.start_at < $3::timestamptz
           AND b.end_at > $2::timestamptz
         ORDER BY b.start_at`,
      [masterIds, range.start, range.end]
    );
    busyIntervals = busyResult.rows.map(row => ({
      master_id: Number(row.master_id),
      start_at: new Date(row.start_at).toISOString(),
      end_at: new Date(row.end_at).toISOString(),
    }));
  }

  return {
    ok: true,
    market_code: "US",
    location,
    salon: {
      id: Number(salonRow.id),
      slug: salonRow.slug,
      name: salonRow.name,
      city: location.city_name,
      timezone,
      location_code: location.location_code,
    },
    date: {
      requested_date: requested,
      salon_today: getUsLocalDate(new Date(), timezone),
      timezone,
      location_code: location.location_code,
      prev_date: nextDay(requested, -1),
      next_date: nextDay(requested, 1),
      range_start_utc: range.start,
      range_end_utc: range.end,
    },
    masters,
    working_hours: hours,
    events,
    busy_intervals: busyIntervals,
    summary: {
      masters_count: masters.length,
      active_masters_count: masters.length,
      events_count: events.length,
      occupied_count: events.filter(event => event.occupancy_status === "occupied").length,
      cancelled_count: events.filter(event =>
        ["cancelled", "canceled", "rejected", "failed", "refunded"]
          .includes(String(event.status || "").toLowerCase())).length,
      available_slots_count: 0,
      unknown_availability_count: hours.filter(row =>
        row.availability_status !== "configured").length,
    },
  };
}

export { buildUsSalonCalendarResponse };
