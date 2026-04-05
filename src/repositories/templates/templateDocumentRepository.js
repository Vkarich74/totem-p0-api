import crypto from "crypto";

const TABLE = "public.template_content_documents";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ${TABLE} (
  id uuid PRIMARY KEY,
  owner_type text NOT NULL,
  owner_slug text NOT NULL,
  template_version text NOT NULL DEFAULT 'v1',
  publish_state text NOT NULL DEFAULT 'draft',
  draft_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_saved_at timestamptz NULL,
  last_published_at timestamptz NULL,
  UNIQUE(owner_type, owner_slug, template_version)
);

CREATE INDEX IF NOT EXISTS idx_tcd_owner 
ON ${TABLE}(owner_type, owner_slug);

CREATE INDEX IF NOT EXISTS idx_tcd_publish_state 
ON ${TABLE}(publish_state);

CREATE INDEX IF NOT EXISTS idx_tcd_updated_at 
ON ${TABLE}(updated_at DESC);
`;

const CONSTRAINTS_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tcd_owner_type_check'
  ) THEN
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT tcd_owner_type_check
    CHECK (owner_type IN ('salon','master'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tcd_publish_state_check'
  ) THEN
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT tcd_publish_state_check
    CHECK (publish_state IN ('draft','published','unpublished'));
  END IF;
END $$;
`;

function mapRow(row){
  if (!row) return null;
  return {
    id: row.id,
    owner_type: row.owner_type,
    owner_slug: row.owner_slug,
    template_version: row.template_version,
    status: row.status_payload || {},
    draft: row.draft_payload || {},
    published: row.published_payload || {},
    validation: row.validation_payload || {},
    meta: row.meta_payload || {},
    publish_state: row.publish_state,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_saved_at: row.last_saved_at,
    last_published_at: row.last_published_at,
  };
}

export async function ensureTemplateContentDocumentsTable(db){
  await db.query(SCHEMA_SQL);
  await db.query(CONSTRAINTS_SQL);
}

export async function findTemplateDocumentByOwner(db, ownerType, ownerSlug, templateVersion){
  await ensureTemplateContentDocumentsTable(db);
  const result = await db.query(`
    SELECT *
    FROM ${TABLE}
    WHERE owner_type=$1 AND owner_slug=$2 AND template_version=$3
    LIMIT 1
  `,[ownerType, ownerSlug, templateVersion]);
  return mapRow(result.rows[0] || null);
}

export async function createTemplateDocument(db, document){
  await ensureTemplateContentDocumentsTable(db);
  const id = document.id || crypto.randomUUID();
  const result = await db.query(`
    INSERT INTO ${TABLE} (
      id, owner_type, owner_slug, template_version, publish_state,
      draft_payload, published_payload, validation_payload, status_payload, meta_payload,
      created_at, updated_at, last_saved_at, last_published_at
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,
      NOW(),NOW(),NULL,NULL
    )
    RETURNING *
  `,[
    id,
    document.owner_type,
    document.owner_slug,
    document.template_version,
    document.status?.publish_state || document.publish_state || 'draft',
    JSON.stringify(document.draft || {}),
    JSON.stringify(document.published || {}),
    JSON.stringify(document.validation || {}),
    JSON.stringify(document.status || {}),
    JSON.stringify(document.meta || {}),
  ]);
  return mapRow(result.rows[0]);
}

export async function updateTemplateDraft(db, ownerType, ownerSlug, templateVersion, draft, validation, status, meta){
  await ensureTemplateContentDocumentsTable(db);
  const result = await db.query(`
    UPDATE ${TABLE}
    SET
      draft_payload=$4::jsonb,
      validation_payload=$5::jsonb,
      status_payload=$6::jsonb,
      meta_payload=$7::jsonb,
      publish_state=$8,
      updated_at=NOW(),
      last_saved_at=NOW()
    WHERE owner_type=$1 AND owner_slug=$2 AND template_version=$3
    RETURNING *
  `,[
    ownerType,
    ownerSlug,
    templateVersion,
    JSON.stringify(draft || {}),
    JSON.stringify(validation || {}),
    JSON.stringify(status || {}),
    JSON.stringify(meta || {}),
    status?.publish_state || 'draft',
  ]);
  return mapRow(result.rows[0] || null);
}

export async function updateTemplatePublished(db, ownerType, ownerSlug, templateVersion, published, validation, status, meta){
  await ensureTemplateContentDocumentsTable(db);
  const result = await db.query(`
    UPDATE ${TABLE}
    SET
      published_payload=$4::jsonb,
      validation_payload=$5::jsonb,
      status_payload=$6::jsonb,
      meta_payload=$7::jsonb,
      publish_state=$8,
      updated_at=NOW(),
      last_published_at=NOW()
    WHERE owner_type=$1 AND owner_slug=$2 AND template_version=$3
    RETURNING *
  `,[
    ownerType,
    ownerSlug,
    templateVersion,
    JSON.stringify(published || {}),
    JSON.stringify(validation || {}),
    JSON.stringify(status || {}),
    JSON.stringify(meta || {}),
    status?.publish_state || 'published',
  ]);
  return mapRow(result.rows[0] || null);
}