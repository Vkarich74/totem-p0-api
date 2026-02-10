# STD LIB ONLY — SAFE FOR ODOO SAAS
import json, ssl, sys, urllib.request

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = ODOO_URL + "/jsonrpc"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def rpc(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        JSONRPC, data=data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        res = json.loads(r.read().decode())
    if res.get("error"):
        print(json.dumps(res["error"], ensure_ascii=False, indent=2))
        sys.exit(1)
    return res["result"]

def login():
    return rpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "common",
            "method": "login",
            "args": [DB, LOGIN, API_KEY]
        },
        "id": 1
    })

def exec_kw(uid, model, method, args=None, kwargs=None):
    return rpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, method, args or [], kwargs or {}]
        },
        "id": 1
    })

uid = login()
print("UID:", uid)

# 1. Берем ЛЮБОЙ root menu (parent_id = False). НИЧЕГО НЕ УДАЛЯЕМ.
roots = exec_kw(uid, "website.menu", "search_read",
                [[["parent_id", "=", False]]],
                {"fields": ["id", "name"]})

if not roots:
    print("NO ROOT MENU FOUND")
    sys.exit(1)

root_id = roots[0]["id"]
print("ROOT MENU:", root_id, roots[0]["name"])

def upsert(parent_id, name, url, seq):
    rows = exec_kw(
        uid, "website.menu", "search_read",
        [[["parent_id", "=", parent_id], ["name", "=", name]]],
        {"fields": ["id"], "limit": 1}
    )
    if rows:
        exec_kw(uid, "website.menu", "write",
                [[rows[0]["id"]], {"url": url, "sequence": seq}])
        return rows[0]["id"]
    return exec_kw(uid, "website.menu", "create", [{
        "name": name,
        "url": url,
        "parent_id": parent_id,
        "sequence": seq
    }])

# 2. TOP LEVEL — ТОЛЬКО КЛИКАБЕЛЬНЫЕ
home = upsert(root_id, "Главная", "/", 10)
masters = upsert(root_id, "Мастера", "/masters/cabinet", 20)
salons = upsert(root_id, "Салоны", "/salons/cabinet", 30)
totem = upsert(root_id, "TOTEM", "#", 40)

# 3. МАСТЕРА
upsert(masters, "Кабинет", "/masters/cabinet", 10)
upsert(masters, "Расписание", "/masters/schedule", 20)
upsert(masters, "Записи", "/masters/bookings", 30)
upsert(masters, "Клиенты", "/masters/clients", 40)
upsert(masters, "Деньги", "/masters/money", 50)
upsert(masters, "Настройки", "/masters/settings", 60)
upsert(masters, "Мои салоны", "/masters/salons", 70)

# 4. САЛОНЫ
upsert(salons, "Кабинет", "/salons/cabinet", 10)
upsert(salons, "Расписание", "/salons/schedule", 20)
upsert(salons, "Записи", "/salons/bookings", 30)
upsert(salons, "Клиенты", "/salons/clients", 40)
upsert(salons, "Деньги", "/salons/money", 50)
upsert(salons, "Настройки", "/salons/settings", 60)
upsert(salons, "Мастера", "/salons/masters", 70)

# 5. TOTEM (SLUG)
upsert(totem, "Салон", "/s/:slug", 10)
upsert(totem, "Запись", "/s/:slug/booking", 20)
upsert(totem, "Календарь", "/s/:slug/calendar", 30)
upsert(totem, "Отчёты", "/s/:slug/reports", 40)
upsert(totem, "Владелец", "/s/:slug/owner", 50)

# 6. УБРАТЬ login/signup ИЗ МЕНЮ (НЕ КНОПКИ)
auth_items = exec_kw(
    uid, "website.menu", "search_read",
    [[["url", "in", ["/web/login", "/web/signup"]]]],
    {"fields": ["id", "parent_id"]}
)
to_delete = [r["id"] for r in auth_items if r["parent_id"]]
if to_delete:
    exec_kw(uid, "website.menu", "unlink", [to_delete])

print("FIX DONE — MENU REBUILT")
