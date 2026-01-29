import express from 'express';
import cors from 'cors';

import healthRoutes from './routes/health.js';
import payoutExecutionRoutes from './routes/payout_execution.js';
import settlementBatchRoutes from './routes/settlement_batches.js';

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// routes
app.use(healthRoutes);
app.use(payoutExecutionRoutes);
app.use(settlementBatchRoutes);

// fallback
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
