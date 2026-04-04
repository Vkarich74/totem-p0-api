import {
  activateReservedSlug,
  checkSlugAvailability,
  reserveSlug
} from "./slugReservation.js";
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
        enabled: user.enabled
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
        public: `/master/${master.slug}`,
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

export async function createMasterCanonical({ pool, payload }){
  const input = validateMasterProvisionInput(payload || {});
  const db = await pool.connect();

  try{
    await db.query("BEGIN");

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
                   master_id`,
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

      await db.query("COMMIT");

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

    const userCreated = await db.query(
      `INSERT INTO auth_users(
         email,
         role,
         salon_slug,
         master_slug,
         enabled,
         created_at,
         salon_id,
         master_id,
         password_hash
       )
       VALUES($1, 'master', NULL, $2, true, NOW(), NULL, NULL, $3)
       RETURNING
         id,
         email,
         role,
         salon_slug,
         master_slug,
         enabled,
         created_at,
         salon_id,
         master_id`,
      [input.email, finalMasterSlug, input.password_hash]
    );

    const user = userCreated.rows[0];

    const masterCreated = await db.query(
      `INSERT INTO masters(
         slug,
         name,
         active,
         created_at,
         user_id
       )
       VALUES($1, $2, true, NOW(), $3)
       RETURNING
         id,
         slug,
         name,
         active,
         created_at,
         user_id`,
      [finalMasterSlug, input.name, user.id]
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
         master_id`,
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

    await db.query("COMMIT");

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
    try{
      await db.query("ROLLBACK");
    }catch(_error){}

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

export default createMasterCanonical;
