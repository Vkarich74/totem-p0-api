# Database Backup Policy

## Scope
Database: railway (Postgres)
Schemas:
- public
- totem_test

## What is backed up
- Full database dump (schema + data)
- Includes:
  - wallets
  - ledger_entries
  - payments
  - payouts
  - service_invoices
  - audit / reporting views
  - materialized views definitions

## What is NOT backed up
- Local exports (CSV)
- Logs
- Temporary scripts
- Tests

## Who performs backup
- Project owner / DB admin only
- Manual operation

## When to backup
- Before any financial release
- Before schema changes
- Before external audit
- On explicit request

## How to backup
- Using pg_dump
- Full dump, no filters
- Stored outside repository

## Restore rules
- Restore only to isolated environment
- Never restore over production blindly
- Restore requires explicit confirmation

## Notes
- No automated backups defined here
- This document defines policy, not execution
