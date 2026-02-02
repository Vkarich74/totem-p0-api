import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import availability from "./availability.js";
import bookings from "./bookings.js";
import bookingCreate from "./bookingCreate.js";
import bookingResult from "./bookingResult.js";
import bookingCancel from "./bookingCancel.js";
import salons from "./salons.js";
import masters from "./masters.js";
import services from "./services.js";
import sdk from "./sdk.js";
import auth from "./auth.js";
import book from "./book.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// health
router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// 🔴 WIDGET — MUST BE FIRST (no middleware, no guards)
router.get("/widget.js", (req, res) => {
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "../public/widget.js"));
});

// core public APIs
router.use("/availability", availability);

// 🔑 BOOKINGS FLOW (ORDER MATTERS)
router.use("/bookings", bookingCreate);   // POST /
router.use("/bookings", bookingResult);   // GET /:id/result
router.use("/bookings", bookingCancel);   // POST /:id/cancel
router.use("/bookings", bookings);        // legacy / list (if any)

router.use("/salons", salons);
router.use("/masters", masters);
router.use("/services", services);
router.use("/sdk.js", sdk);
router.use("/auth", auth);
router.use("/book", book);

export default router;
