# PAYMENTS PROVIDER ADAPTER CONTRACT

Required methods:
- create_intent()
- confirm_intent()
- handle_webhook()
- refund()
- reconcile()

Rules:
- provider-agnostic
- no business logic inside adapter
- adapter only maps provider -> canonical events
