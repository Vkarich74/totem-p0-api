-- Disposable US-PAY-C11 combined SDK + API test ONLY.
-- Append to the synthetic database after us_pay_c11_api_seed.sql.
-- No copied production users, tokens, or booking records.
BEGIN;

CREATE TABLE public.client_access_tokens (
  id integer PRIMARY KEY,
  client_id integer NOT NULL,
  booking_id integer,
  token_last4 text,
  token_hash text NOT NULL,
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL
);

INSERT INTO public.client_access_tokens
(id,client_id,booking_id,token_last4,token_hash,purpose,revoked_at)
VALUES
(1,55,500,'s-55','458e96b039feb1c1cc20f065d3bfb407eba800d096c907a1fed6ce4762a7adfc','cabinet',NULL),
(2,56,502,'g-56','897b028e30aef61f35e77bf9d736869edb446b0f43b8340c81869d7e8531ff45','cabinet',NULL),
(3,57,503,'z-57','e1fee7c1ca8c870900d8129d1a5c6ef2b7f9409d231f785b49124fa08812163c','cabinet',NULL),
(4,55,500,'d-55','083efe9accc872bdae1d5ff70ab12cd833c5e986ba99d897099e1c5b068d244a','cabinet',now()),
(5,55,500,'p-55','e3fb86e12b4a911928025ae9582ced545422220c2767878a032d64c5b9f7fb20','profile',NULL);

-- Malicious/obsolete historical monetary value; US SDK must ignore it.
ALTER TABLE public.bookings
  ADD COLUMN price_snapshot integer DEFAULT 9999,
  ADD COLUMN start_at timestamptz DEFAULT '2026-11-20T16:00:00Z',
  ADD COLUMN end_at timestamptz DEFAULT '2026-11-20T17:00:00Z',
  ADD COLUMN created_at timestamptz DEFAULT '2026-11-17T01:00:00Z';

COMMIT;
