import express from "express";
import bodyParser from "body-parser";
import db from "./db.js";

// BOOKINGS
import { registerBookingSlots } from "./routes/booking_slots.js";
import { registerBookingCreate } from "./routes/booking_create.js";
import { registerBookingCancel } from "./routes/booking_cancel.js";

// BLOCKS
import { registerBlocksCreate } from "./routes/blocks_create.js";
import { registerBlocksCancel } from "./routes/blocks_cancel.js";

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.json({ ok: true, service: "TOTEM API", version: "P2.5" });
});

// routes
registerBookingSlots(app, db);
registerBookingCreate(app, db);
registerBookingCancel(app, db);

registerBlocksCreate(app, db);
registerBlocksCancel(app, db);

// 🔥 ГЛОБАЛЬНЫЙ ERROR HANDLER (КАНОН)
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);

  if (typeof err?.code === "number") {
    return res.status(err.code).json({ error: err.msg });
  }

  return res.status(500).json({ error: "internal_error" });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "route_not_found" });
});

app.listen(PORT, () => {
  console.log("=== TOTEM CORE P2.5 ===");
  console.log(`Server running on port ${PORT}`);
});
