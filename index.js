import express from "express";
import db from "./db/index.js";

console.log("=== TOTEM P1.4.2 SALON SELECT MODE ===");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/booking/start", async (req, res) => {
  const { master_slug, salon_slug, source } = req.query;

  if (!master_slug) {
    return res.json({ ok: false, error: "MASTER_SLUG_REQUIRED" });
  }

  try {
    const master = await db.getMasterBySlug(master_slug);
    if (!master) {
      return res.json({ ok: false, error: "MASTER_NOT_FOUND" });
    }

    // Если salon_slug указан — проверяем конкретный салон
    if (salon_slug) {
      const salon = await db.getActiveSalonBySlug(master.id, salon_slug);
      if (!salon) {
        return res.json({ ok: false, error: "SALON_NOT_ALLOWED" });
      }

      return res.json({
        ok: true,
        master,
        salon,
        source: source || null
      });
    }

    // salon_slug не указан — смотрим количество салонов
    const salons = await db.getActiveSalonsByMasterId(master.id);
    if (!salons || salons.length === 0) {
      return res.json({ ok: false, error: "MASTER_NOT_ACTIVE" });
    }

    if (salons.length > 1) {
      return res.json({
        ok: false,
        error: "SALON_REQUIRED",
        salons
      });
    }

    // ровно один салон — авто-выбор
    return res.json({
      ok: true,
      master,
      salon: salons[0],
      source: source || null
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
