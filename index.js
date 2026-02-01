import express from "express";
import cors from "cors";

import healthRouter from "./routes/health.js";
import publicRouter from "./routes/public.js";
import authRouter from "./routes/auth.js";
import ownerRouter from "./routes/owner.js";
import ownerOnboardingReadonlyRouter from "./routes/owner_onboarding_readonly.js";
import ownerOnboardingWriteRouter from "./routes/owner_onboarding_write.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/public", publicRouter);
app.use("/auth", authRouter);
app.use("/owner", ownerRouter);
app.use("/owner/onboarding", ownerOnboardingReadonlyRouter);
app.use("/owner/onboarding", ownerOnboardingWriteRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log("API listening on port", port);
});
