import express from "express"

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

// ===== HEALTH =====
app.get("/health", (req, res) => {
  res.json({ ok: true })
})

// ===== CRM WEBHOOK (ODOO SAAS SAFE) =====
app.post("/system/webhook/crm", (req, res) => {
  console.log("[CRM WEBHOOK] QUERY:", req.query)
  console.log("[CRM WEBHOOK] BODY:", req.body)

  const token =
    req.query.token ||
    req.headers["x-system-token"]

  if (!token || token !== process.env.SYSTEM_TOKEN) {
    console.error("[CRM WEBHOOK] UNAUTHORIZED")
    return res.status(401).json({ error: "unauthorized" })
  }

  return res.status(200).json({ ok: true })
})

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({ error: "not_found" })
})

// ===== START =====
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`TOTEM API listening on ${PORT}`)
})
