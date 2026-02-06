import express from 'express';
import {
  exportCommissions,
  exportBookings,
  exportPricingSnapshot
} from '../services_analytics/export.js';

const router = express.Router();

/**
 * GET /analytics/export/commissions?format=csv|json
 */
router.get('/export/commissions', (req,res)=>{
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const data = exportCommissions({ format });
  if (format==='csv') {
    res.setHeader('Content-Type','text/csv');
    return res.send(data);
  }
  res.json({ ok:true, data });
});

/**
 * GET /analytics/export/bookings?format=csv|json
 */
router.get('/export/bookings', (req,res)=>{
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const data = exportBookings({ format });
  if (format==='csv') {
    res.setHeader('Content-Type','text/csv');
    return res.send(data);
  }
  res.json({ ok:true, data });
});

/**
 * GET /analytics/export/pricing
 */
router.get('/export/pricing', (req,res)=>{
  const data = exportPricingSnapshot();
  res.json({ ok:true, data });
});

export default router;
