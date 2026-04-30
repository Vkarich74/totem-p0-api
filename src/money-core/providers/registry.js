'use strict';

const MONEY_CORE_PROVIDER_REGISTRY = Object.freeze({
  xpay: Object.freeze({
    code: 'xpay',
    name: 'XPay',
    provider_type: 'payment_intake',
    capabilities: Object.freeze({
      payment_intake: true,
      payment_status: true,
      payment_webhook: true,
      settlement_api: false,
      settlement_report: false,
      settlement_manual: true,
      payout_api: false,
      payout_registry: false,
      payout_manual: false,
      refund_api: false,
      manual_only: false,
    }),
  }),
  manual: Object.freeze({
    code: 'manual',
    name: 'Manual',
    provider_type: 'manual',
    capabilities: Object.freeze({
      payment_intake: false,
      payment_status: false,
      payment_webhook: false,
      settlement_api: false,
      settlement_report: false,
      settlement_manual: true,
      payout_api: false,
      payout_registry: false,
      payout_manual: true,
      refund_api: false,
      manual_only: true,
    }),
  }),
  bank: Object.freeze({
    code: 'bank',
    name: 'Bank',
    provider_type: 'settlement',
    capabilities: Object.freeze({
      payment_intake: false,
      payment_status: false,
      payment_webhook: false,
      settlement_api: false,
      settlement_report: false,
      settlement_manual: true,
      payout_api: false,
      payout_registry: true,
      payout_manual: true,
      refund_api: false,
      manual_only: false,
    }),
  }),
});

function normalizeProviderCode(value) {
  return String(value || '').trim().toLowerCase();
}

function getProviderDefinition(providerCode) {
  const normalized = normalizeProviderCode(providerCode);
  return MONEY_CORE_PROVIDER_REGISTRY[normalized] || null;
}

function listProviderDefinitions() {
  return Object.values(MONEY_CORE_PROVIDER_REGISTRY);
}

function getProviderCapabilities(providerCode) {
  const provider = getProviderDefinition(providerCode);
  return provider ? provider.capabilities : null;
}

function isProviderSupported(providerCode) {
  return Boolean(getProviderDefinition(providerCode));
}

export {
  MONEY_CORE_PROVIDER_REGISTRY,
  getProviderDefinition,
  listProviderDefinitions,
  getProviderCapabilities,
  isProviderSupported,
};
