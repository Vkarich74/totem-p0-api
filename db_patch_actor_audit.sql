BEGIN;

CREATE OR REPLACE FUNCTION public.audit_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_actor_type text;
  v_actor_id   text;
  v_source     text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN

    v_actor_type := NULLIF(current_setting('app.actor_type', true), '');
    v_actor_id   := NULLIF(current_setting('app.actor_id', true), '');
    v_source     := NULLIF(current_setting('app.source', true), '');

    IF v_actor_type IS NULL THEN
      v_actor_type := 'system';
    END IF;

    IF v_source IS NULL THEN
      v_source := 'db_trigger';
    END IF;

    INSERT INTO public.booking_audit_log (
      booking_id,
      from_status,
      to_status,
      actor_type,
      actor_id,
      source,
      created_at
    )
    VALUES (
      OLD.id,
      OLD.status,
      NEW.status,
      v_actor_type,
      v_actor_id,
      v_source,
      NOW()
    );

  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
