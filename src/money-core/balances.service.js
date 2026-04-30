'use strict';

function normalizeOwnerType(ownerType) {
  const value = String(ownerType || '').trim().toLowerCase();
  if (value === 'salon' || value === 'master') {
    return value;
  }
  return null;
}

function toZeroBalanceRow() {
  return {
    provider_hold: '0',
    pending_settlement: '0',
    available: '0',
    locked: '0',
    paid_out: '0',
    refunded: '0',
    reversed: '0',
    fee_reserved: '0',
    commission: '0',
    requires_review: '0',
  };
}

function buildOwnerMoneyCoreSummary(pool, { ownerType, slug }) {
  const normalizedOwnerType = normalizeOwnerType(ownerType);
  const normalizedSlug = String(slug || '').trim();

  if (!normalizedOwnerType) {
    return Promise.resolve({
      ok: false,
      statusCode: 400,
      error: 'OWNER_TYPE_INVALID',
    });
  }

  if (!normalizedSlug) {
    return Promise.resolve({
      ok: false,
      statusCode: 400,
      error: 'OWNER_SLUG_REQUIRED',
    });
  }

  return (async () => {
    const ownerQuery =
      normalizedOwnerType === 'salon'
        ? await pool.query(
            'SELECT id, slug, name, enabled, status FROM public.salons WHERE slug = $1 LIMIT 1',
            [normalizedSlug]
          )
        : await pool.query(
            'SELECT id, slug, name, active FROM public.masters WHERE slug = $1 LIMIT 1',
            [normalizedSlug]
          );

    const ownerRow = ownerQuery.rows[0] || null;

    if (!ownerRow) {
      return {
        ok: false,
        statusCode: 404,
        error: 'OWNER_NOT_FOUND',
      };
    }

    const owner = {
      type: normalizedOwnerType,
      id: ownerRow.id,
      slug: ownerRow.slug,
      name: ownerRow.name,
      status:
        normalizedOwnerType === 'salon'
          ? ownerRow.status
          : ownerRow.active
            ? 'active'
            : 'inactive',
    };

    const legacyWarnings = [];

    if (normalizedOwnerType === 'salon') {
      if (ownerRow.enabled === false) {
        legacyWarnings.push('SALON_DISABLED');
      }
      if (String(ownerRow.status || '').trim().toLowerCase() !== 'active') {
        legacyWarnings.push('SALON_STATUS_NOT_ACTIVE');
      }
    } else if (ownerRow.active === false) {
      legacyWarnings.push('MASTER_INACTIVE');
    }

    const balanceQuery = await pool.query(
      `
      SELECT
        provider_hold,
        pending_settlement,
        available,
        locked,
        paid_out,
        refunded,
        reversed,
        fee_reserved,
        commission,
        requires_review
      FROM public.money_owner_balances
      WHERE owner_type = $1
        AND owner_id = $2
        AND currency = 'KGS'
      LIMIT 1
      `,
      [normalizedOwnerType, ownerRow.id]
    );

    const balanceRow = balanceQuery.rows[0] || toZeroBalanceRow();

    const withdrawsQuery = await pool.query(
      `
      SELECT
        id,
        amount,
        currency,
        status,
        destination_id,
        expected_payout_date,
        created_at,
        updated_at
      FROM public.withdraw_requests
      WHERE owner_type = $1
        AND owner_id = $2
        AND status = ANY($3::text[])
      ORDER BY created_at DESC, id DESC
      `,
      [
        normalizedOwnerType,
        ownerRow.id,
        [
          'created',
          'pending_validation',
          'requires_review',
          'locked',
          'queued_for_payout',
          'bank_processing',
        ],
      ]
    );

    return {
      ok: true,
      owner,
      currency: 'KGS',
      provider_hold: balanceRow.provider_hold,
      pending_settlement: balanceRow.pending_settlement,
      available: balanceRow.available,
      locked: balanceRow.locked,
      paid_out: balanceRow.paid_out,
      refunded: balanceRow.refunded,
      reversed: balanceRow.reversed,
      fee_reserved: balanceRow.fee_reserved,
      commission: balanceRow.commission,
      requires_review: balanceRow.requires_review,
      next_available_at: null,
      active_withdraws: withdrawsQuery.rows,
      legacy_warnings: legacyWarnings,
    };
  })();
}

export { buildOwnerMoneyCoreSummary };
