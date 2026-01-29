// middleware/owner_only.js
export default function ownerOnly(req, res, next) {
  const actorType = req.headers['x-actor-type'];

  if (actorType !== 'owner') {
    return res.status(403).json({
      error: 'forbidden',
      detail: 'owner_only',
    });
  }

  next();
}
