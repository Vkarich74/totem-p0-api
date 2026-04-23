import express from "express";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export default function buildAdminRouter(pool, internalReadRateLimit) {
  const r = express.Router();
  const readLimiter =
    internalReadRateLimit ||
    ((req, res, next) => {
      next();
    });

  r.get("/masters", readLimiter, async (req, res) => {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
    const offset = parsePositiveInt(req.query.offset, 0);

    try {
      const data = await pool.query(
        `
        WITH master_page AS (
          SELECT
            m.id,
            m.name,
            m.slug,
            m.user_id,
            ms.salon_id,
            s.slug AS salon_slug,
            s.name AS salon_name
          FROM masters m
          LEFT JOIN LATERAL (
            SELECT
              ms1.salon_id,
              ms1.status,
              ms1.updated_at,
              ms1.activated_at,
              ms1.fired_at,
              ms1.id
            FROM master_salon ms1
            WHERE ms1.master_id = m.id
            ORDER BY
              CASE
                WHEN ms1.status = 'active' THEN 0
                WHEN ms1.status = 'pending' THEN 1
                WHEN ms1.status = 'fired' THEN 2
                ELSE 3
              END,
              COALESCE(ms1.updated_at, ms1.activated_at, ms1.fired_at) DESC NULLS LAST,
              ms1.id DESC
            LIMIT 1
          ) ms ON true
          LEFT JOIN salons s ON s.id = ms.salon_id
          ORDER BY m.id DESC
          LIMIT $1
          OFFSET $2
        )
        SELECT
          mp.id,
          mp.name,
          mp.slug,
          mp.user_id,
          mp.salon_id,
          mp.salon_slug,
          mp.salon_name,
          COALESCE(bookings.bookings_total, 0)::int AS bookings_total,
          COALESCE(bookings.bookings_completed, 0)::int AS bookings_completed,
          COALESCE(bookings.bookings_cancelled, 0)::int AS bookings_cancelled,
          COALESCE(bookings.clients_total, 0)::int AS clients_total,
          COALESCE(bookings.revenue_total, 0)::bigint AS revenue_total,
          COALESCE(payouts.payouts_total, 0)::bigint AS payouts_total
        FROM master_page mp
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS bookings_total,
            COUNT(*) FILTER (WHERE b.status = 'completed')::int AS bookings_completed,
            COUNT(*) FILTER (WHERE b.status IN ('cancelled', 'canceled'))::int AS bookings_cancelled,
            COUNT(DISTINCT c.id)::int AS clients_total,
            COALESCE(SUM(COALESCE(b.price_snapshot, 0)), 0)::bigint AS revenue_total
          FROM bookings b
          LEFT JOIN clients c ON c.id = b.client_id
          WHERE b.master_id = mp.id
        ) bookings ON true
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(COALESCE(p.amount, 0)), 0)::bigint AS payouts_total
          FROM payouts p
          JOIN bookings b ON b.id = p.booking_id
          WHERE b.master_id = mp.id
        ) payouts ON true
        ORDER BY mp.id DESC
        `,
        [limit, offset],
      );

      return res.json({
        ok: true,
        masters: data.rows,
      });
    } catch (error) {
      console.error("ADMIN_MASTERS_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_MASTERS_FETCH_FAILED",
      });
    }
  });

  r.get("/salons", readLimiter, async (req, res) => {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
    const offset = parsePositiveInt(req.query.offset, 0);

    try {
      const data = await pool.query(
        `
        WITH salon_page AS (
          SELECT
            s.id,
            s.name,
            s.slug,
            s.enabled,
            s.created_at
          FROM salons s
          ORDER BY s.id DESC
          LIMIT $1
          OFFSET $2
        )
        SELECT
          sp.id,
          sp.name,
          sp.slug,
          sp.enabled,
          sp.created_at,
          COALESCE(stats.masters_total, 0)::int AS masters_total,
          COALESCE(stats.clients_total, 0)::int AS clients_total,
          COALESCE(stats.bookings_today, 0)::int AS bookings_today
        FROM salon_page sp
        LEFT JOIN LATERAL (
          SELECT
            COALESCE((
              SELECT COUNT(DISTINCT ms.master_id)::int
              FROM master_salon ms
              WHERE ms.salon_id = sp.id
            ), 0) AS masters_total,
            COALESCE((
              SELECT COUNT(DISTINCT c.id)::int
              FROM clients c
              WHERE c.salon_id = sp.id
            ), 0) AS clients_total,
            COALESCE((
              SELECT COUNT(*)::int
              FROM bookings b
              WHERE b.salon_id = sp.id
              AND DATE(b.start_at) = CURRENT_DATE
            ), 0) AS bookings_today
        ) stats ON true
        ORDER BY sp.id DESC
        `,
        [limit, offset],
      );

      return res.json({
        ok: true,
        salons: data.rows,
      });
    } catch (error) {
      console.error("ADMIN_SALONS_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_SALONS_FETCH_FAILED",
      });
    }
  });

  r.get("/bookings", readLimiter, async (req, res) => {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
    const offset = parsePositiveInt(req.query.offset, 0);

    try {
      const data = await pool.query(
        `
        SELECT
          b.id,
          b.salon_id,
          s.slug AS salon_slug,
          s.name AS salon_name,
          b.master_id,
          m.slug AS master_slug,
          m.name AS master_name,
          c.name AS client_name,
          c.phone AS client_phone,
          b.start_at,
          b.status
        FROM bookings b
        LEFT JOIN salons s ON s.id = b.salon_id
        LEFT JOIN masters m ON m.id = b.master_id
        LEFT JOIN clients c ON c.id = b.client_id
        ORDER BY b.start_at DESC, b.id DESC
        LIMIT $1
        OFFSET $2
        `,
        [limit, offset],
      );

      return res.json({
        ok: true,
        bookings: data.rows,
      });
    } catch (error) {
      console.error("ADMIN_BOOKINGS_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_BOOKINGS_FETCH_FAILED",
      });
    }
  });

  r.get("/clients", readLimiter, async (req, res) => {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
    const offset = parsePositiveInt(req.query.offset, 0);

    try {
      const data = await pool.query(
        `
        SELECT
          c.id,
          c.name,
          c.phone,
          c.salon_id,
          s.slug AS salon_slug,
          s.name AS salon_name,
          COALESCE(stats.bookings_total, 0)::int AS bookings_total,
          stats.last_booking_at
        FROM clients c
        LEFT JOIN salons s ON s.id = c.salon_id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS bookings_total,
            MAX(b.start_at) AS last_booking_at
          FROM bookings b
          WHERE b.client_id = c.id
        ) stats ON true
        ORDER BY stats.last_booking_at DESC NULLS LAST, c.id DESC
        LIMIT $1
        OFFSET $2
        `,
        [limit, offset],
      );

      return res.json({
        ok: true,
        clients: data.rows,
      });
    } catch (error) {
      console.error("ADMIN_CLIENTS_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_CLIENTS_FETCH_FAILED",
      });
    }
  });

  return r;
}
