
# TOTEM — Backend Financial Core
## Provider-Agnostic Wallet, Ledger & Payout Architecture
### STATUS: FREEZE / READY FOR IMPLEMENTATION

---

## 0. Purpose of This Document
This document fixes the **canonical backend financial model** for the TOTEM platform.

Goals:
- No dependency on any payment provider
- Support for wallets, ledger, commissions, payouts
- Flexible pricing (percent / fixed / hybrid)
- Full audit & reporting capability
- Zero refactoring required when providers change

This is a **technical + logical contract**.  
All backend code must follow this document.

---

## 1. Core Principles (Invariants)

1. Ledger is the single source of truth  
2. Wallet balance is derived from ledger  
3. No wallet can ever go negative  
4. Providers never touch balances directly  
5. All money movements are explicit ledger entries  
6. Payout is the only exit of funds from the system  
7. System funds and client funds are never mixed  

---

## 2. Domain Entities

### 2.1 Client
Represents the payer of a service.

Fields:
- id
- phone
- name (nullable)
- created_at

Rules:
- Clients never have wallets
- Clients never participate in ledger
- Client is a source of funds only

---

### 2.2 Salon
Business entity aggregating masters.

Fields:
- id
- owner_id
- status (active / inactive)
- created_at

Rules:
- Salon always has a wallet
- Salon may receive funds from masters or clients

---

### 2.3 Master
Service provider.

Fields:
- id
- salon_id (nullable)
- status (active / inactive)
- created_at

Rules:
- Master always has a wallet
- Master may operate independently or under a salon

---

## 3. Wallet Model

### 3.1 Wallet
Logical sub-bank inside the platform.

Fields:
- id
- owner_type (system | salon | master)
- owner_id
- currency
- created_at

Rules:
- Wallet balance is NOT stored as truth
- Balance is calculated from ledger
- Optional cache_balance may exist for performance

---

## 4. Ledger (Source of Truth)

### 4.1 Ledger Entry

Fields:
- id
- from_wallet_id (nullable)
- to_wallet_id (nullable)
- amount
- currency
- direction (debit | credit)
- reason
- rule_code (nullable)
- reference_type
- reference_id
- created_at

Rules:
- Every money movement creates ledger entries
- Ledger entries are append-only
- Ledger entries are immutable

---

## 5. Payments (Business-Level)

### 5.1 Payment

Represents a logical payment intent.

Fields:
- id
- client_id
- context_type (booking | wallet_topup | service_invoice)
- context_id
- amount_requested
- currency
- status (pending | paid | failed | expired)
- created_at

Rules:
- Payment is provider-agnostic
- Payment does not include commissions
- Payment completion triggers ledger processing

---

## 6. Payment Providers (Adapters)

### 6.1 Provider Registry

Fields:
- code
- name
- active

---

### 6.2 Provider Transactions

Fields:
- id
- payment_id
- provider_code
- provider_tx_id
- amount_received
- currency
- raw_payload
- status
- created_at

Rules:
- Used for webhook logging
- Never modifies wallets directly

---

## 7. Fee & Commission Engine

### 7.1 Fee Rule

Fields:
- code
- applies_to (payment | payout)
- payer_type (client | master | salon | system)
- calculation_type (percent | fixed | hybrid)
- value
- currency (nullable)
- active

Examples:
- PROVIDER_FEE
- PLATFORM_FEE
- SERVICE_FEE
- PAYOUT_FEE

Rules:
- Fee rules are evaluated dynamically
- Changing fees never requires schema changes

---

## 8. Applying Fees to Ledger

Flow:
1. Payment marked as paid
2. Fee rules evaluated
3. Ledger entries generated:
   - Provider fee
   - Platform fee
   - Net distribution
4. Wallet balances update implicitly

---

## 9. Payout (Funds Withdrawal)

### 9.1 Payout

Fields:
- id
- wallet_id
- amount
- currency
- status (requested | processing | completed | failed)
- created_at

Rules:
- amount <= available balance
- Funds are reserved at request time
- On failure, rollback via ledger

---

## 10. Service Invoices (Platform Revenue)

### 10.1 Service Invoice

Fields:
- id
- owner_type (master | salon)
- owner_id
- period_start
- period_end
- amount
- currency
- status (pending | paid | overdue)

Rules:
- Paid via standard payment flow
- Funds go to system wallet
- Never deducted from client balances

---

## 11. Reporting & Analytics

### 11.1 Operational Reports
- Wallet balances
- Incoming / outgoing flows
- Reserved vs available funds

### 11.2 Financial Reports
- Revenue per master / salon
- Platform fees
- Provider fees
- Net platform income

### 11.3 Audit & Forensics
- Full balance reconstruction from ledger
- Fee justification via rule_code
- Period-based reconciliation

---

## 12. What Is Explicitly Out of Scope

- UI / Frontend
- Odoo integration
- Real bank connections
- Legal contracts
- Optimization

---

## 13. Final Status

FINANCIAL CORE MODEL: FROZEN  
READY FOR BACKEND IMPLEMENTATION  
SAFE FOR PROVIDER INTEGRATION  
SAFE FOR SCALE AND AUDIT  

---

END OF DOCUMENT
