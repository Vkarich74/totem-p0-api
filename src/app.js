import express from "express";
import cors from "cors";
import morgan from "morgan";

import calendarRoutes from "./routes/calendar.js";
import { authResolveHandler } from "./routes/auth.resolve.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * AUTH RESOLVE STUB
 * Canonical role resolution endpoint
 */
app.get("/auth/resolve", authResolveHandler);

/**
 * Calendar routes
 */
app.use("/calendar", calendarRoutes);

/**
 * 404
 */
app.use((req, res) => res.status(404).json({ error: "NOT_FOUND" }));

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "INTERNAL_ERROR" });
});

export default app;
