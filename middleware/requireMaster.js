export default function requireMaster() {
  return function (req, res, next) {
    const actor = req.user;

    if (!actor || actor.type !== 'MASTER') {
      return res.status(403).json({ error: 'MASTER_ONLY' });
    }

    const targetMasterId =
      req.body.master_id || req.params.master_id;

    if (!targetMasterId) {
      return res.status(400).json({ error: 'MASTER_ID_REQUIRED' });
    }

    if (String(actor.id) !== String(targetMasterId)) {
      return res.status(403).json({ error: 'MASTER_SELF_ONLY' });
    }

    next();
  };
}
