// middleware/system_owner_guard.js
// CONTRACT:
// - api_guard MUST run before this middleware
// - This guard checks OWNER authorization (salon_admin scoped)

export default function systemOwnerGuard(req, res, next) {
  const user = req.user;

  if (!user) {
    return res.status(500).json({
      ok: false,
      error: "AUTH_GUARD_MISORDERED",
      message: "api_guard must run before systemOwnerGuard",
    });
  }

  // OWNER = salon_admin
  if (user.role !== "salon_admin") {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }

  next();
}
