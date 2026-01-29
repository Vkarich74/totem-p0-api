// index.js
import express from 'express';
import cors from 'cors';

import healthRoutes from './routes/health.js';
import payoutPreviewRoutes from './routes/payout_preview.js';
import payoutExecutionRoutes from './routes/payout_execution.js';
import settlementBatchRoutes from './routes/settlement_batches.js';
import reportsRoutes from './routes/reports.js';
import ownerDashboardRoutes from './routes/owner_dashboard.js';

const app = express();

app.use(cors());
app.use(express.json());

// base
app.use(healthRoutes);

// payouts
app.use(payoutPreviewRoutes);
app.use(payoutExecutionRoutes);

// settlements
app.use(settlementBatchRoutes);

// reports
app.use(reportsRoutes);

// owner dashboard
app.use(ownerDashboardRoutes);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
