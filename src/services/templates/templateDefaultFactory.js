import {
  TEMPLATE_DEFAULT_META,
  TEMPLATE_DEFAULT_STATUS,
  TEMPLATE_DEFAULT_VALIDATION,
  TEMPLATE_VERSION_V1,
} from "../../contracts/templates/templateConstants.js";

function nowIso(){
  return new Date().toISOString();
}

function createEmptySalonPayload(){
  return {
    identity: {
      salon_name: "",
      hero_badge: "",
      slogan: "",
      subtitle: "",
    },
    contact: {
      address: "",
      district: "",
      city: "",
      phone: "",
      whatsapp: "",
      instagram: "",
      telegram: "",
      schedule_text: "",
      map_embed_url: "",
    },
    trust: {
      rating_value: "",
      review_count: "",
      completed_bookings: 0,
      trust_note: "",
    },
    cta: {
      booking_label: "",
      booking_url: "",
      services_label: "",
      services_anchor: "",
    },
    sections: {
      benefits: [],
      popular_services: [],
      full_service_list: [],
      promos: [],
      gallery: [],
      reviews: [],
      about_paragraphs: [],
      masters: [],
    },
    images: {
      hero: {
        image_asset_id: null,
        alt: "",
      },
      logo: {
        image_asset_id: null,
        alt: "",
      },
      promo: {
        image_asset_id: null,
        alt: "",
      },
      assets: {},
    },
    seo: {
      title: "",
      description: "",
      canonical_url: "",
    },
  };
}

function createEmptyMasterPayload(){
  return {
    identity: {
      master_name: "",
      profession: "",
      hero_badge: "",
      subtitle: "",
      description: "",
    },
    location: {
      address: "",
      district: "",
      city: "",
      schedule_text: "",
      phone: "",
      whatsapp: "",
      instagram: "",
      telegram: "",
      map_url: "",
    },
    trust: {
      rating_value: "",
      review_count: "",
      trust_note: "",
    },
    metrics: [],
    cta: {
      booking_label: "",
      booking_url: "",
      services_label: "",
      services_anchor: "",
    },
    sections: {
      badges: [],
      benefits: [],
      featured_services: [],
      service_catalog: [],
      reviews: [],
      about_paragraphs: [],
      portfolio: [],
    },
    images: {
      hero: {
        image_asset_id: null,
        alt: "",
      },
      avatar: {
        image_asset_id: null,
        alt: "",
      },
      assets: {},
    },
    seo: {
      title: "",
      description: "",
      canonical_url: "",
    },
    stats: {
      years: "",
      rating: "",
      bookings: "",
    },
  };
}

export function createEmptyTemplatePayload(ownerType){
  return ownerType === "master" ? createEmptyMasterPayload() : createEmptySalonPayload();
}

export function createDefaultTemplateDocument(ownerType, ownerSlug, templateVersion = TEMPLATE_VERSION_V1){
  const stamp = nowIso();
  return {
    owner_type: ownerType,
    owner_slug: ownerSlug,
    template_version: templateVersion,
    status: {
      ...TEMPLATE_DEFAULT_STATUS,
      draft_exists: true,
    },
    draft: createEmptyTemplatePayload(ownerType),
    published: createEmptyTemplatePayload(ownerType),
    validation: {
      ...TEMPLATE_DEFAULT_VALIDATION,
      validated_at: stamp,
    },
    meta: {
      ...TEMPLATE_DEFAULT_META,
      created_at: stamp,
      updated_at: stamp,
    },
  };
}
