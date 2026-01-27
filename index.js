// index.js — EMERGENCY BOOT
import express from 'express'

const app = express()

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log('BOOT OK on port', PORT)
})
