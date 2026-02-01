// middleware/auth_owner.js
// Accepts salon_admin as owner-equivalent role

export function requireOwner(req, res, next) {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // Canonical rule:
  // salon_admin == owner permissions
  if (user.role !== "salon_admin") {
    return res.status(403).json({ error: "forbidden" });
  }

  next();
}
