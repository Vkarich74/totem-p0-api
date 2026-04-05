export const SALON_TEMPLATE_SLOT_TYPES = [
  "hero",
  "gallery",
  "service_card",
  "master_card",
  "logo",
  "promo",
];

export const MASTER_TEMPLATE_SLOT_TYPES = [
  "hero",
  "avatar",
  "portfolio",
  "service_card",
];

export const TEMPLATE_SINGLETON_SLOT_TYPES = ["hero", "logo", "promo", "avatar"];

export function getAllowedSlotTypes(ownerType){
  if (ownerType === "salon") return SALON_TEMPLATE_SLOT_TYPES;
  if (ownerType === "master") return MASTER_TEMPLATE_SLOT_TYPES;
  return [];
}
