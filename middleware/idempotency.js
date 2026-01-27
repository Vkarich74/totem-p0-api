// middleware/idempotency.js
import {
  openDb,
  computeRequestHash,
  beginIdempotentRequest,
  completeIdempotentRequest
} from "../core/idempotency.js";

function pickActor(req) {
  // аккуратно: у тебя уже может быть auth; пока берем заголовок, иначе "anonymous"
  const fromHeader =
    req.headers["x-actor-id"] ||
    req.headers["x-user-id"] ||
    req.headers["x-system-id"] ||
    req.headers["x-provider-id"];

  if (fromHeader) return String(fromHeader);
  return "anonymous";
}

function getIdempotencyKey(req) {
  const k = req.headers["idempotency-key"] || req.headers["x-idempotency-key"];
  if (!k) return null;
  const key = String(k).trim();
  if (!key) return null;
  if (key.length > 128) return null;
  // допускаем base64/uuid/любые безопасные символы, но режем совсем мусор
  if (!/^[A-Za-z0-9._:\-+/=]+$/.test(key)) return null;
  return key;
}

export function idempotencyGuard(scope, opts = {}) {
  const ttlSeconds = Number(opts.ttlSeconds || 0) || 60 * 60 * 24;

  return function idemMiddleware(req, res, next) {
    const idemKey = getIdempotencyKey(req);

    // если ключа нет — просто пропускаем (по твоим правилам, позже сделаем mandatory для нужных эндпоинтов)
    if (!idemKey) return next();

    const actor = pickActor(req);
    const method = String(req.method || "").toUpperCase();
    const reqPath = String(req.originalUrl || req.url || "");

    // hash включает body+query+actor+method+path
    const requestHash = computeRequestHash({
      method,
      path: reqPath,
      actor,
      body: req.body || {},
      query: req.query || {}
    });

    const db = openDb();

    try {
      const started = beginIdempotentRequest(db, {
        scope,
        idemKey,
        actor,
        method,
        path: reqPath,
        requestHash,
        ttlSeconds
      });

      if (started.kind === "conflict_hash") {
        res.status(409).json({
          ok: false,
          error: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
          scope
        });
        return;
      }

      if (started.kind === "in_progress") {
        res.setHeader("Retry-After", "2");
        res.status(409).json({
          ok: false,
          error: "IDEMPOTENCY_REQUEST_IN_PROGRESS",
          scope
        });
        return;
      }

      if (started.kind === "replay") {
        // replay: возвращаем прошлый ответ
        const headers = started.headers || {};
        for (const [k, v] of Object.entries(headers)) {
          try {
            if (v !== undefined && v !== null) res.setHeader(k, String(v));
          } catch {}
        }
        res.setHeader("x-idempotent-replay", "1");
        res.status(started.statusCode).json(started.body);
        return;
      }

      // new: перехватываем res.json, чтобы записать ответ в таблицу
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        try {
          const statusCode = res.statusCode || 200;

          // сохраняем только безопасные заголовки (не тащим Set-Cookie и т.п.)
          const safeHeaders = {};
          const allow = ["content-type", "x-request-id", "x-idempotent-replay"];
          for (const h of allow) {
            const v = res.getHeader(h);
            if (v !== undefined) safeHeaders[h] = v;
          }

          completeIdempotentRequest(db, {
            scope,
            idemKey,
            statusCode,
            responseHeaders: safeHeaders,
            responseBody: body
          });
        } catch {
          // молча, не ломаем ответ
        } finally {
          try { db.close(); } catch {}
        }
        return originalJson(body);
      };

      // если обработчик вдруг завершит не через res.json — все равно закрыть DB
      res.on("finish", () => {
        try { db.close(); } catch {}
      });

      next();
    } catch (e) {
      try { db.close(); } catch {}
      res.status(500).json({ ok: false, error: "IDEMPOTENCY_INTERNAL_ERROR" });
    }
  };
}
