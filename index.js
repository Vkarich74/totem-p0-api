import express from "express";
import db from "./db/index.js";

console.log("=== TOTEM P1.4 MULTI-SALON MODE ===");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/booking/start", async (req, res) => {
  const { master_slug, source } = req.query;

  if (!master_slug) {
    return res.json({ ok: false, error: "MASTER_SLUG_REQUIRED" });
  }

  try {
    const master = await db.getMasterBySlug(master_slug);
    if (!master) {
      return res.json({ ok: false, error: "MASTER_NOT_FOUND" });
    }

    const salons = await db.getActiveSalonsByMasterId(master.id);
    if (!salons || salons.length === 0) {
      return res.json({ ok: false, error: "MASTER_NOT_ACTIVE" });
    }

    return res.json({
      ok: true,
      master,
      salons,
      source: source || null
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
