import { db } from '../db/index.js';

function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }

function rowsToCSV(rows){
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => esc(r[h])).join(','))
  ];
  return lines.join('\n');
}

export function exportCommissions({ format='json' }){
  const rows = db.prepare('SELECT * FROM marketplace_commissions').all();
  return format==='csv' ? rowsToCSV(rows) : rows;
}

export function exportBookings({ format='json' }){
  const rows = db.prepare('SELECT * FROM bookings').all();
  return format==='csv' ? rowsToCSV(rows) : rows;
}

export function exportPricingSnapshot(){
  // минимальный снапшот для BI
  let commissions = 0;
  const rows = db.prepare('SELECT * FROM marketplace_commissions').all();
  for (const r of rows) commissions += num(r.amount);
  return { commissions };
}
