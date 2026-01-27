// middleware/acl.js (ESM)
// STEP 26.7 — Tenant ACL (roles)

function getRole(req) {
  const r = req.headers["x-tenant-role"];
  return r ? String(r).toLowerCase() : null;
}

function getActorType(req) {
  return req.headers["x-actor-type"]
    ? String(req.headers["x-actor-type"]).toLowerCase()
    : null;
}

function getActorId(req) {
  const id =
    req.headers["x-actor-id"] ||
    req.headers["x-user-id"] ||
    req.headers["x-master-id"];
  return id !== undefined && id !== null ? Number(id) : null;
}

/**
 * requireRoles(['owner','staff'])
 */
export function requireRoles(allowedRoles = []) {
  return function aclMiddleware(req, res, next) {
    const actorType = getActorType(req);

    // system bypass (still tenant-checked elsewhere)
    if (actorType === "system") {
      return next();
    }

    const role = getRole(req);
    if (!role) {
      return res.status(403).json({ ok: false, error: "TENANT_ROLE_REQUIRED" });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ ok: false, error: "ROLE_FORBIDDEN" });
    }

    return next();
  };
}

/**
 * requireMasterSelf()
 * master can act only on his own bookings
 * expects booking loaded on req.booking
 */
export function requireMasterSelf() {
  return function masterSelf(req, res, next) {
    const actorType = getActorType(req);
    if (actorType === "system") return next();

    const role = getRole(req);
    if (role !== "master") return next();

    const actorId = getActorId(req);
    if (!actorId) {
      return res.status(403).json({ ok: false, error: "ACTOR_ID_REQUIRED" });
    }

    const booking = req.booking;
    if (!booking) {
      return res.status(500).json({ ok: false, error: "BOOKING_CONTEXT_MISSING" });
    }

    if (Number(booking.master_id) !== actorId) {
      return res.status(403).json({ ok: false, error: "MASTER_FORBIDDEN" });
    }

    return next();
  };
}
