// middleware/auth_owner.js
export function requireOwner(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // DEV AUTH — пропускаем любой Bearer
  req.user = { role: "salon_admin" };
  next();
}
