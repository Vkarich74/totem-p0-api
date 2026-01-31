import express from "express";
import db from "../db/index.js";

const router = express.Router();

/**
 * GET /book
 * READ-ONLY UI
 * Params:
 *  - salon (required): salon_slug
 *  - return (optional): return url
 */
router.get("/book", (req, res) => {
  const salonSlug = req.query.salon || null;
  const returnUrl = req.query.return || "";

  if (!salonSlug) {
    res.status(400).send("Missing salon parameter");
    return;
  }

  // read salon
  const salon = db
    .prepare(
      "SELECT slug, name, enabled FROM salons WHERE slug = ? LIMIT 1"
    )
    .get(salonSlug);

  if (!salon) {
    res.status(404).send("Salon not found");
    return;
  }

  if (!salon.enabled) {
    res.status(403).send("Salon is disabled");
    return;
  }

  // read masters
  const masters = db
    .prepare(
      "SELECT slug, name FROM masters WHERE active = true ORDER BY name"
    )
    .all();

  // read services
  const services = db
    .prepare(
      "SELECT service_id, name, duration_min, price FROM services ORDER BY name"
    )
    .all();

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>Запись в салон</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f6f6f6;
      padding: 24px;
    }
    .card {
      max-width: 480px;
      margin: 0 auto;
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
    }
    h1 { margin: 0 0 12px; font-size: 22px; }
    h2 { margin: 20px 0 8px; font-size: 16px; }
    ul { padding-left: 18px; }
    li { margin-bottom: 6px; }
    .muted { color: #666; font-size: 14px; }
    button {
      margin-top: 20px;
      width: 100%;
      padding: 14px;
      font-size: 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      background: #111;
      color: #fff;
    }
    button:hover { background: #000; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${salon.name}</h1>
    <div class="muted">Онлайн-запись</div>

    <h2>Мастера</h2>
    <ul>
      ${
        masters.length
          ? masters.map(m => `<li>${m.name}</li>`).join("")
          : "<li class='muted'>Нет доступных мастеров</li>"
      }
    </ul>

    <h2>Услуги</h2>
    <ul>
      ${
        services.length
          ? services.map(s =>
              `<li>${s.name} — ${s.duration_min} мин — ${s.price}</li>`
            ).join("")
          : "<li class='muted'>Нет услуг</li>"
      }
    </ul>

    <button id="continue">Продолжить</button>
  </div>

  <script>
    document.getElementById("continue").onclick = function () {
      var target = "/auth?role=client&salon=${encodeURIComponent(
        salon.slug
      )}&return=${encodeURIComponent(returnUrl)}";
      window.location.href = target;
    };
  </script>
</body>
</html>`);
});

export default router;
