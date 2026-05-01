const MONEY_CORE_DEFAULT_FLAGS = Object.freeze({
  MONEY_CORE_ENABLED: false,
  MONEY_CORE_READ_ONLY: true,
  MONEY_CORE_WRITE_ENABLED: false,
  PROVIDER_EVENTS_ENABLED: true,
  PROVIDER_SETTLEMENTS_ENABLED: false,
  WITHDRAW_REQUESTS_V2_ENABLED: false,
  PAYOUT_EXECUTIONS_ENABLED: false,
  MONEY_CORE_LEDGER_MOVEMENTS_ENABLED: false,
  RECONCILIATION_ENABLED: true,
  AUTO_PAYOUT_ENABLED: false,
  SCHEDULED_WITHDRAWS_ENABLED: false,
  LEGACY_FINANCE_ENABLED: true,
});

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function getMoneyCoreFlags(env = process.env) {
  return {
    MONEY_CORE_ENABLED: parseBoolean(env.MONEY_CORE_ENABLED, MONEY_CORE_DEFAULT_FLAGS.MONEY_CORE_ENABLED),
    MONEY_CORE_READ_ONLY: parseBoolean(env.MONEY_CORE_READ_ONLY, MONEY_CORE_DEFAULT_FLAGS.MONEY_CORE_READ_ONLY),
    MONEY_CORE_WRITE_ENABLED: parseBoolean(env.MONEY_CORE_WRITE_ENABLED, MONEY_CORE_DEFAULT_FLAGS.MONEY_CORE_WRITE_ENABLED),
    PROVIDER_EVENTS_ENABLED: parseBoolean(env.PROVIDER_EVENTS_ENABLED, MONEY_CORE_DEFAULT_FLAGS.PROVIDER_EVENTS_ENABLED),
    PROVIDER_SETTLEMENTS_ENABLED: parseBoolean(env.PROVIDER_SETTLEMENTS_ENABLED, MONEY_CORE_DEFAULT_FLAGS.PROVIDER_SETTLEMENTS_ENABLED),
    WITHDRAW_REQUESTS_V2_ENABLED: parseBoolean(env.WITHDRAW_REQUESTS_V2_ENABLED, MONEY_CORE_DEFAULT_FLAGS.WITHDRAW_REQUESTS_V2_ENABLED),
    PAYOUT_EXECUTIONS_ENABLED: parseBoolean(env.PAYOUT_EXECUTIONS_ENABLED, MONEY_CORE_DEFAULT_FLAGS.PAYOUT_EXECUTIONS_ENABLED),
    MONEY_CORE_LEDGER_MOVEMENTS_ENABLED: parseBoolean(env.MONEY_CORE_LEDGER_MOVEMENTS_ENABLED, MONEY_CORE_DEFAULT_FLAGS.MONEY_CORE_LEDGER_MOVEMENTS_ENABLED),
    RECONCILIATION_ENABLED: parseBoolean(env.RECONCILIATION_ENABLED, MONEY_CORE_DEFAULT_FLAGS.RECONCILIATION_ENABLED),
    AUTO_PAYOUT_ENABLED: parseBoolean(env.AUTO_PAYOUT_ENABLED, MONEY_CORE_DEFAULT_FLAGS.AUTO_PAYOUT_ENABLED),
    SCHEDULED_WITHDRAWS_ENABLED: parseBoolean(env.SCHEDULED_WITHDRAWS_ENABLED, MONEY_CORE_DEFAULT_FLAGS.SCHEDULED_WITHDRAWS_ENABLED),
    LEGACY_FINANCE_ENABLED: parseBoolean(env.LEGACY_FINANCE_ENABLED, MONEY_CORE_DEFAULT_FLAGS.LEGACY_FINANCE_ENABLED),
  };
}

function isMoneyCoreEnabled(env = process.env) {
  return getMoneyCoreFlags(env).MONEY_CORE_ENABLED;
}

function isMoneyCoreReadOnly(env = process.env) {
  return getMoneyCoreFlags(env).MONEY_CORE_READ_ONLY;
}

function assertMoneyCoreWriteAllowed(env = process.env) {
  const flags = getMoneyCoreFlags(env);

  if (!flags.MONEY_CORE_ENABLED) {
    const err = new Error('Money Core is disabled');
    err.code = 'MONEY_CORE_DISABLED';
    throw err;
  }

  if (flags.MONEY_CORE_READ_ONLY) {
    const err = new Error('Money Core is read-only');
    err.code = 'MONEY_CORE_READ_ONLY';
    throw err;
  }

  if (!flags.MONEY_CORE_WRITE_ENABLED) {
    const err = new Error('Money Core write is disabled');
    err.code = 'MONEY_CORE_WRITE_DISABLED';
    throw err;
  }

  return true;
}

function assertMoneyCoreFeatureEnabled(flagName, errorCode, message, env = process.env) {
  assertMoneyCoreWriteAllowed(env);

  const flags = getMoneyCoreFlags(env);

  if (!flags[flagName]) {
    const err = new Error(message);
    err.code = errorCode;
    throw err;
  }

  return true;
}

function assertProviderEventsEnabled(env = process.env) {
  return assertMoneyCoreFeatureEnabled(
    'PROVIDER_EVENTS_ENABLED',
    'PROVIDER_EVENTS_DISABLED',
    'Money Core provider events are disabled',
    env,
  );
}

function assertProviderSettlementsEnabled(env = process.env) {
  return assertMoneyCoreFeatureEnabled(
    'PROVIDER_SETTLEMENTS_ENABLED',
    'PROVIDER_SETTLEMENTS_DISABLED',
    'Money Core provider settlements are disabled',
    env,
  );
}

function assertWithdrawRequestsEnabled(env = process.env) {
  return assertMoneyCoreFeatureEnabled(
    'WITHDRAW_REQUESTS_V2_ENABLED',
    'WITHDRAW_REQUESTS_V2_DISABLED',
    'Money Core withdraw requests v2 are disabled',
    env,
  );
}

function assertPayoutExecutionsEnabled(env = process.env) {
  return assertMoneyCoreFeatureEnabled(
    'PAYOUT_EXECUTIONS_ENABLED',
    'PAYOUT_EXECUTIONS_DISABLED',
    'Money Core payout executions are disabled',
    env,
  );
}

function assertLedgerMovementsEnabled(env = process.env) {
  return assertMoneyCoreFeatureEnabled(
    'MONEY_CORE_LEDGER_MOVEMENTS_ENABLED',
    'MONEY_CORE_LEDGER_MOVEMENTS_DISABLED',
    'Money Core ledger movements are disabled',
    env,
  );
}

function assertReconciliationEnabled(env = process.env) {
  return assertMoneyCoreFeatureEnabled(
    'RECONCILIATION_ENABLED',
    'RECONCILIATION_DISABLED',
    'Money Core reconciliation is disabled',
    env,
  );
}

function assertAutoPayoutEnabled(env = process.env) {
  return assertMoneyCoreFeatureEnabled(
    'AUTO_PAYOUT_ENABLED',
    'AUTO_PAYOUT_DISABLED',
    'Money Core auto payout is disabled',
    env,
  );
}

function assertScheduledWithdrawsEnabled(env = process.env) {
  return assertMoneyCoreFeatureEnabled(
    'SCHEDULED_WITHDRAWS_ENABLED',
    'SCHEDULED_WITHDRAWS_DISABLED',
    'Money Core scheduled withdraws are disabled',
    env,
  );
}

export {
  MONEY_CORE_DEFAULT_FLAGS,
  getMoneyCoreFlags,
  isMoneyCoreEnabled,
  isMoneyCoreReadOnly,
  assertMoneyCoreWriteAllowed,
  assertMoneyCoreFeatureEnabled,
  assertProviderEventsEnabled,
  assertProviderSettlementsEnabled,
  assertWithdrawRequestsEnabled,
  assertPayoutExecutionsEnabled,
  assertLedgerMovementsEnabled,
  assertReconciliationEnabled,
  assertAutoPayoutEnabled,
  assertScheduledWithdrawsEnabled,
};
