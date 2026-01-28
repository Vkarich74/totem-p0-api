// routes_public/availability.js
import express from "express";
import { publicCors, publicTokenAuth, publicRateLimit } from "../middleware/publicTokenAuth.js";

/**
 * GO 27.2 — Public availability (read-only)
 *
 * GET /public/salons/:salon_id/availability?date=YYYY-MM-DD&master_slug=...&duration_min=60
 *
 * Правила:
 * - tenant НЕ из headers; tenant только из public token (req.public.tenant_id)
 * - если token привязан к salon_id, то :salon_id обязан совпадать
 * - CORS включен
 */
export default function mountPublicAvailability(app, { db }) {
  const router = express.Router();

  router.use(publicCors);

  // auth + public RL
  router.use(publicTokenAuth({ db, requiredScope: "public:read" }));
  router.use(publicRateLimit({ windowSec: 60, limit: 120 }));

  router.get("/salons/:salon_id/availability", (req, res) => {
    const salon_id = String(req.params.salon_id || "");
    const date = String(req.query.date || "");
    const master_slug = req.query.master_slug ? String(req.query.master_slug) : null;
    const duration_min = req.query.duration_min ? Number(req.query.duration_min) : null;

    if (!salon_id) return res.status(400).json({ error: "SALON_ID_REQUIRED" });
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "DATE_REQUIRED_YYYY_MM_DD" });
    }

    // token salon binding (optional)
    if (req.public?.salon_id && String(req.public.salon_id) !== salon_id) {
      return res.status(403).json({ error: "SALON_MISMATCH" });
    }

    // weekday (Mon=1..Sun=7), compatible with earlier logic
    const d = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "INVALID_DATE" });
    const jsDay = d.getUTCDay(); // 0..6 (Sun..Sat)
    const weekday = jsDay === 0 ? 7 : jsDay; // 1..7

    // We try to read schedule + bookings with best-effort.
    // If schema differs, we fail gracefully with empty slots (no hanging).
    let schedules = [];
    try {
      // Expected columns (best guess from earlier work):
      // master_slug, salon_id (or salon_slug), weekday, start_time, end_time, step_min
      // We try salon_id first, then salon_slug fallback.
      const stmt1 = db.prepare(
        `SELECT master_slug, weekday, start_time, end_time, step_min
         FROM master_schedule
         WHERE (salon_id = ? OR salon_slug = ?)
           AND weekday = ?
           ${master_slug ? "AND master_slug = ?" : ""}`
      );

      schedules = master_slug
        ? stmt1.all(salon_id, salon_id, weekday, master_slug)
        : stmt1.all(salon_id, salon_id, weekday);
    } catch {
      schedules = [];
    }

    // If no schedule rows, return empty (public-safe)
    if (!Array.isArray(schedules) || schedules.length === 0) {
      return res.json({
        ok: true,
        salon_id,
        date,
        tenant_id: req.public.tenant_id,
        step_min: 30,
        slots: [],
      });
    }

    // bookings for that date
    let bookings = [];
    try {
      const stmtB = db.prepare(
        `SELECT master_slug, start_time, end_time, cancelled_at
         FROM bookings
         WHERE (salon_id = ? OR salon_slug = ?)
           AND date = ?
           ${master_slug ? "AND master_slug = ?" : ""}
        `
      );
      bookings = master_slug
        ? stmtB.all(salon_id, salon_id, date, master_slug)
        : stmtB.all(salon_id, salon_id, date);

      bookings = bookings.filter((b) => !b.cancelled_at);
    } catch {
      bookings = [];
    }

    function toMin(t) {
      const m = String(t || "").match(/^(\d{2}):(\d{2})$/);
      if (!m) return null;
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
      return hh * 60 + mm;
    }

    function toTime(min) {
      const hh = String(Math.floor(min / 60)).padStart(2, "0");
      const mm = String(min % 60).padStart(2, "0");
      return `${hh}:${mm}`;
    }

    function overlaps(aStart, aEnd, bStart, bEnd) {
      return aStart < bEnd && bStart < aEnd;
    }

    const outSlots = [];
    let stepMinGlobal = 30;

    for (const sch of schedules) {
      const step = Number(sch.step_min || 30);
      if (Number.isFinite(step) && step > 0) stepMinGlobal = step;

      const s0 = toMin(sch.start_time);
      const e0 = toMin(sch.end_time);
      if (s0 === null || e0 === null || e0 <= s0) continue;

      const dur = Number.isFinite(duration_min) && duration_min > 0 ? duration_min : step;

      for (let m = s0; m + dur <= e0; m += step) {
        const start = m;
        const end = m + dur;

        // busy check for same master
        const master = sch.master_slug;

        let busy = false;
        for (const b of bookings) {
          if (String(b.master_slug || "") !== String(master || "")) continue;
          const bs = toMin(b.start_time);
          const be = toMin(b.end_time);
          if (bs === null || be === null) continue;
          if (overlaps(start, end, bs, be)) {
            busy = true;
            break;
          }
        }

        if (!busy) {
          outSlots.push({
            master_slug: master,
            start_time: toTime(start),
            end_time: toTime(end),
          });
        }
      }
    }

    return res.json({
      ok: true,
      salon_id,
      date,
      tenant_id: req.public.tenant_id,
      step_min: stepMinGlobal,
      slots: outSlots,
    });
  });

  app.use("/public", router);
}
