import express from "express";
import cors from "cors";

import healthRouter from "./routes/health.js";
import publicRouter from "./routes/public.js";
import authRouter from "./routes/auth.js";
import ownerRouter from "./routes/owner.js";
import ownerOnboardingReadonlyRouter from "./routes/owner_onboarding_readonly.js";

const app = express();

app.use(cors());
app.use(express.json());

// base
app.use("/health", healthRouter);

// public
app.use("/public", publicRouter);

// auth
app.use("/auth", authRouter);

// owner
app.use("/owner", ownerRouter);
app.use("/owner/onboarding", ownerOnboardingReadonlyRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log("API listening on port", port);
});
