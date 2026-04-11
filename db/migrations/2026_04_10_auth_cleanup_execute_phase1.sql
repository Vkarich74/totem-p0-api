BEGIN;

UPDATE public.auth_sessions
SET
    revoked_at = now(),
    revoked_reason = 'auth_contract_cleanup_expired_legacy_session'
WHERE expires_at < now()
  AND revoked_at IS NULL;

UPDATE public.auth_users
SET
    password_hash = NULL,
    must_set_password = true,
    password_changed_at = NULL
WHERE password_hash IN (
    'invite_pending',
    'x',
    'test',
    'test_hash',
    'local_test_password_hash',
    'validation_password_hash'
);

UPDATE public.auth_users
SET
    master_slug = 'totem-demo-master'
WHERE id = 37
  AND role = 'master';

COMMIT;

SELECT
    id,
    email,
    role,
    master_slug,
    must_set_password,
    password_hash
FROM public.auth_users
WHERE id IN (37,40,41,42,43,44,45,46,48,50,52,54,56,58,60,62)
ORDER BY id;

SELECT
    id,
    user_id,
    expires_at,
    revoked_at,
    revoked_reason
FROM public.auth_sessions
ORDER BY created_at DESC;