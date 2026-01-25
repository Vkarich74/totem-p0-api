import express from "express";
import { createDb } from "./lib/db.js";
import { registerMarketplaceSalonRoutes } from "./routes_marketplace/salon.js";
import { registerMarketplaceBookingCreate } from "./routes_marketplace/marketplace_booking_create.js";

const app = express();
app.use(express.json());

const db = createDb({ filename: "data.db" });

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

registerMarketplaceSalonRoutes(app, db);
registerMarketplaceBookingCreate(app, db);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TOTEM P0 API listening on http://localhost:${PORT}`);
});
