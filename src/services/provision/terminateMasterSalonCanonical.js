import {
  buildProvisionMeta,
  resolveProvisionError
} from "./provisionShared.js";

function normalizeText(value){
  return String(value || "").trim();
}

function validateTerminateInput(payload = {}){
  const salonSlug = normalizeText(payload.salon_slug);
  const masterSlug = normalizeText(payload.master_slug);

  if(!salonSlug){
    const err = new Error("SALON_SLUG_REQUIRED");
    err.code = "SALON_SLUG_REQUIRED";
    throw err;
  }

  if(!masterSlug){
    const err = new Error("MASTER_SLUG_REQUIRED");
    err.code = "MASTER_SLUG_REQUIRED";
    throw err;
  }

  return {
    salon_slug: salonSlug,
    master_slug: masterSlug
  };
}

async function findSalonBySlug(db, slug){
  const result = await db.query(
    `SELECT id, slug, name, status
     FROM salons
     WHERE slug=$1
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

async function findMasterBySlug(db, slug){
  const result = await db.query(
    `SELECT id, slug, name, active, user_id
     FROM masters
     WHERE slug=$1
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

async function lockRelation(db, salonId, masterId){
  const result = await db.query(
    `SELECT
       id,
       salon_id,
       master_id,
       status,
       invited_at,
       activated_at,
       fired_at,
       created_at,
       updated_at
     FROM master_salon
     WHERE salon_id=$1
       AND master_id=$2
     FOR UPDATE
     LIMIT 1`,
    [salonId, masterId]
  );

  return result.rows[0] || null;
}

function buildTerminationResult({ salon, master, relation, archivedContracts, canceledCalendar, canceledBookings, disabledMasterServices, disabledSalonMasterServices, meta }){
  return {
    ok: true,
    flow: 'terminate_master_salon',
    result: {
      type: 'terminate_bind',
      salon: {
        id: salon.id,
        slug: salon.slug,
        name: salon.name,
        status: salon.status || null
      },
      master: {
        id: master.id,
        slug: master.slug,
        name: master.name,
        active: master.active,
        user_id: master.user_id
      },
      relation: relation ? {
        id: relation.id,
        salon_id: relation.salon_id,
        master_id: relation.master_id,
        status: relation.status,
        invited_at: relation.invited_at || null,
        activated_at: relation.activated_at || null,
        fired_at: relation.fired_at || null,
        updated_at: relation.updated_at || null
      } : null,
      impact: {
        contracts_archived: archivedContracts,
        future_calendar_canceled: canceledCalendar,
        future_bookings_canceled: canceledBookings,
        master_services_disabled: disabledMasterServices,
        salon_master_services_disabled: disabledSalonMasterServices
      },
      urls: {
        salon_internal: `/internal/salons/${salon.slug}`,
        master_internal: `/internal/masters/${master.slug}`
      }
    },
    errors: null,
    meta
  };
}

export async function terminateMasterSalonCanonical({ pool, payload }){
  const input = validateTerminateInput(payload || {});
  const db = await pool.connect();

  try{
    await db.query('BEGIN');

    const salon = await findSalonBySlug(db, input.salon_slug);
    if(!salon){
      const err = new Error('SALON_NOT_FOUND');
      err.code = 'SALON_NOT_FOUND';
      throw err;
    }

    const master = await findMasterBySlug(db, input.master_slug);
    if(!master){
      const err = new Error('MASTER_NOT_FOUND');
      err.code = 'MASTER_NOT_FOUND';
      throw err;
    }

    const relation = await lockRelation(db, salon.id, master.id);
    if(!relation){
      const err = new Error('MASTER_SALON_LINK_NOT_FOUND');
      err.code = 'MASTER_SALON_LINK_NOT_FOUND';
      throw err;
    }

    const contractsArchived = await db.query(
      `UPDATE contracts
       SET
         status='archived',
         archived_at=NOW(),
         effective_to=COALESCE(effective_to, NOW())
       WHERE salon_id=$1
         AND master_id=$2
         AND status IN ('active','pending')
       RETURNING id`,
      [String(salon.id), String(master.id)]
    );

    const relationUpdated = await db.query(
      `UPDATE master_salon
       SET
         status='fired',
         fired_at=COALESCE(fired_at, NOW()),
         updated_at=NOW()
       WHERE id=$1
       RETURNING
         id,
         salon_id,
         master_id,
         status,
         invited_at,
         activated_at,
         fired_at,
         created_at,
         updated_at`,
      [relation.id]
    );

    const calendarCanceled = await db.query(
      `UPDATE master_calendar
       SET
         status='canceled',
         updated_at=NOW()
       WHERE salon_id=$1
         AND master_id=$2
         AND start_at > NOW()
         AND status='reserved'
       RETURNING id`,
      [String(salon.id), String(master.id)]
    );

    const bookingsCanceled = await db.query(
      `UPDATE bookings
       SET
         status='canceled',
         canceled_at=NOW(),
         cancel_reason='master_terminated'
       WHERE salon_id=$1
         AND master_id=$2
         AND start_at > NOW()
         AND status='reserved'
       RETURNING id`,
      [salon.id, master.id]
    );

    const masterServicesDisabled = await db.query(
      `UPDATE master_services_v2
       SET active=false
       WHERE salon_id=$1
         AND master_id=$2
         AND active=true
       RETURNING id`,
      [salon.id, master.id]
    );

    const salonMasterServicesDisabled = await db.query(
      `UPDATE salon_master_services
       SET active=false
       WHERE salon_id=$1
         AND master_id=$2
         AND active=true
       RETURNING id`,
      [salon.id, master.id]
    );

    await db.query('COMMIT');

    return buildTerminationResult({
      salon,
      master,
      relation: relationUpdated.rows[0] || relation,
      archivedContracts: contractsArchived.rowCount,
      canceledCalendar: calendarCanceled.rowCount,
      canceledBookings: bookingsCanceled.rowCount,
      disabledMasterServices: masterServicesDisabled.rowCount,
      disabledSalonMasterServices: salonMasterServicesDisabled.rowCount,
      meta: buildProvisionMeta({
        created: false,
        updated: true,
        idempotent: relation.status === 'fired'
      })
    });
  }catch(err){
    try{ await db.query('ROLLBACK'); }catch(e){}

    const resolved = resolveProvisionError(err);
    const wrapped = new Error(resolved.error);
    wrapped.code = resolved.error;
    wrapped.status = resolved.status;
    wrapped.details = err?.details || null;
    throw wrapped;
  }finally{
    db.release();
  }
}

export default terminateMasterSalonCanonical;
