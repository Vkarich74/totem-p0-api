import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { buildResolvedEntryContract } from "../../services/entry/entryAccess.js";
import { buildResolvedQrImage } from "../../services/entry/entryQr.js";
import { buildCabinetAuthSnapshot } from "../../services/entry/entryAuth.js";
import { buildEntryValidationSnapshot } from "../../services/entry/entryValidation.js";
import { buildEntryHandoffPackage } from "../../services/entry/entryHandoff.js";
import { buildQrContract } from "../../services/entry/qrService.js"; // ✅ NEW

function readBaseUrl(req){
  const explicit = process.env.PUBLIC_WEB_BASE_URL || process.env.APP_BASE_URL || process.env.PUBLIC_APP_BASE_URL || "";

  if (explicit) {
    return explicit;
  }

  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "www.totemv.com";
  return `${protocol}://${host}`;
}

export default function buildEntryRouter(pool){
  const r = express.Router();

  r.get("/entry/:ownerType/:slug", requireAuth, async (req, res) => {
    try {
      const { ownerType, slug } = req.params;
      const resolved = await buildResolvedEntryContract(pool, ownerType, slug, readBaseUrl(req));

      if (!resolved) {
        return res.status(404).json({ ok: false, code: "NOT_FOUND" });
      }

      if (!resolved.contract.entry_allowed) {
        return res.status(403).json({ ok: false, code: "ENTRY_NOT_AVAILABLE" });
      }

      return res.status(200).json({ ok: true, ...resolved.contract });
    } catch (err) {
      const code = err?.code || "ENTRY_RESOLVE_FAILED";
      const status = code === "INVALID_OWNER_TYPE" || code === "INVALID_CANONICAL_SLUG" ? 400 : 500;
      return res.status(status).json({ ok: false, code });
    }
  });

  // ✅ FIXED: QR PAYLOAD через qrService
  r.get("/entry/:ownerType/:slug/qr-payload", requireAuth, async (req, res) => {
    try {
      const { ownerType, slug } = req.params;

      const qr = buildQrContract({
        owner_type: ownerType,
        canonical_slug: slug
      });

      return res.status(200).json({
        ok: true,
        ...qr.qr
      });

    } catch (err) {
      const code = err?.code || "ENTRY_QR_PAYLOAD_FAILED";
      const status = code === "INVALID_OWNER_TYPE" || code === "INVALID_CANONICAL_SLUG" ? 400 : 500;
      return res.status(status).json({ ok: false, code });
    }
  });

  r.get("/entry/:ownerType/:slug/qr.png", requireAuth, async (req, res) => {
    try {
      const { ownerType, slug } = req.params;
      const resolvedQr = await buildResolvedQrImage(pool, ownerType, slug, readBaseUrl(req));

      if (!resolvedQr) {
        return res.status(404).json({ ok: false, code: "NOT_FOUND" });
      }

      if (!resolvedQr.resolved.contract.qr_allowed || !resolvedQr.qr) {
        return res.status(403).json({ ok: false, code: "QR_NOT_AVAILABLE" });
      }

      // ✅ header теперь консистентен с qrService
      const qrContract = buildQrContract({
        owner_type: ownerType,
        canonical_slug: slug
      });

      res.setHeader("Content-Type", resolvedQr.qr.contentType);
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("X-Totem-Qr-Payload", qrContract.qr.qr_target_url);

      return res.status(200).send(resolvedQr.qr.buffer);
    } catch (err) {
      const code = err?.code || "ENTRY_QR_IMAGE_FAILED";
      const status = err?.status || (code === "INVALID_OWNER_TYPE" || code === "INVALID_CANONICAL_SLUG" ? 400 : 500);
      return res.status(status).json({ ok: false, code });
    }
  });

  r.get("/entry/:ownerType/:slug/auth", async (req, res) => {
    try {
      const { ownerType, slug } = req.params;
      const baseUrl = readBaseUrl(req);
      const resolved = await buildResolvedEntryContract(pool, ownerType, slug, baseUrl);

      if (!resolved) {
        return res.status(404).json({ ok: false, code: "NOT_FOUND" });
      }

      const auth = buildCabinetAuthSnapshot(resolved, req.auth, req.identity, baseUrl);

      return res.status(200).json({
        ok: true,
        owner_type: resolved.contract.owner_type,
        owner_id: resolved.contract.owner_id,
        canonical_slug: resolved.contract.canonical_slug,
        auth_required_for_cabinet: true,
        auth_login_url: auth.auth_login_url,
        auth_login_absolute_url: auth.auth_login_absolute_url,
        cabinet_url: auth.cabinet_url,
        cabinet_absolute_url: auth.cabinet_absolute_url,
        authenticated: auth.authenticated,
        authorized: auth.authorized,
        can_open_cabinet: auth.can_open_cabinet,
        deny_code: auth.deny_code
      });
    } catch (err) {
      const code = err?.code || "ENTRY_AUTH_RESOLVE_FAILED";
      const status = code === "INVALID_OWNER_TYPE" || code === "INVALID_CANONICAL_SLUG" ? 400 : 500;
      return res.status(status).json({ ok: false, code });
    }
  });

  r.get("/entry/:ownerType/:slug/validate", requireAuth, async (req, res) => {
    try {
      const { ownerType, slug } = req.params;
      const baseUrl = readBaseUrl(req);
      const resolved = await buildResolvedEntryContract(pool, ownerType, slug, baseUrl);

      if (!resolved) {
        return res.status(404).json({ ok: false, code: "NOT_FOUND" });
      }

      const auth = buildCabinetAuthSnapshot(resolved, req.auth, req.identity, baseUrl);
      const validation = buildEntryValidationSnapshot(resolved, auth, baseUrl);

      return res.status(200).json({
        ok: true,
        ...validation,
        authenticated: auth.authenticated,
        authorized: auth.authorized,
        can_open_cabinet: auth.can_open_cabinet,
        deny_code: auth.deny_code
      });
    } catch (err) {
      const code = err?.code || "ENTRY_VALIDATION_FAILED";
      const status = code === "INVALID_OWNER_TYPE" || code === "INVALID_CANONICAL_SLUG" ? 400 : 500;
      return res.status(status).json({ ok: false, code });
    }
  });

  r.get("/entry/:ownerType/:slug/handoff", requireAuth, async (req, res) => {
    try {
      const { ownerType, slug } = req.params;
      const baseUrl = readBaseUrl(req);
      const resolved = await buildResolvedEntryContract(pool, ownerType, slug, baseUrl);

      if (!resolved) {
        return res.status(404).json({ ok: false, code: "NOT_FOUND" });
      }

      const auth = buildCabinetAuthSnapshot(resolved, req.auth, req.identity, baseUrl);
      const validation = buildEntryValidationSnapshot(resolved, auth, baseUrl);
      const handoff = buildEntryHandoffPackage(resolved, auth, validation);

      return res.status(200).json({
        ok: true,
        ...handoff
      });
    } catch (err) {
      const code = err?.code || "ENTRY_HANDOFF_FAILED";
      const status = code === "INVALID_OWNER_TYPE" || code === "INVALID_CANONICAL_SLUG" ? 400 : 500;
      return res.status(status).json({ ok: false, code });
    }
  });

  r.get("/entry/:ownerType/:slug/cabinet", async (req, res) => {
    try {
      const { ownerType, slug } = req.params;
      const baseUrl = readBaseUrl(req);
      const resolved = await buildResolvedEntryContract(pool, ownerType, slug, baseUrl);

      if (!resolved) {
        return res.status(404).json({ ok: false, code: "NOT_FOUND" });
      }

      const auth = buildCabinetAuthSnapshot(resolved, req.auth, req.identity, baseUrl);

      if (!auth.can_open_cabinet) {
        return res.status(403).json({
          ok: false,
          code: auth.deny_code || "CABINET_ACCESS_DENIED",
          auth_required_for_cabinet: true,
          auth_login_url: auth.auth_login_url,
          auth_login_absolute_url: auth.auth_login_absolute_url,
          cabinet_url: auth.cabinet_url,
          cabinet_absolute_url: auth.cabinet_absolute_url
        });
      }

      return res.status(200).json({
        ok: true,
        owner_type: resolved.contract.owner_type,
        owner_id: resolved.contract.owner_id,
        canonical_slug: resolved.contract.canonical_slug,
        cabinet_url: auth.cabinet_url,
        cabinet_absolute_url: auth.cabinet_absolute_url,
        post_auth_redirect_url: auth.post_auth_redirect_url,
        post_auth_redirect_absolute_url: auth.post_auth_redirect_absolute_url,
        authenticated: auth.authenticated,
        authorized: auth.authorized,
        can_open_cabinet: auth.can_open_cabinet,
        auth_required_for_cabinet: true
      });
    } catch (err) {
      const code = err?.code || "ENTRY_CABINET_RESOLVE_FAILED";
      const status = code === "INVALID_OWNER_TYPE" || code === "INVALID_CANONICAL_SLUG" ? 400 : 500;
      return res.status(status).json({ ok: false, code });
    }
  });

  return r;
}