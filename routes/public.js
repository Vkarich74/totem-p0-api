// routes/public.js
import express from "express";
import publicRoutes from "../routes_public/index.js";

const router = express.Router();

/**
 * =========================
 * PUBLIC ROUTES (CANON)
 * =========================
 *
 * All public endpoints are wired inside routes_public/index.js
 */

router.use("/", publicRoutes);

export default router;
