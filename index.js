import express from "express";
import cors from "cors";

import healthRoute from "./routes_system/health.js";
import bookingsPublic from "./routes_public/bookings.js";
import salonsPublic from "./routes_public/salons.js";
import bookRoute from "./routes_public/book.js";

const app = express();

app.use(cors());
app.use(express.json());

// system
app.use(healthRoute);

// public API
app.use("/public/bookings", bookingsPublic);
app.use("/public/salons", salonsPublic);

// public UI
app.use(bookRoute);

// fallback
app.use((req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("BOOT OK on port", PORT);
});
