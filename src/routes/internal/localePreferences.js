import express from "express";
import {
  localeError, requireLocaleSession, resolveLocaleOwnerContext,
  resolveAccessibleLocaleMarket, readUserLocale, writeUserLocale,
} from "../../market-context/UserLocaleService.js";

function rejectIdentityInput(input = {}) {
  const allowed = new Set(["market_code", "locale"]);
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !allowed.has(key))) {
    throw localeError("LOCALE_REQUEST_INVALID");
  }
}

export default function buildLocalePreferencesRouter(pool, limiter) {
  const r = express.Router();
  const limited = limiter ?? ((req, res, next) => next());
  const replyError = (res, error) => {
    // Never return database messages or arbitrary exceptions.
    const expected = Number.isInteger(error.statusCode) &&
      error.statusCode >= 400 && error.statusCode < 500;
    return res.status(expected ? error.statusCode : 500).json({
      ok: false, error: expected ? error.code : "LOCALE_REQUEST_FAILED",
    });
  };

  r.get("/locale-context", limited, async (req, res) => {
    try {
      const userId = requireLocaleSession(req);
      const resolved = await resolveLocaleOwnerContext(
        pool, req.identity, req.query.owner_type, req.query.owner_slug
      );
      const preference = await readUserLocale(pool, userId, resolved.context);
      res.set("Cache-Control", "no-store");
      return res.json({
        ok: true,
        market_context: resolved.context,
        ui_locale: preference.effective_locale,
        preference_source: preference.preference_source,
        business_context_status: resolved.business_context_status,
        context_source: resolved.context_source,
      });
    } catch (error) { return replyError(res, error); }
  });

  r.get("/locale-preference", limited, async (req, res) => {
    try {
      const userId = requireLocaleSession(req);
      rejectIdentityInput(req.query);
      const context = await resolveAccessibleLocaleMarket(pool, req.identity, req.query.market_code);
      const preference = await readUserLocale(pool, userId, context);
      res.set("Cache-Control", "no-store");
      return res.json({ ok: true, market_code: context.market_code, ...preference });
    } catch (error) { return replyError(res, error); }
  });

  r.put("/locale-preference", limited, async (req, res) => {
    let client;
    let transaction = false;
    try {
      const userId = requireLocaleSession(req);
      rejectIdentityInput(req.body);
      client = await pool.connect();
      await client.query("BEGIN");
      transaction = true;
      const context = await resolveAccessibleLocaleMarket(client, req.identity, req.body.market_code);
      const preference = await writeUserLocale(client, userId, context, req.body.locale);
      await client.query("COMMIT");
      transaction = false;
      res.set("Cache-Control", "no-store");
      return res.json({ ok: true, market_code: context.market_code, ...preference });
    } catch (error) {
      if (transaction) {
        try { await client.query("ROLLBACK"); } catch { /* return a safe error */ }
      }
      return replyError(res, error);
    } finally { client?.release(); }
  });
  return r;
}
