import { buildAuthLoginUrl } from "./entryContract.js";

function safeInt(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

function collectOwnedIds(identity = {}, key) {
  const ids = new Set();

  if (Array.isArray(identity?.[key])) {
    for (const item of identity[key]) {
      if (item && typeof item === "object") {
        const parsed = safeInt(item.id ?? item.owner_id ?? item[`${key.slice(0, -1)}_id`]);
        if (parsed) {
          ids.add(parsed);
        }
        continue;
      }

      const parsed = safeInt(item);
      if (parsed) {
        ids.add(parsed);
      }
    }
  }

  if (Array.isArray(identity?.ownership)) {
    for (const item of identity.ownership) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const ownerType = String(item.owner_type || item.type || "").trim().toLowerCase();
      if ((key === "salons" && ownerType !== "salon") || (key === "masters" && ownerType !== "master")) {
        continue;
      }

      const parsed = safeInt(item.owner_id ?? item.id ?? item[`${ownerType}_id`]);
      if (parsed) {
        ids.add(parsed);
      }
    }
  }

  return ids;
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function getSessionDenyCode(auth = null) {
  if (!auth?.user_id || !auth?.role) {
    return "AUTH_REQUIRED";
  }

  const now = Date.now();
  const sessionExpiresAt = parseTimestamp(auth?.session_expires_at);
  const idleTimeoutAt = parseTimestamp(auth?.idle_timeout_at);

  if (sessionExpiresAt && sessionExpiresAt <= now) {
    return "SESSION_EXPIRED";
  }

  if (idleTimeoutAt && idleTimeoutAt <= now) {
    return "IDLE_TIMEOUT";
  }

  return null;
}

export function hasCabinetOwnerAccess(auth = null, identity = null, ownerType, ownerId) {
  const safeOwnerId = safeInt(ownerId);
  const safeOwnerType = String(ownerType || "").trim().toLowerCase();

  if (!auth?.user_id || !auth?.role || !safeOwnerId) {
    return false;
  }

  if (getSessionDenyCode(auth)) {
    return false;
  }

  if (auth.role === "system") {
    return true;
  }

  if (safeOwnerType === "salon") {
    return collectOwnedIds(identity, "salons").has(safeOwnerId);
  }

  if (safeOwnerType === "master") {
    return collectOwnedIds(identity, "masters").has(safeOwnerId);
  }

  return false;
}

export function buildCabinetAuthSnapshot(resolvedEntry, auth = null, identity = null, baseUrl = null) {
  const contract = resolvedEntry?.contract || null;

  if (!contract) {
    const err = new Error("ENTRY_CONTRACT_REQUIRED");
    err.code = "ENTRY_CONTRACT_REQUIRED";
    throw err;
  }

  const sessionDenyCode = getSessionDenyCode(auth);
  const authenticated = sessionDenyCode === null;
  const authorized = authenticated && hasCabinetOwnerAccess(auth, identity, contract.owner_type, contract.owner_id);
  const authUrls = buildAuthLoginUrl(contract.owner_type, contract.canonical_slug, baseUrl);

  let denyCode = sessionDenyCode;
  if (!denyCode && !authorized) {
    denyCode = "CABINET_ACCESS_DENIED";
  }

  return {
    owner_type: contract.owner_type,
    owner_id: contract.owner_id,
    canonical_slug: contract.canonical_slug,
    authenticated,
    authorized,
    can_open_cabinet: Boolean(authenticated && authorized),
    auth_required_for_cabinet: true,
    auth_login_url: authUrls.auth_login_url,
    auth_login_absolute_url: authUrls.auth_login_absolute_url,
    cabinet_url: contract.cabinet_url,
    cabinet_absolute_url: contract.cabinet_absolute_url,
    post_auth_redirect_url: contract.cabinet_url,
    post_auth_redirect_absolute_url: contract.cabinet_absolute_url,
    deny_code: denyCode
  };
}

export default {
  hasCabinetOwnerAccess,
  buildCabinetAuthSnapshot
};
