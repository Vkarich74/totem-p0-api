export function registerOwnerSalons(app, db) {
  /**
   * GET /marketplace/owner/salons?owner_id=...
   * P3.2: ownership без auth, owner_id передаётся явно
   */
  app.get("/marketplace/owner/salons", (req, res) => {
    const { owner_id } = req.query || {};

    if (!owner_id) {
      return res.status(400).json({ error: "missing_owner_id" });
    }

    const salons = db.prepare(`
      SELECT id, slug, name
      FROM salons
      WHERE owner_id = ?
        AND active = 1
    `).all(owner_id);

    res.json({
      ok: true,
      owner_id,
      salons
    });
  });
}
