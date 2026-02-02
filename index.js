import express from "express";
import cors from "cors";
import publicRouter from "./routes/public.js";

const app = express();

app.use(cors());
app.use(express.json());

// PUBLIC ROUTES
app.use("/public", publicRouter);

// HEALTH
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("API listening on port", PORT);
});
