// index.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import publicRouter from "./routes/public.js";
import systemRouter from "./routes/system.js";
import systemPayoutsRouter from "./routes/system_payouts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// STATIC: widget
app.use(
  "/public/static",
  express.static(path.join(__dirname, "widget"))
);

// SYSTEM
app.use("/system", systemRouter);
app.use("/system/payouts", systemPayoutsRouter);

// PUBLIC
app.use("/public", publicRouter);

// HEALTH
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("API listening on port", PORT);
});
