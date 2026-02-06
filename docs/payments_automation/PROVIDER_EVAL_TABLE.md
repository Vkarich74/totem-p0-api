# PROVIDER_EVAL_TABLE

Purpose:
Unified comparison table for payment providers.

---

## Evaluation Matrix

| Provider | API | Webhooks | Idempotency | Refunds | Regions | Score |
|---------|-----|----------|-------------|---------|---------|-------|
| Stripe  | ✔   | ✔        | ✔           | ✔       | Global  |       |
| Adyen   | ✔   | ✔        | ✔           | ✔       | Global  |       |
| Custom  | ?   | ?        | ?           | ?       | Local   |       |

---

## Scoring Rules

- API reliability (1–5)
- Webhook quality (1–5)
- Docs clarity (1–5)
- Support (1–5)

Total score = sum.

End of document.
\n