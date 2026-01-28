// index.js
import express from 'express';

// Routes
import payoutExecutionRoutes from './routes/payout_execution.js';

// App
const app = express();

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Routes
// payout_execution.js регистрирует POST /payouts/execute
app.use(payoutExecutionRoutes);

// Fallback
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
