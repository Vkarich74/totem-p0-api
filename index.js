import express from "express";

// routes
import publicRoutes from "./routes/public.js";
import ownerRoutes from "./routes/owner.js";
import systemRoutes from "./routes_system/index.js";

const app = express();

/**
 * =========================
 * CORS — Odoo SaaS allowlist
 * =========================
 */
const ALLOWED_ORIGINS = [
  "https://totem-platform.odoo.com"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-System-Token"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

// ===== HEALTH =====
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ===== ROUTES =====
app.use("/public", publicRoutes);
app.use("/owner", ownerRoutes);
app.use("/system", systemRoutes);

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

// ===== START =====
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`TOTEM API listening on ${PORT}`);
});
