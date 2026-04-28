import express from "express";
import { google } from "googleapis";
import { createSalonCanonical } from "../../services/provision/createSalonCanonical.js";
import { createMasterCanonical } from "../../services/provision/createMasterCanonical.js";
import { bindMasterToSalonCanonical } from "../../services/provision/bindMasterToSalonCanonical.js";

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || "";
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || "";
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || "";
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || "http://localhost";
const GMAIL_SENDER_EMAIL = process.env.GMAIL_SENDER_EMAIL || "kantotemus@gmail.com";

const gmailClient = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REDIRECT_URI
);

gmailClient.setCredentials({
  refresh_token: GMAIL_REFRESH_TOKEN
});

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

async function buildOpenOwnerPrecheck(pool, body = {}){
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

  return {
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
  };
}

function normalizeRequestId(value){
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getAdminActor(req){
  const userId = Number(req.auth?.user_id || req.identity?.user_id || 0);

  return {
    id: Number.isInteger(userId) && userId > 0 ? userId : null,
    email: normalizeEmail(req.auth?.email || req.identity?.email || req.user?.email || ""),
  };
}

async function getPublicTableColumns(db, tableName){
  const result = await db.query(
    `
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name=$1
      ORDER BY ordinal_position
    `,
    [tableName]
  );

  return result.rows || [];
}

function hasColumn(columns, name){
  return columns.some((column) => column.column_name === name);
}

function pickColumnValue(columnName, values){
  return Object.prototype.hasOwnProperty.call(values, columnName)
    ? values[columnName]
    : undefined;
}

async function insertDynamicPublicRow(db, tableName, values, returningColumn = "id"){
  const columns = await getPublicTableColumns(db, tableName);
  const insertColumns = [];
  const insertValues = [];
  const params = [];

  for(const column of columns){
    const columnName = column.column_name;

    if(columnName === "created_at" && pickColumnValue(columnName, values) === "__NOW__"){
      insertColumns.push(columnName);
      insertValues.push("NOW()");
      continue;
    }

    if(columnName === "updated_at" && pickColumnValue(columnName, values) === "__NOW__"){
      insertColumns.push(columnName);
      insertValues.push("NOW()");
      continue;
    }

    const value = pickColumnValue(columnName, values);

    if(value === undefined){
      continue;
    }

    insertColumns.push(columnName);
    params.push(value);
    insertValues.push(`$${params.length}`);
  }

  if(!insertColumns.length){
    throw new Error(`NO_INSERTABLE_COLUMNS_${tableName}`);
  }

  const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, "");
  const returning = hasColumn(columns, returningColumn) ? ` RETURNING ${returningColumn}` : "";

  const result = await db.query(
    `
      INSERT INTO public.${safeTableName}(
        ${insertColumns.join(",\n        ")}
      )
      VALUES(
        ${insertValues.join(",\n        ")}
      )${returning}
    `,
    params
  );

  return result.rows[0] || null;
}

async function createOwnerOpeningModerationCase(db, request){
  const data = {
    entity_type: "owner_opening_request",
    entity_id: Number(request.id),
    reason_code: "owner_opening_review",
    owner_type: request.owner_type,
    slug: request.slug_final,
    email: request.email,
  };

  return await insertDynamicPublicRow(db, "moderation_cases", {
    status: "review",
    data,
    reason_code: "owner_opening_review",
    entity_type: "owner_opening_request",
    entity_id: String(request.id),
    owner_type: request.owner_type,
    slug: request.slug_final,
    lead_id: null,
    created_at: "__NOW__",
    updated_at: "__NOW__",
  });
}

async function writeOwnerOpeningAuditEvent(db, { request, eventType, admin, data = {} }){
  const payload = {
    event_type: eventType,
    entity_type: "owner_opening_request",
    entity_id: Number(request.id),
    request_id: Number(request.id),
    owner_type: request.owner_type,
    slug: request.slug_final,
    status: request.status,
    ...data,
  };

  const actor = admin.email || (admin.id ? `admin:${admin.id}` : "admin");

  return await insertDynamicPublicRow(db, "audit_events", {
    event_type: eventType,
    actor,
    core_user_id: admin.id,
    action: eventType,
    type: eventType,
    entity_type: "owner_opening_request",
    entity_id: String(request.id),
    owner_opening_request_id: Number(request.id),
    request_id: Number(request.id),
    owner_type: request.owner_type,
    status: request.status,
    actor_user_id: admin.id,
    user_id: admin.id,
    admin_user_id: admin.id,
    created_by_admin_id: admin.id,
    actor_email: admin.email || null,
    created_by_admin_email: admin.email || null,
    data: payload,
    metadata: payload,
    payload,
    details: payload,
    source: "admin_open_owner",
    created_at: "__NOW__",
    updated_at: "__NOW__",
  });
}

function buildSalonProvisionPayload(request){
  return {
    email: request.email,
    name: request.name,
    salon_name: request.name,
    salon_slug: request.slug_final,
    phone: request.phone_normalized || request.phone_raw || null,
    city: request.city || null,
    description: request.description || null,
    requested_role: "salon_admin",
  };
}

function buildMasterProvisionPayload(request){
  return {
    email: request.email,
    name: request.name,
    master_slug: request.slug_final,
    phone: request.phone_normalized || request.phone_raw || null,
    requested_role: "master",
  };
}

function extractProvisionAuthUserId(provisionResult){
  const value = provisionResult?.result?.user?.id;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function extractProvisionOwnerId(provisionResult){
  const value = provisionResult?.owner_id || provisionResult?.result?.salon?.id || provisionResult?.result?.master?.id;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function buildOwnerOpeningLinks({ request, provisionResult, bindResult = null }){
  const ownerType = normalizeOwnerType(request.owner_type);
  const slug = normalizeText(provisionResult?.canonical_slug || request.slug_final);

  return {
    owner_type: ownerType || request.owner_type,
    slug,
    public_url: provisionResult?.result?.urls?.public || provisionResult?.public_url || (ownerType && slug ? `/${ownerType}/${slug}` : null),
    cabinet_url: provisionResult?.cabinet_url || (ownerType && slug ? `#/${ownerType}/${slug}` : null),
    internal_url: ownerType && slug ? `/internal/${ownerType === "salon" ? "salons" : "masters"}/${slug}` : null,
    provision_urls: provisionResult?.result?.urls || null,
    bind_urls: bindResult?.result?.urls || null,
  };
}

function resolveProvisionStatus(err){
  const status = Number(err?.status || 500);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function buildProvisionErrorCode(err){
  return String(err?.code || err?.message || "ADMIN_OPEN_OWNER_PROVISION_FAILED").trim() || "ADMIN_OPEN_OWNER_PROVISION_FAILED";
}

function assertGmailConfig(){
  if(!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN){
    const error = new Error("GMAIL_CONFIG_MISSING");
    error.code = "GMAIL_CONFIG_MISSING";
    throw error;
  }
}

function buildOwnerOpeningEmailPreview(request){
  const links = request.links_json || {};
  const ownerType = normalizeOwnerType(request.owner_type);
  const ownerLabel = ownerType === "master" ? "мастера" : "салона";
  const publicUrl = links.public_url || (ownerType && request.slug_final ? `/${ownerType}/${request.slug_final}` : null);
  const cabinetUrl = links.cabinet_url || (ownerType && request.slug_final ? `#/${ownerType}/${request.slug_final}` : null);
  const appBaseUrl = "https://app.totemv.com";
  const publicLink = publicUrl && publicUrl.startsWith("http") ? publicUrl : publicUrl ? `${appBaseUrl}${publicUrl.startsWith("/") ? "" : "/"}${publicUrl}` : null;
  const cabinetLink = cabinetUrl && cabinetUrl.startsWith("http") ? cabinetUrl : cabinetUrl ? `${appBaseUrl}/${cabinetUrl}` : null;

  const subject = `TOTEM: доступ ${ownerLabel} создан`;

  const text = [
    `Здравствуйте, ${request.name}.`,
    "",
    `Доступ ${ownerLabel} в TOTEM создан.`,
    "",
    cabinetLink ? `Кабинет: ${cabinetLink}` : null,
    publicLink ? `Публичная страница: ${publicLink}` : null,
    "",
    "Как войти:",
    "1. Откройте ссылку кабинета.",
    "2. Введите email, на который пришло это письмо.",
    "3. Получите код входа на email.",
    "4. Введите код и откройте кабинет.",
    "",
    "Что заполнить в кабинете:",
    ownerType === "master"
      ? "- профиль мастера, услуги, расписание и описание"
      : "- профиль салона, услуги, мастеров, расписание и описание",
    "",
    "Если код не пришёл, проверьте Спам/Промоакции или обратитесь в поддержку TOTEM.",
    "",
    "Поддержка: kantotemus@gmail.com"
  ].filter((line) => line !== null).join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111827">
      <h2>TOTEM: доступ ${ownerLabel} создан</h2>
      <p>Здравствуйте, ${request.name}.</p>
      <p>Доступ ${ownerLabel} в TOTEM создан.</p>
      ${cabinetLink ? `<p><strong>Кабинет:</strong> <a href="${cabinetLink}">${cabinetLink}</a></p>` : ""}
      ${publicLink ? `<p><strong>Публичная страница:</strong> <a href="${publicLink}">${publicLink}</a></p>` : ""}
      <h3>Как войти</h3>
      <ol>
        <li>Откройте ссылку кабинета.</li>
        <li>Введите email, на который пришло это письмо.</li>
        <li>Получите код входа на email.</li>
        <li>Введите код и откройте кабинет.</li>
      </ol>
      <h3>Что заполнить в кабинете</h3>
      <p>${ownerType === "master" ? "Профиль мастера, услуги, расписание и описание." : "Профиль салона, услуги, мастеров, расписание и описание."}</p>
      <p>Если код не пришёл, проверьте Спам/Промоакции или обратитесь в поддержку TOTEM.</p>
      <p>Поддержка: kantotemus@gmail.com</p>
    </div>
  `;

  return {
    to: request.email,
    subject,
    text,
    html,
    owner_type: ownerType || request.owner_type,
    links: {
      public_url: publicLink,
      cabinet_url: cabinetLink,
    },
    generated_at: new Date().toISOString(),
  };
}

async function sendOwnerOpeningEmail(preview){
  assertGmailConfig();

  const gmail = google.gmail({ version: "v1", auth: gmailClient });
  const subject = "=?UTF-8?B?" + Buffer.from(preview.subject).toString("base64") + "?=";

  const message = [
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    `From: Totem <${GMAIL_SENDER_EMAIL}>`,
    `To: ${preview.to}`,
    `Subject: ${subject}`,
    "",
    preview.html,
  ].join("\n");

  const raw = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

async function createOwnerOpeningMessage(db, { request, preview, status }){
  const data = {
    entity_type: "owner_opening_request",
    entity_id: Number(request.id),
    owner_type: request.owner_type,
    slug: request.slug_final,
    to: preview.to,
    subject: preview.subject,
    text: preview.text,
    html: preview.html,
    links: preview.links,
    status,
  };

  const message = await db.query(
    `
      INSERT INTO public.messages(
        lead_id,
        moderation_case_id,
        status,
        idempotency_key,
        data,
        created_at,
        updated_at
      )
      VALUES(
        NULL,
        $1,
        $2,
        $3,
        $4,
        NOW(),
        NOW()
      )
      RETURNING *
    `,
    [
      request.moderation_case_id ? Number(request.moderation_case_id) : null,
      status,
      `owner_opening:${request.id}:${status}:${Date.now()}`,
      JSON.stringify(data),
    ]
  );

  return message.rows[0] || null;
}

async function createOwnerOpeningTrace(db, { messageId, attempt, status, data }){
  const trace = await db.query(
    `
      INSERT INTO public.traces(
        message_id,
        attempt,
        status,
        data,
        created_at
      )
      VALUES($1, $2, $3, $4, NOW())
      RETURNING *
    `,
    [
      Number(messageId),
      Number(attempt),
      status,
      JSON.stringify(data || {}),
    ]
  );

  return trace.rows[0] || null;
}

async function getOwnerOpeningRequestForUpdate(db, requestId){
  const result = await db.query(
    `
      SELECT *
      FROM public.owner_opening_requests
      WHERE id=$1
      LIMIT 1
      FOR UPDATE
    `,
    [requestId]
  );

  return result.rows[0] || null;
}

async function activateOwnerOpeningEntity(db, request){
  const ownerType = normalizeOwnerType(request?.owner_type);
  const ownerId = Number(request?.created_owner_id || 0);

  if(!ownerType){
    const error = new Error("OWNER_TYPE_INVALID");
    error.code = "OWNER_TYPE_INVALID";
    throw error;
  }

  if(!Number.isInteger(ownerId) || ownerId <= 0){
    const error = new Error("OWNER_OPENING_CREATED_OWNER_ID_MISSING");
    error.code = "OWNER_OPENING_CREATED_OWNER_ID_MISSING";
    throw error;
  }

  if(ownerType === "salon"){
    const result = await db.query(
      `
        UPDATE public.salons
        SET status='active',
            enabled=true
        WHERE id=$1
        RETURNING id, slug, name, status, enabled
      `,
      [ownerId]
    );

    const salon = result.rows[0] || null;

    if(!salon){
      const error = new Error("OWNER_OPENING_SALON_NOT_FOUND");
      error.code = "OWNER_OPENING_SALON_NOT_FOUND";
      throw error;
    }

    return {
      owner_type: ownerType,
      owner_id: ownerId,
      salon,
    };
  }

  if(ownerType === "master"){
    const result = await db.query(
      `
        UPDATE public.masters
        SET active=true
        WHERE id=$1
        RETURNING id, slug, name, active, user_id
      `,
      [ownerId]
    );

    const master = result.rows[0] || null;

    if(!master){
      const error = new Error("OWNER_OPENING_MASTER_NOT_FOUND");
      error.code = "OWNER_OPENING_MASTER_NOT_FOUND";
      throw error;
    }

    return {
      owner_type: ownerType,
      owner_id: ownerId,
      master,
    };
  }

  const error = new Error("OWNER_TYPE_INVALID");
  error.code = "OWNER_TYPE_INVALID";
  throw error;
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

      const provisionResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='approved')::int AS approved_waiting,
          COUNT(*) FILTER (WHERE status='provisioning')::int AS provisioning,
          COUNT(*) FILTER (WHERE status='provisioned')::int AS provisioned,
          COUNT(*) FILTER (WHERE created_owner_id IS NOT NULL)::int AS owners_created,
          COUNT(*) FILTER (WHERE created_auth_user_id IS NOT NULL)::int AS auth_users_created
        FROM public.owner_opening_requests
      `);

      const errorResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='failed')::int AS provision_failed,
          COUNT(*) FILTER (WHERE status='email_failed')::int AS email_failed,
          COUNT(*) FILTER (WHERE email_status='failed')::int AS email_status_failed,
          COUNT(*) FILTER (WHERE email_error IS NOT NULL AND email_error <> '')::int AS email_errors
        FROM public.owner_opening_requests
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
          provision: provisionResult.rows[0] || {
            approved_waiting: 0,
            provisioning: 0,
            provisioned: 0,
            owners_created: 0,
            auth_users_created: 0,
          },
          errors: errorResult.rows[0] || {
            provision_failed: 0,
            email_failed: 0,
            email_status_failed: 0,
            email_errors: 0,
          },
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


  r.post("/requests", async (req,res)=>{
    const db = await pool.connect();

    try{
      const precheck = await buildOpenOwnerPrecheck(pool, req.body || {});

      if(!precheck.valid){
        return res.status(400).json({
          ok: false,
          error: "PRECHECK_FAILED",
          precheck,
        });
      }

      const admin = getAdminActor(req);
      const normalized = precheck.normalized;

      await db.query("BEGIN");

      const createdRequest = await db.query(
        `
          INSERT INTO public.owner_opening_requests(
            owner_type,
            status,
            name,
            slug_requested,
            slug_final,
            email,
            phone_raw,
            phone_normalized,
            city,
            address,
            description,
            specialization,
            work_mode,
            salon_slug,
            admin_notes,
            precheck_result_json,
            created_by_admin_id,
            created_by_admin_email,
            validated_at,
            created_at,
            updated_at
          )
          VALUES(
            $1,
            'validated',
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            NOW(),
            NOW(),
            NOW()
          )
          RETURNING *
        `,
        [
          normalized.owner_type,
          normalized.name,
          normalized.slug_requested,
          normalized.slug_final,
          normalized.email,
          normalized.phone_raw,
          normalized.phone_normalized,
          normalized.city,
          normalized.address,
          normalized.description,
          normalized.specialization,
          normalized.work_mode,
          normalized.salon_slug,
          normalized.admin_notes,
          JSON.stringify(precheck),
          admin.id,
          admin.email || null,
        ]
      );

      let request = createdRequest.rows[0];

      const moderationCase = await createOwnerOpeningModerationCase(db, request);

      if(moderationCase?.id){
        const updatedRequest = await db.query(
          `
            UPDATE public.owner_opening_requests
            SET moderation_case_id=$2,
                updated_at=NOW()
            WHERE id=$1
            RETURNING *
          `,
          [Number(request.id), Number(moderationCase.id)]
        );

        request = updatedRequest.rows[0] || request;
      }

      const auditEvent = await writeOwnerOpeningAuditEvent(db, {
        request,
        eventType: "owner_opening.request_created",
        admin,
        data: {
          moderation_case_id: moderationCase?.id ? Number(moderationCase.id) : null,
          precheck_valid: true,
        },
      });

      await db.query("COMMIT");

      return res.status(201).json({
        ok: true,
        request,
        moderation_case_id: moderationCase?.id ? Number(moderationCase.id) : null,
        audit_event_id: auditEvent?.id ? Number(auditEvent.id) : null,
      });
    }catch(err){
      try{ await db.query("ROLLBACK"); }catch(e){}
      console.error("ADMIN_OPEN_OWNER_CREATE_REQUEST_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_CREATE_REQUEST_FAILED",
      });
    }finally{
      db.release();
    }
  });


  r.post("/requests/:id/approve", async (req,res)=>{
    const requestId = normalizeRequestId(req.params?.id);

    if(!requestId){
      return res.status(400).json({
        ok: false,
        error: "REQUEST_ID_INVALID",
      });
    }

    const db = await pool.connect();

    try{
      const admin = getAdminActor(req);

      await db.query("BEGIN");

      const currentResult = await db.query(
        `
          SELECT *
          FROM public.owner_opening_requests
          WHERE id=$1
          LIMIT 1
          FOR UPDATE
        `,
        [requestId]
      );

      const current = currentResult.rows[0] || null;

      if(!current){
        await db.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_NOT_FOUND",
        });
      }

      if(current.status === "approved"){
        await db.query("COMMIT");
        return res.status(200).json({
          ok: true,
          request: current,
          idempotent: true,
        });
      }

      if(current.status !== "validated"){
        await db.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_STATUS_INVALID",
          status: current.status,
        });
      }

      const updatedResult = await db.query(
        `
          UPDATE public.owner_opening_requests
          SET status='approved',
              approved_at=NOW(),
              updated_at=NOW()
          WHERE id=$1
          RETURNING *
        `,
        [requestId]
      );

      const request = updatedResult.rows[0];

      const auditEvent = await writeOwnerOpeningAuditEvent(db, {
        request,
        eventType: "owner_opening.approved",
        admin,
      });

      await db.query("COMMIT");

      return res.status(200).json({
        ok: true,
        request,
        audit_event_id: auditEvent?.id ? Number(auditEvent.id) : null,
      });
    }catch(err){
      try{ await db.query("ROLLBACK"); }catch(e){}
      console.error("ADMIN_OPEN_OWNER_APPROVE_REQUEST_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_APPROVE_REQUEST_FAILED",
      });
    }finally{
      db.release();
    }
  });

  r.post("/requests/:id/provision", async (req,res)=>{
    const requestId = normalizeRequestId(req.params?.id);

    if(!requestId){
      return res.status(400).json({
        ok: false,
        error: "REQUEST_ID_INVALID",
      });
    }

    let request = null;
    const admin = getAdminActor(req);
    const markDb = await pool.connect();

    try{
      await markDb.query("BEGIN");

      const currentResult = await markDb.query(
        `
          SELECT *
          FROM public.owner_opening_requests
          WHERE id=$1
          LIMIT 1
          FOR UPDATE
        `,
        [requestId]
      );

      request = currentResult.rows[0] || null;

      if(!request){
        await markDb.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_NOT_FOUND",
        });
      }

      if(request.status === "provisioned"){
        await markDb.query("COMMIT");
        return res.status(200).json({
          ok: true,
          request,
          idempotent: true,
        });
      }

      if(request.status !== "approved"){
        await markDb.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_STATUS_INVALID",
          status: request.status,
        });
      }

      const provisioningResult = await markDb.query(
        `
          UPDATE public.owner_opening_requests
          SET status='provisioning',
              updated_at=NOW()
          WHERE id=$1
          RETURNING *
        `,
        [requestId]
      );

      request = provisioningResult.rows[0] || request;

      await writeOwnerOpeningAuditEvent(markDb, {
        request,
        eventType: "owner_opening.provision_started",
        admin,
      });

      await markDb.query("COMMIT");
    }catch(err){
      try{ await markDb.query("ROLLBACK"); }catch(e){}
      console.error("ADMIN_OPEN_OWNER_MARK_PROVISIONING_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_MARK_PROVISIONING_FAILED",
      });
    }finally{
      markDb.release();
    }

    try{
      let provisionResult = null;
      let bindResult = null;

      if(request.owner_type === "salon"){
        provisionResult = await createSalonCanonical({
          pool,
          payload: buildSalonProvisionPayload(request),
        });
      }else if(request.owner_type === "master"){
        provisionResult = await createMasterCanonical({
          pool,
          payload: buildMasterProvisionPayload(request),
        });

        if(request.work_mode === "attached_to_salon"){
          bindResult = await bindMasterToSalonCanonical({
            pool,
            payload: {
              salon_slug: request.salon_slug,
              master_slug: provisionResult?.canonical_slug || request.slug_final,
              bind_mode: "active",
              create_contract: false,
            },
          });
        }
      }else{
        return res.status(400).json({
          ok: false,
          error: "OWNER_TYPE_INVALID",
        });
      }

      const ownerId = extractProvisionOwnerId(provisionResult);
      const authUserId = extractProvisionAuthUserId(provisionResult);
      const links = buildOwnerOpeningLinks({ request, provisionResult, bindResult });
      const resultJson = {
        provision: provisionResult,
        bind: bindResult,
      };

      const doneDb = await pool.connect();

      try{
        await doneDb.query("BEGIN");

        const updatedResult = await doneDb.query(
          `
            UPDATE public.owner_opening_requests
            SET status='provisioned',
                created_owner_id=$2,
                created_auth_user_id=$3,
                provision_result_json=$4,
                links_json=$5,
                provisioned_at=NOW(),
                updated_at=NOW()
            WHERE id=$1
            RETURNING *
          `,
          [
            requestId,
            ownerId,
            authUserId,
            JSON.stringify(resultJson),
            JSON.stringify(links),
          ]
        );

        const finalRequest = updatedResult.rows[0] || request;

        const auditEvent = await writeOwnerOpeningAuditEvent(doneDb, {
          request: finalRequest,
          eventType: "owner_opening.provisioned",
          admin,
          data: {
            created_owner_id: ownerId,
            created_auth_user_id: authUserId,
            bind_created: Boolean(bindResult),
          },
        });

        await doneDb.query("COMMIT");

        return res.status(200).json({
          ok: true,
          request: finalRequest,
          provision_result: provisionResult,
          bind_result: bindResult,
          links,
          audit_event_id: auditEvent?.id ? Number(auditEvent.id) : null,
        });
      }catch(err){
        try{ await doneDb.query("ROLLBACK"); }catch(e){}
        throw err;
      }finally{
        doneDb.release();
      }
    }catch(err){
      const code = buildProvisionErrorCode(err);
      const failedDb = await pool.connect();

      try{
        await failedDb.query("BEGIN");

        const failedResult = await failedDb.query(
          `
            UPDATE public.owner_opening_requests
            SET status='failed',
                provision_result_json=$2,
                updated_at=NOW()
            WHERE id=$1
            RETURNING *
          `,
          [
            requestId,
            JSON.stringify({
              ok: false,
              error: code,
              details: err?.details || null,
            }),
          ]
        );

        const failedRequest = failedResult.rows[0] || request;

        await writeOwnerOpeningAuditEvent(failedDb, {
          request: failedRequest,
          eventType: "owner_opening.provision_failed",
          admin,
          data: {
            error: code,
            details: err?.details || null,
          },
        });

        await failedDb.query("COMMIT");
      }catch(updateErr){
        try{ await failedDb.query("ROLLBACK"); }catch(e){}
        console.error("ADMIN_OPEN_OWNER_PROVISION_FAILED_UPDATE_ERROR", updateErr);
      }finally{
        failedDb.release();
      }

      console.error("ADMIN_OPEN_OWNER_PROVISION_REQUEST_ERROR", err);
      return res.status(resolveProvisionStatus(err)).json({
        ok: false,
        error: code,
      });
    }
  });

  r.post("/requests/:id/activate", async (req,res)=>{
    const requestId = normalizeRequestId(req.params?.id);

    if(!requestId){
      return res.status(400).json({
        ok: false,
        error: "REQUEST_ID_INVALID",
      });
    }

    const db = await pool.connect();

    try{
      const admin = getAdminActor(req);

      await db.query("BEGIN");

      const current = await getOwnerOpeningRequestForUpdate(db, requestId);

      if(!current){
        await db.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_NOT_FOUND",
        });
      }

      if(current.status === "activated"){
        await db.query("COMMIT");
        return res.status(200).json({
          ok: true,
          request: current,
          idempotent: true,
        });
      }

      if(current.status !== "provisioned"){
        await db.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_STATUS_INVALID",
          status: current.status,
        });
      }

      const ownerActivation = await activateOwnerOpeningEntity(db, current);

      const updatedResult = await db.query(
        `
          UPDATE public.owner_opening_requests
          SET status='activated',
              activated_at=NOW(),
              updated_at=NOW()
          WHERE id=$1
          RETURNING *
        `,
        [requestId]
      );

      const request = updatedResult.rows[0] || current;

      const auditEvent = await writeOwnerOpeningAuditEvent(db, {
        request,
        eventType: "owner_opening.activated",
        admin,
        data: {
          created_owner_id: Number(current.created_owner_id || 0),
          owner_activation: ownerActivation,
        },
      });

      await db.query("COMMIT");

      return res.status(200).json({
        ok: true,
        request,
        owner_activation: ownerActivation,
        audit_event_id: auditEvent?.id ? Number(auditEvent.id) : null,
      });
    }catch(err){
      try{ await db.query("ROLLBACK"); }catch(e){}
      console.error("ADMIN_OPEN_OWNER_ACTIVATE_REQUEST_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: String(err?.code || err?.message || "ADMIN_OPEN_OWNER_ACTIVATE_REQUEST_FAILED"),
      });
    }finally{
      db.release();
    }
  });

  r.post("/requests/:id/email-preview", async (req,res)=>{
    const requestId = normalizeRequestId(req.params?.id);

    if(!requestId){
      return res.status(400).json({
        ok: false,
        error: "REQUEST_ID_INVALID",
      });
    }

    const db = await pool.connect();

    try{
      const admin = getAdminActor(req);

      await db.query("BEGIN");

      const request = await getOwnerOpeningRequestForUpdate(db, requestId);

      if(!request){
        await db.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_NOT_FOUND",
        });
      }

      if(request.status !== "activated" && request.status !== "email_ready" && request.status !== "email_sent" && request.status !== "email_failed"){
        await db.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_STATUS_INVALID",
          status: request.status,
        });
      }

      const preview = buildOwnerOpeningEmailPreview(request);

      const updatedResult = await db.query(
        `
          UPDATE public.owner_opening_requests
          SET status=CASE
                WHEN status='activated' THEN 'email_ready'
                ELSE status
              END,
              email_preview_json=$2,
              email_status='ready',
              email_error=NULL,
              updated_at=NOW()
          WHERE id=$1
          RETURNING *
        `,
        [
          requestId,
          JSON.stringify(preview),
        ]
      );

      const updatedRequest = updatedResult.rows[0] || request;

      const auditEvent = await writeOwnerOpeningAuditEvent(db, {
        request: updatedRequest,
        eventType: "owner_opening.email_preview_generated",
        admin,
        data: {
          to: preview.to,
          subject: preview.subject,
        },
      });

      await db.query("COMMIT");

      return res.status(200).json({
        ok: true,
        request: updatedRequest,
        preview,
        audit_event_id: auditEvent?.id ? Number(auditEvent.id) : null,
      });
    }catch(err){
      try{ await db.query("ROLLBACK"); }catch(e){}
      console.error("ADMIN_OPEN_OWNER_EMAIL_PREVIEW_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_EMAIL_PREVIEW_FAILED",
      });
    }finally{
      db.release();
    }
  });

  r.post("/requests/:id/send-email", async (req,res)=>{
    const requestId = normalizeRequestId(req.params?.id);

    if(!requestId){
      return res.status(400).json({
        ok: false,
        error: "REQUEST_ID_INVALID",
      });
    }

    const admin = getAdminActor(req);
    let request = null;
    let preview = null;
    let message = null;

    const prepareDb = await pool.connect();

    try{
      await prepareDb.query("BEGIN");

      request = await getOwnerOpeningRequestForUpdate(prepareDb, requestId);

      if(!request){
        await prepareDb.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_NOT_FOUND",
        });
      }

      if(request.status !== "email_ready" && request.status !== "email_failed"){
        await prepareDb.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_STATUS_INVALID",
          status: request.status,
        });
      }

      preview = request.email_preview_json && Object.keys(request.email_preview_json || {}).length
        ? request.email_preview_json
        : buildOwnerOpeningEmailPreview(request);

      message = await createOwnerOpeningMessage(prepareDb, {
        request,
        preview,
        status: "pending",
      });

      await createOwnerOpeningTrace(prepareDb, {
        messageId: message.id,
        attempt: 1,
        status: "pending",
        data: {
          event: "owner_opening_email_send_started",
          to: preview.to,
          subject: preview.subject,
        },
      });

      await prepareDb.query(
        `
          UPDATE public.owner_opening_requests
          SET message_id=$2,
              email_preview_json=$3,
              email_status='ready',
              email_error=NULL,
              updated_at=NOW()
          WHERE id=$1
        `,
        [
          requestId,
          Number(message.id),
          JSON.stringify(preview),
        ]
      );

      await prepareDb.query("COMMIT");
    }catch(err){
      try{ await prepareDb.query("ROLLBACK"); }catch(e){}
      prepareDb.release();
      console.error("ADMIN_OPEN_OWNER_EMAIL_PREPARE_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_EMAIL_PREPARE_FAILED",
      });
    }

    prepareDb.release();

    try{
      const sent = await sendOwnerOpeningEmail(preview);
      const doneDb = await pool.connect();

      try{
        await doneDb.query("BEGIN");

        await doneDb.query(
          `
            UPDATE public.messages
            SET status='sent',
                updated_at=NOW(),
                data = data || $2::jsonb
            WHERE id=$1
          `,
          [
            Number(message.id),
            JSON.stringify({
              gmail_message_id: sent?.data?.id || null,
              sent_at: new Date().toISOString(),
            }),
          ]
        );

        await createOwnerOpeningTrace(doneDb, {
          messageId: message.id,
          attempt: 1,
          status: "sent",
          data: {
            event: "owner_opening_email_sent",
            gmail_message_id: sent?.data?.id || null,
          },
        });

        const updatedResult = await doneDb.query(
          `
            UPDATE public.owner_opening_requests
            SET status='email_sent',
                email_status='sent',
                email_sent_at=NOW(),
                email_error=NULL,
                updated_at=NOW()
            WHERE id=$1
            RETURNING *
          `,
          [requestId]
        );

        const updatedRequest = updatedResult.rows[0] || request;

        const auditEvent = await writeOwnerOpeningAuditEvent(doneDb, {
          request: updatedRequest,
          eventType: "owner_opening.email_sent",
          admin,
          data: {
            message_id: Number(message.id),
            gmail_message_id: sent?.data?.id || null,
          },
        });

        await doneDb.query("COMMIT");

        return res.status(200).json({
          ok: true,
          request: updatedRequest,
          message_id: Number(message.id),
          gmail_message_id: sent?.data?.id || null,
          audit_event_id: auditEvent?.id ? Number(auditEvent.id) : null,
        });
      }catch(err){
        try{ await doneDb.query("ROLLBACK"); }catch(e){}
        throw err;
      }finally{
        doneDb.release();
      }
    }catch(err){
      const failedDb = await pool.connect();
      const code = String(err?.code || err?.message || "OWNER_OPENING_EMAIL_SEND_FAILED");

      try{
        await failedDb.query("BEGIN");

        await failedDb.query(
          `
            UPDATE public.messages
            SET status='failed',
                updated_at=NOW(),
                data = data || $2::jsonb
            WHERE id=$1
          `,
          [
            Number(message.id),
            JSON.stringify({
              error: code,
              failed_at: new Date().toISOString(),
            }),
          ]
        );

        await createOwnerOpeningTrace(failedDb, {
          messageId: message.id,
          attempt: 1,
          status: "failed",
          data: {
            event: "owner_opening_email_failed",
            error: code,
          },
        });

        const failedResult = await failedDb.query(
          `
            UPDATE public.owner_opening_requests
            SET status='email_failed',
                email_status='failed',
                email_error=$2,
                updated_at=NOW()
            WHERE id=$1
            RETURNING *
          `,
          [
            requestId,
            code,
          ]
        );

        const failedRequest = failedResult.rows[0] || request;

        await writeOwnerOpeningAuditEvent(failedDb, {
          request: failedRequest,
          eventType: "owner_opening.email_failed",
          admin,
          data: {
            message_id: Number(message.id),
            error: code,
          },
        });

        await failedDb.query("COMMIT");
      }catch(updateErr){
        try{ await failedDb.query("ROLLBACK"); }catch(e){}
        console.error("ADMIN_OPEN_OWNER_EMAIL_FAILED_UPDATE_ERROR", updateErr);
      }finally{
        failedDb.release();
      }

      console.error("ADMIN_OPEN_OWNER_SEND_EMAIL_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: code,
      });
    }
  });

  r.post("/requests/:id/resend-email", async (req,res)=>{
    return r.handle({
      ...req,
      method: "POST",
      url: `/requests/${req.params.id}/send-email`,
      originalUrl: req.originalUrl,
    }, res);
  });


  r.get("/requests/:id/audit", async (req,res)=>{
    try{
      const requestId = normalizeRequestId(req.params?.id);

      if(!requestId){
        return res.status(400).json({
          ok: false,
          error: "REQUEST_ID_INVALID",
        });
      }

      const requestResult = await pool.query(
        `
          SELECT id
          FROM public.owner_opening_requests
          WHERE id=$1
          LIMIT 1
        `,
        [requestId]
      );

      if(!requestResult.rows.length){
        return res.status(404).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_NOT_FOUND",
        });
      }

      const auditResult = await pool.query(
        `
          SELECT
            id,
            event_type,
            actor,
            lead_id,
            core_user_id,
            data,
            created_at
          FROM public.audit_events
          WHERE
            (
              data->>'entity_type' = 'owner_opening_request'
              AND (
                data->>'request_id' = $1::text
                OR data->>'entity_id' = $1::text
              )
            )
          ORDER BY created_at ASC, id ASC
        `,
        [requestId]
      );

      const messageResult = await pool.query(
        `
          SELECT
            id,
            status,
            idempotency_key,
            data,
            created_at,
            updated_at
          FROM public.messages
          WHERE
            data->>'entity_type' = 'owner_opening_request'
            AND data->>'entity_id' = $1::text
          ORDER BY created_at ASC, id ASC
        `,
        [requestId]
      );

      const messageIds = messageResult.rows
        .map((message) => Number(message.id))
        .filter((id) => Number.isInteger(id) && id > 0);

      let traces = [];

      if(messageIds.length){
        const traceResult = await pool.query(
          `
            SELECT
              id,
              message_id,
              attempt,
              status,
              data,
              created_at
            FROM public.traces
            WHERE message_id = ANY($1::bigint[])
            ORDER BY created_at ASC, id ASC
          `,
          [messageIds]
        );

        traces = traceResult.rows;
      }

      return res.status(200).json({
        ok: true,
        request_id: requestId,
        audit_events: auditResult.rows,
        messages: messageResult.rows,
        traces,
      });
    }catch(err){
      console.error("ADMIN_OPEN_OWNER_AUDIT_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_AUDIT_FAILED",
      });
    }
  });


  r.get("/requests", async (req,res)=>{
    try{
      const limitRaw = Number(req.query?.limit || 100);
      const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? limitRaw : 100;

      const result = await pool.query(
        `
          SELECT
            id,
            owner_type,
            status,
            name,
            slug_requested,
            slug_final,
            email,
            phone_raw,
            phone_normalized,
            city,
            address,
            description,
            specialization,
            work_mode,
            salon_slug,
            admin_notes,
            created_owner_id,
            created_auth_user_id,
            moderation_case_id,
            message_id,
            email_status,
            email_sent_at,
            email_error,
            created_by_admin_id,
            created_by_admin_email,
            created_at,
            updated_at,
            validated_at,
            approved_at,
            provisioned_at,
            rejected_at,
            suspended_at,
            activated_at
          FROM public.owner_opening_requests
          ORDER BY created_at DESC, id DESC
          LIMIT $1
        `,
        [limit]
      );

      return res.status(200).json({
        ok: true,
        requests: result.rows,
      });
    }catch(err){
      console.error("ADMIN_OPEN_OWNER_LIST_REQUESTS_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_LIST_REQUESTS_FAILED",
      });
    }
  });

  r.get("/requests/:id", async (req,res)=>{
    try{
      const requestId = normalizeRequestId(req.params?.id);

      if(!requestId){
        return res.status(400).json({
          ok: false,
          error: "REQUEST_ID_INVALID",
        });
      }

      const result = await pool.query(
        `
          SELECT *
          FROM public.owner_opening_requests
          WHERE id=$1
          LIMIT 1
        `,
        [requestId]
      );

      const request = result.rows[0] || null;

      if(!request){
        return res.status(404).json({
          ok: false,
          error: "OWNER_OPENING_REQUEST_NOT_FOUND",
        });
      }

      return res.status(200).json({
        ok: true,
        request,
      });
    }catch(err){
      console.error("ADMIN_OPEN_OWNER_GET_REQUEST_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_OPEN_OWNER_GET_REQUEST_FAILED",
      });
    }
  });

  return r;
}
