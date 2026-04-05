import crypto from "crypto";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.template_publish_log (
  id uuid PRIMARY KEY,
  owner_type text NOT NULL,
  owner_slug text NOT NULL,
  template_version text NOT NULL,
  published_by text NULL,
  publish_result text NOT NULL,
  published_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tpl_owner ON public.template_publish_log(owner_type, owner_slug);
CREATE INDEX IF NOT EXISTS idx_tpl_created_at ON public.template_publish_log(created_at DESC);
`;

export async function ensureTemplatePublishLogTable(db){
  await db.query(SCHEMA_SQL);
}

export async function createTemplatePublishLog(db, entry){
  await ensureTemplatePublishLogTable(db);
  const id = entry.id || crypto.randomUUID();
  const result = await db.query(`
    INSERT INTO public.template_publish_log (
      id, owner_type, owner_slug, template_version,
      published_by, publish_result, published_snapshot, validation_snapshot, created_at
    ) VALUES (
      $1,$2,$3,$4,
      $5,$6,$7::jsonb,$8::jsonb,NOW()
    ) RETURNING *
  `,[
    id,
    entry.owner_type,
    entry.owner_slug,
    entry.template_version,
    entry.published_by || null,
    entry.publish_result,
    JSON.stringify(entry.published_snapshot || {}),
    JSON.stringify(entry.validation_snapshot || {}),
  ]);
  return result.rows[0] || null;
}

export async function listTemplatePublishLogs(db, ownerType, ownerSlug, templateVersion, limit = 20){
  await ensureTemplatePublishLogTable(db);
  const result = await db.query(`
    SELECT *
    FROM public.template_publish_log
    WHERE owner_type=$1 AND owner_slug=$2 AND template_version=$3
    ORDER BY created_at DESC
    LIMIT $4
  `,[ownerType, ownerSlug, templateVersion, limit]);
  return result.rows;
}
