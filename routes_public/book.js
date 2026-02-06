import express from "express";

const router = express.Router();

const API_BASE = "https://totem-p0-api-production.up.railway.app";

/**
 * GET /book
 * READ-ONLY UI
 * Источник данных: ТОЛЬКО public API
 * Никаких db import
 */
router.get("/book", async (req, res) => {
  const salonSlug = req.query.salon || null;
  const returnUrl = req.query.return || "";

  if (!salonSlug) {
    res.status(400).send("Missing salon parameter");
    return;
  }

  try {
    // 1) salon
    const salonResp = await fetch(`${API_BASE}/public/salons/${encodeURIComponent(salonSlug)}`);
    if (!salonResp.ok) {
      res.status(404).send("Salon not found");
      return;
    }
    const salon = await salonResp.json();
    if (salon.enabled === false) {
      res.status(403).send("Salon is disabled");
      return;
    }

    // 2) masters (если эндпоинта нет — безопасный fallback)
    let masters = [];
    try {
      const mResp = await fetch(`${API_BASE}/public/masters`);
      if (mResp.ok) masters = await mResp.json();
    } catch (_) {}

    // 3) services (если эндпоинта нет — безопасный fallback)
    let services = [];
    try {
      const sResp = await fetch(`${API_BASE}/public/services`);
      if (sResp.ok) services = await sResp.json();
    } catch (_) {}

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>Запись в салон</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background:#f6f6f6; padding:24px; }
    .card { max-width:480px; margin:0 auto; background:#fff; border-radius:12px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,.08); }
    h1 { margin:0 0 12px; font-size:22px; }
    h2 { margin:20px 0 8px; font-size:16px; }
    ul { padding-left:18px; }
    li { margin-bottom:6px; }
    .muted { color:#666; font-size:14px; }
    button { margin-top:20px; width:100%; padding:14px; font-size:16px; border-radius:8px; border:none; cursor:pointer; background:#111; color:#fff; }
    button:hover { background:#000; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${salon.name || "Салон"}</h1>
    <div class="muted">Онлайн-запись</div>

    <h2>Мастера</h2>
    <ul>
      ${
        masters.length
          ? masters.map(m => `<li>${m.name || m.slug}</li>`).join("")
          : "<li class='muted'>Данные недоступны</li>"
      }
    </ul>

    <h2>Услуги</h2>
    <ul>
      ${
        services.length
          ? services.map(s => `<li>${s.name} — ${s.duration_min} мин — ${s.price}</li>`).join("")
          : "<li class='muted'>Данные недоступны</li>"
      }
    </ul>

    <button id="continue">Продолжить</button>
  </div>

  <script>
    document.getElementById("continue").onclick = function () {
      var target = "/auth?role=client&salon=${encodeURIComponent(salon.slug)}&return=${encodeURIComponent(returnUrl)}";
      window.location.href = target;
    };
  </script>
</body>
</html>`);
  } catch (err) {
    res.status(500).send("Internal error");
  }
});

export default router;
