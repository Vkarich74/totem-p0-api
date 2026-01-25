import express from "express";
import bodyParser from "body-parser";
import db from "./db.js";

// CORE
import { registerBookingSlots } from "./routes/booking_slots.js";
import { registerBookingCreate } from "./routes/booking_create.js";
import { registerBookingCancel } from "./routes/booking_cancel.js";
import { registerBlocksCreate } from "./routes/blocks_create.js";
import { registerBlocksCancel } from "./routes/blocks_cancel.js";

// P3
import { registerOwnerInfo } from "./routes_marketplace/owner_info.js";
import { registerMarketplaceBookingCreate } from "./routes_marketplace/marketplace_booking_create.js";

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.json({ ok: true, service: "TOTEM API", version: "P3" });
});

// CORE
registerBookingSlots(app, db);
registerBookingCreate(app, db);
registerBookingCancel(app, db);
registerBlocksCreate(app, db);
registerBlocksCancel(app, db);

// MARKETPLACE
registerOwnerInfo(app, db);
registerMarketplaceBookingCreate(app, db);

// ERRORS
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  if (typeof err?.code === "number") {
    return res.status(err.code).json({ error: err.msg });
  }
  return res.status(500).json({ error: "internal_error" });
});

app.use((req, res) => {
  res.status(404).json({ error: "route_not_found" });
});

app.listen(PORT, () => {
  console.log("=== TOTEM API P3 ===");
  console.log(`Server running on port ${PORT}`);
});
