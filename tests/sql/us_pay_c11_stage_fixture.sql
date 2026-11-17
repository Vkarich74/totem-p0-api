-- US-PAY-C11-DB: synthetic-only PostgreSQL staging fixture.
-- This is intentionally NOT the full production schema or production data.
BEGIN;
CREATE TABLE public.salons (
 id integer PRIMARY KEY, name text NOT NULL,
 enabled boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.masters (
 id integer PRIMARY KEY, name text NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.markets (
 id bigint PRIMARY KEY, code text NOT NULL UNIQUE,
 active boolean NOT NULL, default_currency text NOT NULL
);
CREATE TABLE public.tenant_market_settings (
 salon_id integer PRIMARY KEY REFERENCES public.salons(id),
 market_id bigint NOT NULL REFERENCES public.markets(id)
);
CREATE TABLE public.salon_master_services (
 id integer PRIMARY KEY,
 salon_id integer NOT NULL REFERENCES public.salons(id),
 master_id integer NOT NULL REFERENCES public.masters(id),
 service_pk integer NOT NULL,
 currency_code text,
 active boolean NOT NULL
);
CREATE TABLE public.bookings (
 id integer PRIMARY KEY,
 salon_id integer NOT NULL REFERENCES public.salons(id),
 master_id integer NOT NULL REFERENCES public.masters(id),
 service_id integer NOT NULL,
 client_id integer NOT NULL,
 currency_code text,
 status text NOT NULL
);
INSERT INTO public.markets VALUES
 (1,'KG',true,'KGS'),(2,'KZ',true,'KZT'),(3,'US',true,'USD');
INSERT INTO public.salons(id,name) VALUES
 (100,'SYNTHETIC_US_A'),(101,'SYNTHETIC_KG'),(102,'SYNTHETIC_KZ');
INSERT INTO public.masters(id,name) VALUES
 (200,'SYNTHETIC_MASTER_US'),(201,'SYNTHETIC_MASTER_KG'),(202,'SYNTHETIC_MASTER_KZ');
INSERT INTO public.tenant_market_settings VALUES
 (100,3),(101,1),(102,2);
INSERT INTO public.salon_master_services VALUES
 (300,100,200,400,'USD',true),
 (301,101,201,401,'KGS',true),
 (302,100,200,402,'USD',true),
 (303,102,202,403,'KZT',true);
INSERT INTO public.bookings VALUES
 (500,100,200,400,55,'USD','reserved'),
 (501,100,200,400,55,'USD','confirmed'),
 (502,101,201,401,56,'KGS','reserved'),
 (503,102,202,403,57,'KZT','reserved'),
 (504,100,200,402,55,'USD','reserved');
COMMIT;
