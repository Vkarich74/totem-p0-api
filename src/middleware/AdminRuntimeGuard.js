export default function AdminRuntimeGuard(req, res, next) {
  return res.status(501).json({
    ok: false,
    error: "ADMIN_GUARD_NOT_IMPLEMENTED",
  });
}
