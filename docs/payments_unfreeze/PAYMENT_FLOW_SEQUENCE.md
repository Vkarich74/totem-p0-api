# PAYMENT_FLOW_SEQUENCE

Purpose:
End-to-end payment flow sequence (logical).

---

## Sequence

1. Booking created (pending_payment)
2. Payment intent created
3. Client redirected / widget opened
4. Provider processes payment
5. Webhook received (paid / failed)
6. Backend updates payment
7. Booking updated accordingly
8. Frontend reflects final state

---

## Invariants

- Webhook is source of truth
- Client redirect is NOT confirmation
- Booking paid only after webhook

End of document.
