import express from "express"

const app = express()

// ===== GLOBAL MIDDLEWARE =====
app.use(express.json())

// ===== HEALTH CHECK =====
app.get("/health", (req, res) => {
  res.json({ ok: true })
})

// ===== CRM WEBHOOK (ODOO) =====
app.post("/system/webhook/crm", (req, res) => {
  console.log("[CRM WEBHOOK] HEADERS:", req.headers)
  console.log("[CRM WEBHOOK] BODY:", req.body)

  const token = req.headers["x-system-token"]

  if (!token || token !== process.env.SYSTEM_TOKEN) {
    console.error("[CRM WEBHOOK] UNAUTHORIZED")
    return res.status(401).json({ error: "unauthorized" })
  }

  // TODO: здесь позже будет реальная обработка лида
  // сейчас просто подтверждаем приём

  return res.status(200).json({ ok: true })
})

// ===== 404 FALLBACK =====
app.use((req, res) => {
  res.status(404).json({ error: "not_found" })
})

// ===== START SERVER =====
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`TOTEM API listening on port ${PORT}`)
})
