import express from "express";

import paymentsFlowRoutes from "./routes/payments_flow.js";
import paymentsWebhookRoutes from "./routes/payments_webhook.js";
import reconciliationRoutes from "./routes/reconciliation.js";
import payoutPreviewRoutes from "./routes/payout_preview.js";
import payoutExecutionRoutes from "./routes/payout_execution.js";

const app = express();

app.use(express.json());

// Health (build marker)
app.get("/health", (req, res) => {
  res.json({ ok: true, build: "p5.2-flowfix-1" });
});

// Payments
app.use("/payments", paymentsFlowRoutes);
app.use("/payments", paymentsWebhookRoutes);

// Reconciliation
app.use("/reconciliation", reconciliationRoutes);

// Payouts
app.use("/payouts", payoutPreviewRoutes);
app.use("/payouts", payoutExecutionRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
