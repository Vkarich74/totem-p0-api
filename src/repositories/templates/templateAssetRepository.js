import crypto from "crypto";

const TABLE = "public.template_image_assets";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ${TABLE} (
  id uuid PRIMARY KEY,
  owner_type text NOT NULL,
  owner_slug text NOT NULL,
  slot_type text NOT NULL,
  slot_index integer NOT NULL DEFAULT 0,
  public_id text NOT NULL,
  secure_url text NOT NULL,
  fallback_url text NULL,
  width integer NULL,
  height integer NULL,
  format text NULL,
  bytes bigint NULL,
  mime_type text NULL,
  alt text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tia_owner 
ON ${TABLE}(owner_type, owner_slug);

CREATE INDEX IF NOT EXISTS idx_tia_slot 
ON ${TABLE}(owner_type, owner_slug, slot_type);

CREATE INDEX IF NOT EXISTS idx_tia_slot_order 
ON ${TABLE}(owner_type, owner_slug, slot_type, slot_index);

CREATE INDEX IF NOT EXISTS idx_tia_active 
ON ${TABLE}(is_active);
`;

const CONSTRAINTS_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tia_owner_type_check'
  ) THEN
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT tia_owner_type_check
    CHECK (owner_type IN ('salon','master'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tia_slot_type_check'
  ) THEN
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT tia_slot_type_check
    CHECK (
      slot_type IN (
        'hero',
        'gallery',
        'service_card',
        'master_card',
        'logo',
        'promo',
        'avatar',
        'portfolio'
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tia_slot_index_check'
  ) THEN
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT tia_slot_index_check
    CHECK (slot_index >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tia_width_check'
  ) THEN
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT tia_width_check
    CHECK (width IS NULL OR width >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tia_height_check'
  ) THEN
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT tia_height_check
    CHECK (height IS NULL OR height >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tia_bytes_check'
  ) THEN
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT tia_bytes_check
    CHECK (bytes IS NULL OR bytes >= 0);
  END IF;
END $$;
`;

export async function ensureTemplateImageAssetsTable(db){
  await db.query(SCHEMA_SQL);
  await db.query(CONSTRAINTS_SQL);
}

export async function listTemplateAssets(db, ownerType, ownerSlug, filters = {}){
  await ensureTemplateImageAssetsTable(db);
  const values = [ownerType, ownerSlug];
  let sql = `
    SELECT *
    FROM ${TABLE}
    WHERE owner_type=$1 AND owner_slug=$2
  `;

  if (filters.slot_type) {
    values.push(filters.slot_type);
    sql += ` AND slot_type=$${values.length}`;
  }

  if (filters.active_only) {
    sql += ` AND is_active=true`;
  }

  sql += ` ORDER BY slot_type ASC, slot_index ASC, created_at ASC`;

  const result = await db.query(sql, values);
  return result.rows;
}

export async function findTemplateAssetById(db, ownerType, ownerSlug, assetId){
  await ensureTemplateImageAssetsTable(db);
  const result = await db.query(`
    SELECT *
    FROM ${TABLE}
    WHERE id=$1 AND owner_type=$2 AND owner_slug=$3
    LIMIT 1
  `,[assetId, ownerType, ownerSlug]);
  return result.rows[0] || null;
}

export async function createTemplateAsset(db, ownerType, ownerSlug, asset){
  await ensureTemplateImageAssetsTable(db);
  const id = asset.id || crypto.randomUUID();
  const result = await db.query(`
    INSERT INTO ${TABLE} (
      id, owner_type, owner_slug, slot_type, slot_index,
      public_id, secure_url, fallback_url, width, height,
      format, bytes, mime_type, alt, is_active,
      created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,
      NOW(),NOW()
    ) RETURNING *
  `,[
    id,
    ownerType,
    ownerSlug,
    asset.slot_type,
    Number(asset.slot_index || 0),
    asset.public_id,
    asset.secure_url,
    asset.fallback_url || null,
    asset.width || null,
    asset.height || null,
    asset.format || null,
    asset.bytes || null,
    asset.mime_type || null,
    asset.alt || null,
    typeof asset.is_active === "boolean" ? asset.is_active : true,
  ]);
  return result.rows[0];
}

export async function updateTemplateAsset(db, ownerType, ownerSlug, assetId, patch){
  await ensureTemplateImageAssetsTable(db);
  const current = await findTemplateAssetById(db, ownerType, ownerSlug, assetId);
  if (!current) return null;

  const next = {
    ...current,
    ...patch,
    slot_index: patch.slot_index ?? current.slot_index,
    alt: patch.alt ?? current.alt,
    is_active: typeof patch.is_active === "boolean" ? patch.is_active : current.is_active,
  };

  const result = await db.query(`
    UPDATE ${TABLE}
    SET alt=$4, is_active=$5, slot_index=$6, updated_at=NOW()
    WHERE id=$1 AND owner_type=$2 AND owner_slug=$3
    RETURNING *
  `,[assetId, ownerType, ownerSlug, next.alt, next.is_active, next.slot_index]);
  return result.rows[0] || null;
}

export async function activateSingletonTemplateAsset(db, ownerType, ownerSlug, slotType, assetId){
  await ensureTemplateImageAssetsTable(db);

  await db.query(`
    UPDATE ${TABLE}
    SET is_active=false, updated_at=NOW()
    WHERE owner_type=$1 AND owner_slug=$2 AND slot_type=$3 AND is_active=true
  `,[ownerType, ownerSlug, slotType]);

  const result = await db.query(`
    UPDATE ${TABLE}
    SET is_active=true, updated_at=NOW()
    WHERE id=$1 AND owner_type=$2 AND owner_slug=$3
    RETURNING *
  `,[assetId, ownerType, ownerSlug]);

  return result.rows[0] || null;
}