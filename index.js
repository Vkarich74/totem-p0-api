import express from "express";

console.log("=== TOTEM P1.1 INDEX LOADED ===");

const app = express();
const PORT = process.env.PORT || 3000;

const masters = [
  { id: "m1", name: "Test Master", slug: "test-master" }
];

const salons = [
  { id: "s1", name: "Totem Demo Salon", slug: "totem-demo-salon" }
];

const salonMasters = [
  { masterId: "m1", salonId: "s1", active: true }
];

app.get("/booking/start", (req, res) => {
  const master = masters.find(m => m.slug === req.query.master_slug);
  if (!master) return res.json({ ok: false, error: "MASTER_NOT_FOUND" });

  const rel = salonMasters.find(sm => sm.masterId === master.id && sm.active);
  if (!rel) return res.json({ ok: false, error: "MASTER_NOT_ACTIVE" });

  const salon = salons.find(s => s.id === rel.salonId);

  return res.json({
    ok: true,
    master,
    salon,
    source: req.query.source || null
  });
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
