import {assertKgSharedMasterPending} from "./kgSharedMasterIdentity.js";

import {
  activateReservedSlug,
  checkSlugAvailability,
  reserveSlug
} from "./slugReservation.js";
import { normalizeContactPhoneForBusiness } from "../contactPhone.js";
import { US_COUNTRY_PACK } from "../../market-context/country-packs/US.js";
import {
  buildCanonicalProvisionResponse,
  buildProvisionMeta,
  createOnboardingIdentityIfNeeded,
  createOnboardingTransition,
  ensureUniqueMasterSlug,
  findExistingAuthUser,
  normalizeLifecycleState,
  resolveProvisionError,
  validateMasterProvisionInput
} from "./provisionShared.js";

async function findMasterBySlug(db, slug){
  const result = await db.query(
    `SELECT
       id,
       slug,
       name,
       active,
       user_id,
       created_at
     FROM masters
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

async function findMasterByUserId(db, userId){
  const result = await db.query(
    `SELECT
       id,
       slug,
       name,
       active,
       user_id,
       created_at
     FROM masters
     WHERE user_id = $1
     ORDER BY id ASC
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

async function authUsersHasColumn(db, columnName){
  const result = await db.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='auth_users'
       AND column_name=$1
     LIMIT 1`,
    [columnName]
  );

  return result.rows.length > 0;
}



async function createProvisionMasterAuthUser(db, { input, masterSlug }){
  const hasSalonSlug = await authUsersHasColumn(db, "salon_slug");
  const hasMasterSlug = await authUsersHasColumn(db, "master_slug");
  const hasSalonId = await authUsersHasColumn(db, "salon_id");
  const hasMasterId = await authUsersHasColumn(db, "master_id");
  const hasPasswordHash = await authUsersHasColumn(db, "password_hash");
  const hasMustSetPassword = await authUsersHasColumn(db, "must_set_password");
  const hasPasswordChangedAt = await authUsersHasColumn(db, "password_changed_at");
  const hasPhone = await authUsersHasColumn(db, "phone");
  if(input.phone && !hasPhone){
    const error = new Error("PROVISION_CONTACT_PHONE_COLUMN_MISSING");
    error.code = "PROVISION_CONTACT_PHONE_COLUMN_MISSING";
    throw error;
  }


  const columns = [];
  const valueSql = [];
  const params = [];

  function pushParamColumn(column, value){
    columns.push(column);
    params.push(value);
    valueSql.push(`$${params.length}`);
  }

  pushParamColumn("email", input.email);
  pushParamColumn("role", "master");

  if(hasSalonSlug){
    pushParamColumn("salon_slug", null);
  }

  if(hasMasterSlug){
    pushParamColumn("master_slug", masterSlug);
  }

  pushParamColumn("enabled", input.market_code !== "US");

  columns.push("created_at");
  valueSql.push("NOW()");

  if(hasSalonId){
    pushParamColumn("salon_id", null);
  }

  if(hasMasterId){
    pushParamColumn("master_id", null);
  }

  if(hasPasswordHash){
    pushParamColumn("password_hash", null);
  }

  if(hasMustSetPassword){
    pushParamColumn("must_set_password", true);
  }

  if(hasPasswordChangedAt){
    pushParamColumn("password_changed_at", null);
  }

  if(hasPhone){
    pushParamColumn("phone", input.phone);
  }

  const created = await db.query(
    `INSERT INTO auth_users(
       ${columns.join(",\n       ")}
     )
     VALUES(${valueSql.join(", ")})
     RETURNING
       id,
       email,
       role,
       salon_slug,
       master_slug,
       enabled,
       created_at,
       salon_id,
       master_id,
       must_set_password,
       phone`,
    params
  );

  return created.rows[0] || null;
}

function buildProvisionResult({ user, master, onboardingIdentity, onboardingTransition, reservation, meta, isIdempotent = false }){
  const lifecycleState = normalizeLifecycleState(onboardingIdentity?.state, isIdempotent ? "active" : "onboarding");

  return buildCanonicalProvisionResponse({
    ok: true,
    flow: "create_master",
    owner_type: "master",
    owner_id: master.id,
    canonical_slug: master.slug,
    lifecycle_state: lifecycleState,
    access_state: lifecycleState === "active" ? "active" : "none",
    relation_status: null,
    readiness_flag: isIdempotent ? "ready" : "awaiting_activation",
    result: {
      type: "master",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        master_slug: user.master_slug,
        master_id: user.master_id || null,
        enabled: user.enabled,
        must_set_password: user.must_set_password ?? null,
        phone: user.phone ?? null
      },
      master: {
        id: master.id,
        slug: master.slug,
        name: master.name,
        active: master.active,
        user_id: master.user_id
      },
      onboarding: {
        identity_created: Boolean(onboardingIdentity),
        transition_created: Boolean(onboardingTransition),
        identity: onboardingIdentity,
        transition: onboardingTransition
      },
      reservation: reservation ? {
        id: reservation.id,
        owner_type: reservation.owner_type,
        owner_id: reservation.owner_id,
        slug: reservation.slug,
        status: reservation.status,
        expires_at: reservation.expires_at,
        activated_at: reservation.activated_at
      } : null,
      urls: {
        public: `/master/${encodeURIComponent(master.slug)}`,
        internal: `/internal/masters/${master.slug}`
      }
    },
    errors: null,
    meta
  });
}

async function resolveMasterSlugForReservation(db, requestedSlug){
  const requested = String(requestedSlug || "").trim();
  const availability = await checkSlugAvailability(db, "master", requested);

  if(availability.available){
    return availability.slug;
  }

  return ensureUniqueMasterSlug(db, requested);
}

export async function createMasterCanonical({ pool, payload, dbClient = null, kgSharedRequestId=null }){
  const input = validateMasterProvisionInput(payload || {});
  const ownsTransaction = !dbClient;
  const db = dbClient || await pool.connect();

  try{
    if (ownsTransaction) await db.query("BEGIN");

    const phoneResult = input.market_code === "US"
      ? US_COUNTRY_PACK.normalizeBusinessPhone(input.phone)
      : await normalizeContactPhoneForBusiness(db, input.phone, {
        marketCode: input.market_code || "",
        required: false,
      });
    if(!phoneResult.ok){
      const error = new Error(phoneResult.error);
      error.code = phoneResult.error;
      throw error;
    }
    input.phone = phoneResult.phone;

    if(kgSharedRequestId){
      if(!dbClient||input.market_code!=="KG")throw Object.assign(Error("KG_SHARED_MASTER_TRANSACTION_REQUIRED"),{code:"KG_SHARED_MASTER_TRANSACTION_REQUIRED",status:409});
      const r=(await db.query("SELECT * FROM public.owner_opening_requests WHERE id=$1 AND status='provisioning' FOR UPDATE",[kgSharedRequestId])).rows[0];
      const a=await assertKgSharedMasterPending(db,r);
      if(r.email!==input.email||r.name!==input.name||r.slug_final!==input.master_slug||r.phone_normalized!==input.phone)
        throw Object.assign(Error("KG_SHARED_MASTER_INPUT_CHANGED"),{code:"KG_SHARED_MASTER_INPUT_CHANGED",status:409});
      const availability=await checkSlugAvailability(db,"master",input.master_slug);
      if(!availability.available||availability.slug!==input.master_slug)throw Object.assign(Error("SLUG_NOT_AVAILABLE"),{code:"SLUG_NOT_AVAILABLE",status:409});
      const reservation=await reserveSlug(db,{owner_type:"master",slug:input.master_slug,meta:{source:"kg_shared_master"}});
      const master=(await db.query("INSERT INTO public.masters(slug,name,active,created_at,user_id) VALUES($1,$2,false,NOW(),$3) RETURNING *",
        [input.master_slug,input.name,a.principal_auth_user_id])).rows[0];
      const user=(await db.query("SELECT id,email,role,master_slug,master_id,enabled,must_set_password,phone FROM public.auth_users WHERE id=$1",
        [a.principal_auth_user_id])).rows[0];
      const activatedReservation=await activateReservedSlug(db,{owner_type:"master",slug:master.slug,owner_id:Number(master.id),reservation_id:reservation?.reservation?.id||reservation?.id||null});
      return buildProvisionResult({user,master,onboardingIdentity:null,onboardingTransition:null,reservation:activatedReservation?.reservation||activatedReservation,
        meta:buildProvisionMeta({created:true})});
    }
    const existingUser = await findExistingAuthUser(db, input.email, "master");

    if(existingUser){
      const existingMasterSlug = String(existingUser.master_slug || "").trim();
      const existingMaster = existingMasterSlug
        ? await findMasterBySlug(db, existingMasterSlug)
        : await findMasterByUserId(db, existingUser.id);

      if(!existingMaster){
        const err = new Error("AUTH_USER_ALREADY_EXISTS_WITHOUT_MASTER");
        err.code = "AUTH_USER_ALREADY_EXISTS_WITHOUT_MASTER";
        throw err;
      }

      const existingUserAligned =
        String(existingUser.master_id || "") === String(existingMaster.id)
          ? existingUser
          : (
              await db.query(
                `UPDATE auth_users
                 SET master_id = $2,
                     master_slug = $3
                 WHERE id = $1
                 RETURNING
                   id,
                   email,
                   role,
                   salon_slug,
                   master_slug,
                   enabled,
                   created_at,
                   salon_id,
                   master_id,
                   must_set_password,
                   phone`,
                [existingUser.id, String(existingMaster.id), existingMaster.slug]
              )
            ).rows[0] || existingUser;

      const onboardingIdentity = await createOnboardingIdentityIfNeeded(db, {
        ...input,
        granted_role: "master",
        state: "PROVISIONED"
      });

      const onboardingTransition = await createOnboardingTransition(db, {
        core_user_id: existingUser.id,
        from_state: "PROVISIONED",
        to_state: "PROVISIONED",
        reason: "create_master_idempotent"
      });

      if (ownsTransaction) await db.query("COMMIT");

      return buildProvisionResult({
        user: existingUserAligned,
        master: existingMaster,
        onboardingIdentity,
        onboardingTransition,
        reservation: null,
        meta: buildProvisionMeta({ created: false, updated: true, idempotent: true }),
        isIdempotent: true
      });
    }

    const finalMasterSlug = await resolveMasterSlugForReservation(db, input.master_slug || input.name);

    const reservation = await reserveSlug(db, {
      owner_type: "master",
      slug: finalMasterSlug,
      meta: {
        source: "create_master",
        email: input.email
      }
    });

    const user = await createProvisionMasterAuthUser(db, {
      input,
      masterSlug: finalMasterSlug
    });

    const masterCreated = await db.query(
      `INSERT INTO masters(
         slug,
         name,
         active,
         created_at,
         user_id
       )
       VALUES($1, $2, $3, NOW(), $4)
       RETURNING
         id,
         slug,
         name,
         active,
         created_at,
         user_id`,
      [finalMasterSlug, input.name, input.market_code !== "US", user.id]
    );

    const master = masterCreated.rows[0];

    const userUpdated = await db.query(
      `UPDATE auth_users
       SET master_id = $2
       WHERE id = $1
       RETURNING
         id,
         email,
         role,
         salon_slug,
         master_slug,
         enabled,
         created_at,
         salon_id,
         master_id,
         must_set_password,
         phone`,
      [user.id, String(master.id)]
    );

    const finalUser = userUpdated.rows[0] || user;

    const onboardingIdentity = await createOnboardingIdentityIfNeeded(db, {
      ...input,
      granted_role: "master",
      state: "PROVISIONED"
    });

    const onboardingTransition = await createOnboardingTransition(db, {
      core_user_id: finalUser.id,
      from_state: "PENDING",
      to_state: "PROVISIONED",
      reason: "create_master"
    });

    const activatedReservation = await activateReservedSlug(db, {
      owner_type: "master",
      slug: finalMasterSlug,
      owner_id: Number(master.id),
      reservation_id: reservation?.reservation?.id || reservation?.id || null
    });

    if (ownsTransaction) await db.query("COMMIT");

    return buildProvisionResult({
      user: finalUser,
      master,
      onboardingIdentity,
      onboardingTransition,
      reservation: activatedReservation?.reservation || activatedReservation || null,
      meta: buildProvisionMeta({ created: true, updated: false, idempotent: false }),
      isIdempotent: false
    });
  }catch(err){
    if (ownsTransaction) {
      try{ await db.query("ROLLBACK"); }catch(_error){}
    }

    const resolved = err?.status&&String(err.code||"").startsWith("KG_SHARED_MASTER_")?{status:err.status,error:err.code}:resolveProvisionError(err);
    const wrapped = new Error(resolved.error);
    wrapped.code = resolved.error;
    wrapped.status = resolved.status;
    wrapped.details = err?.details || null;
    throw wrapped;
  }finally{
    if (ownsTransaction) db.release();
  }
}

export default createMasterCanonical;
