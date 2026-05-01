# MONEY CORE — Controlled Write Runbook

## 1. Назначение
Этот runbook фиксирует контролируемый порядок включения Money Core write-поведения, baseline-проверки, smoke-порядок и rollback-правила.

Цель:
- не трогать real salon/master money без отдельного approved window;
- проводить baseline SQL до записи;
- выполнять rollback сразу после smoke;
- держать deploy/push и production smoke как отдельные процессы.

## 2. Safe/off состояние
На текущем backend HEAD `46c5723 fix: add ledger movements feature gate` safe/off состояние зафиксировано так:

- `MONEY_CORE_ENABLED=false`
- `MONEY_CORE_READ_ONLY=true`
- `MONEY_CORE_WRITE_ENABLED=false`
- `PROVIDER_SETTLEMENTS_ENABLED=false`
- `WITHDRAW_REQUESTS_V2_ENABLED=false`
- `PAYOUT_EXECUTIONS_ENABLED=false`
- `MONEY_CORE_LEDGER_MOVEMENTS_ENABLED=false`
- `AUTO_PAYOUT_ENABLED=false`
- `SCHEDULED_WITHDRAWS_ENABLED=false`
- `LEGACY_FINANCE_ENABLED=true`

Факт из smoke:
- `POST /internal/money-core/settlements/manual` при `MONEY_CORE_ENABLED=false` вернул `403 MONEY_CORE_DISABLED`.
- DB после этого осталась без изменений по `provider_settlement_id='money-core-provider-settlement-gate-smoke-20260501-001'` и связанным таблицам.

## 3. Флаги и смысл каждого
- `MONEY_CORE_ENABLED` — глобальный вход в Money Core write-path.
- `MONEY_CORE_READ_ONLY` — блокирует write-поведение, оставляет read-only поверхности.
- `MONEY_CORE_WRITE_ENABLED` — финальный write-gate для Money Core.
- `PROVIDER_SETTLEMENTS_ENABLED` — включает provider settlement write routes.
- `WITHDRAW_REQUESTS_V2_ENABLED` — включает withdraw destination / settings / withdraw request v2 routes.
- `PAYOUT_EXECUTIONS_ENABLED` — включает payout execution routes.
- `MONEY_CORE_LEDGER_MOVEMENTS_ENABLED` — отдельный gate для `POST /internal/money-core/ledger/movements`.
- `AUTO_PAYOUT_ENABLED` — отдельный будущий gate для auto payout, в текущем runbook не участвует.
- `SCHEDULED_WITHDRAWS_ENABLED` — отдельный будущий gate для scheduled withdraws, в текущем runbook не участвует.
- `LEGACY_FINANCE_ENABLED` — legacy surface; в данном write runbook не участвует.

## 4. Controlled write window порядок
Рекомендуемый порядок controlled window:

1. Сначала baseline и подтверждение, что smoke owner изолирован.
2. Затем открывать только минимальную ветку для нужного smoke:
   - для withdraw/payout smoke: `MONEY_CORE_ENABLED` + `MONEY_CORE_READ_ONLY=false` + `MONEY_CORE_WRITE_ENABLED` + `WITHDRAW_REQUESTS_V2_ENABLED` + `PAYOUT_EXECUTIONS_ENABLED`;
   - для provider settlement smoke: отдельное окно с `PROVIDER_SETTLEMENTS_ENABLED`;
   - для ledger movements smoke: отдельное окно с `MONEY_CORE_LEDGER_MOVEMENTS_ENABLED`.
3. Reconciliation держать как отдельный контур, не смешивая с первым write smoke.
4. Provider settlements и ledger movements не смешивать с первым withdraw/payout smoke без отдельного решения.

## 5. Rollback sequence
Rollback выполняется немедленно после smoke, в обратном порядке окна:

1. выключить `MONEY_CORE_LEDGER_MOVEMENTS_ENABLED`;
2. выключить `PAYOUT_EXECUTIONS_ENABLED`;
3. выключить `WITHDRAW_REQUESTS_V2_ENABLED`;
4. выключить `PROVIDER_SETTLEMENTS_ENABLED`;
5. выключить `AUTO_PAYOUT_ENABLED`, если он временно включался;
6. выключить `SCHEDULED_WITHDRAWS_ENABLED`, если он временно включался;
7. вернуть `MONEY_CORE_WRITE_ENABLED=false`;
8. вернуть `MONEY_CORE_READ_ONLY=true`;
9. вернуть `MONEY_CORE_ENABLED=false`.

`LEGACY_FINANCE_ENABLED` не трогать.

## 6. Baseline SQL before write
Перед любым write smoke снять baseline по synthetic owner и по ожидаемым источникам записи:

```sql
SELECT code, method, enabled, country
FROM public.destination_providers
WHERE enabled = true
  AND country = 'KG';

SELECT *
FROM public.withdraw_destinations
WHERE owner_type = 'system'
  AND owner_id = 900001;

SELECT *
FROM public.money_owner_balances
WHERE owner_type = 'system'
  AND owner_id = 900001
  AND currency = 'KGS';

SELECT *
FROM public.withdraw_requests
WHERE owner_type = 'system'
  AND owner_id = 900001;

SELECT *
FROM public.payout_executions
WHERE owner_type = 'system'
  AND owner_id = 900001;

SELECT *
FROM public.money_ledger_entries
WHERE owner_type = 'system'
  AND owner_id = 900001;

SELECT *
FROM public.money_receipts
WHERE owner_type = 'system'
  AND owner_id = 900001;

SELECT *
FROM public.money_audit_events
WHERE owner_type = 'system'
  AND owner_id = 900001;
```

## 7. Provider settlement negative smoke
Факт:
- `POST /internal/money-core/settlements/manual` при выключенных флагах вернул `403 MONEY_CORE_DISABLED`.

DB unchanged facts:
- `provider_settlement_id='money-core-provider-settlement-gate-smoke-20260501-001'` — `0 rows`;
- provider settlement audit events — `0 rows`;
- `money_split_allocations` — `0 rows`;
- `money_owner_balances` — без изменений.

Важно:
- это negative smoke;
- positive provider settlement smoke здесь не фиксируется и не утверждается;
- provider settlement write flows остаются в отдельном controlled window.

## 8. Withdraw/payout controlled smoke summary
Факт контролируемого smoke:
- owner: `system/900001`
- available: `100`
- withdraw `10` → locked
- payout submitted → completed
- available: `90`
- locked: `0`
- paid_out: `10`
- `withdraw_request id=1` completed
- `payout_execution id=1` completed
- `money_receipts count = 1` payout receipt
- real salon/master money touched: `0`

Критичное правило:
- этот flow допускается только для изолированного smoke owner;
- реальные salon/master money не использовать.

## 9. Ledger movements gate
Отдельный gate существует:
- `MONEY_CORE_LEDGER_MOVEMENTS_ENABLED=false`

Факт:
- `POST /internal/money-core/ledger/movements` при глобально выключенном Money Core вернул `403 MONEY_CORE_DISABLED`.

DB unchanged facts:
- `ledger_gate_smoke` — `0 rows`;
- `system/900001` balance — без изменений.

Правило:
- этот route имеет отдельную защиту и не должен входить в первый write smoke без отдельного approved window.

## 10. Receipt unique contract
Production DB контракт на receipt уже существует:

- unique index: `money_receipts_receipt_source_type_uidx`
- unique index: `UNIQUE (receipt_type, source_type, source_id)`
- индекс применён напрямую через Railway psql;
- migration file не создавался.

Вывод:
- retry на тот же `receipt_type/source_type/source_id` должен упираться в unique index;
- application-level dedupe всё равно желательно сохранять.

## 11. Settlement receipt deferred policy
Факты:
- owner attribution на уровне `provider_settlement` сейчас не доказан.
- owner attribution впервые появляется в `money_split_allocations`.
- owner-facing settlement receipts поэтому deferred.

Потенциально безопасный future technical receipt:
- только platform/system-scoped, если это понадобится как временная техническая фиксация;
- owner-facing settlement receipt без подтверждённого owner mapping не включать.

## 12. Запрещено
- не использовать real salon/master money для smoke;
- не включать flags без explicit controlled window;
- не делать positive provider settlement smoke без отдельного плана;
- не трогать XPAY / legacy finance / Odoo;
- не смешивать deploy/push и production smoke;
- не менять DB schema в рамках runbook;
- не добавлять непроверенные факты в этот документ.

## 13. Финальный checklist before/after smoke
Перед smoke:
- baseline SQL снят;
- smoke owner изолирован;
- выбран только один target window;
- понимаем, какие таблицы будут затронуты;
- rollback sequence подготовлен.

После smoke:
- rollback выполнен сразу;
- повторный SQL check подтверждает отсутствие лишних записей;
- recorded counts сравниваются с baseline;
- подтверждено, что real salon/master money не затронуты.

## 14. Production Enablement Checklist
- Перед любым write window должен быть explicit approval.
- Repo clean и origin synced.
- Production flags safe/off подтверждены через `/internal/money-core/flags`.
- Baseline SQL снят до write.
- Smoke owner synthetic/system, real salon/master money не используется.
- Выбран только один write-контур на одно окно.
- Rollback sequence подготовлен до write.
- Admin token/session проверен.
- PASS/FAIL критерии известны до запуска.
- Post-enable readback SQL обязателен.
- Если любое условие не выполнено — write window не открывать.

## 15. Smoke Matrix
1. Provider settlement negative smoke:
   - flags OFF
   - expected: `403 MONEY_CORE_DISABLED`
   - DB writes: `0`
   - status: `completed/pass`

2. Provider settlement positive smoke:
   - requires explicit write window
   - flags needed:
     - `MONEY_CORE_ENABLED=true`
     - `MONEY_CORE_READ_ONLY=false`
     - `MONEY_CORE_WRITE_ENABLED=true`
     - `PROVIDER_SETTLEMENTS_ENABLED=true`
   - expected tables:
     - `provider_settlements`
     - `money_audit_events`
   - forbidden:
     - `money_owner_balances`
     - `money_ledger_entries`
     - `money_receipts`
   - status: `deferred`

3. Split apply smoke:
   - requires provider settlement positive smoke first
   - use explicit allocations only unless `provider_settlement_items` are proven
   - expected table:
     - `money_split_allocations`
   - forbidden:
     - `money_owner_balances`
     - `money_ledger_entries`
     - `money_receipts`
   - status: `deferred`

4. Ledger movements runtime proof:
   - requires global write window plus `MONEY_CORE_LEDGER_MOVEMENTS_ENABLED=false` to prove dedicated gate
   - expected:
     - `403 MONEY_CORE_LEDGER_MOVEMENTS_DISABLED`
   - DB writes: `0`
   - status: `deferred`

5. Withdraw/payout controlled smoke:
   - already completed on `system/900001`
   - real salon/master money touched `0`
   - status: `completed/pass`

## 16. PASS / FAIL Criteria
PASS criteria:
- expected HTTP status returned
- expected rows created only in allowed tables
- forbidden tables unchanged
- balances unchanged unless test explicitly targets balance movement
- receipts dedupe unchanged
- duplicates `0 rows`
- flags rolled back immediately
- final `/flags` safe/off
- real salon/master money touched `0`
- git remains clean unless docs/code patch is expected

FAIL criteria:
- unexpected `2xx/5xx`
- HTML error instead of JSON
- write happened while flags OFF
- any row appears in forbidden table
- real salon/master owner touched
- rollback not completed
- duplicate receipt appears
- balance changes outside expected owner
- unknown audit/receipt side effects



