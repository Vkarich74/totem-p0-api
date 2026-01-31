// middleware/system_owner_guard.js
// CONTRACT:
// - api_guard MUST run before this middleware
// - This guard ONLY checks authorization, never authentication

export default function systemOwnerGuard(req, res, next) {
  const user = req.user;

  if (!user) {
    // This is a developer / routing error, not an auth failure
    return res.status(500).json({
      ok: false,
      error: "AUTH_GUARD_MISORDERED",
      message: "api_guard must run before systemOwnerGuard"
    });
  }

  if (user.role !== "salon_admin") {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }

  const whitelist = (process.env.SYSTEM_OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (whitelist.length > 0 && !whitelist.includes(user.email)) {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }

  next();
}
