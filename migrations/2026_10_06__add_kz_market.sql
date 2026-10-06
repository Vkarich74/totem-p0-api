BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM countries WHERE code='KZ' AND currency_code='KZT' AND timezone='Asia/Almaty' AND phone_prefix='+7') THEN
   RAISE EXCEPTION 'KZ country prerequisites mismatch';
 END IF;
 IF EXISTS (SELECT 1 FROM markets WHERE code='KZ' AND (country_code<>'KZ' OR default_locale<>'ru-KZ' OR supported_locales<>ARRAY['ru-KZ','en-KZ']::text[] OR default_currency<>'KZT' OR supported_currencies<>ARRAY['KZT']::text[] OR default_timezone<>'Asia/Almaty' OR country_pack_code<>'KZ' OR country_pack_version<>'1')) THEN
   RAISE EXCEPTION 'Existing KZ market conflict';
 END IF;
END $$;
INSERT INTO markets(code,country_code,default_locale,supported_locales,default_currency,supported_currencies,default_timezone,country_pack_code,country_pack_version,active)
VALUES('KZ','KZ','ru-KZ',ARRAY['ru-KZ','en-KZ'],'KZT',ARRAY['KZT'],'Asia/Almaty','KZ','1',false)
ON CONFLICT(code) DO NOTHING;
COMMIT;
