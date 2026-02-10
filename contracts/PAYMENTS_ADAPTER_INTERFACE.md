# PAYMENTS ADAPTER INTERFACE — FREEZE

create_intent(payload)
verify_webhook(headers, raw_body)
parse_event(headers, raw_body)
request_refund(intent_id, amount)
