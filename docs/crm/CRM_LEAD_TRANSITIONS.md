# CRM_LEAD_TRANSITIONS

Purpose:
Define allowed and forbidden transitions for leads.

---

## Allowed transitions

new -> contacted
new -> lost

contacted -> qualified
contacted -> lost

qualified -> converted
qualified -> lost

converted -> (final)
lost -> (final)

---

## Forbidden transitions

- any -> new
- converted -> anything
- lost -> anything
- contacted -> converted (must be qualified first)

---

## Actors

- system (webhooks, forms)
- owner/admin (manual updates)

End of document.
