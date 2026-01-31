export default function systemOwnerGuard(req, res, next) {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
  }

  if (user.role !== "salon_admin") {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }

  const whitelist = (process.env.SYSTEM_OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (!whitelist.includes(user.email)) {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }

  next();
}
