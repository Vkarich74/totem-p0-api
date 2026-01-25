export function registerMarketplaceSalonRoutes(app, db) {
  app.get("/marketplace/salon/list", (req, res) => {
    const salons = db.all(
      "SELECT salon_id, salon_slug, enabled, enabled_at FROM marketplace_salons ORDER BY salon_slug"
    );
    res.json({ ok: true, salons });
  });

  app.post("/marketplace/salon/enable", (req, res) => {
    const slug = String(req.body?.salon_slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "salon_slug_required" });

    const salon = db.get("SELECT * FROM marketplace_salons WHERE salon_slug = ?", [slug]);
    if (!salon) return res.status(404).json({ ok: false, error: "salon_not_found" });

    const enabled = req.body?.enabled === false ? 0 : 1;
    const enabledAt = enabled ? new Date().toISOString() : null;

    db.run(
      "UPDATE marketplace_salons SET enabled = ?, enabled_at = ? WHERE salon_slug = ?",
      [enabled, enabledAt, slug]
    );

    res.json({ ok: true });
  });
}
