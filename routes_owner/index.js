// routes_owner/index.js
import express from 'express';
import { authOwner } from '../middleware/auth_owner.js';

const router = express.Router();

router.use(authOwner);

// smoke
router.get('/health', (_req, res) => {
  res.json({ ok: true, scope: 'owner' });
});

export default router;
