import KZ_COUNTRY_PACK from "./country-packs/KZ.js";
import KG_COUNTRY_PACK from "./country-packs/KG.js";

const PACKS = new Map([
  [`${KZ_COUNTRY_PACK.code}@${KZ_COUNTRY_PACK.version}`, KZ_COUNTRY_PACK],
  [`${KG_COUNTRY_PACK.code}@${KG_COUNTRY_PACK.version}`, KG_COUNTRY_PACK],
]);

function createCountryPackError(code, message, statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeKey(code, version) {
  return `${String(code || "").trim().toUpperCase()}@${String(version || "").trim()}`;
}

function getCountryPack(code, version) {
  const key = normalizeKey(code, version);
  const pack = PACKS.get(key) || null;

  if (!pack) {
    throw createCountryPackError(
      "COUNTRY_PACK_NOT_FOUND",
      `CountryPack is not registered: ${key}`,
      500
    );
  }

  return pack;
}

function listCountryPacks() {
  return Object.freeze(Array.from(PACKS.values()));
}

export { createCountryPackError, getCountryPack, listCountryPacks };
