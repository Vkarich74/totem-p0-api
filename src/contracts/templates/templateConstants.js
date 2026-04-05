export const TEMPLATE_OWNER_TYPES = ["salon", "master"];
export const TEMPLATE_VERSION_V1 = "v1";
export const TEMPLATE_PUBLISH_STATES = ["draft", "published", "unpublished"];
export const TEMPLATE_SECTION_STATUS_VALUES = ["empty", "incomplete", "warning", "valid", "blocked"];
export const TEMPLATE_SINGLETON_SLOT_TYPES = ["hero", "logo", "promo", "avatar"];

export const TEMPLATE_DEFAULT_STATUS = {
  draft_exists: true,
  published_exists: false,
  publish_state: "draft",
  is_dirty: false,
  is_publishable: false,
};

export const TEMPLATE_DEFAULT_VALIDATION = {
  is_ready_for_preview: false,
  is_publishable: false,
  completeness_score: 0,
  hard_errors: [],
  warnings: [],
  section_status: {},
  validated_at: null,
};

export const TEMPLATE_DEFAULT_META = {
  created_at: null,
  updated_at: null,
  last_saved_at: null,
  last_published_at: null,
  last_previewed_at: null,
  edited_by: null,
  published_by: null,
};
