# TOTEM — DEEP Odoo Website Audit Report

- generated_at: **2026-02-11T10:37:54.264615Z**
- odoo_url: **https://totem-platform.odoo.com**

## Inside (JSON-RPC)

- websites: **ERROR**: {
  "code": 0,
  "message": "Odoo Server Error",
  "data": {
    "name": "builtins.ValueError",
    "message": "Invalid field 'active' on 'website'",
    "arguments": [
      "Invalid field 'active' on 'website'"
    ],
    "context": {},
    "debug": "Traceback (most recent call last):\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/orm/models.py\", line 3102, in _determine_fields_to_fetch\n    field = self._fields[field_name]\n            ~~~~~~~~~~~~^^^^^^^^^^^^\nKeyError: 'active'\n\nThe above exception was the direct cause of the following exception:\n\nTraceback (most recent call last):\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 2514, in _serve_db\n    return retrying(serve_func, env=self.env)\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 509, in retrying\n    result = func()\n             ^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 2569, in _serve_ir_http\n    response = self.dispatcher.dispatch(rule.endpoint, args)\n               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 2790, in dispatch\n    result = self.request.registry['ir.http']._dispatch(endpoint)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/addons/base/models/ir_http.py\", line 357, in _dispatch\n    result = endpoint(**request.params)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 902, in route_wrapper\n    result = endpoint(self, *args, **params_ok)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/custom/trial/saas_trial/controllers/main.py\", line 474, in jsonrpc\n    res = super().jsonrpc(service, method, args)\n          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 902, in route_wrapper\n    result = endpoint(self, *args, **params_ok)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/addons/rpc/controllers/jsonrpc.py\", line 16, in jsonrpc\n    return dispatch_rpc(service, method, args)\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 466, in dispatch_rpc\n    return dispatch(method, params)\n           ^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/service/model.py\", line 91, in dispatch\n    res = execute_cr(cr, uid, model, method_, args, kw)\n          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/service/model.py\", line 108, in execute_cr\n    result = http.retrying(partial(call_kw, recs, method, args, kw), env)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 509, in retrying\n    result = func()\n             ^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/service/model.py\", line 56, in call_kw\n    result = method(recs, *args, **kwargs)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/orm/models.py\", line 5092, in search_read\n    records = self.search_fetch(domain or [], fields, offset=offset, limit=limit, order=order)\n              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/orm/models.py\", line 1436, in search_fetch\n    fields_to_fetch = self._determine_fields_to_fetch(field_names)\n                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/orm/models.py\", line 3104, in _determine_fields_to_fetch\n    raise ValueError(f\"Invalid field {field_name!r} on {self._name!r}\") from e\nValueError: Invalid field 'active' on 'website'\n"
  }
}
- pages: **38**
- views_linked: **38**
- views_website_all: **1023**
- menus: **21**
- redirects: **ERROR**: {
  "code": 0,
  "message": "Odoo Server Error",
  "data": {
    "name": "odoo.exceptions.UserError",
    "message": "Object website.redirect doesn't exist",
    "arguments": [
      "Object website.redirect doesn't exist"
    ],
    "context": {},
    "debug": "Traceback (most recent call last):\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 2514, in _serve_db\n    return retrying(serve_func, env=self.env)\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 509, in retrying\n    result = func()\n             ^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 2569, in _serve_ir_http\n    response = self.dispatcher.dispatch(rule.endpoint, args)\n               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 2790, in dispatch\n    result = self.request.registry['ir.http']._dispatch(endpoint)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/addons/base/models/ir_http.py\", line 357, in _dispatch\n    result = endpoint(**request.params)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 902, in route_wrapper\n    result = endpoint(self, *args, **params_ok)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/custom/trial/saas_trial/controllers/main.py\", line 474, in jsonrpc\n    res = super().jsonrpc(service, method, args)\n          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 902, in route_wrapper\n    result = endpoint(self, *args, **params_ok)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/addons/rpc/controllers/jsonrpc.py\", line 16, in jsonrpc\n    return dispatch_rpc(service, method, args)\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/http.py\", line 466, in dispatch_rpc\n    return dispatch(method, params)\n           ^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/service/model.py\", line 91, in dispatch\n    res = execute_cr(cr, uid, model, method_, args, kw)\n          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/odoo/src/odoo/saas-19.1/odoo/service/model.py\", line 106, in execute_cr\n    raise UserError(f\"Object {obj} doesn't exist\")  # pylint: disable=missing-gettext\n    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nodoo.exceptions.UserError: Object website.redirect doesn't exist\n"
  }
}
- attachments: **242**
- assets_views: **0**

## Forms reuse (Inside / QWeb)

- unique_signatures_inside: **2**
### d520713f64e5…  (used on 1 pages)
- kinds: qweb_form_tag
- data_models: mail.mail
- fields: Field, Submit Button, company, description, email_from, email_to, mail.mail, name, phone, subject
- urls:
  - /contactus

### 2b55b866d3c8…  (used on 1 pages)
- kinds: qweb_data_model_chunk
- data_models: mail.mail
- fields: Field, mail.mail
- urls:
  - /contactus

## Menus coverage

- unique_menu_urls: **16**
- menu_urls_without_page_match: **1**
- examples:
  - #

## Outside (HTTP Crawl BOT)

- crawled_urls: **37**
- http_200: **35**
- non_200: **2**
- errors: **0**
- unique_form_signatures_outside: **2**

### Top reused form signatures (Outside / HTML)

#### 7a5d84d4151a…  (used on 70 urls)
- action: /website/search
- method: get
- input_names: order, search
- urls:
  - /
  - /
  - /contactus
  - /contactus
  - /contactus-thank-you
  - /contactus-thank-you
  - /demo
  - /demo
  - /demo/s/test
  - /demo/s/test
  - /demo/s/test/booking
  - /demo/s/test/booking
  - /demo/s/test/calendar
  - /demo/s/test/calendar
  - /masters
  - /masters
  - /masters/bookings
  - /masters/bookings
  - /masters/cabinet
  - /masters/cabinet
  - /masters/clients
  - /masters/clients
  - /masters/money
  - /masters/money
  - /masters/salons
  - /masters/salons
  - /masters/schedule
  - /masters/schedule
  - /masters/settings
  - /masters/settings

#### 05bc54d0a2d3…  (used on 1 urls)
- action: /website/form/
- method: post
- data_model_name: mail.mail
- input_names: company, description, email_from, email_to, name, phone, subject, website_form_signature
- urls:
  - /contactus

## Deterministic findings rules

- If ONE signature dominates many URLs (inside/outside) → same form/view reused → explains “одна форма на все страницы”.
- If menu urls lack page match → menu points to external/redirect/controller route.
- If redirects exist → URLs may not map to pages; need routing contract before changes.
