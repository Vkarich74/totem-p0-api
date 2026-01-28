import express from "express";

import paymentsFlowRoutes from "./routes/payments_flow.js";
import paymentsWebhookRoutes from "./routes/payments_webhook.js";
import reconciliationRoutes from "./routes/reconciliation.js";
import payoutPreviewRoutes from "./routes/payout_preview.js";
import payoutExecutionRoutes from "./routes/payout_execution.js";
import probePaymentsRoutes from "./routes/__probe_payments.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, build: "p5.3-probe" });
});

// Payments
app.use("/payments", paymentsFlowRoutes);
app.use("/payments", paymentsWebhookRoutes);

// Reconciliation
app.use("/reconciliation", reconciliationRoutes);

// Payouts
app.use(payoutPreviewRoutes);
app.use(payoutExecutionRoutes);

// PROBE (временно)
app.use(probePaymentsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
