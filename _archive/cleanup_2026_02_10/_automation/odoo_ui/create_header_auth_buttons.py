import json
import ssl
import sys
import urllib.request

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

BUTTONS = [
    ("Войти", "/web/login", 9000),
    ("Регистрация", "/web/signup", 9010),
]

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def die(msg):
    print(msg)
    sys.exit(1)

def rpc(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        JSONRPC,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        raw = r.read().decode("utf-8", errors="replace")
    res = json.loads(raw)
    if "error" in res and res["error"]:
        die(json.dumps(res["error"], indent=2, ensure_ascii=False))
    return res.get("result")

def common_login():
    uid = rpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "common",
            "method": "login",
            "args": [DB, LOGIN, API_KEY],
        },
        "id": 1
    })
    if not uid:
        die("LOGIN FAILED")
    return uid

def exec_kw(uid, model, method, args=None, kwargs=None):
    return rpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, method, args or [], kwargs or {}],
        },
        "id": 1
    })

def model_exists(uid, model_name: str) -> bool:
    rows = exec_kw(
        uid,
        "ir.model",
        "search_read",
        [[["model", "=", model_name]]],
        {"fields": ["id", "model"], "limit": 1},
    )
    return bool(rows)

def pick_website_model(uid):
    # Deterministic: prefer "website" if exists, else "website.website"
    if model_exists(uid, "website"):
        return "website"
    if model_exists(uid, "website.website"):
        return "website.website"
    return None

def fields_has(uid, model, field_name: str) -> bool:
    info = exec_kw(uid, model, "fields_get", [[field_name]], {"attributes": ["type"]})
    return field_name in (info or {})

def get_website_id(uid, website_model: str):
    rows = exec_kw(
        uid,
        website_model,
        "search_read",
        [[["id", ">", 0]]],
        {"fields": ["id"], "limit": 1},
    )
    if not rows:
        return None
    return int(rows[0]["id"])

def ensure_menu(uid, menu_has_website_id: bool, website_id: int | None, name: str, url: str, seq: int):
    domain = [["url", "=", url]]
    if menu_has_website_id and website_id is not None:
        domain.append(["website_id", "=", website_id])

    rows = exec_kw(
        uid,
        "website.menu",
        "search_read",
        [domain],
        {"fields": ["id", "name"], "limit": 1},
    )

    if rows:
        mid = int(rows[0]["id"])
        # normalize name
        if rows[0].get("name") != name:
            exec_kw(uid, "website.menu", "write", [[mid], {"name": name}])
        print(f"OK EXISTS: {name} -> {url}")
        return

    vals = {
        "name": name,
        "url": url,
        "parent_id": False,
        "sequence": seq,
    }
    if menu_has_website_id and website_id is not None:
        vals["website_id"] = website_id

    mid = exec_kw(uid, "website.menu", "create", [vals])
    print(f"CREATED: {name} -> {url} (id={mid})")

def main():
    uid = common_login()

    # Hard check menu model exists
    if not model_exists(uid, "website.menu"):
        die("FATAL: model website.menu doesn't exist (Website app not installed in this DB)")

    website_model = pick_website_model(uid)
    website_id = None
    if website_model:
        website_id = get_website_id(uid, website_model)

    menu_has_website_id = fields_has(uid, "website.menu", "website_id")

    for name, url, seq in BUTTONS:
        ensure_menu(uid, menu_has_website_id, website_id, name, url, seq)

    print("DONE")

if __name__ == "__main__":
    main()
