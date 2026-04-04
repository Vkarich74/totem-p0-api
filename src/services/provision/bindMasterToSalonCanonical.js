import {
  buildProvisionMeta,
  resolveProvisionError
} from "./provisionShared.js";

function normalizeText(value){
  return String(value || "").trim();
}

function validateTerms(terms = {}){
  const master = Number(terms.master_percent ?? 0);
  const salon = Number(terms.salon_percent ?? 0);
  const platform = Number(terms.platform_percent ?? 0);
  const payoutSchedule = normalizeText(terms.payout_schedule || "manual") || "manual";

  if(!Number.isFinite(master) || !Number.isFinite(salon) || !Number.isFinite(platform)){
    const err = new Error("INVALID_CONTRACT_TERMS");
    err.code = "INVALID_CONTRACT_TERMS";
    throw err;
  }

  if(master < 0 || salon < 0 || platform < 0){
    const err = new Error("INVALID_CONTRACT_TERMS");
    err.code = "INVALID_CONTRACT_TERMS";
    throw err;
  }

  if(master + salon + platform !== 100){
    const err = new Error("INVALID_CONTRACT_TERMS");
    err.code = "INVALID_CONTRACT_TERMS";
    throw err;
  }

  return {
    master_percent: master,
    salon_percent: salon,
    platform_percent: platform,
    payout_schedule: payoutSchedule
  };
}

function validateBindInput(payload = {}){
  const salonSlug = normalizeText(payload.salon_slug);
  const masterSlug = normalizeText(payload.master_slug);
  const bindMode = normalizeText(payload.bind_mode || "pending").toLowerCase();
  const createContract = Boolean(payload.create_contract);
  const effectiveFrom = payload.effective_from ? new Date(payload.effective_from) : null;

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

  if(bindMode !== "pending" && bindMode !== "active"){
    const err = new Error("INVALID_BIND_MODE");
    err.code = "INVALID_BIND_MODE";
    throw err;
  }

  if(effectiveFrom && Number.isNaN(effectiveFrom.getTime())){
    const err = new Error("INVALID_EFFECTIVE_FROM");
    err.code = "INVALID_EFFECTIVE_FROM";
    throw err;
  }

  return {
    salon_slug: salonSlug,
    master_slug: masterSlug,
    bind_mode: bindMode,
    create_contract: createContract,
    contract_terms: createContract ? validateTerms(payload.contract_terms || {}) : null,
    effective_from: effectiveFrom
  };
}

async function findSalonBySlug(db, slug){
  const result = await db.query(
    `SELECT id, slug, name, status
     FROM salons
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

async function findMasterBySlug(db, slug){
  const result = await db.query(
    `SELECT id, slug, name, active, user_id
     FROM masters
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

async function upsertMasterSalonRelation(db, salonId, masterId, bindMode){
  const existing = await db.query(
    `SELECT
       id,
       master_id,
       salon_id,
       status,
       invited_at,
       activated_at,
       fired_at,
       created_at,
       updated_at
     FROM master_salon
     WHERE salon_id = $1
       AND master_id = $2
     FOR UPDATE
     LIMIT 1`,
    [salonId, masterId]
  );

  if(existing.rows.length){
    const current = existing.rows[0];
    const nextStatus = bindMode;
    const invitedAt = nextStatus === "pending" ? current.invited_at || new Date() : current.invited_at;
    const activatedAt = nextStatus === "active" ? current.activated_at || new Date() : null;

    const updated = await db.query(
      `UPDATE master_salon
       SET
         status = $2,
         invited_at = $3,
         activated_at = $4,
         fired_at = NULL,
         updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         master_id,
         salon_id,
         status,
         invited_at,
         activated_at,
         fired_at,
         created_at,
         updated_at`,
      [
        current.id,
        nextStatus,
        invitedAt,
        activatedAt
      ]
    );

    return {
      relation: updated.rows[0],
      created: false,
      updated: true,
      idempotent: current.status === nextStatus
    };
  }

  const invitedAt = bindMode === "pending" ? new Date() : null;
  const activatedAt = bindMode === "active" ? new Date() : null;

  const inserted = await db.query(
    `INSERT INTO master_salon(
       master_id,
       salon_id,
       status,
       invited_at,
       activated_at,
       fired_at,
       created_at,
       updated_at
     )
     VALUES($1, $2, $3, $4, $5, NULL, NOW(), NOW())
     RETURNING
       id,
       master_id,
       salon_id,
       status,
       invited_at,
       activated_at,
       fired_at,
       created_at,
       updated_at`,
    [masterId, salonId, bindMode, invitedAt, activatedAt]
  );

  return {
    relation: inserted.rows[0],
    created: true,
    updated: false,
    idempotent: false
  };
}

async function ensureContractState(db, payload){
  if(!payload.create_contract){
    return {
      created: false,
      idempotent: false,
      contract: null
    };
  }

  const existing = await db.query(
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
     WHERE salon_id = $1
       AND master_id = $2
       AND status IN ('pending', 'active')
     ORDER BY created_at DESC
     LIMIT 1`,
    [String(payload.salonId), String(payload.masterId)]
  );

  if(existing.rows.length){
    return {
      created: false,
      idempotent: true,
      contract: existing.rows[0]
    };
  }

  const inserted = await db.query(
    `INSERT INTO contracts(
       salon_id,
       master_id,
       status,
       version,
       terms_json,
       effective_from,
       created_at
     )
     VALUES($1, $2, 'pending', 1, $3, $4, NOW())
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
    [
      String(payload.salonId),
      String(payload.masterId),
      payload.contract_terms,
      payload.effective_from || new Date()
    ]
  );

  return {
    created: true,
    idempotent: false,
    contract: inserted.rows[0]
  };
}

function buildBindResult({ salon, master, relationState, contractState }){
  return {
    ok: true,
    flow: "bind_master_to_salon",
    result: {
      type: "bind",
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
      relation: relationState.relation ? {
        id: relationState.relation.id,
        salon_id: relationState.relation.salon_id,
        master_id: relationState.relation.master_id,
        status: relationState.relation.status,
        invited_at: relationState.relation.invited_at || null,
        activated_at: relationState.relation.activated_at || null,
        fired_at: relationState.relation.fired_at || null,
        updated_at: relationState.relation.updated_at || null
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
    meta: buildProvisionMeta({
      created: Boolean(relationState.created || contractState.created),
      updated: Boolean(relationState.updated),
      idempotent: Boolean(relationState.idempotent && (!contractState.contract || contractState.idempotent))
    })
  };
}

export async function bindMasterToSalonCanonical({ pool, payload }){
  const input = validateBindInput(payload || {});
  const db = await pool.connect();

  try{
    await db.query("BEGIN");

    const salon = await findSalonBySlug(db, input.salon_slug);
    if(!salon){
      const err = new Error("SALON_NOT_FOUND");
      err.code = "SALON_NOT_FOUND";
      throw err;
    }

    const master = await findMasterBySlug(db, input.master_slug);
    if(!master){
      const err = new Error("MASTER_NOT_FOUND");
      err.code = "MASTER_NOT_FOUND";
      throw err;
    }

    const relationState = await upsertMasterSalonRelation(db, salon.id, master.id, input.bind_mode);
    const contractState = await ensureContractState(db, {
      create_contract: input.create_contract,
      salonId: salon.id,
      masterId: master.id,
      contract_terms: input.contract_terms,
      effective_from: input.effective_from
    });

    await db.query("COMMIT");

    return buildBindResult({
      salon,
      master,
      relationState,
      contractState
    });
  }catch(err){
    try{ await db.query("ROLLBACK"); }catch(e){}

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


// RESPONSE NORMALIZATION ADDITIVE
function buildCanonicalResponse(base){
    return {
        ok: true,
        owner_type: base.owner_type || null,
        owner_id: base.owner_id || null,
        canonical_slug: base.slug || null,
        public_url: base.slug ? `/public/${base.owner_type}/${base.slug}` : null,
        cabinet_url: base.slug ? `#/${base.owner_type}/${base.slug}` : null,
        lifecycle_state: base.lifecycle_state || 'draft',
        access_state: base.access_state || 'none',
        relation_status: base.relation_status || null,
        readiness_flag: base.readiness_flag || 'draft',
        meta: base.meta || {}
    }
}
