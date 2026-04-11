BEGIN;

ALTER TABLE public.auth_users
    ADD COLUMN IF NOT EXISTS phone text,
    ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
    ADD COLUMN IF NOT EXISTS must_set_password boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS preferred_login_channel text;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auth_users_master_password_required'
          AND conrelid = 'public.auth_users'::regclass
    ) THEN
        ALTER TABLE public.auth_users
            DROP CONSTRAINT auth_users_master_password_required;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auth_users_master_password_required_v2'
          AND conrelid = 'public.auth_users'::regclass
    ) THEN
        ALTER TABLE public.auth_users
            ADD CONSTRAINT auth_users_master_password_required_v2
            CHECK (
                role <> 'master'
                OR password_hash IS NOT NULL
                OR must_set_password = true
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auth_users_phone_canonical_check'
          AND conrelid = 'public.auth_users'::regclass
    ) THEN
        ALTER TABLE public.auth_users
            ADD CONSTRAINT auth_users_phone_canonical_check
            CHECK (
                phone IS NULL
                OR phone ~ '^\+996[1-9][0-9]{8}$'
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auth_users_preferred_login_channel_check'
          AND conrelid = 'public.auth_users'::regclass
    ) THEN
        ALTER TABLE public.auth_users
            ADD CONSTRAINT auth_users_preferred_login_channel_check
            CHECK (
                preferred_login_channel IS NULL
                OR preferred_login_channel IN ('email', 'whatsapp')
            );
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS auth_users_phone_unique
    ON public.auth_users (phone)
    WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_users_email_lower
    ON public.auth_users ((lower(email)));

ALTER TABLE public.auth_sessions
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
    ADD COLUMN IF NOT EXISTS revoked_reason text,
    ADD COLUMN IF NOT EXISTS ip_address text,
    ADD COLUMN IF NOT EXISTS user_agent text;

UPDATE public.auth_sessions
SET last_seen_at = COALESCE(last_seen_at, created_at)
WHERE last_seen_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auth_sessions_user_id_fkey'
          AND conrelid = 'public.auth_sessions'::regclass
    ) THEN
        ALTER TABLE public.auth_sessions
            ADD CONSTRAINT auth_sessions_user_id_fkey
            FOREIGN KEY (user_id)
            REFERENCES public.auth_users(id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
    ON public.auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
    ON public.auth_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_last_seen_at
    ON public.auth_sessions (last_seen_at);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_revoked_at
    ON public.auth_sessions (revoked_at);

CREATE TABLE IF NOT EXISTS public.auth_otps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id integer NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,
    channel text NOT NULL,
    target text NOT NULL,
    purpose text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts_used integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5,
    blocked_until timestamptz NULL,
    resend_available_at timestamptz NOT NULL,
    consumed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT auth_otps_channel_check CHECK (channel IN ('email', 'whatsapp')),
    CONSTRAINT auth_otps_purpose_check CHECK (purpose IN ('signup_verify', 'email_verify', 'phone_verify', 'password_reset', 'login_verify')),
    CONSTRAINT auth_otps_attempts_used_check CHECK (attempts_used >= 0),
    CONSTRAINT auth_otps_max_attempts_check CHECK (max_attempts > 0)
);

CREATE INDEX IF NOT EXISTS idx_auth_otps_target_purpose_created_at
    ON public.auth_otps (target, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_otps_expires_at
    ON public.auth_otps (expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_otps_blocked_until
    ON public.auth_otps (blocked_until);

CREATE INDEX IF NOT EXISTS idx_auth_otps_user_id
    ON public.auth_otps (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_otps_target
    ON public.auth_otps (target);

COMMIT;