# Audit Access Procedure

## Scope
Applies to financial audit and reporting access for the TOTEM platform.

## Roles
- DB Admin (postgres)
- Audit Read-Only User: totem_audit_ro

## Access Levels

### 1. DB Admin
- Full access
- Can:
  - Refresh materialized views
  - Perform backups
  - Grant / revoke roles

### 2. Audit Read-Only User
Role: totem_audit_ro

Allowed:
- CONNECT to database
- SELECT on schemas:
  - public
  - totem_test
- Read:
  - tables
  - views
  - materialized views

Forbidden:
- INSERT / UPDATE / DELETE
- CREATE / DROP
- REFRESH materialized views
- Any DDL or DML write operations

## Access Grant Rules
- Access is granted manually by DB Admin
- Credentials are shared out-of-band
- Access is time-bounded if required

## Audit Operations
Auditor may:
- Run SELECT queries
- Export CSV locally
- Validate balances and reconciliations

Auditor may NOT:
- Modify data
- Trigger background operations
- Access production secrets outside DB

## Revocation
- Access can be revoked immediately by DB Admin
- Password rotation is mandatory after audit completion

## Notes
- No UI access is defined here
- This document defines procedure, not enforcement
