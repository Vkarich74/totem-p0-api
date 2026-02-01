import express from "express";

import availability from "./availability.js";
import bookings from "./bookings.js";
import bookingResult from "./bookingResult.js";
import bookingCancel from "./bookingCancel.js";
import salons from "./salons.js";
import masters from "./masters.js";
import services from "./services.js";
import sdk from "./sdk.js";
import auth from "./auth.js";
import book from "./book.js";

import registerWidgetRoute from "./widget.js";

const router = express.Router();

// health
router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// widget (public js)
registerWidgetRoute(router);

// core public APIs
router.use("/availability", availability);
router.use("/bookings", bookings);
router.use("/bookings", bookingResult);
router.use("/bookings", bookingCancel);
router.use("/salons", salons);
router.use("/masters", masters);
router.use("/services", services);
router.use("/sdk.js", sdk);
router.use("/auth", auth);
router.use("/book", book);

export default router;
