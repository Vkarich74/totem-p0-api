import express from "express";
import { requireRole } from "../../middleware/requireRole.js";
import { TEMPLATE_VERSION_V1 } from "../../contracts/templates/templateConstants.js";
import { getOrCreateTemplateDocument, getPreviewSource, getPublishedSource, getTemplatePublishLog, saveTemplateDraft } from "../../services/templates/templateDocumentService.js";
import { publishTemplateDraft } from "../../services/templates/templatePublishService.js";
import { createAssetForOwner, deleteAssetForOwner, listAssetsForOwner, patchAssetForOwner, activateSingletonAssetForOwner } from "../../services/templates/templateAssetService.js";
import { validateTemplateDraft } from "../../services/templates/templateValidationService.js";

function readVersion(req){
  return String(req.query?.version || req.body?.template_version || TEMPLATE_VERSION_V1).trim() || TEMPLATE_VERSION_V1;
}

function normalizeOwnerParams(req){
  return {
    ownerType: String(req.params.owner_type || "").trim(),
    ownerSlug: String(req.params.owner_slug || "").trim(),
  };
}

function readEditorIdentity(req){
  const role = req.auth?.role || null;
  const userId = req.auth?.user_id || null;
  return role && userId ? `${role}:${userId}` : role || null;
}

function sendError(res, err){
  const status = Number(err?.status) || 500;
  return res.status(status).json({
    ok: false,
    error: String(err?.code || err?.message || "TEMPLATE_INTERNAL_ERROR"),
    message: err?.message || "Template request failed",
    ...(err?.validation ? { validation: err.validation } : {}),
  });
}

export default function buildTemplatesRouter(pool, internalReadRateLimit){
  const r = express.Router();
  const writeRoles = ["system", "owner", "salon_admin", "master_admin", "master"];

  r.get("/templates-public/:owner_type/:owner_slug/published", internalReadRateLimit, async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const templateVersion = readVersion(req);
      const published = await getPublishedSource(db, ownerType, ownerSlug, templateVersion);
      return res.json({
        ok: true,
        owner_type: ownerType,
        owner_slug: ownerSlug,
        template_version: templateVersion,
        published_exists: !!published.document?.status?.published_exists,
        payload: published.payload,
        meta: published.document?.meta || {},
      });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.get("/templates/:owner_type/:owner_slug", requireRole(writeRoles), internalReadRateLimit, async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const templateVersion = readVersion(req);
      const document = await getOrCreateTemplateDocument(db, ownerType, ownerSlug, templateVersion);
      return res.json({ ok: true, document });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.put("/templates/:owner_type/:owner_slug/draft", requireRole(writeRoles), async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const templateVersion = readVersion(req);
      const document = await saveTemplateDraft(db, ownerType, ownerSlug, templateVersion, req.body?.draft || {}, readEditorIdentity(req));
      return res.json({ ok: true, document });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.post("/templates/:owner_type/:owner_slug/validate", requireRole(writeRoles), async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const templateVersion = readVersion(req);
      const document = await getOrCreateTemplateDocument(db, ownerType, ownerSlug, templateVersion);
      const validation = validateTemplateDraft(ownerType, document.draft || {});
      return res.json({ ok: true, validation });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.get("/templates/:owner_type/:owner_slug/preview", requireRole(writeRoles), internalReadRateLimit, async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const templateVersion = readVersion(req);
      const preview = await getPreviewSource(db, ownerType, ownerSlug, templateVersion);
      return res.json({
        ok: true,
        owner_type: ownerType,
        owner_slug: ownerSlug,
        template_version: templateVersion,
        is_ready_for_preview: preview.validation.is_ready_for_preview,
        validation: preview.validation,
        payload: preview.payload,
      });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.post("/templates/:owner_type/:owner_slug/publish", requireRole(writeRoles), async (req, res) => {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const templateVersion = readVersion(req);
      const document = await publishTemplateDraft(db, ownerType, ownerSlug, templateVersion, req.body?.published_by || readEditorIdentity(req));
      await db.query("COMMIT");
      return res.json({ ok: true, published: true, document });
    } catch (err) {
      try { await db.query("ROLLBACK"); } catch (rollbackError) {}
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.get("/templates/:owner_type/:owner_slug/published", requireRole(writeRoles), internalReadRateLimit, async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const templateVersion = readVersion(req);
      const published = await getPublishedSource(db, ownerType, ownerSlug, templateVersion);
      return res.json({
        ok: true,
        owner_type: ownerType,
        owner_slug: ownerSlug,
        template_version: templateVersion,
        published_exists: !!published.document?.status?.published_exists,
        payload: published.payload,
        meta: published.document?.meta || {},
      });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.get("/templates/:owner_type/:owner_slug/publish-log", requireRole(writeRoles), internalReadRateLimit, async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const templateVersion = readVersion(req);
      const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 20)));
      const items = await getTemplatePublishLog(db, ownerType, ownerSlug, templateVersion, limit);
      return res.json({ ok: true, items });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.get("/templates/:owner_type/:owner_slug/assets", requireRole(writeRoles), internalReadRateLimit, async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const items = await listAssetsForOwner(db, ownerType, ownerSlug, {
        slot_type: req.query?.slot_type ? String(req.query.slot_type).trim() : null,
        active_only: String(req.query?.active_only || "false") === "true",
      });
      return res.json({ ok: true, items });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.post("/templates/:owner_type/:owner_slug/assets", requireRole(writeRoles), async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const asset = await createAssetForOwner(db, ownerType, ownerSlug, req.body || {});
      return res.json({ ok: true, asset });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.patch("/templates/:owner_type/:owner_slug/assets/:asset_id", requireRole(writeRoles), async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const asset = await patchAssetForOwner(db, ownerType, ownerSlug, req.params.asset_id, req.body || {});
      return res.json({ ok: true, asset });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.post("/templates/:owner_type/:owner_slug/assets/:asset_id/activate", requireRole(writeRoles), async (req, res) => {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const asset = await activateSingletonAssetForOwner(db, ownerType, ownerSlug, req.params.asset_id);
      await db.query("COMMIT");
      return res.json({ ok: true, asset });
    } catch (err) {
      try { await db.query("ROLLBACK"); } catch (rollbackError) {}
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  r.delete("/templates/:owner_type/:owner_slug/assets/:asset_id", requireRole(writeRoles), async (req, res) => {
    const db = await pool.connect();
    try {
      const { ownerType, ownerSlug } = normalizeOwnerParams(req);
      const asset = await deleteAssetForOwner(db, ownerType, ownerSlug, req.params.asset_id);
      return res.json({ ok: true, deleted: true, asset });
    } catch (err) {
      return sendError(res, err);
    } finally {
      db.release();
    }
  });

  return r;
}
