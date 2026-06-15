function roundProjectionMoney(value){
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function normalizeProjectionDate(value){
  if(!value){
    return null;
  }

  const date = new Date(value);

  if(Number.isNaN(date.getTime())){
    return null;
  }

  return date.toISOString();
}

function normalizeProjectionPercent(value){
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseProjectionStatusList(value){
  if(Array.isArray(value)){
    return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  }

  const raw = String(value ?? "").trim().toLowerCase();

  if(!raw){
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function buildProjectionScope(scopeType, scopeRow, masterIdFilter = null){
  if(scopeType === "salon"){
    return {
      type: "salon",
      salon_id: Number(scopeRow?.id ?? null) || null,
      salon_slug: scopeRow?.slug || null,
      salon_name: scopeRow?.name || null,
      master_id: masterIdFilter == null ? null : Number(masterIdFilter) || null
    };
  }

  return {
    type: "master",
    master_id: Number(scopeRow?.id ?? null) || null,
    master_slug: scopeRow?.slug || null,
    master_name: scopeRow?.name || null
  };
}

function buildProjectionFilters({ status, from, to, master_id: masterId = null } = {}){
  const filters = {
    status: parseProjectionStatusList(status),
    from: from ? String(from).trim() : null,
    to: to ? String(to).trim() : null
  };

  if(masterId !== null && masterId !== undefined){
    filters.master_id = Number(masterId) || null;
  }

  return filters;
}

function buildPaymentProjectionResponse({
  payment,
  contract,
  scopeSalons,
  scopeMasters
}){
  const grossAmount = roundProjectionMoney(payment.gross_amount ?? payment.amount ?? 0);
  const contractTerms = contract?.terms_json && typeof contract.terms_json === "object"
    ? { ...contract.terms_json }
    : {};
  const contractModel = String(contractTerms.model || "").trim().toLowerCase() || null;
  const currency = String(contractTerms.currency || "KGS").trim().toUpperCase() || "KGS";
  const bookingCreatedAt = normalizeProjectionDate(payment.booking_created_at);
  const paymentCreatedAt = normalizeProjectionDate(payment.payment_created_at);
  const contractBasis = bookingCreatedAt ? "booking_created_at" : (paymentCreatedAt ? "payment_created_at" : null);

  const collectorOwnerType = String(payment.collector_owner_type || "").trim() || null;
  const collectorOwnerId = payment.collector_owner_id == null ? null : Number(payment.collector_owner_id);

  let collectorLabel = null;
  if(collectorOwnerType === "salon"){
    collectorLabel = scopeSalons?.name || scopeSalons?.slug || null;
  }else if(collectorOwnerType === "master"){
    collectorLabel = scopeMasters?.name || scopeMasters?.slug || null;
  }

  let masterPercent = null;
  let salonPercent = null;
  let platformPercent = null;
  let masterShare = null;
  let salonShare = null;
  let platformShare = null;
  let shareResidual = null;
  let calculationStatus = "blocked_missing_contract";
  let settlementStatus = "blocked_missing_contract";
  let custodyHolderType = null;
  let custodyHolderId = null;
  let transferFromType = null;
  let transferFromId = null;
  let transferToType = null;
  let transferToId = null;
  let transferAmount = null;
  let includedInOpenBalance = false;
  let includedInHistory = true;
  let carryForward = false;
  let openTransferAmount = 0;
  let settledTransferAmount = 0;
  let remainingTransferAmount = 0;

  if(contract){
    masterPercent = normalizeProjectionPercent(contractTerms.master_percent);
    salonPercent = normalizeProjectionPercent(contractTerms.salon_percent);
    platformPercent = normalizeProjectionPercent(contractTerms.platform_percent);

    masterShare = roundProjectionMoney(grossAmount * masterPercent / 100);
    salonShare = roundProjectionMoney(grossAmount * salonPercent / 100);
    platformShare = roundProjectionMoney(grossAmount * platformPercent / 100);
    shareResidual = roundProjectionMoney(grossAmount - masterShare - salonShare - platformShare);

    if(collectorOwnerType === "salon"){
      custodyHolderType = "salon";
      custodyHolderId = Number(payment.salon_id) || null;
      transferFromType = "salon";
      transferFromId = Number(payment.salon_id) || null;
      transferToType = "master";
      transferToId = Number(payment.master_id) || null;
      transferAmount = masterShare;
      calculationStatus = "shares_calculated_transfer_ready";
      settlementStatus = transferAmount > 0 ? "transfer_required" : "no_transfer_required";
      includedInOpenBalance = transferAmount > 0;
      carryForward = transferAmount > 0;
      openTransferAmount = transferAmount > 0 ? transferAmount : 0;
      remainingTransferAmount = transferAmount > 0 ? transferAmount : 0;
    }else if(collectorOwnerType === "master"){
      custodyHolderType = "master";
      custodyHolderId = Number(payment.master_id) || null;
      transferFromType = "master";
      transferFromId = Number(payment.master_id) || null;
      transferToType = "salon";
      transferToId = Number(payment.salon_id) || null;
      transferAmount = salonShare;
      calculationStatus = "shares_calculated_transfer_ready";
      settlementStatus = transferAmount > 0 ? "transfer_required" : "no_transfer_required";
      includedInOpenBalance = transferAmount > 0;
      carryForward = transferAmount > 0;
      openTransferAmount = transferAmount > 0 ? transferAmount : 0;
      remainingTransferAmount = transferAmount > 0 ? transferAmount : 0;
    }else{
      calculationStatus = "shares_calculated_transfer_blocked_missing_collector";
      settlementStatus = "blocked_missing_collector";
      includedInOpenBalance = false;
      carryForward = false;
    }

    if(transferAmount === 0){
      calculationStatus = "no_transfer_required";
      settlementStatus = "no_transfer_required";
      includedInOpenBalance = false;
      carryForward = false;
      openTransferAmount = 0;
      remainingTransferAmount = 0;
    }
  }

  return {
    payment_id: Number(payment.payment_id),
    booking_id: Number(payment.booking_id),
    salon_id: Number(payment.salon_id),
    master_id: Number(payment.master_id),
    gross_amount: grossAmount,
    currency,
    payment_status: payment.payment_status ?? null,
    payment_provider: payment.payment_provider ?? null,
    method: payment.method ?? null,
    booking_status: payment.booking_status ?? null,
    booking_start_at: payment.booking_start_at ?? null,
    booking_end_at: payment.booking_end_at ?? null,
    booking_created_at: bookingCreatedAt || paymentCreatedAt,
    service_id: payment.service_id ?? null,
    service_name: payment.service_name ?? null,
    client_name: payment.client_name ?? null,
    collector_owner_type: collectorOwnerType,
    collector_owner_id: collectorOwnerId,
    collector_label: collectorLabel,
    confirmed_by_user_id: payment.confirmed_by_user_id ?? null,
    confirmed_at: normalizeProjectionDate(payment.confirmed_at),
    applied_contract_id: contract?.id ?? null,
    applied_contract_model: contractModel,
    contract_basis: contract ? contractBasis : null,
    contract_terms_snapshot: contractTerms,
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
    remaining_transfer_amount: remainingTransferAmount
  };
}

async function resolvePaymentProjectionContract(pool, payment){
  const bookingAnchor = payment.booking_created_at ? normalizeProjectionDate(payment.booking_created_at) : null;
  const paymentAnchor = payment.payment_created_at ? normalizeProjectionDate(payment.payment_created_at) : null;
  const anchor = bookingAnchor || paymentAnchor || null;

  if(!anchor){
    return null;
  }

  const contractResult = await pool.query(`
SELECT
c.id,
c.terms_json,
c.created_at,
c.effective_from,
c.archived_at,
c.status
FROM public.contracts c
WHERE c.salon_id::text = $1::text
AND c.master_id::text = $2::text
AND LOWER(COALESCE(c.terms_json->>'model', '')) IN ('percentage', 'hybrid')
AND c.created_at <= $3::timestamptz
AND (
  c.effective_from IS NULL
  OR (c.effective_from AT TIME ZONE 'Asia/Bishkek') <= $3::timestamptz
)
AND (c.archived_at IS NULL OR c.archived_at > $3::timestamptz)
ORDER BY COALESCE(c.effective_from, c.created_at) DESC, c.created_at DESC, c.id DESC
LIMIT 1
`,[
    String(payment.salon_id),
    String(payment.master_id),
    anchor
  ]);

  return contractResult.rows[0] || null;
}

async function fetchPaymentProjectionRows(pool, {
  scopeType,
  scopeId,
  masterIdFilter = null,
  from = null,
  to = null
}){
  const values = [scopeId];
  const clauses = [];

  if(scopeType === "salon"){
    clauses.push("b.salon_id = $1");
    if(masterIdFilter !== null && masterIdFilter !== undefined){
      values.push(masterIdFilter);
      clauses.push(`b.master_id = $${values.length}`);
    }
  }else{
    clauses.push("b.master_id = $1");
  }

  if(from){
    values.push(from);
    clauses.push(`b.created_at >= $${values.length}::timestamptz`);
  }

  if(to){
    values.push(to);
    clauses.push(`b.created_at < $${values.length}::timestamptz`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const result = await pool.query(`
SELECT
p.id AS payment_id,
b.id AS booking_id,
p.amount AS gross_amount,
p.provider AS payment_provider,
p.status AS payment_status,
p.method,
p.confirmed_by_user_id,
p.confirmed_at,
p.collector_owner_type,
p.collector_owner_id,
p.created_at AS payment_created_at,
b.salon_id,
b.master_id,
b.status AS booking_status,
b.start_at AS booking_start_at,
b.end_at AS booking_end_at,
b.created_at AS booking_created_at,
b.service_id,
COALESCE(svc.name, b.service_id::text) AS service_name,
COALESCE(cli.name, b.client_id::text) AS client_name,
COALESCE(sal.name, sal.slug, b.salon_id::text) AS salon_name,
COALESCE(mas.name, mas.slug, b.master_id::text) AS master_name
FROM public.payments p
JOIN public.bookings b ON b.id = p.booking_id
LEFT JOIN public.clients cli ON cli.id = b.client_id
LEFT JOIN public.services svc ON svc.id = b.service_id
LEFT JOIN public.salons sal ON sal.id = b.salon_id
LEFT JOIN public.masters mas ON mas.id = b.master_id
${whereSql}
ORDER BY b.created_at DESC, p.created_at DESC, p.id DESC
`, values);

  return result.rows || [];
}

function buildProjectionSummary(rows){
  const summary = {
    row_count: 0,
    gross_amount: 0,
    open_balance_count: 0,
    open_balance_amount: 0,
    history_count: 0,
    history_amount: 0,
    blocked_missing_contract_count: 0,
    blocked_missing_collector_count: 0,
    transfer_required_count: 0,
    settled_count: 0
  };

  for(const row of rows){
    const grossAmount = roundProjectionMoney(row?.gross_amount ?? 0);
    const openBalanceAmount = roundProjectionMoney(row?.remaining_transfer_amount ?? row?.transfer_amount ?? 0);
    const calculationStatus = String(row?.calculation_status || "").toLowerCase();
    const settlementStatus = String(row?.settlement_status || "").toLowerCase();

    summary.row_count += 1;
    summary.gross_amount += grossAmount;
    summary.history_count += 1;
    summary.history_amount += grossAmount;

    if(row?.included_in_open_balance){
      summary.open_balance_count += 1;
      summary.open_balance_amount += openBalanceAmount;
    }

    if(calculationStatus === "blocked_missing_contract"){
      summary.blocked_missing_contract_count += 1;
    }

    if(settlementStatus === "blocked_missing_collector"){
      summary.blocked_missing_collector_count += 1;
    }

    if(settlementStatus === "transfer_required"){
      summary.transfer_required_count += 1;
    }

    if(settlementStatus === "settled"){
      summary.settled_count += 1;
    }
  }

  return summary;
}

function rowMatchesStatusFilter(row, statusList){
  if(!statusList.length){
    return true;
  }

  const values = new Set([
    String(row?.payment_status || "").trim().toLowerCase(),
    String(row?.booking_status || "").trim().toLowerCase(),
    String(row?.calculation_status || "").trim().toLowerCase(),
    String(row?.settlement_status || "").trim().toLowerCase()
  ].filter(Boolean));

  return statusList.some((status) => values.has(status));
}

export async function getPaymentProjectionList(pool, {
  scopeType,
  scopeRow,
  scopeId,
  masterIdFilter = null,
  from = null,
  to = null,
  status = null
}){
  const filters = buildProjectionFilters({
    status,
    from,
    to,
    master_id: masterIdFilter
  });

  const paymentRows = await fetchPaymentProjectionRows(pool, {
    scopeType,
    scopeId,
    masterIdFilter,
    from: filters.from,
    to: filters.to
  });

  const rows = [];

  for(const payment of paymentRows){
    const contract = await resolvePaymentProjectionContract(pool, payment);
    const row = buildPaymentProjectionResponse({
      payment,
      contract,
      scopeSalons: {
        name: payment.salon_name,
        slug: String(payment.salon_id)
      },
      scopeMasters: {
        name: payment.master_name,
        slug: String(payment.master_id)
      }
    });

    if(rowMatchesStatusFilter(row, filters.status)){
      rows.push(row);
    }
  }

  return {
    ok: true,
    scope: buildProjectionScope(scopeType, scopeRow, masterIdFilter),
    filters,
    summary: buildProjectionSummary(rows),
    rows
  };
}

export {
  roundProjectionMoney,
  normalizeProjectionDate,
  normalizeProjectionPercent,
  buildPaymentProjectionResponse,
  resolvePaymentProjectionContract
};
