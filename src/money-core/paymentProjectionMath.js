'use strict';

function roundProjectionMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function normalizeProjectionPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function computePaymentShareBreakdown(input = {}) {
  const payment = input.payment || input || {};
  const booking = input.booking || null;
  const contract = input.contract || null;

  const rawGrossAmount = roundProjectionMoney(payment.gross_amount ?? payment.amount ?? 0);
  const paymentStatus = String((payment.payment_status ?? payment.status) || '').trim().toLowerCase();
  const bookingStatus = String((payment.booking_status ?? booking?.status) || '').trim().toLowerCase();
  const isCancelledBooking =
    bookingStatus === 'cancelled' ||
    bookingStatus === 'canceled' ||
    bookingStatus === 'rejected';
  const isLiveMoney = paymentStatus === 'confirmed' && !isCancelledBooking;
  const grossAmount = isLiveMoney ? rawGrossAmount : 0;

  const contractTerms =
    contract?.terms_json && typeof contract.terms_json === 'object'
      ? { ...contract.terms_json }
      : {};

  const contractModel = String(contractTerms.model || '').trim().toLowerCase() || null;
  const currency = String(contractTerms.currency || 'KGS').trim().toUpperCase() || 'KGS';

  const collectorOwnerType = String(payment.collector_owner_type || '').trim() || null;
  const collectorOwnerId = payment.collector_owner_id == null ? null : Number(payment.collector_owner_id);

  let collectorLabel = null;
  if (collectorOwnerType === 'salon') {
    collectorLabel = payment.salon_name || payment.salon_slug || null;
  } else if (collectorOwnerType === 'master') {
    collectorLabel = payment.master_name || payment.master_slug || null;
  }

  let masterPercent = null;
  let salonPercent = null;
  let platformPercent = null;
  let masterShare = null;
  let salonShare = null;
  let platformShare = null;
  let shareResidual = null;
  let calculationStatus = 'blocked_missing_contract';
  let settlementStatus = 'blocked_missing_contract';
  let custodyHolderType = null;
  let custodyHolderId = null;
  let transferFromType = null;
  let transferFromId = null;
  let transferToType = null;
  let transferToId = null;
  let transferAmount = null;
  let includedInOpenBalance = false;
  let includedInHistory = isLiveMoney;
  let carryForward = false;
  let openTransferAmount = 0;
  let settledTransferAmount = 0;
  let remainingTransferAmount = 0;

  if (contract) {
    masterPercent = normalizeProjectionPercent(contractTerms.master_percent);
    salonPercent = normalizeProjectionPercent(contractTerms.salon_percent);
    platformPercent = normalizeProjectionPercent(contractTerms.platform_percent);

    masterShare = roundProjectionMoney((grossAmount * masterPercent) / 100);
    salonShare = roundProjectionMoney((grossAmount * salonPercent) / 100);
    platformShare = roundProjectionMoney((grossAmount * platformPercent) / 100);
    shareResidual = roundProjectionMoney(grossAmount - masterShare - salonShare - platformShare);

    if (collectorOwnerType === 'salon') {
      custodyHolderType = 'salon';
      custodyHolderId = Number(payment.salon_id) || null;
      transferFromType = 'salon';
      transferFromId = Number(payment.salon_id) || null;
      transferToType = 'master';
      transferToId = Number(payment.master_id) || null;
      transferAmount = masterShare;
      calculationStatus = 'shares_calculated_transfer_ready';
      settlementStatus = transferAmount > 0 ? 'transfer_required' : 'no_transfer_required';
      includedInOpenBalance = transferAmount > 0;
      carryForward = transferAmount > 0;
      openTransferAmount = transferAmount > 0 ? transferAmount : 0;
      remainingTransferAmount = transferAmount > 0 ? transferAmount : 0;
    } else if (collectorOwnerType === 'master') {
      custodyHolderType = 'master';
      custodyHolderId = Number(payment.master_id) || null;
      transferFromType = 'master';
      transferFromId = Number(payment.master_id) || null;
      transferToType = 'salon';
      transferToId = Number(payment.salon_id) || null;
      transferAmount = salonShare;
      calculationStatus = 'shares_calculated_transfer_ready';
      settlementStatus = transferAmount > 0 ? 'transfer_required' : 'no_transfer_required';
      includedInOpenBalance = transferAmount > 0;
      carryForward = transferAmount > 0;
      openTransferAmount = transferAmount > 0 ? transferAmount : 0;
      remainingTransferAmount = transferAmount > 0 ? transferAmount : 0;
    } else {
      calculationStatus = 'shares_calculated_transfer_blocked_missing_collector';
      settlementStatus = 'blocked_missing_collector';
      includedInOpenBalance = false;
      carryForward = false;
    }

    if (transferAmount === 0) {
      calculationStatus = 'no_transfer_required';
      settlementStatus = 'no_transfer_required';
      includedInOpenBalance = false;
      carryForward = false;
      openTransferAmount = 0;
      remainingTransferAmount = 0;
    }
  }

  if (!isLiveMoney) {
    masterShare = 0;
    salonShare = 0;
    platformShare = 0;
    shareResidual = 0;
    transferAmount = 0;
    calculationStatus = 'not_financial_cancelled_or_rejected';
    settlementStatus = 'not_financial';
    includedInOpenBalance = false;
    includedInHistory = false;
    carryForward = false;
    openTransferAmount = 0;
    settledTransferAmount = 0;
    remainingTransferAmount = 0;
  }

  return {
    raw_gross_amount: rawGrossAmount,
    gross_amount: grossAmount,
    live_money: isLiveMoney,
    currency,
    payment_status: payment.payment_status ?? payment.status ?? null,
    booking_status: payment.booking_status ?? booking?.status ?? null,
    collector_owner_type: collectorOwnerType,
    collector_owner_id: collectorOwnerId,
    collector_label: collectorLabel,
    master_percent: masterPercent,
    salon_percent: salonPercent,
    platform_percent: platformPercent,
    master_share: masterShare,
    salon_share: salonShare,
    platform_share: platformShare,
    share_residual: shareResidual,
    custody_holder_type: custodyHolderType,
    custody_holder_id: custodyHolderId,
    transfer_from_type: transferFromType,
    transfer_from_id: transferFromId,
    transfer_to_type: transferToType,
    transfer_to_id: transferToId,
    transfer_amount: transferAmount,
    calculation_status: calculationStatus,
    settlement_status: settlementStatus,
    included_in_open_balance: includedInOpenBalance,
    included_in_history: includedInHistory,
    carry_forward: carryForward,
    open_transfer_amount: openTransferAmount,
    settled_transfer_amount: settledTransferAmount,
    remaining_transfer_amount: remainingTransferAmount,
    contract_model: contractModel,
  };
}

export {
  computePaymentShareBreakdown,
  roundProjectionMoney,
  normalizeProjectionPercent,
};
