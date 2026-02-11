import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

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

// ------------------------
// HEALTH
// ------------------------

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ------------------------
// AUTH LOGIN
// ------------------------

app.post("/auth/login", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }

  // TODO: заменить на реальную проверку БД
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

// ------------------------
// AUTH RESOLVE
// ------------------------

app.get("/auth/resolve", (req, res) => {
  const session = req.cookies.totem_session;

  if (!session) {
    return res.json({ role: "public" });
  }

  // TODO: заменить на реальную сессию из БД
  return res.json({
    role: "salon_admin",
    salon_slug: "totem-demo-salon",
    master_slug: null
  });
});

// ------------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
