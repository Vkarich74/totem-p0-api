# PROVIDER_REQUIREMENTS

Purpose:
Define hard requirements for selecting a payment provider.

---

## Mandatory capabilities

- Hosted payment page OR client SDK
- Webhook support
- Idempotency keys
- Partial and full refunds
- Test / sandbox mode

---

## Technical requirements

- HTTPS only
- Webhook retries supported
- Event IDs provided by provider
- Signature verification supported

---

## Business requirements

- Multi-currency (optional)
- Clear fee structure
- Dispute handling

---

## Disallowed providers

- No webhooks
- No idempotency
- Client-only confirmation without server verification

End of document.
