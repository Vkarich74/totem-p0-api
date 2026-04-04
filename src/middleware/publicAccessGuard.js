// src/middleware/publicAccessGuard.js

function getBillingStateFromTenant(tenant) {
  const billingAccess = tenant?.billing_access || null;
  const rawState =
    billingAccess?.subscription_status ||
    billingAccess?.access_state ||
    billingAccess?.status ||
    tenant?.billing_state ||
    "none";

  switch (String(rawState).trim().toLowerCase()) {
    case "active":
      return "active";
    case "grace":
      return "grace";
    case "overdue":
      return "overdue";
    case "blocked":
      return "blocked";
    default:
      return "none";
  }
}

function getLifecycleStateFromTenant(tenant) {
  const rawState =
    tenant?.lifecycle_state ||
    tenant?.onboarding?.state ||
    tenant?.onboarding_state ||
    "draft";

  switch (String(rawState).trim().toLowerCase()) {
    case "active":
    case "live":
    case "launched":
    case "activated":
    case "provisioned":
    case "grace":
      return "active";
    case "pending_payment":
    case "payment_pending":
    case "awaiting_payment":
      return "pending_payment";
    case "blocked":
    case "disabled":
      return "blocked";
    case "expired":
    case "archived":
      return "expired";
    case "onboarding":
    case "pending":
    case "invited":
      return "onboarding";
    case "draft":
    default:
      return "draft";
  }
}

function buildAccessSnapshot(tenant) {
  const lifecycleState = getLifecycleStateFromTenant(tenant);
  const billingState = getBillingStateFromTenant(tenant);

  const lifecycleAllowsPublic = lifecycleState === "active";
  const billingAllowsPublic = billingState === "active" || billingState === "grace";

  let accessState = "inactive";
  let denyReason = null;

  if (!lifecycleAllowsPublic) {
    accessState = `lifecycle_${lifecycleState}`;
    denyReason = "lifecycle_denied";
  } else if (!billingAllowsPublic) {
    accessState = billingState === "none" ? "billing_missing" : `billing_${billingState}`;
    denyReason = "billing_denied";
  } else {
    accessState = "active";
  }

  const publicVisible = lifecycleAllowsPublic && billingAllowsPublic;
  const canBook = lifecycleAllowsPublic && billingAllowsPublic;

  return {
    exists: true,
    owner_type: tenant?.owner_type || "salon",
    owner_id: tenant?.owner_id || tenant?.salon_id || tenant?.master_id || null,
    slug: tenant?.slug || null,
    lifecycle_state: lifecycleState,
    billing_state: billingState,
    access_state: accessState,
    deny_reason: denyReason,
    lifecycle_first: true,
    public_visible: publicVisible,
    can_book: canBook,
    can_view_profile: publicVisible,
    can_view_metrics: publicVisible,
    can_view_bookings: publicVisible,
    can_view_availability: canBook
  };
}

function isActionAllowed(snapshot, action) {
  switch (action) {
    case "page":
      return snapshot.public_visible && snapshot.can_view_profile;
    case "metrics":
      return snapshot.public_visible && snapshot.can_view_metrics;
    case "booking_read":
      return snapshot.public_visible && snapshot.can_view_bookings;
    case "availability":
      return snapshot.can_view_availability;
    case "booking_create":
      return snapshot.can_book;
    default:
      return false;
  }
}

function sendDenied(res, action) {
  if (
    action === "page" ||
    action === "metrics" ||
    action === "booking_read"
  ) {
    return res.status(404).json({
      ok: false,
      code: "NOT_FOUND"
    });
  }

  return res.status(403).json({
    ok: false,
    code: "PUBLIC_BOOKING_DISABLED"
  });
}

export function buildPublicAccessGuard(action) {
  return async function publicAccessGuard(req, res, next) {
    try {
      if (!req.tenant) {
        return res.status(500).json({
          ok: false,
          code: "PUBLIC_ACCESS_GUARD_ERROR"
        });
      }

      const snapshot = buildAccessSnapshot(req.tenant);

      req.publicAccess = snapshot;
      req.publicAccessAction = action;

      if (!isActionAllowed(snapshot, action)) {
        return sendDenied(res, action);
      }

      return next();
    } catch (err) {
      console.error("PUBLIC_ACCESS_GUARD_ERROR", err.message);

      return res.status(500).json({
        ok: false,
        code: "PUBLIC_ACCESS_GUARD_ERROR"
      });
    }
  };
}

export default buildPublicAccessGuard;
