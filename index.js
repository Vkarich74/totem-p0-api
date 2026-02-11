import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Pool } from "pg";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "https://totem-platform.odoo.com";

app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true
}));

app.options("*", cors({
  origin: FRONTEND_ORIGIN,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
}));

/* =========================
   SAFE DB HELPER
========================= */

function getPool() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL
  });
}

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* =========================
   AUTH LOGIN
========================= */

app.post("/auth/login", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }

  const role = "salon_admin";
  const salon_slug = "totem-demo-salon";

  const token = crypto.randomUUID();

  res.cookie("totem_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "None"
  });

  return res.json({
    ok: true,
    role,
    salon_slug,
    master_slug: null
  });
});

/* =========================
   AUTH RESOLVE
========================= */

app.get("/auth/resolve", (req, res) => {
  const session = req.cookies.totem_session;

  if (!session) {
    return res.json({ role: "public" });
  }

  return res.json({
    role: "salon_admin",
    salon_slug: "totem-demo-salon",
    master_slug: null
  });
});

/* =========================
   SALON SLUG RESOLVE
========================= */

app.get("/s/:slug/resolve", async (req, res) => {
  try {
    const pool = getPool();

    if (!pool) {
      return res.status(500).json({
        ok: false,
        error: "DATABASE_NOT_CONFIGURED"
      });
    }

    const { slug } = req.params;

    const result = await pool.query(
      "SELECT id, slug FROM salons WHERE slug = $1 LIMIT 1",
      [slug]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND"
      });
    }

    const salon = result.rows[0];

    return res.json({
      ok: true,
      salon_id: String(salon.id),
      slug: salon.slug
    });

  } catch (err) {
    console.error("SLUG_RESOLVE_ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR"
    });
  }
});

/* =========================
   GLOBAL JSON 404
========================= */

app.use((req, res) => {
  return res.status(404).json({
    ok: false,
    error: "NOT_FOUND"
  });
});

/* =========================
   START
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
