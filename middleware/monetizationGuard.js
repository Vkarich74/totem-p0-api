/**
 * TOTEM — Monetization Guard (B17)
 * Non-breaking monetization invariants
 * Applied to /marketplace/*
 */

function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

function isISODate(x) {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
}

function normalizeCurrency(x) {
  if (!isNonEmptyString(x)) return null;
  return x.trim().toUpperCase();
}

function respond(res, status, payload) {
  return res.status(status).json(payload);
}

function validateMoney(res, field, value) {
  if (!isFiniteNumber(value)) {
    return respond(res, 400, { error: "MONETIZATION_INVALID_NUMBER", field });
  }
  if (value < 0) {
    return respond(res, 400, { error: "MONETIZATION_NEGATIVE_VALUE", field });
  }
  return null;
}

function validatePercent(res, field, value) {
  if (!Number.isInteger(value)) {
    return respond(res, 400, { error: "MONETIZATION_INVALID_PERCENT", field });
  }
  if (value < 0 || value > 100) {
    return respond(res, 400, {
      error: "MONETIZATION_PERCENT_OUT_OF_RANGE",
      field,
      min: 0,
      max: 100,
    });
  }
  return null;
}

export function monetizationGuard(req, res, next) {
  // Do not block read-only traffic
  if (req.method === "GET" || req.method === "HEAD") {
    return next();
  }

  const body = req.body || {};
  const path = req.path || "";

  if ("price" in body) {
    const err = validateMoney(res, "price", body.price);
    if (err) return err;
  }

  if ("amount" in body) {
    const err = validateMoney(res, "amount", body.amount);
    if (err) return err;
  }

  if ("commission_pct" in body) {
    const err = validatePercent(res, "commission_pct", body.commission_pct);
    if (err) return err;
  }

  if ("currency" in body) {
    const c = normalizeCurrency(body.currency);
    if (c && !/^[A-Z]{3}$/.test(c)) {
      return respond(res, 400, {
        error: "MONETIZATION_INVALID_CURRENCY",
        field: "currency",
      });
    }
    body.currency = c;
  }

  // Booking-related logic
  if (path.includes("/booking")) {
    if ("price" in body && "commission_pct" in body) {
      const price = body.price;
      const pct = body.commission_pct;
      if (isFiniteNumber(price) && Number.isInteger(pct)) {
        const commissionAmount = Math.round((price * pct)) / 100;
        if (commissionAmount > price) {
          return respond(res, 400, {
            error: "MONETIZATION_COMMISSION_EXCEEDS_PRICE",
            price,
            commission_pct: pct,
            commission_amount: commissionAmount,
          });
        }
      }
    }
  }

  // Payment logic
  if (path.includes("/payment")) {
    if ("provider" in body && !isNonEmptyString(body.provider)) {
      return respond(res, 400, { error: "MONETIZATION_INVALID_PROVIDER" });
    }
  }

  // Payout logic
  if (path.includes("/payout")) {
    if ("from" in body && !isISODate(body.from)) {
      return respond(res, 400, { error: "MONETIZATION_INVALID_DATE", field: "from" });
    }
    if ("to" in body && !isISODate(body.to)) {
      return respond(res, 400, { error: "MONETIZATION_INVALID_DATE", field: "to" });
    }
    if ("from" in body && "to" in body && body.from > body.to) {
      return respond(res, 400, { error: "MONETIZATION_INVALID_PERIOD" });
    }
  }

  return next();
}

export default monetizationGuard;
