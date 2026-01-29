# TOTEM — PUBLIC API (v1) — Freeze Contract

**Status:** stable (FREEZE)  
**Audience:** SDK / Widget / Frontend  
**Base URL (prod):** https://totem-p0-api-production.up.railway.app  

Принцип:
- Виджет и SDK используют **только этот контракт**
- Backend зафиксирован, изменения — только через v2
- Никаких скрытых зависимостей от owner/system API

---

## 1) Health

### GET `/health`

**Purpose:** smoke-check, monitoring

**Response 200**
```json
{ "ok": true }
