app.get("/s/:slug/resolve", async (req, res) => {
  try {
    const slug = req.params.slug;

    if (!slug) {
      return res.status(400).json({ ok: false, error: "missing_slug" });
    }

    // Временно: просто подтверждаем существование slug
    return res.json({
      ok: true,
      slug,
      exists: true
    });

  } catch (e) {
    console.error("SLUG RESOLVE ERROR:", e);
    return res.status(500).json({ ok: false });
  }
});
