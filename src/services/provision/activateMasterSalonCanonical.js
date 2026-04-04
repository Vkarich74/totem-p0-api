import {
  buildProvisionMeta,
  resolveProvisionError
} from "./provisionShared.js";

function normalizeText(value){
  return String(value || "").trim();
}

function validateActivateInput(payload = {}){
  const salonSlug = normalizeText(payload.salon_slug);
  const masterSlug = normalizeText(payload.master_slug);
  const acceptContract = Boolean(payload.accept_contract);

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
    master_slug: masterSlug,
    accept_contract: acceptContract
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
     ORDER BY id DESC
     FOR UPDATE
     LIMIT 1`,
    [salonId, masterId]
  );

  return result.rows[0] || null;
}

async function activateRelation(db, relationId){
  const result = await db.query(
    `UPDATE master_salon
     SET
       status='active',
       activated_at=COALESCE(activated_at, NOW()),
       fired_at=NULL,
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
    [relationId]
  );

  return result.rows[0] || null;
}

async function acceptPendingContractIfNeeded(db, salonId, masterId, acceptContract){
  if(!acceptContract){
    return {
      updated: false,
      idempotent: false,
      contract: null
    };
  }

  const existingActive = await db.query(
    `SELECT
       id,
       salon_id,
       master_id,
       status,
       version,
       terms_json,
       effective_from,
       effective_to,
       created_at,
       archived_at
     FROM contracts
     WHERE salon_id=$1
       AND master_id=$2
       AND status='active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [String(salonId), String(masterId)]
  );

  if(existingActive.rows.length){
    return {
      updated: false,
      idempotent: true,
      contract: existingActive.rows[0]
    };
  }

  const pending = await db.query(
    `SELECT
       id,
       salon_id,
       master_id,
       status,
       version,
       terms_json,
       effective_from,
       effective_to,
       created_at,
       archived_at
     FROM contracts
     WHERE salon_id=$1
       AND master_id=$2
       AND status='pending'
     ORDER BY created_at DESC
     FOR UPDATE
     LIMIT 1`,
    [String(salonId), String(masterId)]
  );

  if(!pending.rows.length){
    return {
      updated: false,
      idempotent: false,
      contract: null
    };
  }

  await db.query(
    `UPDATE contracts
     SET
       status='archived',
       archived_at=NOW()
     WHERE salon_id=$1
       AND master_id=$2
       AND status='active'
       AND id<>$3`,
    [String(salonId), String(masterId), pending.rows[0].id]
  );

  const activated = await db.query(
    `UPDATE contracts
     SET
       status='active',
       archived_at=NULL
     WHERE id=$1
     RETURNING
       id,
       salon_id,
       master_id,
       status,
       version,
       terms_json,
       effective_from,
       effective_to,
       created_at,
       archived_at`,
    [pending.rows[0].id]
  );

  return {
    updated: true,
    idempotent: false,
    contract: activated.rows[0] || pending.rows[0]
  };
}

function buildActivationResult({ salon, master, relation, contractState, meta }){
  return {
    ok: true,
    flow: 'activate_master_salon',
    result: {
      type: 'activate_bind',
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
      contract: contractState.contract ? {
        id: contractState.contract.id,
        salon_id: contractState.contract.salon_id,
        master_id: contractState.contract.master_id,
        status: contractState.contract.status,
        version: contractState.contract.version,
        terms_json: contractState.contract.terms_json,
        effective_from: contractState.contract.effective_from || null,
        archived_at: contractState.contract.archived_at || null
      } : null,
      urls: {
        salon_internal: `/internal/salons/${salon.slug}`,
        master_internal: `/internal/masters/${master.slug}`
      }
    },
    errors: null,
    meta
  };
}

export async function activateMasterSalonCanonical({ pool, payload }){
  const input = validateActivateInput(payload || {});
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

    const nextRelation = relation.status === 'active'
      ? relation
      : await activateRelation(db, relation.id);

    const contractState = await acceptPendingContractIfNeeded(db, salon.id, master.id, input.accept_contract);

    await db.query('COMMIT');

    return buildActivationResult({
      salon,
      master,
      relation: nextRelation,
      contractState,
      meta: buildProvisionMeta({
        created: false,
        updated: relation.status !== 'active' || contractState.updated,
        idempotent: relation.status === 'active' && (!input.accept_contract || contractState.idempotent || !contractState.contract)
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

export default activateMasterSalonCanonical;
