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
        data: {
          items: data.rows,
          pagination: {
            total: data.rows.length,
            limit,
            offset,
          },
        },
        meta: {},
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
        data: {
          items: data.rows,
          pagination: {
            total: data.rows.length,
            limit,
            offset,
          },
        },
        meta: {},
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
        data: {
          items: data.rows,
          pagination: {
            total: data.rows.length,
            limit,
            offset,
          },
        },
        meta: {},
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
        data: {
          items: data.rows,
          pagination: {
            total: data.rows.length,
            limit,
            offset,
          },
        },
        meta: {},
      });
    } catch (error) {
      console.error("ADMIN_CLIENTS_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_CLIENTS_FETCH_FAILED",
      });
    }
  });

  r.get("/overview", readLimiter, async (req, res) => {
    try {
      const data = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM salons) AS salons_total,
          (SELECT COUNT(*)::int FROM masters) AS masters_total,
          (SELECT COUNT(*)::int FROM clients) AS clients_total,
          (SELECT COUNT(*)::int FROM bookings WHERE DATE(start_at) = CURRENT_DATE) AS bookings_today,
          COALESCE((
            SELECT SUM(COALESCE(price_snapshot, 0))::bigint
            FROM bookings
            WHERE DATE(start_at) = CURRENT_DATE
          ), 0)::bigint AS revenue_today,
          COALESCE((
            SELECT SUM(COALESCE(amount, 0))::bigint
            FROM payouts
          ), 0)::bigint AS payouts_total
      `);

      return res.json({
        ok: true,
        data: data.rows[0] || {
          salons_total: 0,
          masters_total: 0,
          clients_total: 0,
          bookings_today: 0,
          revenue_today: 0,
          payouts_total: 0,
        },
        meta: {},
      });
    } catch (error) {
      console.error("ADMIN_OVERVIEW_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OVERVIEW_FETCH_FAILED",
      });
    }
  });

  r.post("/salons/:id/action", async (req, res) => {
    const id = Number(req.params.id);
    const action = String(req.body?.action || "").trim();
    const reason = String(req.body?.reason || "").trim();

    if (action !== "suspend" && action !== "unsuspend") {
      return res.status(400).json({
        ok: false,
        error: "ADMIN_ACTION_INVALID",
      });
    }

    const db = await pool.connect();

    try {
      await db.query("BEGIN");

      const beforeResult = await db.query(
        `
        SELECT id, slug, name, enabled, status
        FROM public.salons
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
        `,
        [id],
      );
      const before = beforeResult.rows?.[0] || null;

      if (!before) {
        await db.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          error: "ADMIN_SALON_NOT_FOUND",
        });
      }

      const updateResult = await db.query(
        action === "suspend"
          ? `
            UPDATE public.salons
            SET enabled=false, status='suspended'
            WHERE id=$1
            RETURNING id, slug, name, enabled, status
            `
          : `
            UPDATE public.salons
            SET enabled=true, status='active'
            WHERE id=$1
            RETURNING id, slug, name, enabled, status
            `,
        [id],
      );
      const entity = updateResult.rows?.[0] || null;
      const auditAction = action === "suspend" ? "entity_suspended" : "entity_unsuspended";

      await db.query(
        `
        INSERT INTO public.audit_logs (entity_type, entity_id, action, data)
        VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          "salon",
          id,
          auditAction,
          JSON.stringify({
            source: "admin_control",
            entity_type: "salon",
            entity_id: id,
            action,
            reason,
            actor_user_id: req.auth?.user_id ?? null,
            before,
            after: entity,
          }),
        ],
      );

      await db.query("COMMIT");

      return res.json({
        ok: true,
        data: {
          entity,
          audit_action: auditAction,
        },
      });
    } catch (error) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackError) {}

      console.error("ADMIN_SALON_ACTION_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_SALON_ACTION_FAILED",
      });
    } finally {
      db.release();
    }
  });

  r.post("/masters/:id/action", async (req, res) => {
    const id = Number(req.params.id);
    const action = String(req.body?.action || "").trim();
    const reason = String(req.body?.reason || "").trim();

    if (action !== "suspend" && action !== "unsuspend") {
      return res.status(400).json({
        ok: false,
        error: "ADMIN_ACTION_INVALID",
      });
    }

    const db = await pool.connect();

    try {
      await db.query("BEGIN");

      const beforeResult = await db.query(
        `
        SELECT id, slug, name, active
        FROM public.masters
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
        `,
        [id],
      );
      const before = beforeResult.rows?.[0] || null;

      if (!before) {
        await db.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          error: "ADMIN_MASTER_NOT_FOUND",
        });
      }

      const updateResult = await db.query(
        action === "suspend"
          ? `
            UPDATE public.masters
            SET active=false
            WHERE id=$1
            RETURNING id, slug, name, active
            `
          : `
            UPDATE public.masters
            SET active=true
            WHERE id=$1
            RETURNING id, slug, name, active
            `,
        [id],
      );
      const entity = updateResult.rows?.[0] || null;
      const auditAction = action === "suspend" ? "entity_suspended" : "entity_unsuspended";

      await db.query(
        `
        INSERT INTO public.audit_logs (entity_type, entity_id, action, data)
        VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          "master",
          id,
          auditAction,
          JSON.stringify({
            source: "admin_control",
            entity_type: "master",
            entity_id: id,
            action,
            reason,
            actor_user_id: req.auth?.user_id ?? null,
            before,
            after: entity,
          }),
        ],
      );

      await db.query("COMMIT");

      return res.json({
        ok: true,
        data: {
          entity,
          audit_action: auditAction,
        },
      });
    } catch (error) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackError) {}

      console.error("ADMIN_MASTER_ACTION_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_MASTER_ACTION_FAILED",
      });
    } finally {
      db.release();
    }
  });

  return r;
}
