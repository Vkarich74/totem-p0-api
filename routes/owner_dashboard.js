import express from "express";

const router = express.Router();

/**
 * GET /owner
 * Owner entrypoint
 */
router.get("/", async (req, res) => {
  res.json({
    ok: true,
    role: req.user.role,
    salon_slug: req.user.salon_slug,
  });
});

export default router;
