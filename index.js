import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import publicRouter from "./routes/public.js";

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

// PUBLIC API
app.use("/public", publicRouter);

// HEALTH
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("API listening on port", PORT);
});
