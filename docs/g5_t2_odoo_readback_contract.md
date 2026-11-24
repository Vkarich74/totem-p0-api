# G5-T2 — Odoo Online subscription readback and configuration contract

Status: SOURCE-ONLY / DRAFT PR / NOT DEPLOYED. 24 Nov 2026.
Authoritative technical plan: TOTEM USA Google Drive G5-T V1.2.

## Live facts verified by readonly Odoo RPC
Company 4, website 5. The live subscription object is sale.order, not sale.subscription.
Company-4 subscription plan #6: billing_period_unit=month, billing_period_value=1.
Company-4 recurring product template #29: active, recurring_invoice=true, is_published=false; USD currency #1.
Company-4 sale.order=0, account.move=0, payment.transaction=0 under the authorized API user's company scope.
Stripe provider #32: state=enabled, is_published=false; it is not proof of live merchant readiness.
base_automation installed, web_studio uninstalled; no existing sale.order/account.move/payment.transaction outbound automation.
Native recurring invoice cron daily; subscription expiration cron weekly. Cron is not a precise paid_until signal.
CRM14 is explicitly frozen: no CRM reads, activation or changes.

## Prepared T2 backend source
src/services/billing/usOdooReadOnlyClient.js — server credentials, HTTPS-only JSON-RPC
authentication, allowlisted models, search_read ONLY, Odoo context allowed_company_ids=[4].
src/services/billing/usOdooPaidEntitlement.js — read-only proof; a caller-provided Odoo
billing hint only wakes readback and its status/paid_until are ignored.
tests/g5-odoo-paid-entitlement.test.mjs — offline tests with in-memory source fixtures.

## Conditions before Core may grant an entitlement
1. Explicit owner-approved policy version, company #4, website #5, product template,
subscription plan, USD currency and an allowed payment channel are required.
2. Verify sale.order state sale, is_subscription=true, subscription_state=3_progress,
payment_exception=false, pending_transaction=false, same source Odoo partner/company/site.
3. Read plan, recurring sale order lines and actual product variant -> allowed template.
4. Read the invoice linked to that order, same partner/company/currency, move_type
out_invoice, state posted, payment_state paid, amount_total positive, residual zero.
5. Verify matching account.move.line by same invoice, subscription_id, sale_line_ids
and recurring product. A paid invoice from another subscription never unlocks Core.
6. Verify a linked inbound paid/reconciled account.payment for manual channel OR
payment.transaction state=done linked to the invoice for online channel.
7. Check reversal_move_ids and posted account.move credit notes reversing the invoice.
Refunds/chargebacks unrelated to the original invoice require further reconciliation
and may NOT be presumed absent solely because this initial read returned no reversal.
8. Derive effective paid period ONLY from contractually approved Odoo evidence.
The current source implementation can use invoice-line deferred_start_date and
deferred_end_date for a calendar-month, half-open UTC period ONLY if the owner confirms
that these accounting-deferral dates are the actual sold service period for this product.
That mapping is NOT currently evidenced as a live billing rule. The default is WAIT.
Never infer coverage only from next_invoice_date, end_date, invoice_date or 3_progress.
9. For order renewals, require a verified linked new subscription order; parent state
5_renewed cannot itself reactivate Core. Future revision must prove chain linkage.

## Strict scope and limits
The prepared T2 service does NOT register a source, write billing_subscriptions,
activate or provision Core, change Admin, create an Odoo payment or send Gmail.
It does not expose an endpoint, create an Odoo automation or switch on CRM14.
All unmet/uncertain conditions return WAIT, and Odoo outages return WAIT.
US signup remains independent of payment and /odoo-intake remains HOLD 409.

## Next release dependencies (not executed)
Commercial owner must authorize actual tariff, period semantic policy, checkout
publication and real payment E2E independently. A protected Core receiver and
same canonical activation with US-only expiry guard (T3+T5) must be deployed
before enabling outbound Odoo payment/subscription notifications.
Native Odoo base.automation triggering computed payment_state must be proven
in a permitted test; missed events require a scheduled authoritative reconciliation.
Neither the old Core wallet biller nor booking Stripe may override Odoo SaaS entitlement.

## Evidence and QA
18/18 isolated Node tests PASS; no real partner, account.move, payment or user was
created. The live Odoo RPC checks above were read-only. Test data is memory-only.
Source commit and pull-request details are recorded in Google Drive.
