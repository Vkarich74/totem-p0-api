/**
 * Anti-bypass middleware
 *
 * Purpose:
 *  - Guarantee marketplace bookings cannot bypass commission logic
 *  - Source of truth is REQUEST CHANNEL, not DB fields
 *
 * This middleware:
 *  - Marks request as marketplace-originated
 *  - Blocks attempts to fake or override source
 *
 * No DB access.
 * No schema changes.
 */

function antiBypassMarketplace(req, res, next) {
  // Hard rule:
  // Public booking endpoint = marketplace
  const isPublicMarketplace =
    req.originalUrl &&
    req.originalUrl.startsWith("/public/booking");

  if (!isPublicMarketplace) {
    // Not a marketplace request → do nothing
    return next();
  }

  // Block any attempt to override or inject source manually
  if (req.body && typeof req.body.source !== "undefined") {
    return res.status(400).json({
      ok: false,
      error: "SOURCE_OVERRIDE_FORBIDDEN"
    });
  }

  // Attach immutable marketplace flag to request context
  req.marketplace = {
    enabled: true,
    commission_required: true
  };

  return next();
}

module.exports = antiBypassMarketplace;
