import express from "express";
import { pool } from "../db.js";

const router = express.Router();

function normalizeMobileRequestBody(req) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
}

function normalizeMobileSource(value) {
  const source = String(value || "").trim().toLowerCase();
  return ["mobile", "pwa", "web"].includes(source) ? source : "mobile";
}

function normalizeMobileCountry(value) {
  const country = String(value || "").trim().toUpperCase();
  return country ? country.slice(0, 2) : null;
}

function normalizeMobileCity(value) {
  const city = String(value || "").trim().toLowerCase();
  if (!city) {
    return null;
  }

  return city.slice(0, 120);
}

function normalizeMobileOwnerType(value) {
  const ownerType = String(value || "").trim().toLowerCase();
  return ["salon", "master"].includes(ownerType) ? ownerType : null;
}

function normalizeMobileText(value, maxLength) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeMobileEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email ? email.slice(0, 200) : null;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MOBILE_PAYLOAD_BLOCKLIST_KEYS = new Set([
  "email",
  "phone",
  "name",
  "contact_email",
  "contact_phone",
  "contact_name",
  "client_name",
  "client_phone",
  "address",
  "token",
  "password",
  "authorization",
  "bearer",
  "card",
  "bank",
  "account",
]);

// Public mobile payload_json must not store direct contact/payment/auth identifiers. Contact fields are stored only in explicit contact_* columns where required.
function isBlockedMobilePayloadKey(key) {
  const normalizedKey = String(key || "").trim().toLowerCase();

  if (MOBILE_PAYLOAD_BLOCKLIST_KEYS.has(normalizedKey)) {
    return true;
  }

  return [
    "token",
    "password",
    "authorization",
    "bearer",
    "secret",
    "card",
    "bank",
    "account",
  ].some((fragment) => normalizedKey.includes(fragment));
}

function sanitizeMobilePayloadValue(value, depth = 0, maxDepth = 4) {
  if (depth > maxDepth) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const valueType = typeof value;

  if (valueType === "string") {
    return value;
  }

  if (valueType === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (valueType === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const sanitized = [];

    for (const item of value) {
      const nextValue = sanitizeMobilePayloadValue(item, depth + 1, maxDepth);
      if (nextValue !== undefined) {
        sanitized.push(nextValue);
      }
    }

    return sanitized;
  }

  const isPlainObject =
    value !== null &&
    valueType === "object" &&
    Object.prototype.toString.call(value) === "[object Object]";

  if (!isPlainObject) {
    return undefined;
  }

  const sanitized = {};

  for (const [key, nextValue] of Object.entries(value)) {
    if (isBlockedMobilePayloadKey(key)) {
      continue;
    }

    const sanitizedValue = sanitizeMobilePayloadValue(nextValue, depth + 1, maxDepth);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  }

  return sanitized;
}

function normalizeMobilePayloadJson(value, sourceValue) {
  const isPlainObject =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]";

  if (!isPlainObject) {
    return {
      error: null,
      payload: {},
    };
  }

  const payload = sanitizeMobilePayloadValue(value, 0, 4) || {};
  const normalizedSource = normalizeMobileSource(sourceValue || payload.source);
  const payloadWithMeta = {
    ...payload,
    source: normalizedSource,
    privacy_version: "mobile_privacy_v1",
    taxonomy_version: "mobile_taxonomy_v1",
    pii_sanitized: true,
  };
  const payloadString = JSON.stringify(payloadWithMeta);

  if (payloadString.length > 2000) {
    return {
      error: "PAYLOAD_TOO_LARGE",
      payload: null,
    };
  }

  return {
    error: null,
    payload: payloadWithMeta,
  };
}

const MOBILE_NOTIFICATION_READER_TYPES = new Set([
  "client",
  "salon",
  "master",
  "salon_admin",
  "master_admin",
  "owner",
  "auth_user",
]);

function isAllowedMobileNotificationReaderType(value) {
  return MOBILE_NOTIFICATION_READER_TYPES.has(String(value || "").trim().toLowerCase());
}

function buildReferralEventDedupMeta(payloadJson, referralCode, eventType, countryCode, citySlug, source, dateBucket) {
  const contextCandidates = [
    payloadJson?.request_uid,
    payloadJson?.booking_uid,
    payloadJson?.booking_id,
    payloadJson?.client_uid,
    payloadJson?.session_id,
  ];
  const contextKey = contextCandidates.find((value) => String(value || "").trim()) || "daily";
  const referralEventKey = [
    String(referralCode || "").trim(),
    String(eventType || "").trim(),
    String(countryCode || "").trim() || "global",
    String(citySlug || "").trim() || "global",
    String(source || "").trim() || "mobile",
    String(dateBucket || "").trim(),
    String(contextKey || "").trim(),
  ].join(":");

  return {
    contextKey,
    referralEventKey,
  };
}

router.get("/config", async (req, res) => {
  try {
    const versionsResult = await pool.query(
      `SELECT
         id,
         platform,
         version,
         build_number,
         min_supported_version,
         status,
         force_update,
         rollout_percent,
         release_notes_ru,
         release_notes_en,
         created_at,
         updated_at
       FROM public.mobile_app_versions
       ORDER BY platform, version, build_number`
    );

    const featureFlagsResult = await pool.query(
      `SELECT
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
       ORDER BY flag_key, scope_type, scope_code`
    );

    return res.status(200).json({
      ok: true,
      config: {
        versions: versionsResult.rows,
        feature_flags: featureFlagsResult.rows,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_CONFIG_FAILED",
    });
  }
});

router.get("/locations", async (req, res) => {
  try {
    const countriesResult = await pool.query(
      `SELECT
         code,
         name_ru,
         name_en,
         currency_code,
         timezone,
         phone_prefix,
         status,
         created_at,
         updated_at
       FROM public.countries
       ORDER BY code`
    );

    const citiesResult = await pool.query(
      `SELECT
         id,
         country_code,
         slug,
         name_ru,
         name_en,
         timezone,
         currency_code,
         status,
         created_at,
         updated_at
       FROM public.cities
       ORDER BY country_code, slug`
    );

    return res.status(200).json({
      ok: true,
      locations: {
        countries: countriesResult.rows,
        cities: citiesResult.rows,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_LOCATIONS_FAILED",
    });
  }
});

router.get("/city/:countryCode/:citySlug/home", async (req, res) => {
  try {
    const countryCode = String(req.params.countryCode || "").trim().toUpperCase();
    const citySlug = String(req.params.citySlug || "").trim().toLowerCase();

    if (!countryCode || !citySlug) {
      return res.status(404).json({
        ok: false,
        error: "PUBLIC_MOBILE_CITY_NOT_FOUND",
      });
    }

    const countryResult = await pool.query(
      `SELECT
         code,
         name_ru,
         name_en,
         currency_code,
         timezone,
         phone_prefix,
         status,
         created_at,
         updated_at
       FROM public.countries
       WHERE code = $1
       LIMIT 1`,
      [countryCode]
    );

    if (!countryResult.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "PUBLIC_MOBILE_CITY_NOT_FOUND",
      });
    }

    const cityResult = await pool.query(
      `SELECT
         id,
         country_code,
         slug,
         name_ru,
         name_en,
         timezone,
         currency_code,
         status,
         created_at,
         updated_at
       FROM public.cities
       WHERE country_code = $1
         AND slug = $2
       LIMIT 1`,
      [countryCode, citySlug]
    );

    if (!cityResult.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "PUBLIC_MOBILE_CITY_NOT_FOUND",
      });
    }

    const salonsResult = await pool.query(
      `SELECT
         s.id,
         s.slug,
         s.name,
         s.enabled,
         s.status,
         s.description,
         s.logo_url,
         s.cover_url,
         s.city,
         s.phone,
         s.slogan
       FROM public.mobile_owner_locations mol
       JOIN public.salons s ON s.id = mol.owner_id
       WHERE mol.owner_type = 'salon'
         AND mol.country_code = $1
         AND mol.city_slug = $2
         AND mol.status = 'active'
         AND COALESCE(s.enabled, true) = true
       ORDER BY s.id`,
      [countryCode, citySlug]
    );

    const mastersResult = await pool.query(
      `SELECT
         m.id,
         m.slug,
         m.name,
         m.active
       FROM public.mobile_owner_locations mol
       JOIN public.masters m ON m.id = mol.owner_id
       WHERE mol.owner_type = 'master'
         AND mol.country_code = $1
         AND mol.city_slug = $2
         AND mol.status = 'active'
         AND COALESCE(m.active, true) = true
       ORDER BY m.id`,
      [countryCode, citySlug]
    );

    return res.status(200).json({
      ok: true,
      home: {
        country: countryResult.rows[0],
        city: cityResult.rows[0],
        salons: salonsResult.rows,
        masters: mastersResult.rows,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_CITY_HOME_FAILED",
    });
  }
});

router.get("/salons/:slug/catalog", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();

    if (!slug) {
      return res.status(400).json({
        ok: false,
        error: "SALON_SLUG_REQUIRED",
      });
    }

    const salonResult = await pool.query(
      `SELECT
         id,
         slug,
         name,
         enabled,
         status,
         description,
         logo_url,
         cover_url,
         city,
         phone,
         slogan
       FROM public.salons
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );

    if (!salonResult.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "PUBLIC_MOBILE_SALON_NOT_FOUND",
      });
    }

    const salon = salonResult.rows[0];
    const salonId = salon.id;

    const mastersResult = await pool.query(
      `SELECT
         m.id,
         m.slug,
         m.name,
         m.active
       FROM public.masters m
       JOIN public.master_salon ms ON ms.master_id = m.id
       JOIN public.salons s ON s.id = ms.salon_id
       WHERE s.slug = $1
       ORDER BY m.name ASC`,
      [slug]
    );

    const servicesResult = await pool.query(
      `SELECT
         sms.salon_id,
         sms.master_id,
         sms.service_pk,
         s.service_id AS catalog_service_id,
         s.name,
         sms.price,
         sms.duration_min,
         sms.active
       FROM public.salon_master_services sms
       JOIN public.services s ON s.id = sms.service_pk
       WHERE sms.salon_id = $1
         AND COALESCE(sms.active, true) = true
       ORDER BY sms.id DESC`,
      [salonId]
    );

    return res.status(200).json({
      ok: true,
      salon,
      masters: mastersResult.rows,
      services: servicesResult.rows,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_SALON_CATALOG_FAILED",
    });
  }
});

router.get("/announcements", async (req, res) => {
  try {
    const country = String(req.query.country || "").trim();
    const city = String(req.query.city || "").trim();
    const audience = String(req.query.audience || "client").trim().toLowerCase() || "client";

    const conditions = [
      `(status IN ('active', 'published'))`,
      `(starts_at IS NULL OR starts_at <= NOW())`,
      `(ends_at IS NULL OR ends_at >= NOW())`,
      `(audience_type IN ('all', $1))`,
      `(
        scope_type = 'global'
        ${country ? `OR (scope_type = 'country' AND scope_code = $2)` : ""}
        ${city ? `OR (scope_type = 'city' AND scope_code = $${country ? 3 : 2})` : ""}
      )`,
    ];

    const params = [audience];

    if (country) {
      params.push(country.toUpperCase());
    }

    if (city) {
      params.push(city.toLowerCase());
    }

    const { rows } = await pool.query(
      `SELECT
         id,
         announcement_uid,
         scope_type,
         scope_code,
         audience_type,
         priority,
         title_ru,
         body_ru,
         title_en,
         body_en,
         image_url,
         action_type,
         action_url,
         payload_json,
         starts_at,
         ends_at,
         published_at,
         created_at
       FROM public.app_announcements
       WHERE ${conditions.join("\n         AND ")}
       ORDER BY priority DESC NULLS LAST,
                published_at DESC NULLS LAST,
                created_at DESC`,
      params
    );

    return res.status(200).json({
      ok: true,
      announcements: rows,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_ANNOUNCEMENTS_FAILED",
    });
  }
});

router.get("/notifications", async (req, res) => {
  try {
    const rawReaderType = String(req.query.reader_type || "").trim().toLowerCase();
    const readerId = String(req.query.reader_id || "").trim();
    const rawTargetType = String(req.query.target_type || "").trim().toLowerCase();
    const rawTargetId = String(req.query.target_id || "").trim();
    const ownerType = String(req.query.owner_type || "").trim().toLowerCase();
    const ownerId = String(req.query.owner_id || "").trim();
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 50);

    const hasReaderIdentity = Boolean(readerId) && isAllowedMobileNotificationReaderType(rawReaderType);
    const hasTargetScope = Boolean(rawTargetType || rawTargetId);
    const targetType = rawTargetType || "global";
    const targetId = rawTargetId || null;
    const hasOwnerScope = Boolean(ownerType || ownerId);

    const conditions = [
      `status = 'sent'`,
      `channel = 'in_app'`,
      `(expires_at IS NULL OR expires_at > NOW())`,
    ];
    const values = [];

    if (hasTargetScope) {
      values.push(targetType, targetId);
      conditions.push(
        `(target_type = 'global' OR (target_type = $${values.length - 1} AND (target_id IS NULL OR CAST(target_id AS TEXT) = $${values.length})))`,
      );
    } else {
      conditions.push(`target_type = 'global'`);
    }

    if (hasOwnerScope) {
      values.push(ownerType, ownerId);
      conditions.push(
        `(owner_type IS NULL OR (owner_type = $${values.length - 1} AND (owner_id IS NULL OR CAST(owner_id AS TEXT) = $${values.length})))`,
      );
    }

    const readJoinSql = hasReaderIdentity
      ? `LEFT JOIN public.app_notification_reads reads
           ON reads.notification_id = notifications.id
          AND reads.reader_type = $${values.length + 1}
          AND reads.reader_id = $${values.length + 2}`
      : "";

    const readSelectSql = hasReaderIdentity
      ? `reads.read_at AS read_at,
         (reads.read_at IS NOT NULL) AS is_read`
      : `NULL::timestamptz AS read_at,
         false AS is_read`;

    if (hasReaderIdentity) {
      values.push(rawReaderType, readerId);
    }

    const data = await pool.query(
      `
      SELECT
        notifications.id,
        notifications.notification_uid,
        notifications.target_type,
        notifications.target_id,
        notifications.owner_type,
        notifications.owner_id,
        notifications.channel,
        notifications.priority,
        notifications.title_ru,
        notifications.body_ru,
        notifications.title_en,
        notifications.body_en,
        notifications.action_type,
        notifications.action_url,
        notifications.payload_json,
        notifications.status,
        notifications.sent_at,
        notifications.expires_at,
        notifications.created_at,
        ${readSelectSql}
      FROM public.app_notifications notifications
      ${readJoinSql}
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY notifications.priority DESC NULLS LAST,
               notifications.sent_at DESC NULLS LAST,
               notifications.created_at DESC,
               notifications.id DESC
      LIMIT $${values.length + 1}
      `,
      [...values, limit],
    );

    return res.json({
      ok: true,
      notifications: data.rows.map((row) => ({
        id: row.id,
        notification_uid: row.notification_uid,
        target_type: row.target_type,
        target_id: row.target_id,
        owner_type: row.owner_type,
        owner_id: row.owner_id,
        channel: row.channel,
        priority: row.priority,
        title_ru: row.title_ru,
        body_ru: row.body_ru,
        title_en: row.title_en,
        body_en: row.body_en,
        action_type: row.action_type,
        action_url: row.action_url,
        payload_json: row.payload_json,
        status: row.status,
        sent_at: row.sent_at,
        expires_at: row.expires_at,
        created_at: row.created_at,
        read_at: row.read_at || null,
        is_read: Boolean(row.is_read),
      })),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_NOTIFICATIONS_FAILED",
    });
  }
});

router.post("/notifications/:notificationUid/read", async (req, res) => {
  try {
    const notificationUid = String(req.params.notificationUid || "").trim();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const readerType = String(body.reader_type || "").trim().toLowerCase();
    const readerId = String(body.reader_id || "").trim();

    if (!notificationUid) {
      return res.status(400).json({
        ok: false,
        error: "NOTIFICATION_UID_REQUIRED",
      });
    }

    if (!readerType) {
      return res.status(400).json({
        ok: false,
        error: "NOTIFICATION_READER_TYPE_REQUIRED",
      });
    }

    if (!isAllowedMobileNotificationReaderType(readerType)) {
      return res.status(400).json({
        ok: false,
        error: "NOTIFICATION_READER_TYPE_INVALID",
      });
    }

    if (!readerId || readerId.length > 120) {
      return res.status(400).json({
        ok: false,
        error: "NOTIFICATION_READER_ID_REQUIRED",
      });
    }

    const data = await pool.query(
      `
      WITH notification AS (
        SELECT id, notification_uid
        FROM public.app_notifications
        WHERE notification_uid = $1
          AND status = 'sent'
          AND channel = 'in_app'
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      ),
      upserted AS (
        INSERT INTO public.app_notification_reads (
          notification_id,
          reader_type,
          reader_id,
          read_at
        )
        SELECT
          notification.id,
          $2,
          $3,
          NOW()
        FROM notification
        ON CONFLICT (notification_id, reader_type, reader_id)
        DO UPDATE SET read_at = public.app_notification_reads.read_at
        RETURNING
          notification_id,
          reader_type,
          reader_id,
          read_at,
          (xmax = 0) AS created
      )
      SELECT
        upserted.notification_id,
        notification.notification_uid,
        upserted.reader_type,
        upserted.reader_id,
        upserted.read_at,
        upserted.created
      FROM upserted
      JOIN notification ON notification.id = upserted.notification_id
      `,
      [notificationUid, readerType, readerId],
    );

    const read = data.rows[0] || null;

    if (!read) {
      return res.status(404).json({
        ok: false,
        error: "NOTIFICATION_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      read: {
        notification_id: read.notification_id,
        notification_uid: read.notification_uid,
        reader_type: read.reader_type,
        reader_id: read.reader_id,
        read_at: read.read_at,
        created: Boolean(read.created),
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_NOTIFICATION_READ_FAILED",
    });
  }
});

router.get("/referral", async (req, res) => {
  try {
    const countryCode = String(req.query.country || "").trim().toUpperCase();
    const citySlug = String(req.query.city || "").trim().toLowerCase();

    const flagResult = await pool.query(
      `SELECT
         enabled,
         status
       FROM public.mobile_feature_flags
       WHERE flag_key = $1
         AND scope_type = 'global'
         AND scope_code = 'global'
       LIMIT 1`,
      ["mobile_referral_enabled"]
    );

    const flag = flagResult.rows[0] || null;
    const flagStatus = String(flag?.status || "").trim().toLowerCase();
    const flagEnabled = Boolean(flag?.enabled) && (flagStatus === "active" || flagStatus === "enabled");

    if (!flag || !flagEnabled) {
      return res.status(200).json({
        ok: true,
        referral: {
          enabled: false,
          available: false,
          reason: "FEATURE_DISABLED",
        },
      });
    }

    let cityId = null;

    if (citySlug) {
      const cityQuery = countryCode
        ? `SELECT id FROM public.cities WHERE country_code = $1 AND slug = $2 LIMIT 1`
        : `SELECT id FROM public.cities WHERE slug = $1 LIMIT 1`;
      const cityParams = countryCode ? [countryCode, citySlug] : [citySlug];

      const cityResult = await pool.query(cityQuery, cityParams);
      cityId = cityResult.rows[0]?.id || null;
    }

    const referralConditions = [
      `channel = 'mobile'`,
      `status = 'active'`,
      `referral_code IS NOT NULL`,
      `(starts_at IS NULL OR starts_at <= NOW())`,
      `(expires_at IS NULL OR expires_at > NOW())`,
      `(max_uses IS NULL OR used_count < max_uses)`,
    ];
    const referralParams = [];

    if (countryCode) {
      referralParams.push(countryCode);
      referralConditions.push(`(country_code IS NULL OR country_code = $${referralParams.length})`);
    } else if (!citySlug) {
      referralConditions.push(`country_code IS NULL`);
    }

    if (citySlug) {
      referralParams.push(cityId);
      referralConditions.push(`(city_id IS NULL OR city_id = $${referralParams.length})`);
    }

    const referralResult = await pool.query(
      `SELECT
         referral_code,
         country_code,
         channel
       FROM public.referral_links
       WHERE ${referralConditions.join("\n         AND ")}
       ORDER BY CASE
                  WHEN city_id IS NOT NULL THEN 2
                  WHEN country_code IS NOT NULL THEN 1
                  ELSE 0
                END DESC,
                created_at DESC
       LIMIT 1`,
      referralParams
    );

    const referral = referralResult.rows[0] || null;

    if (!referral) {
      return res.status(200).json({
        ok: true,
        referral: {
          enabled: true,
          available: false,
          reason: "NO_ACTIVE_REFERRAL_LINK",
        },
      });
    }

    const referralCode = String(referral.referral_code || "").trim();

    return res.status(200).json({
      ok: true,
      referral: {
        enabled: true,
        available: true,
        referral_code: referralCode,
        country_code: referral.country_code || null,
        channel: referral.channel || "mobile",
        share_url: `https://app.totemv.com/#/mobile?ref=${encodeURIComponent(referralCode)}`,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_REFERRAL_FAILED",
    });
  }
});

router.post("/feedback", async (req, res) => {
  try {
    const body = normalizeMobileRequestBody(req);
    const source = normalizeMobileSource(body.source);
    const countryCode = normalizeMobileCountry(body.country);
    const citySlug = normalizeMobileCity(body.city);
    const ownerType = normalizeMobileOwnerType(body.owner_type);
    const ownerSlug = normalizeMobileText(body.owner_slug, 160);
    const contactName = normalizeMobileText(body.contact_name, 160);
    const contactEmail = normalizeMobileEmail(body.contact_email);
    const contactPhone = normalizeMobileText(body.contact_phone, 60);
    const message = normalizeMobileText(body.message, 2000);
    const payloadResult = normalizeMobilePayloadJson(body.payload_json, source);

    if (payloadResult.error) {
      return res.status(400).json({
        ok: false,
        error: payloadResult.error,
      });
    }

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "MESSAGE_REQUIRED",
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO public.mobile_feedback_requests (
         source,
         country_code,
         city_slug,
         owner_type,
         owner_slug,
         contact_name,
         contact_email,
         contact_phone,
         message,
         payload_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING id, request_uid, status, created_at`,
      [
        source,
        countryCode,
        citySlug,
        ownerType,
        ownerSlug,
        contactName,
        contactEmail,
        contactPhone,
        message,
        JSON.stringify(payloadResult.payload),
      ]
    );

    const request = rows[0] || null;

    return res.status(200).json({
      ok: true,
      request: request
        ? {
            id: request.id,
            request_uid: request.request_uid,
            status: request.status,
            created_at: request.created_at,
          }
        : null,
    });
  } catch (err) {
    console.error("PUBLIC_MOBILE_FEEDBACK_FAILED", err);
    return res.status(500).json({
      ok: false,
      error: "MOBILE_FEEDBACK_FAILED",
    });
  }
});

router.post("/data-request", async (req, res) => {
  try {
    const body = normalizeMobileRequestBody(req);
    const source = normalizeMobileSource(body.source);
    const requestTypeRaw = String(body.request_type || "").trim().toLowerCase();
    const requestType = ["data_access", "data_delete", "data_export", "other"].includes(requestTypeRaw)
      ? requestTypeRaw
      : "data_access";
    const countryCode = normalizeMobileCountry(body.country);
    const citySlug = normalizeMobileCity(body.city);
    const ownerType = normalizeMobileOwnerType(body.owner_type);
    const ownerSlug = normalizeMobileText(body.owner_slug, 160);
    const contactName = normalizeMobileText(body.contact_name, 160);
    const contactEmail = normalizeMobileEmail(body.contact_email);
    const contactPhone = normalizeMobileText(body.contact_phone, 60);
    const message = normalizeMobileText(body.message, 2000);
    const payloadResult = normalizeMobilePayloadJson(body.payload_json, source);

    if (payloadResult.error) {
      return res.status(400).json({
        ok: false,
        error: payloadResult.error,
      });
    }

    if (!contactEmail && !contactPhone) {
      return res.status(400).json({
        ok: false,
        error: "CONTACT_REQUIRED",
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO public.mobile_data_requests (
         request_type,
         source,
         country_code,
         city_slug,
         owner_type,
         owner_slug,
         contact_name,
         contact_email,
         contact_phone,
         message,
         payload_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       RETURNING id, request_uid, request_type, status, created_at`,
      [
        requestType,
        source,
        countryCode,
        citySlug,
        ownerType,
        ownerSlug,
        contactName,
        contactEmail,
        contactPhone,
        message,
        JSON.stringify(payloadResult.payload),
      ]
    );

    const request = rows[0] || null;

    return res.status(200).json({
      ok: true,
      request: request
        ? {
            id: request.id,
            request_uid: request.request_uid,
            request_type: request.request_type,
            status: request.status,
            created_at: request.created_at,
          }
        : null,
    });
  } catch (err) {
    console.error("PUBLIC_MOBILE_DATA_REQUEST_FAILED", err);
    return res.status(500).json({
      ok: false,
      error: "MOBILE_DATA_REQUEST_FAILED",
    });
  }
});

router.post("/referral/events", async (req, res) => {
  try {
    const flagResult = await pool.query(
      `SELECT
         enabled,
         status
       FROM public.mobile_feature_flags
       WHERE flag_key = $1
         AND scope_type = 'global'
         AND scope_code = 'global'
       LIMIT 1`,
      ["mobile_referral_enabled"]
    );

    const flag = flagResult.rows[0] || null;
    const flagStatus = String(flag?.status || "").trim().toLowerCase();
    const flagEnabled = Boolean(flag?.enabled) && (flagStatus === "active" || flagStatus === "enabled");

    if (!flag || !flagEnabled) {
      return res.status(200).json({
        ok: true,
        recorded: false,
        reason: "FEATURE_DISABLED",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const referralCode = String(body.referral_code || "").trim();
    const eventType = String(body.event_type || "").trim();
    const source = String(body.source || "").trim().toLowerCase() || "mobile";

    if (!referralCode) {
      return res.status(400).json({
        ok: false,
        error: "REFERRAL_CODE_REQUIRED",
      });
    }

    if (referralCode.length > 120) {
      return res.status(400).json({
        ok: false,
        error: "REFERRAL_CODE_REQUIRED",
      });
    }

    if (!["link_opened", "booking_started"].includes(eventType)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_EVENT_TYPE",
      });
    }

    const normalizedPayload = normalizeMobilePayloadJson(body.payload_json, source);

    if (normalizedPayload.error) {
      return res.status(400).json({
        ok: false,
        error: normalizedPayload.error,
      });
    }

    const payloadObject = normalizedPayload.payload;

    if (JSON.stringify(payloadObject).length > 2000) {
      return res.status(400).json({
        ok: false,
        error: "PAYLOAD_TOO_LARGE",
      });
    }

    const linkResult = await pool.query(
      `SELECT id, referral_code, owner_type, owner_id, country_code, city_id, channel
       FROM public.referral_links
       WHERE referral_code = $1
         AND channel = 'mobile'
         AND status = 'active'
         AND (starts_at IS NULL OR starts_at <= now())
         AND (expires_at IS NULL OR expires_at > now())
         AND (max_uses IS NULL OR used_count < max_uses)
       LIMIT 1`,
      [referralCode]
    );

    const link = linkResult.rows[0] || null;

    if (!link) {
      return res.status(404).json({
        ok: false,
        error: "REFERRAL_LINK_NOT_FOUND",
      });
    }

    let cityId = null;
    const citySlug = String(body.city || "").trim().toLowerCase();

    if (citySlug) {
      const cityResult = await pool.query(
        `SELECT id FROM public.cities WHERE slug = $1 LIMIT 1`,
        [citySlug]
      );
      cityId = cityResult.rows[0]?.id || null;
    }

    const countryCode = String(body.country || "").trim().toUpperCase();
    const countryValue = String(countryCode || "").trim().slice(0, 2);
    const countryCodeValue = countryValue ? countryValue : String(link.country_code || "").trim().toUpperCase() || null;
    const sourceValue = source || "mobile";
    const dateBucket = new Date().toISOString().slice(0, 10);
    const dedupMeta = buildReferralEventDedupMeta(payloadObject, referralCode, eventType, countryCodeValue, citySlug, sourceValue, dateBucket);

    const existingEventResult = await pool.query(
      `SELECT
         id,
         event_uid,
         event_type,
         status,
         reward_status,
         created_at
       FROM public.referral_events
       WHERE referral_code = $1
         AND event_type = $2
         AND payload_json->>'referral_event_key' = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [referralCode, eventType, dedupMeta.referralEventKey]
    );

    const existingEvent = existingEventResult.rows[0] || null;

    if (existingEvent) {
      return res.status(200).json({
        ok: true,
        event: {
          id: existingEvent.id,
          event_uid: existingEvent.event_uid,
          event_type: existingEvent.event_type,
          status: existingEvent.status,
          reward_status: existingEvent.reward_status,
          created_at: existingEvent.created_at,
          duplicate: true,
        },
      });
    }

    const payloadWithDedup = {
      ...payloadObject,
      referral_event_key: dedupMeta.referralEventKey,
      dedup: {
        strategy: "referral_code_event_context_day",
        date_bucket: dateBucket,
        context_key: dedupMeta.contextKey,
      },
    };

    const insertResult = await pool.query(
      `INSERT INTO public.referral_events (
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
         payload_json
       )
       VALUES (
         gen_random_uuid()::text,
         $1, $2, $3,
         'anonymous', NULL,
         'anonymous', NULL,
         $4, $5, $6, $7,
         'recorded',
         'none',
         NULL,
         NULL,
         $8::jsonb
       )
       RETURNING id, event_uid, event_type, status, reward_status, created_at`,
      [
        link.id,
        referralCode,
        eventType,
        link.owner_type || null,
        link.owner_id || null,
        countryCodeValue,
        cityId,
        JSON.stringify(payloadWithDedup),
      ]
    );

    const event = insertResult.rows[0] || null;

    return res.status(200).json({
      ok: true,
      recorded: true,
      event: event
        ? {
            id: event.id,
            event_uid: event.event_uid,
            event_type: event.event_type,
            status: event.status,
            reward_status: event.reward_status,
            created_at: event.created_at,
          }
        : null,
    });
  } catch (err) {
    console.error("PUBLIC_MOBILE_REFERRAL_EVENT_FAILED", err);
    return res.status(500).json({
      ok: false,
      error: "REFERRAL_EVENT_FAILED",
    });
  }
});

export default router;
