# inject_role_check_into_layout.py
# Injects script tag into website.layout (idempotent)

import requests

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

SCRIPT_TAG = '<script src="/web/content/totem_role_check.js"></script>'

def jsonrpc(payload):
    r = requests.post(JSONRPC, json=payload)
    r.raise_for_status()
    return r.json()["result"]

def auth():
    return jsonrpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "common",
            "method": "authenticate",
            "args": [DB, LOGIN, API_KEY, {}],
        },
        "id": 1,
    })

def exec_kw(uid, model, method, args=None, kwargs=None):
    if args is None: args = []
    if kwargs is None: kwargs = {}
    return jsonrpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, method, args, kwargs],
        },
        "id": 2,
    })

def main():
    uid = auth()

    layout = exec_kw(uid, "ir.ui.view", "search_read",
        [[("key", "=", "website.layout")]],
        {"fields": ["id", "arch_db"], "limit": 1}
    )

    if not layout:
        print("website.layout not found")
        return

    view_id = layout[0]["id"]
    arch = layout[0]["arch_db"]

    if SCRIPT_TAG in arch:
        print("Already injected")
        return

    new_arch = arch.replace("</body>", SCRIPT_TAG + "\n</body>")

    exec_kw(uid, "ir.ui.view", "write",
        [[view_id], {"arch_db": new_arch}]
    )

    print("ROLE CHECK injected into layout")

if __name__ == "__main__":
    main()
