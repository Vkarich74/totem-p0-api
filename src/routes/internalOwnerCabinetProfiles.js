// Owner cabinet profile transport. Does not create owners, salons or masters.
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  readOwnerCabinetProfile, saveOwnerCabinetProfile,
  ownerCabinetProfileError,
} from "../services/ownerCabinetProfile.service.js";

export function buildOwnerCabinetProfilesRouter(pool, readRateLimit) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("OWNER_CABINET_PROFILE_DB_REQUIRED");
  }
  const router = express.Router();
  router.use(requireAuth);
  router.use((_req,res,next) => {
    res.set("Cache-Control","no-store");
    next();
  });

  router.get("/cabinet-profile/:ownerType/:ownerSlug",
    ...(typeof readRateLimit === "function" ? [readRateLimit] : []),
    async (req,res) => {
      try {
        const answer = await readOwnerCabinetProfile(pool, {
          ownerType: req.params.ownerType,
          ownerSlug: req.params.ownerSlug,
          auth: req.auth,
          identity: req.identity,
        });
        return res.status(answer.status).json(answer.body);
      } catch(error) {
        const answer = ownerCabinetProfileError(error);
        return res.status(answer.status).json(answer.body);
      }
    }
  );
  router.patch("/cabinet-profile/:ownerType/:ownerSlug",
    ...(typeof readRateLimit === "function" ? [readRateLimit] : []),
    async (req,res) => {
      try {
        const answer = await saveOwnerCabinetProfile(pool, {
          ownerType: req.params.ownerType,
          ownerSlug: req.params.ownerSlug,
          auth: req.auth,
          identity: req.identity,
          body: req.body,
        });
        return res.status(answer.status).json(answer.body);
      } catch(error) {
        const answer = ownerCabinetProfileError(error);
        return res.status(answer.status).json(answer.body);
      }
    }
  );
  return router;
}
