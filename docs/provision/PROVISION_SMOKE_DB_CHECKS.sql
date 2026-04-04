-- PROVISION_SMOKE_DB_CHECKS.sql

-- CREATE SALON CHECKS
SELECT id,email,role,salon_slug,salon_id
FROM public.auth_users
WHERE email='salon.test@example.com' AND role='salon_admin';

SELECT id,slug,name
FROM public.salons
WHERE slug='<SALON_SLUG>';

SELECT id,owner_id,salon_id,status
FROM public.owner_salon
WHERE salon_id=<SALON_ID>;

SELECT user_id,default_salon_slug
FROM public.user_default_salon
WHERE user_id=<USER_ID>;

-- CREATE MASTER CHECKS
SELECT id,email,role,master_slug,master_id
FROM public.auth_users
WHERE email='master.test@example.com' AND role='master';

SELECT id,slug,name,user_id
FROM public.masters
WHERE slug='<MASTER_SLUG>';

-- BIND CHECKS
SELECT id,master_id,salon_id,status,invited_at,activated_at,fired_at
FROM public.master_salon
WHERE master_id=<MASTER_ID> AND salon_id=<SALON_ID>;

-- OPTIONAL CONTRACT CHECK
SELECT id,salon_id,master_id,status,version,effective_from,archived_at
FROM public.contracts
WHERE salon_id='<SALON_ID>' AND master_id='<MASTER_ID>'
ORDER BY created_at DESC;
