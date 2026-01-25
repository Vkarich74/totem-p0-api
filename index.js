import express from "express";
import { db } from "./db.js";

console.log("=== TOTEM P1.2 DB MODE ===");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/booking/start", (req, res) => {
  const { master_slug, source } = req.query;

  if (!master_slug) {
    return res.json({ ok: false, error: "MASTER_SLUG_REQUIRED" });
  }

  const master = db
    .prepare("SELECT id, name, slug FROM masters WHERE slug = ?")
    .get(master_slug);

  if (!master) {
    return res.json({ ok: false, error: "MASTER_NOT_FOUND" });
  }

  const relation = db
    .prepare(
      "SELECT salon_id FROM salon_masters WHERE master_id = ? AND active = 1"
    )
    .get(master.id);

  if (!relation) {
    return res.json({ ok: false, error: "MASTER_NOT_ACTIVE" });
  }

  const salon = db
    .prepare("SELECT id, name, slug FROM salons WHERE id = ?")
    .get(relation.salon_id);

  if (!salon) {
    return res.json({ ok: false, error: "SALON_NOT_FOUND" });
  }

  return res.json({
    ok: true,
    master,
    salon,
    source: source || null
  });
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
