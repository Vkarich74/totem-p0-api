import express from "express";
import cors from "cors";

import bookingCreate from "./routes_public/bookingCreate.js";
import bookingStatusRead from "./routes_public/bookingStatusRead.js";
import catalog from "./routes_public/catalog.js";

const app = express();

app.use(cors());
app.use(express.json());

// health
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// public routes
app.use("/public", catalog);
app.use("/public", bookingCreate);
app.use("/public", bookingStatusRead);

export default app;
