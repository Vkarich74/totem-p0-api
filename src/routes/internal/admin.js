import express from "express";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeAuditEntityType(value) {
  const raw = String(value ?? "").trim().toLowerCase();

  if (raw === "salons") return "salon";
  if (raw === "masters") return "master";
  if (raw === "clients") return "client";
  if (raw === "bookings") return "booking";

  return raw;
}

function normalizeOptionalText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : "";
}

function normalizeOptionalBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function buildWhereClause(filters) {
  const clauses = [];
  const values = [];

  for (const filter of Array.isArray(filters) ? filters : []) {
    if (!filter || !filter.enabled) {
      continue;
    }

    values.push(filter.value);
    clauses.push(String(filter.sql || "").replace("?", `$${values.length}`));
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function normalizeJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function buildMobileCrmSourceConfig(sourceType) {
  if (sourceType === "feedback") {
    return {
      table: "public.mobile_feedback_requests",
      selectRequestTypeExpression: "NULL::text AS request_type",
      notFoundError: "MOBILE_FEEDBACK_NOT_FOUND",
      routeError: "MOBILE_FEEDBACK_ROUTE_CRM_FAILED",
      idempotencyPrefix: "mobile_feedback",
      runtimePrefix: "mobile_feedback",
      messageRuntimePrefix: "mobile_feedback_message",
    };
  }

  return {
    table: "public.mobile_data_requests",
    selectRequestTypeExpression: "request_type",
    notFoundError: "MOBILE_DATA_REQUEST_NOT_FOUND",
    routeError: "MOBILE_DATA_REQUEST_ROUTE_CRM_FAILED",
    idempotencyPrefix: "mobile_data_request",
    runtimePrefix: "mobile_data_request",
    messageRuntimePrefix: "mobile_data_request_message",
  };
}

function buildMobileCrmLeadData(sourceType, sourceRow, runtimeId, nowIso, sourcePayloadJson) {
  const base = {
    id: runtimeId,
    lead_type: "client",
    status: "new",
    name:
      sourceRow?.contact_name ||
      (sourceType === "feedback"
        ? `Mobile feedback #${sourceRow.id}`
        : `Mobile data request #${sourceRow.id}`),
    phone: sourceRow?.contact_phone || "",
    email: sourceRow?.contact_email || "",
    assigned_to: "admin",
    notes_count: 1,
    mobile_request: {
      type: sourceType,
      id: sourceRow.id,
      request_uid: sourceRow.request_uid,
      country_code: sourceRow.country_code || null,
      city_slug: sourceRow.city_slug || null,
      owner_type: sourceRow.owner_type || null,
      owner_slug: sourceRow.owner_slug || null,
      message: sourceRow.message || "",
      payload_json: sourcePayloadJson,
      created_at: nowIso,
      updated_at: nowIso,
    },
    created_at: nowIso,
    updated_at: nowIso,
  };

  if (sourceType === "data_request") {
    base.source = "mobile_data_request";
    base.mobile_request.request_type = sourceRow.request_type || "data_access";
  } else {
    base.source = "mobile_feedback";
  }

  return base;
}

function buildMobileCrmMessageData(sourceType, sourceRow, leadRuntimeId, messageRuntimeId, nowIso, sourcePayloadJson) {
  return {
    id: messageRuntimeId,
    status: "queued",
    channel: "internal",
    recipient_type: "lead",
    recipient_id: leadRuntimeId,
    lead_id: leadRuntimeId,
    subject: sourceType === "feedback" ? "Mobile feedback" : "Mobile data request",
    body: sourceRow?.message || "",
    source: "admin_mobile_route_crm",
    mobile_request: {
      type: sourceType,
      id: sourceRow.id,
      request_uid: sourceRow.request_uid,
      request_type: sourceType === "data_request" ? sourceRow.request_type || "data_access" : undefined,
      country_code: sourceRow.country_code || null,
      city_slug: sourceRow.city_slug || null,
      owner_type: sourceRow.owner_type || null,
      owner_slug: sourceRow.owner_slug || null,
      message: sourceRow.message || "",
      payload_json: sourcePayloadJson,
      created_at: nowIso,
      updated_at: nowIso,
    },
    created_at: nowIso,
    updated_at: nowIso,
  };
}

async function routeMobileRequestToCrm(db, sourceType, sourceId) {
  const config = buildMobileCrmSourceConfig(sourceType);
  const nowIso = new Date().toISOString();

  const sourceResult = await db.query(
    `
    SELECT
      id,
      request_uid,
      ${config.selectRequestTypeExpression},
      status,
      source,
      country_code,
      city_slug,
      owner_type,
      owner_slug,
      contact_name,
      contact_email,
      contact_phone,
      message,
      payload_json,
      created_at,
      updated_at
    FROM ${config.table}
    WHERE id = $1
    LIMIT 1
    FOR UPDATE
    `,
    [sourceId],
  );

  const sourceRow = sourceResult.rows?.[0] || null;

  if (!sourceRow) {
    return {
      notFound: true,
      error: config.notFoundError,
    };
  }

  const sourcePayloadJson = normalizeJsonObject(sourceRow.payload_json);
  const leadIdempotencyKey = `${config.idempotencyPrefix}:${sourceRow.id}:crm`;
  const messageIdempotencyKey = `${config.idempotencyPrefix}:${sourceRow.id}:crm_message`;
  const leadRuntimeId = `${config.runtimePrefix}_${sourceRow.id}`;
  const messageRuntimeId = `${config.messageRuntimePrefix}_${sourceRow.id}`;

  const leadData = buildMobileCrmLeadData(sourceType, sourceRow, leadRuntimeId, nowIso, sourcePayloadJson);
  const messageData = buildMobileCrmMessageData(sourceType, sourceRow, leadRuntimeId, messageRuntimeId, nowIso, sourcePayloadJson);

  const existingLeadResult = await db.query(
    `
    SELECT id, idempotency_key, data
    FROM public.leads
    WHERE idempotency_key = $1
    LIMIT 1
    `,
    [leadIdempotencyKey],
  );

  let leadRow = existingLeadResult.rows?.[0] || null;
  let leadCreated = false;

  if (!leadRow) {
    const insertedLeadResult = await db.query(
      `
      INSERT INTO public.leads (status, idempotency_key, data)
      VALUES ($1, $2, $3::jsonb)
      RETURNING id, idempotency_key, data
      `,
      ["new", leadIdempotencyKey, JSON.stringify(leadData)],
    );

    leadRow = insertedLeadResult.rows?.[0] || null;
    leadCreated = true;
  }

  const leadDbId = leadRow?.id || null;
  const leadRuntimeValue = String(normalizeJsonObject(leadRow?.data).id || leadRuntimeId);

  const existingMessageResult = await db.query(
    `
    SELECT id, lead_id, idempotency_key, data
    FROM public.messages
    WHERE idempotency_key = $1
    LIMIT 1
    `,
    [messageIdempotencyKey],
  );

  let messageRow = existingMessageResult.rows?.[0] || null;
  let messageCreated = false;

  if (!messageRow) {
    const insertedMessageResult = await db.query(
      `
      INSERT INTO public.messages (
        lead_id,
        moderation_case_id,
        status,
        idempotency_key,
        data
      )
      VALUES ($1, NULL, $2, $3, $4::jsonb)
      RETURNING id, lead_id, idempotency_key, data
      `,
      [leadDbId, "queued", messageIdempotencyKey, JSON.stringify(messageData)],
    );

    messageRow = insertedMessageResult.rows?.[0] || null;
    messageCreated = true;
  }

  const messageDbId = messageRow?.id || null;
  const messageRuntimeValue = String(normalizeJsonObject(messageRow?.data).id || messageRuntimeId);
  const routingStatus = leadCreated || messageCreated ? "created" : "existing";

  const routingPayload = {
    lead_db_id: leadDbId,
    lead_runtime_id: leadRuntimeValue,
    message_db_id: messageDbId,
    message_runtime_id: messageRuntimeValue,
    routed_at: nowIso,
    routed_by: "admin_mobile",
    routing_status: routingStatus,
  };

  await db.query(
    `
    UPDATE ${config.table}
    SET payload_json = jsonb_set(
          COALESCE(payload_json, '{}'::jsonb) || '{"routing": {}}'::jsonb,
          '{routing,crm}',
          $2::jsonb,
          true
        ),
        updated_at = NOW()
    WHERE id = $1
    `,
    [sourceRow.id, JSON.stringify(routingPayload)],
  );

  return {
    source_type: sourceType,
    source_id: sourceRow.id,
    lead: {
      id: leadDbId,
      runtime_id: leadRuntimeValue,
      created: leadCreated,
    },
    message: {
      id: messageDbId,
      runtime_id: messageRuntimeValue,
      created: messageCreated,
    },
    routing: routingPayload,
  };
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
            m.active,
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
          mp.active,
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

  r.get("/clients/:id/audit", readLimiter, async (req, res) => {
    const clientId = Number(req.params.id);
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
    const offset = parsePositiveInt(req.query.offset, 0);

    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({
        ok: false,
        error: "ADMIN_CLIENT_ID_INVALID",
      });
    }

    try {
      const data = await pool.query(
        `
        SELECT
          id,
          client_id,
          booking_id,
          actor_type,
          actor_id,
          action,
          metadata,
          created_at
        FROM public.client_audit_events
        WHERE client_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
        OFFSET $3
        `,
        [clientId, limit, offset],
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
      console.error("ADMIN_CLIENT_AUDIT_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_CLIENT_AUDIT_FETCH_FAILED",
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

  r.get("/mobile/overview", readLimiter, async (req, res) => {
    try {
      const [
        feedbackTotalResult,
        feedbackByStatusResult,
        dataRequestsTotalResult,
        dataRequestsByStatusResult,
        dataRequestsByTypeResult,
        flagsTotalResult,
        flagsActiveResult,
        flagsEnabledResult,
        flagsItemsResult,
        referralsLinksTotalResult,
        referralsEventsTotalResult,
        referralsEventsByTypeResult,
        referralsRewardsByStatusResult,
        notificationsTotalResult,
        notificationsByStatusResult,
        announcementsTotalResult,
        announcementsByStatusResult,
        recentFeedbackResult,
        recentDataRequestsResult,
        recentReferralEventsResult,
      ] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS total_count FROM public.mobile_feedback_requests`),
        pool.query(`
          SELECT
            COALESCE(status, 'unknown') AS status,
            COUNT(*)::int AS count
          FROM public.mobile_feedback_requests
          GROUP BY COALESCE(status, 'unknown')
          ORDER BY status ASC
        `),
        pool.query(`SELECT COUNT(*)::int AS total_count FROM public.mobile_data_requests`),
        pool.query(`
          SELECT
            COALESCE(status, 'unknown') AS status,
            COUNT(*)::int AS count
          FROM public.mobile_data_requests
          GROUP BY COALESCE(status, 'unknown')
          ORDER BY status ASC
        `),
        pool.query(`
          SELECT
            COALESCE(request_type, 'unknown') AS request_type,
            COUNT(*)::int AS count
          FROM public.mobile_data_requests
          GROUP BY COALESCE(request_type, 'unknown')
          ORDER BY request_type ASC
        `),
        pool.query(`SELECT COUNT(*)::int AS total_count FROM public.mobile_feature_flags`),
        pool.query(`
          SELECT COUNT(*)::int AS active_count
          FROM public.mobile_feature_flags
          WHERE status IN ('active', 'enabled')
        `),
        pool.query(`
          SELECT COUNT(*)::int AS enabled_count
          FROM public.mobile_feature_flags
          WHERE enabled = true
        `),
        pool.query(`
          SELECT
            id,
            flag_key,
            scope_type,
            scope_code,
            enabled,
            status,
            payload_json,
            description_ru,
            description_en,
            created_at,
            updated_at
          FROM public.mobile_feature_flags
          ORDER BY flag_key ASC, scope_type ASC, scope_code ASC
        `),
        pool.query(`SELECT COUNT(*)::int AS links_total FROM public.referral_links`),
        pool.query(`SELECT COUNT(*)::int AS events_total FROM public.referral_events`),
        pool.query(`
          SELECT
            COALESCE(event_type, 'unknown') AS event_type,
            COUNT(*)::int AS count
          FROM public.referral_events
          GROUP BY COALESCE(event_type, 'unknown')
          ORDER BY event_type ASC
        `),
        pool.query(`
          SELECT
            COALESCE(reward_status, 'unknown') AS reward_status,
            COUNT(*)::int AS count
          FROM public.referral_events
          GROUP BY COALESCE(reward_status, 'unknown')
          ORDER BY reward_status ASC
        `),
        pool.query(`SELECT COUNT(*)::int AS total_count FROM public.app_notifications`),
        pool.query(`
          SELECT
            COALESCE(status, 'unknown') AS status,
            COUNT(*)::int AS count
          FROM public.app_notifications
          GROUP BY COALESCE(status, 'unknown')
          ORDER BY status ASC
        `),
        pool.query(`SELECT COUNT(*)::int AS total_count FROM public.app_announcements`),
        pool.query(`
          SELECT
            COALESCE(status, 'unknown') AS status,
            COUNT(*)::int AS count
          FROM public.app_announcements
          GROUP BY COALESCE(status, 'unknown')
          ORDER BY status ASC
        `),
        pool.query(`
          SELECT
            id,
            request_uid,
            status,
            source,
            country_code,
            city_slug,
            owner_type,
            owner_slug,
            contact_name,
            contact_email,
            contact_phone,
            message,
            payload_json,
            created_at,
            updated_at
          FROM public.mobile_feedback_requests
          ORDER BY created_at DESC, id DESC
          LIMIT 10
        `),
        pool.query(`
          SELECT
            id,
            request_uid,
            request_type,
            status,
            source,
            country_code,
            city_slug,
            owner_type,
            owner_slug,
            contact_name,
            contact_email,
            contact_phone,
            message,
            payload_json,
            created_at,
            updated_at
          FROM public.mobile_data_requests
          ORDER BY created_at DESC, id DESC
          LIMIT 10
        `),
        pool.query(`
          SELECT
            id,
            event_uid,
            referral_link_id,
            referral_code,
            event_type,
            actor_type,
            actor_id,
            target_type,
            target_id,
            owner_type,
            owner_id,
            country_code,
            city_id,
            status,
            reward_status,
            reward_amount,
            currency_code,
            payload_json,
            created_at
          FROM public.referral_events
          ORDER BY created_at DESC, id DESC
          LIMIT 10
        `),
      ]);

      return res.json({
        ok: true,
        data: {
          feedback: {
            total_count: feedbackTotalResult.rows?.[0]?.total_count || 0,
            by_status: feedbackByStatusResult.rows || [],
          },
          data_requests: {
            total_count: dataRequestsTotalResult.rows?.[0]?.total_count || 0,
            by_status: dataRequestsByStatusResult.rows || [],
            by_request_type: dataRequestsByTypeResult.rows || [],
          },
          flags: {
            total_count: flagsTotalResult.rows?.[0]?.total_count || 0,
            active_count: flagsActiveResult.rows?.[0]?.active_count || 0,
            enabled_count: flagsEnabledResult.rows?.[0]?.enabled_count || 0,
            items: flagsItemsResult.rows || [],
          },
          referrals: {
            links_total: referralsLinksTotalResult.rows?.[0]?.links_total || 0,
            events_total: referralsEventsTotalResult.rows?.[0]?.events_total || 0,
            events_by_type: referralsEventsByTypeResult.rows || [],
            rewards_by_status: referralsRewardsByStatusResult.rows || [],
          },
          notifications: {
            total_count: notificationsTotalResult.rows?.[0]?.total_count || 0,
            by_status: notificationsByStatusResult.rows || [],
          },
          announcements: {
            total_count: announcementsTotalResult.rows?.[0]?.total_count || 0,
            by_status: announcementsByStatusResult.rows || [],
          },
          recent_feedback: recentFeedbackResult.rows || [],
          recent_data_requests: recentDataRequestsResult.rows || [],
          recent_referral_events: recentReferralEventsResult.rows || [],
        },
      });
    } catch (error) {
      console.error("ADMIN_MOBILE_OVERVIEW_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_MOBILE_OVERVIEW_FETCH_FAILED",
      });
    }
  });

  r.get("/mobile/feedback", readLimiter, async (req, res) => {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 100);
    const offset = parsePositiveInt(req.query.offset, 0);
    const status = normalizeOptionalText(req.query.status, 32).toLowerCase();
    const countryCode = normalizeOptionalText(req.query.country, 2).toUpperCase();
    const citySlug = normalizeOptionalText(req.query.city, 120).toLowerCase();

    try {
      const { whereSql, values } = buildWhereClause([
        { enabled: Boolean(status), sql: "status = ?", value: status },
        { enabled: Boolean(countryCode), sql: "country_code = ?", value: countryCode },
        { enabled: Boolean(citySlug), sql: "city_slug = ?", value: citySlug },
      ]);

      const totalResult = await pool.query(
        `SELECT COUNT(*)::int AS total_count FROM public.mobile_feedback_requests ${whereSql}`,
        values,
      );

      const data = await pool.query(
        `
        SELECT
          id,
          request_uid,
          status,
          source,
          country_code,
          city_slug,
          owner_type,
          owner_slug,
          contact_name,
          contact_email,
          contact_phone,
          message,
          payload_json,
          created_at,
          updated_at
        FROM public.mobile_feedback_requests
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
        `,
        [...values, limit, offset],
      );

      return res.json({
        ok: true,
        data: {
          items: data.rows,
          total_count: totalResult.rows?.[0]?.total_count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error("ADMIN_MOBILE_FEEDBACK_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_MOBILE_FEEDBACK_FETCH_FAILED",
      });
    }
  });

  r.patch("/mobile/feedback/:id/status", async (req, res) => {
    const id = Number(req.params.id);
    const status = normalizeOptionalText(req.body?.status, 32).toLowerCase();

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        error: "MOBILE_FEEDBACK_ID_INVALID",
      });
    }

    if (!["new", "reviewed", "closed", "spam"].includes(status)) {
      return res.status(400).json({
        ok: false,
        error: "MOBILE_FEEDBACK_STATUS_INVALID",
      });
    }

    try {
      const data = await pool.query(
        `
        UPDATE public.mobile_feedback_requests
        SET status = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, request_uid, status, created_at, updated_at
        `,
        [id, status],
      );

      if (!data.rows.length) {
        return res.status(404).json({
          ok: false,
          error: "MOBILE_FEEDBACK_NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
        data: {
          item: data.rows[0],
        },
      });
    } catch (error) {
      console.error("ADMIN_MOBILE_FEEDBACK_STATUS_UPDATE_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "MOBILE_FEEDBACK_STATUS_UPDATE_FAILED",
      });
    }
  });

  r.get("/mobile/data-requests", readLimiter, async (req, res) => {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 100);
    const offset = parsePositiveInt(req.query.offset, 0);
    const status = normalizeOptionalText(req.query.status, 32).toLowerCase();
    const countryCode = normalizeOptionalText(req.query.country, 2).toUpperCase();
    const citySlug = normalizeOptionalText(req.query.city, 120).toLowerCase();
    const requestType = normalizeOptionalText(req.query.request_type, 32).toLowerCase();

    try {
      const { whereSql, values } = buildWhereClause([
        { enabled: Boolean(status), sql: "status = ?", value: status },
        { enabled: Boolean(countryCode), sql: "country_code = ?", value: countryCode },
        { enabled: Boolean(citySlug), sql: "city_slug = ?", value: citySlug },
        { enabled: Boolean(requestType), sql: "request_type = ?", value: requestType },
      ]);

      const totalResult = await pool.query(
        `SELECT COUNT(*)::int AS total_count FROM public.mobile_data_requests ${whereSql}`,
        values,
      );

      const data = await pool.query(
        `
        SELECT
          id,
          request_uid,
          request_type,
          status,
          source,
          country_code,
          city_slug,
          owner_type,
          owner_slug,
          contact_name,
          contact_email,
          contact_phone,
          message,
          payload_json,
          created_at,
          updated_at
        FROM public.mobile_data_requests
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
        `,
        [...values, limit, offset],
      );

      return res.json({
        ok: true,
        data: {
          items: data.rows,
          total_count: totalResult.rows?.[0]?.total_count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error("ADMIN_MOBILE_DATA_REQUESTS_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_MOBILE_DATA_REQUESTS_FETCH_FAILED",
      });
    }
  });

  r.patch("/mobile/data-requests/:id/status", async (req, res) => {
    const id = Number(req.params.id);
    const status = normalizeOptionalText(req.body?.status, 32).toLowerCase();

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        error: "MOBILE_DATA_REQUEST_ID_INVALID",
      });
    }

    if (!["new", "reviewed", "closed", "spam"].includes(status)) {
      return res.status(400).json({
        ok: false,
        error: "MOBILE_DATA_REQUEST_STATUS_INVALID",
      });
    }

    try {
      const data = await pool.query(
        `
        UPDATE public.mobile_data_requests
        SET status = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, request_uid, request_type, status, created_at, updated_at
        `,
        [id, status],
      );

      if (!data.rows.length) {
        return res.status(404).json({
          ok: false,
          error: "MOBILE_DATA_REQUEST_NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
        data: {
          item: data.rows[0],
        },
      });
    } catch (error) {
      console.error("ADMIN_MOBILE_DATA_REQUEST_STATUS_UPDATE_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "MOBILE_DATA_REQUEST_STATUS_UPDATE_FAILED",
      });
    }
  });

  r.post("/mobile/feedback/:id/route-crm", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        error: "MOBILE_FEEDBACK_ID_INVALID",
      });
    }

    const db = await pool.connect();

    try {
      await db.query("BEGIN");

      const result = await routeMobileRequestToCrm(db, "feedback", id);

      if (result?.notFound) {
        await db.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          error: "MOBILE_FEEDBACK_NOT_FOUND",
        });
      }

      await db.query("COMMIT");

      return res.json({
        ok: true,
        data: result,
      });
    } catch (error) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackError) {}

      console.error("ADMIN_MOBILE_FEEDBACK_ROUTE_CRM_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "MOBILE_FEEDBACK_ROUTE_CRM_FAILED",
      });
    } finally {
      db.release();
    }
  });

  r.post("/mobile/data-requests/:id/route-crm", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        error: "MOBILE_DATA_REQUEST_ID_INVALID",
      });
    }

    const db = await pool.connect();

    try {
      await db.query("BEGIN");

      const result = await routeMobileRequestToCrm(db, "data_request", id);

      if (result?.notFound) {
        await db.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          error: "MOBILE_DATA_REQUEST_NOT_FOUND",
        });
      }

      await db.query("COMMIT");

      return res.json({
        ok: true,
        data: result,
      });
    } catch (error) {
      try {
        await db.query("ROLLBACK");
      } catch (rollbackError) {}

      console.error("ADMIN_MOBILE_DATA_REQUEST_ROUTE_CRM_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "MOBILE_DATA_REQUEST_ROUTE_CRM_FAILED",
      });
    } finally {
      db.release();
    }
  });

  r.get("/mobile/referrals", readLimiter, async (req, res) => {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 100);
    const offset = parsePositiveInt(req.query.offset, 0);
    const status = normalizeOptionalText(req.query.status, 32).toLowerCase();
    const countryCode = normalizeOptionalText(req.query.country, 2).toUpperCase();
    const channel = normalizeOptionalText(req.query.channel, 32).toLowerCase();

    try {
      const { whereSql, values } = buildWhereClause([
        { enabled: Boolean(status), sql: "status = ?", value: status },
        { enabled: Boolean(countryCode), sql: "country_code = ?", value: countryCode },
        { enabled: Boolean(channel), sql: "channel = ?", value: channel },
      ]);

      const totalResult = await pool.query(
        `SELECT COUNT(*)::int AS total_count FROM public.referral_links ${whereSql}`,
        values,
      );

      const data = await pool.query(
        `
        SELECT
          id,
          referral_code,
          owner_type,
          owner_id,
          country_code,
          city_id,
          channel,
          status,
          used_count,
          starts_at,
          expires_at,
          max_uses,
          created_at,
          updated_at
        FROM public.referral_links
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
        `,
        [...values, limit, offset],
      );

      return res.json({
        ok: true,
        data: {
          items: data.rows,
          total_count: totalResult.rows?.[0]?.total_count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error("ADMIN_MOBILE_REFERRALS_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_MOBILE_REFERRALS_FETCH_FAILED",
      });
    }
  });

  r.get("/mobile/referral-events", readLimiter, async (req, res) => {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 100);
    const offset = parsePositiveInt(req.query.offset, 0);
    const eventType = normalizeOptionalText(req.query.event_type, 64).toLowerCase();
    const rewardStatus = normalizeOptionalText(req.query.reward_status, 64).toLowerCase();
    const countryCode = normalizeOptionalText(req.query.country, 2).toUpperCase();

    try {
      const { whereSql, values } = buildWhereClause([
        { enabled: Boolean(eventType), sql: "event_type = ?", value: eventType },
        { enabled: Boolean(rewardStatus), sql: "reward_status = ?", value: rewardStatus },
        { enabled: Boolean(countryCode), sql: "country_code = ?", value: countryCode },
      ]);

      const totalResult = await pool.query(
        `SELECT COUNT(*)::int AS total_count FROM public.referral_events ${whereSql}`,
        values,
      );

      const data = await pool.query(
        `
        SELECT
          id,
          event_uid,
          referral_link_id,
          referral_code,
          event_type,
          actor_type,
          actor_id,
          target_type,
          target_id,
          owner_type,
          owner_id,
          country_code,
          city_id,
          status,
          reward_status,
          reward_amount,
          currency_code,
          payload_json,
          created_at
        FROM public.referral_events
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
        `,
        [...values, limit, offset],
      );

      return res.json({
        ok: true,
        data: {
          items: data.rows,
          total_count: totalResult.rows?.[0]?.total_count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error("ADMIN_MOBILE_REFERRAL_EVENTS_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_MOBILE_REFERRAL_EVENTS_FETCH_FAILED",
      });
    }
  });

  r.get("/mobile/flags", readLimiter, async (req, res) => {
    try {
      const data = await pool.query(
        `
        SELECT
          id,
          flag_key,
          scope_type,
          scope_code,
          enabled,
          status,
          payload_json,
          description_ru,
          description_en,
          created_at,
          updated_at
        FROM public.mobile_feature_flags
        ORDER BY flag_key ASC, scope_type ASC, scope_code ASC
        `,
      );

      return res.json({
        ok: true,
        data: {
          items: data.rows,
        },
      });
    } catch (error) {
      console.error("ADMIN_MOBILE_FLAGS_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_MOBILE_FLAGS_FETCH_FAILED",
      });
    }
  });

  r.patch("/mobile/flags/:flagKey", async (req, res) => {
    const flagKey = normalizeOptionalText(req.params.flagKey, 120);
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const enabled = normalizeOptionalBoolean(body.enabled);
    const statusRaw = normalizeOptionalText(body.status, 32).toLowerCase();
    const scopeType = normalizeOptionalText(body.scope_type, 80).toLowerCase() || "global";
    const scopeCode = normalizeOptionalText(body.scope_code, 160) || "global";

    if (!flagKey) {
      return res.status(400).json({
        ok: false,
        error: "MOBILE_FLAG_KEY_INVALID",
      });
    }

    if (body.enabled !== undefined && enabled === null) {
      return res.status(400).json({
        ok: false,
        error: "MOBILE_FLAG_ENABLED_INVALID",
      });
    }

    if (body.status !== undefined && !["active", "planned", "disabled"].includes(statusRaw)) {
      return res.status(400).json({
        ok: false,
        error: "MOBILE_FLAG_STATUS_INVALID",
      });
    }

    const updates = [];
    const values = [];

    if (body.enabled !== undefined) {
      values.push(enabled);
      updates.push(`enabled = $${values.length}`);
    }

    if (body.status !== undefined) {
      values.push(statusRaw);
      updates.push(`status = $${values.length}`);
    }

    updates.push(`updated_at = NOW()`);

    try {
      const data = await pool.query(
        `
        UPDATE public.mobile_feature_flags
        SET ${updates.join(", ")}
        WHERE flag_key = $${values.push(flagKey)}
          AND scope_type = $${values.push(scopeType)}
          AND scope_code = $${values.push(scopeCode)}
        RETURNING id, flag_key, scope_type, scope_code, enabled, status, payload_json, description_ru, description_en, created_at, updated_at
        `,
        values,
      );

      if (!data.rows.length) {
        return res.status(404).json({
          ok: false,
          error: "MOBILE_FLAG_NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
        data: {
          item: data.rows[0],
        },
      });
    } catch (error) {
      console.error("ADMIN_MOBILE_FLAG_UPDATE_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "MOBILE_FLAG_UPDATE_FAILED",
      });
    }
  });

  r.get("/audit", readLimiter, async (req, res) => {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
    const offset = parsePositiveInt(req.query.offset, 0);
    const entityType = normalizeAuditEntityType(req.query.entity_type);
    const entityIdRaw = req.query.entity_id;
    const action = String(req.query.action ?? "").trim();

    const where = [];
    const values = [];

    if (entityType) {
      values.push(entityType);
      where.push(`entity_type = $${values.length}`);
    }

    if (entityIdRaw !== undefined && entityIdRaw !== null && String(entityIdRaw).trim() !== "") {
      const entityId = Number(entityIdRaw);

      if (!Number.isInteger(entityId) || entityId <= 0) {
        return res.status(400).json({
          ok: false,
          error: "ADMIN_AUDIT_ENTITY_ID_INVALID",
        });
      }

      values.push(entityId);
      where.push(`entity_id = $${values.length}`);
    }

    if (action) {
      values.push(action);
      where.push(`action = $${values.length}`);
    }

    values.push(limit);
    const limitIndex = values.length;

    values.push(offset);
    const offsetIndex = values.length;

    try {
      const data = await pool.query(
        `
        SELECT
          id,
          entity_type,
          entity_id,
          action,
          data,
          created_at
        FROM public.audit_logs
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC, id DESC
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
        `,
        values,
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
      console.error("ADMIN_AUDIT_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_AUDIT_FETCH_FAILED",
      });
    }
  });

  r.get("/audit/:entityType/:entityId", readLimiter, async (req, res) => {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
    const offset = parsePositiveInt(req.query.offset, 0);
    const entityType = normalizeAuditEntityType(req.params.entityType);
    const entityId = Number(req.params.entityId);

    if (!entityType) {
      return res.status(400).json({
        ok: false,
        error: "ADMIN_AUDIT_ENTITY_TYPE_INVALID",
      });
    }

    if (!Number.isInteger(entityId) || entityId <= 0) {
      return res.status(400).json({
        ok: false,
        error: "ADMIN_AUDIT_ENTITY_ID_INVALID",
      });
    }

    try {
      const data = await pool.query(
        `
        SELECT
          id,
          entity_type,
          entity_id,
          action,
          data,
          created_at
        FROM public.audit_logs
        WHERE entity_type = $1
          AND entity_id = $2
        ORDER BY created_at DESC, id DESC
        LIMIT $3
        OFFSET $4
        `,
        [entityType, entityId, limit, offset],
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
      console.error("ADMIN_AUDIT_ENTITY_FETCH_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_AUDIT_ENTITY_FETCH_FAILED",
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
