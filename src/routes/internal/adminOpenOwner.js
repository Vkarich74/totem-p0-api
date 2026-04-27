import express from "express";

const OWNER_TYPES = ["salon", "master"];

const REQUEST_STATUSES = [
  "draft",
  "validated",
  "validation_failed",
  "approved",
  "provisioning",
  "provisioned",
  "email_ready",
  "email_sent",
  "email_failed",
  "activated",
  "rejected",
  "suspended",
  "failed",
];

const EMAIL_STATUSES = [
  "not_ready",
  "ready",
  "sent",
  "failed",
];

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "login",
  "logout",
  "client",
  "clients",
  "booking",
  "master",
  "masters",
  "salon",
  "salons",
  "internal",
  "public",
  "assets",
  "slug",
  "test",
]);

const CYRILLIC_TRANSLIT = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function toCountMap(rows = [], keyName = "key"){
  return Object.fromEntries(
    (rows || []).map((row) => [
      String(row?.[keyName] || ""),
      Number(row?.count || 0),
    ]).filter(([key]) => Boolean(key))
  );
}

function normalizeOwnerType(value){
  const ownerType = String(value || "").trim().toLowerCase();
  return OWNER_TYPES.includes(ownerType) ? ownerType : "";
}

function normalizeText(value){
  return String(value || "").trim();
}

function transliterateToLatin(value){
  return String(value || "")
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      return CYRILLIC_TRANSLIT[lower] ?? char;
    })
    .join("");
}

function normalizeSlug(value){
  const raw = normalizeText(value);
  const latin = transliterateToLatin(raw);

  return latin
    .toLowerCase()
    .replace(/[:]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeEmail(value){
  return normalizeText(value).toLowerCase();
}

function isValidEmail(value){
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeKgPhone(value){
  const raw = normalizeText(value);

  if(!raw){
    return "";
  }

  const digits = raw.replace(/\D/g, "");

  if(digits.length === 10 && digits.startsWith("0")){
    const local = digits.slice(1);
    if(/^[579]\d{8}$/.test(local)){
      return `+996${local}`;
    }
    return "";
  }

  if(digits.length === 12 && digits.startsWith("996")){
    const local = digits.slice(3);
    if(/^[579]\d{8}$/.test(local)){
      return `+996${local}`;
    }
    return "";
  }

  if(raw.startsWith("+996")){
    const local = raw.slice(4).replace(/\D/g, "");
    if(/^[579]\d{8}$/.test(local)){
      return `+996${local}`;
    }
  }

  return "";
}

function addCheck(checks, code, ok, details = {}){
  checks.push({
    code,
    ok: Boolean(ok),
    ...details,
  });
}

async function checkSlugAvailability(pool, slug){
  const [salonResult, masterResult, reservationResult] = await Promise.all([
    pool.query(
      `
        SELECT id, slug
        FROM public.salons
        WHERE lower(slug)=lower($1)
        LIMIT 1
      `,
      [slug]
    ),
    pool.query(
      `
        SELECT id, slug
        FROM public.masters
        WHERE lower(slug)=lower($1)
        LIMIT 1
      `,
      [slug]
    ),
    pool.query(
      `
        SELECT id, slug, status
        FROM public.slug_reservations
        WHERE lower(slug)=lower($1)
          AND status IN ('reserved','activated')
        LIMIT 1
      `,
      [slug]
    ),
  ]);

  return {
    available:
      salonResult.rows.length === 0 &&
      masterResult.rows.length === 0 &&
      reservationResult.rows.length === 0,
    conflicts: {
      salons: salonResult.rows,
      masters: masterResult.rows,
      slug_reservations: reservationResult.rows,
    },
  };
}

async function checkEmailAvailability(pool, email){
  const result = await pool.query(
    `
      SELECT id, email, role, enabled
      FROM public.auth_users
      WHERE lower(email)=lower($1)
      LIMIT 1
    `,
    [email]
  );

  return {
    available: result.rows.length === 0,
    conflicts: result.rows,
  };
}

async function checkSalonSlug(pool, salonSlug){
  const result = await pool.query(
    `
      SELECT id, slug, name
      FROM public.salons
      WHERE lower(slug)=lower($1)
      LIMIT 1
    `,
    [salonSlug]
  );

  return {
    exists: result.rows.length > 0,
    salon: result.rows[0] || null,
  };
}

export default function buildAdminOpenOwnerRouter(pool, internalReadRateLimit){
  const r = express.Router();

  if(internalReadRateLimit){
    r.use(internalReadRateLimit);
  }

  r.get("/stats", async (req,res)=>{
    try{
      const totalResult = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM public.owner_opening_requests
      `);

      const statusResult = await pool.query(`
        SELECT status, COUNT(*)::int AS count
        FROM public.owner_opening_requests
        GROUP BY status
        ORDER BY status
      `);

      const ownerTypeResult = await pool.query(`
        SELECT owner_type, COUNT(*)::int AS count
        FROM public.owner_opening_requests
        GROUP BY owner_type
        ORDER BY owner_type
      `);

      const emailStatusResult = await pool.query(`
        SELECT email_status, COUNT(*)::int AS count
        FROM public.owner_opening_requests
        GROUP BY email_status
        ORDER BY email_status
      `);

      return res.status(200).json({
        ok: true,
        feature: "admin_open_owner",
        engine: "db",
        total: Number(totalResult.rows[0]?.count || 0),
        counts: {
          by_status: toCountMap(statusResult.rows, "status"),
          by_owner_type: toCountMap(ownerTypeResult.rows, "owner_type"),
          by_email_status: toCountMap(emailStatusResult.rows, "email_status"),
        },
        contract: {
          owner_types: OWNER_TYPES,
          request_statuses: REQUEST_STATUSES,
          email_statuses: EMAIL_STATUSES,
        },
      });
    }catch(err){
      console.error("ADMIN_OPEN_OWNER_STATS_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_STATS_FAILED",
      });
    }
  });

  r.post("/precheck", async (req,res)=>{
    try{
      const body = req.body || {};
      const checks = [];
      const errors = [];

      const ownerType = normalizeOwnerType(body.owner_type);
      const name = normalizeText(body.name);
      const slugSource = normalizeText(body.slug || body.slug_requested || name);
      const slugFinal = normalizeSlug(slugSource);
      const email = normalizeEmail(body.email);
      const phoneRaw = normalizeText(body.phone || body.phone_raw || body.phone_normalized);
      const phoneNormalized = normalizeKgPhone(phoneRaw);
      const city = normalizeText(body.city);
      const workMode = normalizeText(body.work_mode || (ownerType === "master" ? "independent" : ""));
      const salonSlug = normalizeSlug(body.salon_slug);

      addCheck(checks, "owner_type_valid", Boolean(ownerType), {
        owner_type: ownerType || null,
      });
      if(!ownerType){
        errors.push("OWNER_TYPE_INVALID");
      }

      addCheck(checks, "name_present", Boolean(name), {
        name,
      });
      if(!name){
        errors.push("NAME_REQUIRED");
      }

      addCheck(checks, "slug_present", Boolean(slugFinal), {
        slug_requested: slugSource,
        slug_final: slugFinal || null,
      });
      if(!slugFinal){
        errors.push("SLUG_REQUIRED");
      }

      const slugLengthOk = slugFinal.length >= 3 && slugFinal.length <= 80;
      addCheck(checks, "slug_length_valid", slugLengthOk, {
        min: 3,
        max: 80,
        slug_length: slugFinal.length,
      });
      if(slugFinal && !slugLengthOk){
        errors.push("SLUG_LENGTH_INVALID");
      }

      const slugReserved = RESERVED_SLUGS.has(slugFinal);
      addCheck(checks, "slug_not_reserved", Boolean(slugFinal) && !slugReserved, {
        slug_final: slugFinal || null,
      });
      if(slugFinal && slugReserved){
        errors.push("SLUG_RESERVED");
      }

      if(slugFinal && slugLengthOk && !slugReserved){
        const slugAvailability = await checkSlugAvailability(pool, slugFinal);
        addCheck(checks, "slug_available", slugAvailability.available, {
          slug_final: slugFinal,
          conflicts: slugAvailability.conflicts,
        });

        if(!slugAvailability.available){
          errors.push("SLUG_NOT_AVAILABLE");
        }
      }

      const emailValid = isValidEmail(email);
      addCheck(checks, "email_valid", emailValid, {
        email: email || null,
      });
      if(!emailValid){
        errors.push("EMAIL_INVALID");
      }

      if(emailValid){
        const emailAvailability = await checkEmailAvailability(pool, email);
        addCheck(checks, "email_available", emailAvailability.available, {
          email,
          conflicts: emailAvailability.conflicts,
        });

        if(!emailAvailability.available){
          errors.push("EMAIL_ALREADY_EXISTS");
        }
      }

      addCheck(checks, "phone_valid", Boolean(phoneNormalized), {
        phone_raw: phoneRaw || null,
        phone_normalized: phoneNormalized || null,
      });
      if(!phoneNormalized){
        errors.push("INVALID_KG_MOBILE_PHONE");
      }

      addCheck(checks, "city_present", Boolean(city), {
        city,
      });
      if(!city){
        errors.push("CITY_REQUIRED");
      }

      if(ownerType === "master"){
        const workModeValid = ["independent", "attached_to_salon"].includes(workMode);
        addCheck(checks, "work_mode_valid", workModeValid, {
          work_mode: workMode || null,
        });

        if(!workModeValid){
          errors.push("WORK_MODE_INVALID");
        }

        if(workMode === "attached_to_salon"){
          addCheck(checks, "salon_slug_present", Boolean(salonSlug), {
            salon_slug: salonSlug || null,
          });

          if(!salonSlug){
            errors.push("SALON_SLUG_REQUIRED");
          }else{
            const salonCheck = await checkSalonSlug(pool, salonSlug);
            addCheck(checks, "salon_slug_exists", salonCheck.exists, {
              salon_slug: salonSlug,
              salon: salonCheck.salon,
            });

            if(!salonCheck.exists){
              errors.push("SALON_NOT_FOUND");
            }
          }
        }
      }

      const valid = errors.length === 0;

      return res.status(200).json({
        ok: true,
        valid,
        error: valid ? null : "PRECHECK_FAILED",
        errors,
        normalized: {
          owner_type: ownerType || null,
          name,
          slug_requested: slugSource,
          slug_final: slugFinal || null,
          email,
          phone_raw: phoneRaw,
          phone_normalized: phoneNormalized || null,
          city,
          address: normalizeText(body.address),
          description: normalizeText(body.description),
          specialization: normalizeText(body.specialization),
          work_mode: ownerType === "master" ? workMode : null,
          salon_slug: ownerType === "master" && workMode === "attached_to_salon" ? salonSlug : null,
          admin_notes: normalizeText(body.admin_notes),
        },
        checks,
      });
    }catch(err){
      console.error("ADMIN_OPEN_OWNER_PRECHECK_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_PRECHECK_FAILED",
      });
    }
  });

  return r;
}
