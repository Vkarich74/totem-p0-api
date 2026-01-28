import { db } from '../db/index.js';

function parseDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Cohorts & churn по бронированиям
 * Ищем first booking клиента → смотрим возвраты
 */
export function getCohorts({ windows = [30, 60, 90] }) {
  const rows = db.prepare('SELECT * FROM bookings').all();

  // группируем бронирования по клиенту
  const byClient = {};
  for (const r of rows) {
    const clientId =
      r.client_id ??
      r.user_id ??
      r.customer_id ??
      null;

    if (!clientId) continue;

    const dt =
      parseDate(r.created_at) ??
      parseDate(r.booked_at) ??
      parseDate(r.date) ??
      null;

    if (!dt) continue;

    if (!byClient[clientId]) byClient[clientId] = [];
    byClient[clientId].push(dt);
  }

  // сортируем даты и строим когорты
  const cohorts = {};

  for (const [clientId, dates] of Object.entries(byClient)) {
    dates.sort((a, b) => a - b);
    const first = dates[0];

    const cohortKey = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!cohorts[cohortKey]) {
      cohorts[cohortKey] = {
        cohort: cohortKey,
        users: 0,
        retained: Object.fromEntries(windows.map(w => [w, 0]))
      };
    }

    cohorts[cohortKey].users += 1;

    for (const w of windows) {
      const returned = dates.some(d => daysBetween(first, d) >= w);
      if (returned) cohorts[cohortKey].retained[w] += 1;
    }
  }

  // финальный формат
  return Object.values(cohorts)
    .sort((a, b) => a.cohort.localeCompare(b.cohort))
    .map(c => ({
      cohort: c.cohort,
      users: c.users,
      retention: Object.fromEntries(
        Object.entries(c.retained).map(([w, v]) => [
          `${w}d`,
          c.users ? Number((v / c.users).toFixed(2)) : 0
        ])
      ),
      churn: Object.fromEntries(
        Object.entries(c.retained).map(([w, v]) => [
          `${w}d`,
          c.users ? Number((1 - v / c.users).toFixed(2)) : 0
        ])
      )
    }));
}
