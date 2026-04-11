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
  ensureUniqueSalonSlug,
  findExistingAuthUser,
  normalizeLifecycleState,
  resolveProvisionError,
  upsertOwnerSalonLink,
  upsertUserDefaultSalon,
  validateSalonProvisionInput
} from "./provisionShared.js";

async function findSalonBySlug(db, slug){
  const result = await db.query(
    `SELECT
       id,
       slug,
       name,
       status,
       city,
       phone,
       description,
       logo_url,
       cover_url,
       slogan,
       created_at
     FROM salons
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

function normalizeProvisionPhone(value){
  const raw = String(value || "").trim();
  if(!raw){
    return null;
  }

  const digits = raw.replace(/\D/g, "");

  if(digits.startsWith("996") && digits.length === 12){
    const local = digits.slice(3);
    if(local[0] === "0"){
      return null;
    }
    return `+996${local}`;
  }

  if(raw.startsWith("+996")){
    const local = raw.slice(4).replace(/\D/g, "");
    if(local.length !== 9 || local[0] === "0"){
      return null;
    }
    return `+996${local}`;
  }

  return null;
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

async function createProvisionSalonAuthUser(db, { input, salon }){
  const hasSalonSlug = await authUsersHasColumn(db, "salon_slug");
  const hasMasterSlug = await authUsersHasColumn(db, "master_slug");
  const hasSalonId = await authUsersHasColumn(db, "salon_id");
  const hasMasterId = await authUsersHasColumn(db, "master_id");
  const hasPasswordHash = await authUsersHasColumn(db, "password_hash");
  const hasMustSetPassword = await authUsersHasColumn(db, "must_set_password");
  const hasPhone = await authUsersHasColumn(db, "phone");
  const hasPasswordChangedAt = await authUsersHasColumn(db, "password_changed_at");

  const columns = ["email", "role", "enabled"];
  const values = [input.email, "salon_admin", true];

  if(hasSalonSlug){
    columns.push("salon_slug");
    values.push(salon.slug);
  }

  if(hasMasterSlug){
    columns.push("master_slug");
    values.push(null);
  }

  if(hasSalonId){
    columns.push("salon_id");
    values.push(String(salon.id));
  }

  if(hasMasterId){
    columns.push("master_id");
    values.push(null);
  }

  if(hasPasswordHash){
    columns.push("password_hash");
    values.push(null);
  }

  if(hasMustSetPassword){
    columns.push("must_set_password");
    values.push(true);
  }

  if(hasPhone){
    columns.push("phone");
    values.push(normalizeProvisionPhone(input.phone));
  }

  if(hasPasswordChangedAt){
    columns.push("password_changed_at");
    values.push(null);
  }

  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const returnFields = ["id", "email", "role", "enabled", "created_at"];

  if(hasSalonSlug){
    returnFields.push("salon_slug");
  }
  if(hasMasterSlug){
    returnFields.push("master_slug");
  }
  if(hasSalonId){
    returnFields.push("salon_id");
  }
  if(hasMasterId){
    returnFields.push("master_id");
  }
  if(hasPhone){
    returnFields.push("phone");
  }
  if(hasMustSetPassword){
    returnFields.push("must_set_password");
  }

  const created = await db.query(
    `INSERT INTO auth_users(
       ${columns.join(",\n       ")}
     )
     VALUES(${placeholders})
     RETURNING
       ${returnFields.join(",\n       ")}`,
    values
  );

  return created.rows[0] || null;
}

function buildProvisionResult({
  user,
  salon,
  ownerLink,
  defaultSalon,
  onboardingIdentity,
  onboardingTransition,
  reservation,
  meta,
  isIdempotent = false
}){
  const lifecycleState = normalizeLifecycleState(onboardingIdentity?.state, isIdempotent ? "active" : "onboarding");

  return buildCanonicalProvisionResponse({
    ok: true,
    flow: "create_salon",
    owner_type: "salon",
    owner_id: salon.id,
    canonical_slug: salon.slug,
    lifecycle_state: lifecycleState,
    access_state: lifecycleState === "active" ? "active" : "none",
    relation_status: ownerLink?.status || null,
    readiness_flag: isIdempotent ? "ready" : "awaiting_activation",
    result: {
      type: "salon",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        salon_slug: user.salon_slug,
        salon_id: user.salon_id || null,
        enabled: user.enabled,
        must_set_password: user.must_set_password ?? null,
        phone: user.phone || null
      },
      salon: {
        id: salon.id,
        slug: salon.slug,
        name: salon.name,
        status: salon.status || null,
        city: salon.city || null,
        phone: salon.phone || null
      },
      owner_link: ownerLink ? {
        id: ownerLink.id,
        owner_id: ownerLink.owner_id,
        salon_id: ownerLink.salon_id,
        status: ownerLink.status
      } : null,
      default_salon: defaultSalon ? {
        user_id: defaultSalon.user_id,
        default_salon_slug: defaultSalon.default_salon_slug,
        updated_at: defaultSalon.updated_at
      } : null,
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
        public: `/salon/${salon.slug}`,
        internal: `/internal/salons/${salon.slug}`
      }
    },
    errors: null,
    meta
  });
}

async function resolveSalonSlugForReservation(db, requestedSlug){
  const requested = String(requestedSlug || "").trim();
  const availability = await checkSlugAvailability(db, "salon", requested);

  if(availability.available){
    return availability.slug;
  }

  return ensureUniqueSalonSlug(db, requested);
}

export async function createSalonCanonical({ pool, payload }){
  const input = validateSalonProvisionInput(payload || {});
  const db = await pool.connect();

  try{
    await db.query("BEGIN");

    const existingUser = await findExistingAuthUser(db, input.email, "salon_admin");

    if(existingUser){
      const existingSalonSlug = String(existingUser.salon_slug || "").trim();
      const existingSalon = existingSalonSlug
        ? await findSalonBySlug(db, existingSalonSlug)
        : null;

      if(!existingSalon){
        const err = new Error("AUTH_USER_ALREADY_EXISTS_WITHOUT_SALON");
        err.code = "AUTH_USER_ALREADY_EXISTS_WITHOUT_SALON";
        throw err;
      }

      const ownerLink = await upsertOwnerSalonLink(db, existingUser.id, existingSalon.id);
      const defaultSalon = await upsertUserDefaultSalon(db, existingUser.id, existingSalon.slug);
      const onboardingIdentity = await createOnboardingIdentityIfNeeded(db, {
        ...input,
        granted_role: "salon_admin",
        state: "PROVISIONED"
      });
      const onboardingTransition = await createOnboardingTransition(db, {
        core_user_id: existingUser.id,
        from_state: "PROVISIONED",
        to_state: "PROVISIONED",
        reason: "create_salon_idempotent"
      });

      await db.query("COMMIT");

      return buildProvisionResult({
        user: existingUser,
        salon: existingSalon,
        ownerLink,
        defaultSalon,
        onboardingIdentity,
        onboardingTransition,
        reservation: null,
        meta: buildProvisionMeta({ created: false, updated: true, idempotent: true }),
        isIdempotent: true
      });
    }

    const finalSalonSlug = await resolveSalonSlugForReservation(db, input.salon_slug || input.salon_name);

    const reservation = await reserveSlug(db, {
      owner_type: "salon",
      slug: finalSalonSlug,
      meta: {
        source: "create_salon",
        email: input.email
      }
    });

    const salonCreated = await db.query(
      `INSERT INTO salons(
         slug,
         name,
         status,
         city,
         phone,
         description,
         logo_url,
         cover_url,
         slogan,
         created_at
       )
       VALUES($1, $2, 'draft', $3, $4, $5, $6, $7, $8, NOW())
       RETURNING
         id,
         slug,
         name,
         status,
         city,
         phone,
         description,
         logo_url,
         cover_url,
         slogan,
         created_at`,
      [
        finalSalonSlug,
        input.salon_name,
        input.city,
        input.phone,
        input.description,
        input.logo_url,
        input.cover_url,
        input.slogan
      ]
    );

    const salon = salonCreated.rows[0];

    const user = await createProvisionSalonAuthUser(db, {
      input,
      salon
    });

    const ownerLink = await upsertOwnerSalonLink(db, user.id, salon.id);
    const defaultSalon = await upsertUserDefaultSalon(db, user.id, salon.slug);

    const onboardingIdentity = await createOnboardingIdentityIfNeeded(db, {
      ...input,
      granted_role: "salon_admin",
      state: "PROVISIONED"
    });

    const onboardingTransition = await createOnboardingTransition(db, {
      core_user_id: user.id,
      from_state: "PENDING",
      to_state: "PROVISIONED",
      reason: "create_salon"
    });

    const activatedReservation = await activateReservedSlug(db, {
      owner_type: "salon",
      slug: salon.slug,
      owner_id: Number(salon.id),
      reservation_id: reservation?.reservation?.id || reservation?.id || null
    });

    await db.query("COMMIT");

    return buildProvisionResult({
      user,
      salon,
      ownerLink,
      defaultSalon,
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

export default createSalonCanonical;
