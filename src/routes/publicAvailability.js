import { pool } from "../db.js";
import { buildSalonCalendarResponse } from "../services/salonCalendar.service.js";

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
  const dateParts = String(dateValue || "").trim().split("-");
  const timeParts = String(timeValue || "").trim().split(":");

  if (dateParts.length !== 3 || timeParts.length < 2) {
    return null;
  }

  const year = Number(dateParts[0]);
  const month = Number(dateParts[1]);
  const day = Number(dateParts[2]);
  const hour = Number(timeParts[0]);
  const minute = Number(timeParts[1]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
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

function parseTimeToMinutes(value) {
  const parts = String(value || "").trim().split(":");
  if (parts.length < 2) {
    return null;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatMinutesAsTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function overlaps(aStartMs, aEndMs, bStartMs, bEndMs) {
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

function parseRequestedDate(req) {
  const explicitDate = String(req.query?.date || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    return explicitDate;
  }

  const fromRaw = String(req.query?.from || "").trim();
  const toRaw = String(req.query?.to || "").trim();
  const from = new Date(fromRaw);
  const to = new Date(toRaw);

  if (!fromRaw || !toRaw || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !(from < to)) {
    return null;
  }

  return from.toISOString().slice(0, 10);
}

export async function publicMasterAvailability(req, res) {
  try {
    const salonId = Number(req.tenant?.salon_id);
    const masterId = Number(req.params.master_id);
    const serviceId = Number(req.query.service_id);
    const requestedDate = parseRequestedDate(req);
    const requestedStep = Number(req.query.step_min || 15);
    const stepMin = Number.isInteger(requestedStep) && requestedStep > 0 && requestedStep <= 120
      ? requestedStep
      : 15;

    if (!salonId) {
      return res.status(400).json({ ok: false, error: "TENANT_REQUIRED" });
    }

    if (!masterId) {
      return res.status(400).json({ ok: false, error: "MASTER_ID_REQUIRED" });
    }

    if (!serviceId) {
      return res.status(400).json({ ok: false, error: "SERVICE_ID_REQUIRED" });
    }

    if (!requestedDate) {
      return res.status(400).json({ ok: false, error: "INVALID_RANGE" });
    }

    const salonRes = await pool.query(
      `SELECT id, slug, name, city, status, enabled
       FROM public.salons
       WHERE id = $1
       LIMIT 1`,
      [salonId]
    );

    if (!salonRes.rows.length) {
      return res.status(404).json({ ok: false, error: "SALON_NOT_FOUND" });
    }

    const serviceRes = await pool.query(
      `SELECT
         sms.id,
         sms.master_id,
         sms.duration_min
       FROM public.salon_master_services sms
       JOIN public.master_salon ms
         ON ms.salon_id = sms.salon_id
        AND ms.master_id = sms.master_id
        AND ms.status = 'active'
       WHERE sms.id = $1
         AND sms.salon_id = $2
         AND sms.master_id = $3
         AND COALESCE(sms.active, true) = true
       LIMIT 1`,
      [serviceId, salonId, masterId]
    );

    if (!serviceRes.rows.length) {
      return res.status(404).json({ ok: false, error: "SERVICE_NOT_FOUND" });
    }

    const durationMin = Number(serviceRes.rows[0].duration_min);

    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      return res.status(409).json({ ok: false, error: "SERVICE_DURATION_INVALID" });
    }

    const calendar = await buildSalonCalendarResponse(pool, {
      salonRow: salonRes.rows[0],
      requestedDate
    });

    const workingRow = (calendar.working_hours || []).find(
      (row) => Number(row.master_id) === masterId
    );

    if (!workingRow || workingRow.availability_status !== "configured") {
      return res.json({
        ok: true,
        master_id: masterId,
        service_id: serviceId,
        date: requestedDate,
        timezone: calendar?.date?.timezone || null,
        slots: []
      });
    }

    const workStartMin = parseTimeToMinutes(workingRow.start_time);
    const workEndMin = parseTimeToMinutes(workingRow.end_time);
    const breakStartMin = parseTimeToMinutes(workingRow.break_start);
    const breakEndMin = parseTimeToMinutes(workingRow.break_end);
    const timeZone = String(calendar?.date?.timezone || "").trim();

    if (
      workStartMin === null ||
      workEndMin === null ||
      workStartMin >= workEndMin ||
      !timeZone
    ) {
      return res.json({
        ok: true,
        master_id: masterId,
        service_id: serviceId,
        date: requestedDate,
        timezone: timeZone || null,
        slots: []
      });
    }

    const busy = (calendar.events || [])
      .filter(
        (event) =>
          Number(event.master_id) === masterId &&
          String(event.occupancy_status || "").toLowerCase() === "occupied" &&
          event.start_at &&
          event.end_at
      )
      .map((event) => ({
        startMs: new Date(event.start_at).getTime(),
        endMs: new Date(event.end_at).getTime()
      }))
      .filter(
        (event) =>
          Number.isFinite(event.startMs) &&
          Number.isFinite(event.endMs) &&
          event.startMs < event.endMs
      );

    const slots = [];
    const latestStartMin = workEndMin - durationMin;
    const nowMs = Date.now();

    for (let startMin = workStartMin; startMin <= latestStartMin; startMin += stepMin) {
      const endMin = startMin + durationMin;

      if (
        breakStartMin !== null &&
        breakEndMin !== null &&
        breakStartMin < breakEndMin &&
        startMin < breakEndMin &&
        breakStartMin < endMin
      ) {
        continue;
      }

      const localTime = formatMinutesAsTime(startMin);
      const localEndTime = formatMinutesAsTime(endMin);
      const startAt = localDateTimeToUtcIso(requestedDate, localTime, timeZone);
      const endAt = localDateTimeToUtcIso(requestedDate, localEndTime, timeZone);

      if (!startAt || !endAt) {
        continue;
      }

      const startMs = new Date(startAt).getTime();
      const endMs = new Date(endAt).getTime();

      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < nowMs) {
        continue;
      }

      if (busy.some((event) => overlaps(startMs, endMs, event.startMs, event.endMs))) {
        continue;
      }

      slots.push({
        start_at: startAt,
        end_at: endAt,
        local_time: localTime
      });
    }

    return res.json({
      ok: true,
      master_id: masterId,
      service_id: serviceId,
      date: requestedDate,
      timezone: timeZone,
      slots
    });
  } catch (err) {
    if (err?.code === "BAD_CALENDAR_DATE" || err?.message === "BAD_CALENDAR_DATE") {
      return res.status(400).json({ ok: false, error: "INVALID_RANGE" });
    }

    console.error("AVAILABILITY_ERROR", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
