-- US-PAY-C11 owner authorization staging fixture (synthetic only).
-- Runs AFTER the base SQL, USD sidecars, and API seed.
BEGIN;

CREATE TABLE public.auth_users (
  id integer PRIMARY KEY,
  role text NOT NULL,
  enabled boolean NOT NULL
);

CREATE TABLE public.auth_sessions (
  id uuid PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.auth_users(id),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE public.owner_salon (
  owner_id text NOT NULL,
  salon_id integer NOT NULL REFERENCES public.salons(id),
  PRIMARY KEY (owner_id, salon_id)
);

CREATE TABLE public.master_salon (
  salon_id integer NOT NULL REFERENCES public.salons(id),
  master_id integer NOT NULL REFERENCES public.masters(id),
  status text NOT NULL,
  PRIMARY KEY(salon_id,master_id)
);

INSERT INTO public.auth_users VALUES
 (900,'salon_admin',TRUE),
 (901,'master',TRUE),
 (902,'salon_admin',TRUE),
 (903,'salon_admin',TRUE),
 (904,'salon_admin',FALSE);

INSERT INTO public.auth_sessions VALUES
 ('00000000-0000-4000-8000-000000000900',900,now()+interval '1 day',now(),NULL),
 ('00000000-0000-4000-8000-000000000901',901,now()+interval '1 day',now(),NULL),
 ('00000000-0000-4000-8000-000000000902',902,now()+interval '1 day',now(),NULL),
 ('00000000-0000-4000-8000-000000000903',903,now()+interval '1 day',now(),NULL),
 ('00000000-0000-4000-8000-000000000904',904,now()+interval '1 day',now(),NULL),
 ('00000000-0000-4000-8000-000000000905',900,now()-interval '1 hour',now()-interval '1 day',NULL),
 ('00000000-0000-4000-8000-000000000906',900,now()+interval '1 day',now(),now());

INSERT INTO public.owner_salon VALUES
 ('900',100),
 ('902',101),
 ('904',100);

INSERT INTO public.master_salon VALUES
 (100,200,'active'),
 (101,201,'active'),
 (102,202,'active');

-- Current service link 300 has $12.05 after API seed; version 2.
INSERT INTO public.bookings
  (id,salon_id,master_id,service_id,client_id,currency_code,status)
VALUES
 (505,100,200,400,55,'USD','reserved'),
 (506,100,200,400,55,'USD','confirmed'),
 (507,100,200,400,55,'USD','reserved'),
 (508,100,200,400,55,'USD','completed');

INSERT INTO public.us_booking_price_snapshots (
  booking_id,market_id,salon_master_service_id,amount_minor,service_price_version
) VALUES
 (505,3,300,1205,2),
 (506,3,300,1205,2),
 (508,3,300,1205,2);

-- US service for master 203 exists but no active master_salon relation.
INSERT INTO public.masters VALUES (203,'SYNTHETIC_MASTER_INACTIVE');
INSERT INTO public.salon_master_services
 (id,salon_id,master_id,service_pk,currency_code,active)
VALUES (304,100,203,404,'USD',TRUE);
INSERT INTO public.us_service_price_amounts
 (salon_master_service_id,market_id,amount_minor)
VALUES (304,3,700);
INSERT INTO public.bookings
 (id,salon_id,master_id,service_id,client_id,currency_code,status)
VALUES (509,100,203,404,55,'USD','reserved');
INSERT INTO public.us_booking_price_snapshots
 (booking_id,market_id,salon_master_service_id,amount_minor,service_price_version)
VALUES (509,3,304,700,1);

COMMIT;
