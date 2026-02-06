import express from "express";

const router = express.Router();

/**
 * GET /me
 * Protected endpoint
 * apiGuard guarantees:
 * - req.user exists
 * - role & binding are valid
 */
router.get("/", (req, res) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "AUTH_REQUIRED",
    });
  }

  if (user.enabled === false) {
    return res.status(403).json({
      ok: false,
      error: "USER_DISABLED",
    });
  }

  return res.json({
    ok: true,
    user: {
      email: user.email,
      role: user.role,
      salon_slug: user.salon_slug ?? null,
      master_slug: user.master_slug ?? null,
    },
  });
});

export default router;
