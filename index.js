// index.js
import express from 'express';
import healthRoutes from './routes/health.js';
import payoutExecutionRoutes from './routes/payout_execution.js';
import payoutPreviewRoutes from './routes/payout_preview.js';
import settlementBatchRoutes from './routes/settlement_batches.js';
import reportRoutes from './routes/reports.js';
import ownerActionRoutes from './routes/owner_actions.js';

const app = express();

app.use(express.json());

app.use(healthRoutes);
app.use(payoutPreviewRoutes);
app.use(payoutExecutionRoutes);
app.use(settlementBatchRoutes);
app.use(reportRoutes);
app.use(ownerActionRoutes);

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log('Server listening on port', port);
});
