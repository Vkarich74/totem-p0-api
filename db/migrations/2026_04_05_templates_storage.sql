-- TEMPLATE STORAGE FINAL MIGRATION

-- DOCUMENTS
CREATE TABLE IF NOT EXISTS public.template_content_documents (
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

ALTER TABLE public.template_content_documents
  DROP CONSTRAINT IF EXISTS tcd_owner_type_check;

ALTER TABLE public.template_content_documents
  ADD CONSTRAINT tcd_owner_type_check
  CHECK (owner_type IN ('salon','master'));

ALTER TABLE public.template_content_documents
  DROP CONSTRAINT IF EXISTS tcd_publish_state_check;

ALTER TABLE public.template_content_documents
  ADD CONSTRAINT tcd_publish_state_check
  CHECK (publish_state IN ('draft','published','unpublished'));

-- PUBLISH LOG
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

ALTER TABLE public.template_publish_log
  DROP CONSTRAINT IF EXISTS tpl_owner_type_check;

ALTER TABLE public.template_publish_log
  ADD CONSTRAINT tpl_owner_type_check
  CHECK (owner_type IN ('salon','master'));

ALTER TABLE public.template_publish_log
  DROP CONSTRAINT IF EXISTS tpl_publish_result_check;

ALTER TABLE public.template_publish_log
  ADD CONSTRAINT tpl_publish_result_check
  CHECK (publish_result IN ('success','failed'));

-- ASSETS
CREATE TABLE IF NOT EXISTS public.template_image_assets (
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

ALTER TABLE public.template_image_assets
  DROP CONSTRAINT IF EXISTS tia_owner_type_check;

ALTER TABLE public.template_image_assets
  ADD CONSTRAINT tia_owner_type_check
  CHECK (owner_type IN ('salon','master'));

ALTER TABLE public.template_image_assets
  DROP CONSTRAINT IF EXISTS tia_slot_type_check;

ALTER TABLE public.template_image_assets
  ADD CONSTRAINT tia_slot_type_check
  CHECK (slot_type IN (
    'hero','gallery','service_card','master_card',
    'logo','promo','avatar','portfolio'
  ));

ALTER TABLE public.template_image_assets
  DROP CONSTRAINT IF EXISTS tia_slot_index_check;

ALTER TABLE public.template_image_assets
  ADD CONSTRAINT tia_slot_index_check
  CHECK (slot_index >= 0);