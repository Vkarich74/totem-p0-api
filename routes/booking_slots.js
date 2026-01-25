import {
  getBookingContextBySlugs,
  getActiveScheduleForWeekday,
  getBookingsForDate,
  getBlocksForDate
} from "../db.js";

const SLOT_STEP_MIN = 30;

function err(res, code, status = 400) {
  return res.status(status).json({ ok: false, error: code });
}

function isValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function weekdayUTC(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.getUTCDay();
}

function hmToMin(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
function minToHm(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function buildSlots(ranges, bookings, blocks) {
  const busy = [
    ...bookings,
    ...blocks
  ].map(x => ({
    start: hmToMin(x.start_time),
    end: hmToMin(x.end_time)
  }));

  const slots = [];
  for (const r of ranges) {
    const start = hmToMin(r.start_time);
    const end = hmToMin(r.end_time);

    for (let t = start; t + SLOT_STEP_MIN <= end; t += SLOT_STEP_MIN) {
      const a = t, b = t + SLOT_STEP_MIN;
      if (!busy.some(x => overlaps(a, b, x.start, x.end))) {
        slots.push({ start_time: minToHm(a), end_time: minToHm(b) });
      }
    }
  }
  return slots;
}

export function registerBookingSlots(app, db) {
  app.get("/booking/slots", (req, res) => {
    const { master_slug, salon_slug, date } = req.query;

    if (!master_slug) return err(res, "MASTER_SLUG_REQUIRED");
    if (!salon_slug) return err(res, "SALON_SLUG_REQUIRED");
    if (!date) return err(res, "DATE_REQUIRED");
    if (!isValidDate(date)) return err(res, "DATE_INVALID_FORMAT");

    const wd = weekdayUTC(date);
    if (wd === null) return err(res, "DATE_INVALID");

    const ctx = getBookingContextBySlugs(db, { master_slug, salon_slug });
    if (!ctx) return err(res, "MASTER_SALON_NOT_FOUND", 404);
    if (ctx.master_active !== 1) return err(res, "MASTER_NOT_ACTIVE", 403);
    if (ctx.salon_active !== 1) return err(res, "SALON_NOT_ACTIVE", 403);
    if (ctx.link_active !== 1) return err(res, "MASTER_NOT_ACTIVE_IN_SALON", 403);

    const schedule = getActiveScheduleForWeekday(db, {
      master_id: ctx.master_id,
      salon_id: ctx.salon_id,
      weekday: wd
    });

    const bookings = getBookingsForDate(db, {
      master_id: ctx.master_id,
      salon_id: ctx.salon_id,
      date
    });

    const blocks = getBlocksForDate(db, {
      master_id: ctx.master_id,
      salon_id: ctx.salon_id,
      date
    });

    res.json({
      ok: true,
      date,
      weekday: wd,
      step_min: SLOT_STEP_MIN,
      slots: buildSlots(schedule, bookings, blocks)
    });
  });
}
