import {
  buildCanonicalProvisionResponse,
  buildProvisionMeta,
  resolveProvisionError
} from "./provisionShared.js";

function normalizeText(value){
  return String(value || "").trim();
}

function safeInt(value){
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function resolveFixedRentPeriodStart(contract){
  const rawStart = contract?.effective_from || contract?.created_at || null;
  const startDate = rawStart ? new Date(rawStart) : new Date();

  if(Number.isNaN(startDate.getTime())){
    const err = new Error("FIXED_RENT_PERIOD_NOT_SUPPORTED");
    err.code = "FIXED_RENT_PERIOD_NOT_SUPPORTED";
    throw err;
  }

  return startDate.toISOString();
}

async function resolveFixedRentOwnership(db, contract){
  const salonTextId = String(contract?.salon_id ?? "").trim();
  const masterTextId = String(contract?.master_id ?? "").trim();
  const salonNumericId = safeInt(salonTextId);
  const masterNumericId = safeInt(masterTextId);

  if(!salonNumericId || !masterNumericId){
    const err = new Error("FIXED_RENT_PARTIES_RESOLVE_FAILED");
    err.code = "FIXED_RENT_PARTIES_RESOLVE_FAILED";
    throw err;
  }

  const salon = await db.query(
    `SELECT id
     FROM salons
     WHERE id=$1
     LIMIT 1`,
    [salonNumericId]
  );

  const master = await db.query(
    `SELECT id
     FROM masters
     WHERE id=$1
     LIMIT 1`,
    [masterNumericId]
  );

  if(!salon.rows.length || !master.rows.length){
    const err = new Error("FIXED_RENT_PARTIES_RESOLVE_FAILED");
    err.code = "FIXED_RENT_PARTIES_RESOLVE_FAILED";
    throw err;
  }

  return {
    contract_salon_id: salonTextId,
    contract_master_id: masterTextId,
    salon_id: salon.rows[0].id,
    master_id: master.rows[0].id
  };
}

async function upsertFixedRentObligation(db, contract, source, createdByFlow){
  if(String(contract?.terms_json?.model || "").trim().toLowerCase() !== "fixed_rent"){
    const err = new Error("FIXED_RENT_MODEL_REQUIRED");
    err.code = "FIXED_RENT_MODEL_REQUIRED";
    throw err;
  }

  const rentPeriod = normalizeText(contract?.terms_json?.rent_period || "monthly").toLowerCase();
  if(rentPeriod !== "monthly"){
    const err = new Error("FIXED_RENT_PERIOD_NOT_SUPPORTED");
    err.code = "FIXED_RENT_PERIOD_NOT_SUPPORTED";
    throw err;
  }

  const rentAmount = Number(contract?.terms_json?.rent_amount);
  if(!Number.isFinite(rentAmount) || rentAmount <= 0){
    const err = new Error("FIXED_RENT_AMOUNT_INVALID");
    err.code = "FIXED_RENT_AMOUNT_INVALID";
    throw err;
  }

  const ownership = await resolveFixedRentOwnership(db, contract);
  const periodStart = resolveFixedRentPeriodStart(contract);
  const currency = normalizeText(contract?.terms_json?.currency || "KGS").toUpperCase();
  const metadata = JSON.stringify({
    source,
    rent_period: rentPeriod,
    created_by_flow: createdByFlow
  });

  const inserted = await db.query(
    `INSERT INTO public.contract_rent_obligations (
       contract_id,
       contract_salon_id,
       contract_master_id,
       salon_id,
       master_id,
       period_start,
       period_end,
       amount,
       currency,
       status,
       due_at,
       metadata
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6::timestamptz,
       $6::timestamptz + interval '1 month',
       $7,
       $8,
       'open',
       $6::timestamptz,
       $9::jsonb
     )
     ON CONFLICT (contract_id, period_start, period_end)
     DO NOTHING
     RETURNING *`,
    [
      contract.id,
      ownership.contract_salon_id,
      ownership.contract_master_id,
      ownership.salon_id,
      ownership.master_id,
      periodStart,
      rentAmount,
      currency,
      metadata
    ]
  );

  if(inserted.rows.length){
    return inserted.rows[0];
  }

  const existing = await db.query(
    `SELECT
       id,
       contract_id,
       contract_salon_id,
       contract_master_id,
       salon_id,
       master_id,
       period_start,
       period_end,
       amount,
       currency,
       status,
       due_at,
       paid_at,
       created_at,
       updated_at,
       cancelled_at,
       metadata
     FROM public.contract_rent_obligations
     WHERE contract_id=$1
       AND period_start=$2::timestamptz
       AND period_end=($2::timestamptz + interval '1 month')
     LIMIT 1`,
    [contract.id, periodStart]
  );

  return existing.rows[0] || null;
}

async function resolveSalaryOwnership(db, contract){
  const salonTextId = String(contract?.salon_id ?? "").trim();
  const masterTextId = String(contract?.master_id ?? "").trim();
  const salonNumericId = safeInt(salonTextId);
  const masterNumericId = safeInt(masterTextId);

  if(!salonNumericId || !masterNumericId){
    const err = new Error("SALARY_PARTIES_RESOLVE_FAILED");
    err.code = "SALARY_PARTIES_RESOLVE_FAILED";
    throw err;
  }

  const salon = await db.query(
    `SELECT id
     FROM salons
     WHERE id=$1
     LIMIT 1`,
    [salonNumericId]
  );

  const master = await db.query(
    `SELECT id
     FROM masters
     WHERE id=$1
     LIMIT 1`,
    [masterNumericId]
  );

  if(!salon.rows.length || !master.rows.length){
    const err = new Error("SALARY_PARTIES_RESOLVE_FAILED");
    err.code = "SALARY_PARTIES_RESOLVE_FAILED";
    throw err;
  }

  return {
    contract_salon_id: salonTextId,
    contract_master_id: masterTextId,
    salon_id: salon.rows[0].id,
    master_id: master.rows[0].id
  };
}

function resolveSalaryPeriodStart(contract){
  const rawStart = contract?.effective_from || contract?.created_at || null;
  const startDate = rawStart ? new Date(rawStart) : new Date();

  if(Number.isNaN(startDate.getTime())){
    const err = new Error("SALARY_PERIOD_NOT_SUPPORTED");
    err.code = "SALARY_PERIOD_NOT_SUPPORTED";
    throw err;
  }

  return startDate.toISOString();
}

async function upsertSalaryObligation(db, contract, source, createdByFlow){
  if(String(contract?.terms_json?.model || "").trim().toLowerCase() !== "salary"){
    const err = new Error("SALARY_MODEL_REQUIRED");
    err.code = "SALARY_MODEL_REQUIRED";
    throw err;
  }

  const salaryPeriod = String(contract?.terms_json?.salary_period || "monthly").trim().toLowerCase();
  if(!["weekly", "monthly"].includes(salaryPeriod)){
    const err = new Error("SALARY_PERIOD_NOT_SUPPORTED");
    err.code = "SALARY_PERIOD_NOT_SUPPORTED";
    throw err;
  }

  const salaryAmount = Number(contract?.terms_json?.salary_amount);
  if(!Number.isInteger(salaryAmount) || salaryAmount <= 0){
    const err = new Error("SALARY_AMOUNT_INVALID");
    err.code = "SALARY_AMOUNT_INVALID";
    throw err;
  }

  const ownership = await resolveSalaryOwnership(db, contract);
  const periodStart = resolveSalaryPeriodStart(contract);
  const periodStartDate = new Date(periodStart);
  const periodEndDate = new Date(periodStartDate.getTime());
  if(salaryPeriod === "weekly"){
    periodEndDate.setUTCDate(periodEndDate.getUTCDate() + 7);
  }else{
    periodEndDate.setUTCMonth(periodEndDate.getUTCMonth() + 1);
  }
  const periodEnd = periodEndDate.toISOString();
  const currency = normalizeText(contract?.terms_json?.currency || "KGS").toUpperCase();
  const metadata = JSON.stringify({
    source,
    salary_period: salaryPeriod,
    created_by_flow: createdByFlow,
    direction: "salon_to_master"
  });

  const inserted = await db.query(
    `INSERT INTO public.contract_salary_obligations (
       contract_id,
       contract_salon_id,
       contract_master_id,
       salon_id,
       master_id,
       period_start,
       period_end,
       amount,
       currency,
       status,
       due_at,
       metadata
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6::timestamptz,
       $7::timestamptz,
       $8,
       $9,
       'open',
       $7::timestamptz,
       $10::jsonb
     )
     ON CONFLICT (contract_id, period_start, period_end)
     DO NOTHING
     RETURNING *`,
    [
      contract.id,
      ownership.contract_salon_id,
      ownership.contract_master_id,
      ownership.salon_id,
      ownership.master_id,
      periodStart,
      periodEnd,
      salaryAmount,
      currency,
      metadata
    ]
  );

  if(inserted.rows.length){
    return inserted.rows[0];
  }

  const existing = await db.query(
    `SELECT
       id,
       contract_id,
       contract_salon_id,
       contract_master_id,
       salon_id,
       master_id,
       period_start,
       period_end,
       amount,
       currency,
       status,
       due_at,
       paid_at,
       created_at,
       updated_at,
       cancelled_at,
       metadata
     FROM public.contract_salary_obligations
     WHERE contract_id=$1
       AND period_start=$2::timestamptz
       AND period_end=$3::timestamptz
     LIMIT 1`,
    [contract.id, periodStart, periodEnd]
  );

  return existing.rows[0] || null;
}

function normalizeHybridBaseConfig(contract){
  const model = String(contract?.terms_json?.model || "").trim().toLowerCase();
  if(model !== "hybrid"){
    const err = new Error("HYBRID_MODEL_REQUIRED");
    err.code = "HYBRID_MODEL_REQUIRED";
    throw err;
  }

  const baseType = normalizeText(contract?.terms_json?.base_type || "").toLowerCase();
  if(!["salary", "fixed_rent"].includes(baseType)){
    const err = new Error("HYBRID_BASE_TYPE_NOT_SUPPORTED");
    err.code = "HYBRID_BASE_TYPE_NOT_SUPPORTED";
    throw err;
  }

  const baseAmount = Number(contract?.terms_json?.base_amount);
  if(!Number.isInteger(baseAmount) || baseAmount <= 0){
    const err = new Error("HYBRID_BASE_AMOUNT_INVALID");
    err.code = "HYBRID_BASE_AMOUNT_INVALID";
    throw err;
  }

  const basePeriod = normalizeText(contract?.terms_json?.base_period || "monthly").toLowerCase();
  if(baseType === "fixed_rent"){
    if(basePeriod !== "monthly"){
      const err = new Error("HYBRID_BASE_PERIOD_NOT_SUPPORTED");
      err.code = "HYBRID_BASE_PERIOD_NOT_SUPPORTED";
      throw err;
    }
  }else if(!["weekly", "monthly"].includes(basePeriod)){
    const err = new Error("HYBRID_BASE_PERIOD_NOT_SUPPORTED");
    err.code = "HYBRID_BASE_PERIOD_NOT_SUPPORTED";
    throw err;
  }

  return {
    baseType,
    baseAmount,
    basePeriod
  };
}

async function upsertHybridObligation(db, contract, source, createdByFlow){
  const { baseType, baseAmount, basePeriod } = normalizeHybridBaseConfig(contract);

  if(baseType === "salary"){
    const derivedContract = {
      ...contract,
      terms_json: {
        ...contract.terms_json,
        model: "salary",
        salary_amount: baseAmount,
        salary_period: basePeriod
      }
    };

    try{
      return await upsertSalaryObligation(db, derivedContract, source, createdByFlow);
    }catch(err){
      if(err?.code === "SALARY_PARTIES_RESOLVE_FAILED"){
        const hybridErr = new Error("HYBRID_PARTIES_RESOLVE_FAILED");
        hybridErr.code = "HYBRID_PARTIES_RESOLVE_FAILED";
        throw hybridErr;
      }

      throw err;
    }
  }

  const derivedContract = {
    ...contract,
    terms_json: {
      ...contract.terms_json,
      model: "fixed_rent",
      rent_amount: baseAmount,
      rent_period: basePeriod,
      settlement_mode: normalizeText(contract?.terms_json?.settlement_mode || "accrued") || "accrued"
    }
  };

  try{
    return await upsertFixedRentObligation(db, derivedContract, source, createdByFlow);
  }catch(err){
    if(err?.code === "FIXED_RENT_PARTIES_RESOLVE_FAILED"){
      const hybridErr = new Error("HYBRID_PARTIES_RESOLVE_FAILED");
      hybridErr.code = "HYBRID_PARTIES_RESOLVE_FAILED";
      throw hybridErr;
    }

    throw err;
  }
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
    const activeContract = existingActive.rows[0];
    const activeModel = String(activeContract?.terms_json?.model || "").trim().toLowerCase();
    const obligation = activeModel === "fixed_rent"
      ? await upsertFixedRentObligation(db, activeContract, "fixed_rent_provisioning_accept", "activate_master_salon_canonical")
      : activeModel === "salary"
        ? await upsertSalaryObligation(db, activeContract, "salary_provisioning_accept", "activate_master_salon_canonical")
        : activeModel === "hybrid"
          ? await upsertHybridObligation(db, activeContract, "hybrid_provisioning_accept", "activate_master_salon_canonical")
          : null;

    return {
      updated: false,
      idempotent: true,
      contract: activeContract,
      obligation
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

  const activeContract = activated.rows[0] || pending.rows[0];
  const activeModel = String(activeContract?.terms_json?.model || "").trim().toLowerCase();
  const obligation = activeModel === "fixed_rent"
    ? await upsertFixedRentObligation(db, activeContract, "fixed_rent_provisioning_accept", "activate_master_salon_canonical")
    : activeModel === "salary"
      ? await upsertSalaryObligation(db, activeContract, "salary_provisioning_accept", "activate_master_salon_canonical")
      : activeModel === "hybrid"
        ? await upsertHybridObligation(db, activeContract, "hybrid_provisioning_accept", "activate_master_salon_canonical")
        : null;

  return {
    updated: true,
    idempotent: false,
    contract: activeContract,
    obligation
  };
}

function buildActivationResult({ salon, master, relation, contractState, meta }){
  return buildCanonicalProvisionResponse({
    ok: true,
    flow: "activate_master_salon",
    owner_type: "salon",
    owner_id: salon.id,
    canonical_slug: salon.slug,
    lifecycle_state: relation?.status === "active" ? "active" : "onboarding",
    access_state: relation?.status === "active" ? "active" : "none",
    relation_status: relation?.status || null,
    readiness_flag: relation?.status === "active" ? "ready" : "pending_bind",
    result: {
      type: "activate_bind",
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
      obligation: contractState.obligation ? {
        id: contractState.obligation.id,
        contract_id: contractState.obligation.contract_id,
        salon_id: contractState.obligation.salon_id,
        master_id: contractState.obligation.master_id,
        period_start: contractState.obligation.period_start,
        period_end: contractState.obligation.period_end,
        amount: contractState.obligation.amount,
        currency: contractState.obligation.currency,
        status: contractState.obligation.status,
        due_at: contractState.obligation.due_at,
        paid_at: contractState.obligation.paid_at,
        created_at: contractState.obligation.created_at,
        updated_at: contractState.obligation.updated_at,
        cancelled_at: contractState.obligation.cancelled_at,
        metadata: contractState.obligation.metadata
      } : null,
      urls: {
        salon_internal: `/internal/salons/${salon.slug}`,
        master_internal: `/internal/masters/${master.slug}`
      }
    },
    errors: null,
    meta
  });
}

export async function activateMasterSalonCanonical({ pool, payload }){
  const input = validateActivateInput(payload || {});
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

    const relation = await lockRelation(db, salon.id, master.id);
    if(!relation){
      const err = new Error("MASTER_SALON_LINK_NOT_FOUND");
      err.code = "MASTER_SALON_LINK_NOT_FOUND";
      throw err;
    }

    const nextRelation = relation.status === "active"
      ? relation
      : await activateRelation(db, relation.id);

    const contractState = await acceptPendingContractIfNeeded(db, salon.id, master.id, input.accept_contract);

    await db.query("COMMIT");

    return buildActivationResult({
      salon,
      master,
      relation: nextRelation,
      contractState,
      meta: buildProvisionMeta({
        created: false,
        updated: relation.status !== "active" || contractState.updated,
        idempotent: relation.status === "active" && (!input.accept_contract || contractState.idempotent || !contractState.contract)
      })
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

export default activateMasterSalonCanonical;
