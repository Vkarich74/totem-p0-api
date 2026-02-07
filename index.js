import express from "express";
import cors from "cors";
import db from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// ===== HEALTH =====
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ===== SALON CONTEXT RESOLVER =====
// URL: /s/{slug}/...
app.use("/s/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;

    const sql =
      db.mode === "POSTGRES"
        ? "SELECT id, slug, status FROM salons WHERE slug = $1"
        : "SELECT id, slug, status FROM salons WHERE slug = ?";

    const salon = await db.get(sql, [slug]);

    if (!salon) {
      return res.status(404).json({ error: "SALON_NOT_FOUND" });
    }

    if (salon.status !== "active") {
      return res.status(403).json({ error: "SALON_INACTIVE" });
    }

    req.salon = salon;
    req.salon_id = salon.id;
    next();
  } catch (err) {
    console.error("[SALON RESOLVER ERROR]", err);
    res.status(500).json({ error: "SALON_RESOLVE_FAILED" });
  }
});

// ===== SALON RESOLVE API =====
// GET /s/{slug}/resolve
app.get("/s/:slug/resolve", (req, res) => {
  res.json({
    ok: true,
    salon_id: String(req.salon_id),
    slug: req.salon.slug,
  });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`TOTEM API running on port ${PORT}`);
});
