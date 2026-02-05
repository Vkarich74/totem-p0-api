import express from "express"

// routes
import publicRoutes from "./routes/public.js"
import ownerRoutes from "./routes/owner.js"
import systemRoutes from "./routes/system.js"

const app = express()

/**
 * =========================
 * CORS — Odoo SaaS allowlist
 * =========================
 */
const ALLOWED_ORIGINS = [
  "https://totem-platform.odoo.com"
]

app.use((req, res, next) => {
  const origin = req.headers.origin

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-System-Token"
  )

  if (req.method === "OPTIONS") {
    return res.sendStatus(204)
  }

  next()
})

app.use(express.json())

/**
 * =========================
 * SCALE A — RATE LIMIT
 * =========================
 * - Soft limit for GET /public/catalog
 * - Hard limit for POST /public/bookings
 * - In-memory (RC-safe)
 * - Contract unchanged
 */

const RATE_WINDOW_MS = 60 * 1000

const catalogHits = new Map()
const bookingHits = new Map()

function rateLimit(map, limit) {
  return (req, res, next) => {
    const key = req.ip
    const now = Date.now()

    const entry = map.get(key) || { count: 0, ts: now }

    if (now - entry.ts > RATE_WINDOW_MS) {
      entry.count = 0
      entry.ts = now
    }

    entry.count++
    map.set(key, entry)

    if (entry.count > limit) {
      return res.status(429).json({ error: "rate_limited" })
    }

    next()
  }
}

// health must NEVER be rate-limited
app.get("/health", (req, res) => {
  res.json({ ok: true })
})

// soft limit: catalog (read)
app.use(
  "/public/catalog",
  rateLimit(catalogHits, 120) // 120 req / min per IP
)

// hard limit: bookings (write)
app.use(
  "/public/bookings",
  rateLimit(bookingHits, 10) // 10 req / min per IP
)

// ===== ROUTES =====
app.use("/public", publicRoutes)
app.use("/owner", ownerRoutes)
app.use("/system", systemRoutes)

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({ error: "not_found" })
})

// ===== START =====
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`TOTEM API listening on ${PORT}`)
})
