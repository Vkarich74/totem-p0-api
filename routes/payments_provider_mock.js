module.exports = {
  createIntent: () => ({ status: 'authorized' }),
  refund: () => ({ status: 'refunded' }),
  webhook: (req, res) => res.status(200).json({ ok: true })
};