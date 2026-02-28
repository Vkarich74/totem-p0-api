import { pool } from "../db.js";

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export async function publicMasterAvailability(req, res) {
  const client = await pool.connect();

  try {
    const salon_id = req.tenant?.salon_id;
    if (!salon_id) return res.status(400).json({ ok: false, error: "TENANT_REQUIRED" });

    const master_id = Number(req.params.master_id);
    const service_id = Number(req.query.service_id);

    if (!master_id) return res.status(400).json({ ok: false, error: "MASTER_ID_REQUIRED" });
    if (!service_id) return res.status(400).json({ ok: false, error: "SERVICE_ID_REQUIRED" });

    const from = new Date(req.query.from);
    const to = new Date(req.query.to);

    if (isNaN(from.getTime()) || isNaN(to.getTime()))
      return res.status(400).json({ ok: false, error: "INVALID_DATE_RANGE" });

    const step_min = req.query.step_min ? Number(req.query.step_min) : 15;

    const serviceRes = await client.query(
      `SELECT duration_min
         FROM services_v2
        WHERE id = $1
          AND salon_id = $2
          AND is_active = true`,
      [service_id, salon_id]
    );

    if (serviceRes.rowCount === 0)
      return res.status(404).json({ ok: false, error: "SERVICE_NOT_FOUND" });

    const duration_min = serviceRes.rows[0].duration_min;

    const busyRes = await client.query(
      `SELECT start_at, end_at
         FROM calendar_slots
        WHERE master_id = $1
          AND salon_id = $2
          AND status <> 'cancelled'
          AND start_at < $4
          AND end_at > $3`,
      [master_id, salon_id, from, to]
    );

    const busy = busyRes.rows.map(r => ({
      start: new Date(r.start_at),
      end: new Date(r.end_at)
    }));

    const latestStart = addMinutes(to, -duration_min);
    const slots = [];

    for (let t = new Date(from.getTime()); t <= latestStart; t = addMinutes(t, step_min)) {
      const tEnd = addMinutes(t, duration_min);

      let conflict = false;
      for (const b of busy) {
        if (overlaps(t, tEnd, b.start, b.end)) {
          conflict = true;
          break;
        }
      }

      if (!conflict) {
        slots.push({
          start_at: t.toISOString(),
          end_at: tEnd.toISOString()
        });
      }
    }

    return res.json({
      ok: true,
      master_id,
      service_id,
      slots
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}