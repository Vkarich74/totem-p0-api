import express from "express";

function uniqueNumberList(values = []) {
  return [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];
}

function isTimestampExpired(value) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return false;
  }

  return time <= Date.now();
}

function requiresSessionForRole(role) {
  return role === "salon_admin" || role === "master";
}

function buildPublicIdentity() {
  return {
    user_id: null,
    role: "public",
    salons: [],
    masters: [],
    ownership: []
  };
}

export default function buildAuthSessionResolveRouter() {
  const r = express.Router();

  r.get("/auth/session/resolve", async (req, res) => {
    try {
      const auth = req.auth ?? null;
      const identity = req.identity ?? null;

      const role = String(auth?.role || "public");
      const requiresSession = requiresSessionForRole(role);
      const missingSession = requiresSession && !auth?.session_id;

      const hasAuth = Boolean(auth?.user_id && auth?.role) && !missingSession;
      const sessionExpired = isTimestampExpired(auth?.session_expires_at);
      const idleExpired = isTimestampExpired(auth?.idle_timeout_at);
      const authenticated = hasAuth && !sessionExpired && !idleExpired;

      if (!authenticated) {
        return res.status(200).json({
          ok: true,
          authenticated: false,
          role: "public",
          reason: missingSession
            ? "NO_SESSION"
            : sessionExpired
            ? "SESSION_EXPIRED"
            : idleExpired
            ? "IDLE_TIMEOUT"
            : "NO_AUTH",
          auth: null,
          identity: buildPublicIdentity()
        });
      }

      const salons = uniqueNumberList(Array.isArray(identity?.salons) ? identity.salons : []);
      const masters = uniqueNumberList(Array.isArray(identity?.masters) ? identity.masters : []);
      const ownership = Array.isArray(identity?.ownership) ? identity.ownership : [];

      return res.status(200).json({
        ok: true,
        authenticated: true,
        role,
        auth: {
          user_id: Number(auth?.user_id),
          role,
          source: auth?.source || null,
          session_id: auth?.session_id || null,
          session_source: auth?.session_source || null,
          session_expires_at: auth?.session_expires_at || null,
          last_seen_at: auth?.last_seen_at || null,
          idle_timeout_at: auth?.idle_timeout_at || null
        },
        identity: {
          user_id: Number(identity?.user_id || auth?.user_id),
          role: String(identity?.role || role),
          salons,
          masters,
          ownership
        }
      });
    } catch (err) {
      console.error("AUTH_SESSION_RESOLVE_ROUTE_ERROR", err);
      return res.status(500).json({
        ok: false,
        error: "AUTH_SESSION_RESOLVE_FAILED"
      });
    }
  });

  return r;
}
