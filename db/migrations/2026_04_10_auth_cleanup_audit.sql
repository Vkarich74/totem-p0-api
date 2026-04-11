WITH auth_users_base AS (
    SELECT
        u.id,
        u.email,
        lower(trim(u.email)) AS email_canonical,
        u.role,
        u.salon_slug,
        u.master_slug,
        u.enabled,
        u.salon_id,
        u.master_id,
        u.phone,
        u.password_hash,
        u.must_set_password,
        CASE
            WHEN u.password_hash IS NULL THEN 'NULL'
            WHEN u.password_hash IN (
                'invite_pending',
                'x',
                'test',
                'test_hash',
                'local_test_password_hash',
                'validation_password_hash'
            ) THEN 'FAKE_PLACEHOLDER'
            WHEN u.password_hash LIKE '$2a$%' THEN 'BCRYPT'
            WHEN u.password_hash LIKE '$2b$%' THEN 'BCRYPT'
            WHEN u.password_hash LIKE '$2y$%' THEN 'BCRYPT'
            ELSE 'UNKNOWN'
        END AS password_state
    FROM public.auth_users u
),

email_duplicates AS (
    SELECT
        email_canonical,
        COUNT(*) AS cnt,
        STRING_AGG(id::text || ':' || role, ', ' ORDER BY id) AS rows_list
    FROM auth_users_base
    GROUP BY email_canonical
    HAVING COUNT(*) > 1
),

master_binding_check AS (
    SELECT
        u.id,
        u.email,
        u.role,
        u.master_slug,
        m.id AS master_row_id,
        m.slug AS master_row_slug,
        m.user_id AS master_row_user_id,
        m.active AS master_active
    FROM auth_users_base u
    LEFT JOIN public.masters m
      ON m.user_id = u.id
    WHERE u.role = 'master'
),

salon_binding_check AS (
    SELECT
        u.id,
        u.email,
        u.role,
        u.salon_slug,
        s.id AS salon_row_id,
        s.slug AS salon_row_slug,
        s.enabled AS salon_enabled,
        s.status AS salon_status
    FROM auth_users_base u
    LEFT JOIN public.salons s
      ON s.slug = u.salon_slug
    WHERE u.role = 'salon_admin'
),

default_salon_check AS (
    SELECT
        u.id,
        u.email,
        u.role,
        uds.default_salon_slug,
        s.slug AS matched_salon_slug
    FROM auth_users_base u
    LEFT JOIN public.user_default_salon uds
      ON uds.user_id = u.id
    LEFT JOIN public.salons s
      ON s.slug = uds.default_salon_slug
),

session_summary AS (
    SELECT
        s.user_id,
        COUNT(*) AS total_sessions,
        COUNT(*) FILTER (WHERE s.expires_at < now()) AS expired_sessions,
        COUNT(*) FILTER (WHERE s.revoked_at IS NOT NULL) AS revoked_sessions
    FROM public.auth_sessions s
    GROUP BY s.user_id
)

SELECT
    'A01_AUTH_USERS_OVERVIEW' AS section,
    jsonb_pretty(
        jsonb_build_object(
            'total_auth_users', COUNT(*),
            'salon_admin_count', COUNT(*) FILTER (WHERE role = 'salon_admin'),
            'master_count', COUNT(*) FILTER (WHERE role = 'master'),
            'phone_filled_count', COUNT(*) FILTER (WHERE phone IS NOT NULL),
            'must_set_password_true', COUNT(*) FILTER (WHERE must_set_password = true),
            'password_state_null', COUNT(*) FILTER (WHERE password_state = 'NULL'),
            'password_state_fake_placeholder', COUNT(*) FILTER (WHERE password_state = 'FAKE_PLACEHOLDER'),
            'password_state_bcrypt', COUNT(*) FILTER (WHERE password_state = 'BCRYPT'),
            'password_state_unknown', COUNT(*) FILTER (WHERE password_state = 'UNKNOWN')
        )
    ) AS report
FROM auth_users_base

UNION ALL

SELECT
    'A02_FAKE_OR_INVALID_PASSWORD_ROWS' AS section,
    COALESCE(
        jsonb_pretty(
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'email', email,
                    'role', role,
                    'password_hash', password_hash,
                    'password_state', password_state,
                    'must_set_password', must_set_password
                )
                ORDER BY id
            )
        ),
        '[]'
    ) AS report
FROM auth_users_base
WHERE password_state IN ('FAKE_PLACEHOLDER', 'UNKNOWN')

UNION ALL

SELECT
    'A03_EMAIL_DUPLICATES_BY_CANONICAL_EMAIL' AS section,
    COALESCE(
        jsonb_pretty(
            jsonb_agg(
                jsonb_build_object(
                    'email_canonical', email_canonical,
                    'count', cnt,
                    'rows', rows_list
                )
                ORDER BY email_canonical
            )
        ),
        '[]'
    ) AS report
FROM email_duplicates

UNION ALL

SELECT
    'A04_MASTER_BINDING_PROBLEMS' AS section,
    COALESCE(
        jsonb_pretty(
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'email', email,
                    'master_slug_auth', master_slug,
                    'master_row_id', master_row_id,
                    'master_row_slug', master_row_slug,
                    'master_row_user_id', master_row_user_id,
                    'master_active', master_active
                )
                ORDER BY id
            )
        ),
        '[]'
    ) AS report
FROM master_binding_check
WHERE master_row_id IS NULL
   OR master_row_slug IS DISTINCT FROM master_slug
   OR master_row_user_id IS DISTINCT FROM id

UNION ALL

SELECT
    'A05_SALON_BINDING_PROBLEMS' AS section,
    COALESCE(
        jsonb_pretty(
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'email', email,
                    'salon_slug_auth', salon_slug,
                    'salon_row_id', salon_row_id,
                    'salon_row_slug', salon_row_slug,
                    'salon_enabled', salon_enabled,
                    'salon_status', salon_status
                )
                ORDER BY id
            )
        ),
        '[]'
    ) AS report
FROM salon_binding_check
WHERE salon_row_id IS NULL
   OR salon_row_slug IS DISTINCT FROM salon_slug

UNION ALL

SELECT
    'A06_DEFAULT_SALON_PROBLEMS' AS section,
    COALESCE(
        jsonb_pretty(
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'email', email,
                    'role', role,
                    'default_salon_slug', default_salon_slug,
                    'matched_salon_slug', matched_salon_slug
                )
                ORDER BY id
            )
        ),
        '[]'
    ) AS report
FROM default_salon_check
WHERE default_salon_slug IS NOT NULL
  AND matched_salon_slug IS NULL

UNION ALL

SELECT
    'A07_SESSION_SUMMARY_BY_USER' AS section,
    COALESCE(
        jsonb_pretty(
            jsonb_agg(
                jsonb_build_object(
                    'user_id', u.id,
                    'email', u.email,
                    'role', u.role,
                    'total_sessions', COALESCE(ss.total_sessions, 0),
                    'expired_sessions', COALESCE(ss.expired_sessions, 0),
                    'revoked_sessions', COALESCE(ss.revoked_sessions, 0)
                )
                ORDER BY u.id
            )
        ),
        '[]'
    ) AS report
FROM auth_users_base u
LEFT JOIN session_summary ss
  ON ss.user_id = u.id;