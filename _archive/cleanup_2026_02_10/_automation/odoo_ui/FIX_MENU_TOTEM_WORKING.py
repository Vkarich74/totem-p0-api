# STD LIB ONLY — IDempotent — NO ROOT DELETE — NO UNLINK
import json
import ssl
import sys
import urllib.request

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def rpc(payload, timeout=90):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(JSONRPC, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
        res = json.loads(r.read().decode("utf-8"))
    if res.get("error"):
        print(json.dumps(res["error"], ensure_ascii=False, indent=2))
        sys.exit(1)
    return res["result"]

def login_uid():
    uid = rpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {"service": "common", "method": "login", "args": [DB, LOGIN, API_KEY]},
        "id": 1
    })
    return uid

def exec_kw(uid, model, method, args=None, kwargs=None):
    return rpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, method, args or [], kwargs or {}]
        },
        "id": 2
    })

def sr(uid, model, domain, fields, limit=2000, order="id asc"):
    return exec_kw(uid, model, "search_read", [domain], {"fields": fields, "limit": limit, "order": order})

def write(uid, model, rec_id, vals):
    return exec_kw(uid, model, "write", [[rec_id], vals])

def create(uid, model, vals):
    return exec_kw(uid, model, "create", [vals])

def field_exists(uid, model, field_name):
    # Проверяем наличие поля через fields_get
    fg = exec_kw(uid, model, "fields_get", [[field_name]], {"attributes": ["string"]})
    return field_name in fg

uid = login_uid()
print("UID =", uid)
if not uid:
    print("AUTH FAILED")
    sys.exit(2)

HAS_ACTIVE = field_exists(uid, "website.menu", "active")
HAS_IS_MEGA = field_exists(uid, "website.menu", "is_mega_menu")

# 1) Выбираем ROOT меню: prefer name contains "TOTEM" or "Platform", иначе берем самое первое root.
roots = sr(uid, "website.menu", [["parent_id", "=", False]], ["id", "name", "url"], limit=50)
if not roots:
    print("NO ROOT MENUS FOUND")
    sys.exit(3)

def pick_root(roots_):
    for r in roots_:
        n = (r.get("name") or "").lower()
        if "totem" in n or "platform" in n:
            return r["id"], r.get("name") or ""
    return roots_[0]["id"], roots_[0].get("name") or ""

ROOT_ID, ROOT_NAME = pick_root(roots)
print("ROOT =", ROOT_ID, ROOT_NAME)

def normalize_parent_vals(seq):
    v = {"sequence": seq, "url": "#"}
    if HAS_IS_MEGA:
        v["is_mega_menu"] = False
    if HAS_ACTIVE:
        v["active"] = True
    return v

def normalize_child_vals(url, seq):
    v = {"sequence": seq, "url": url}
    if HAS_ACTIVE:
        v["active"] = True
    return v

def disable_menu(uid, menu_id):
    if HAS_ACTIVE:
        write(uid, "website.menu", menu_id, {"active": False})
    else:
        # если active нет — просто уводим в неиспользуемый URL (мягко)
        write(uid, "website.menu", menu_id, {"url": "#__disabled__"})

def find_under_parent_by_name(parent_id, name):
    rows = sr(uid, "website.menu",
              [["parent_id", "=", parent_id], ["name", "=", name]],
              ["id", "name", "url", "parent_id", "sequence"], limit=50)
    return rows

def find_by_url(url):
    rows = sr(uid, "website.menu",
              [["url", "=", url]],
              ["id", "name", "url", "parent_id", "sequence"], limit=200)
    return rows

def upsert_menu(parent_id, name, url, seq, parent_like=False):
    # 1) если есть по URL — берём первую, приводим к нужному parent+name
    by_url = find_by_url(url) if url else []
    keep_id = None
    if by_url:
        keep_id = by_url[0]["id"]
        write(uid, "website.menu", keep_id, {"name": name, "parent_id": parent_id, **(normalize_parent_vals(seq) if parent_like else normalize_child_vals(url, seq))})
        # остальные дубли по URL — отключаем
        for d in by_url[1:]:
            disable_menu(uid, d["id"])
        return keep_id

    # 2) иначе ищем по NAME под нужным parent
    by_name = find_under_parent_by_name(parent_id, name)
    if by_name:
        keep_id = by_name[0]["id"]
        write(uid, "website.menu", keep_id, {"parent_id": parent_id, **(normalize_parent_vals(seq) if parent_like else normalize_child_vals(url, seq))})
        # остальные дубли по name под parent — отключаем
        for d in by_name[1:]:
            disable_menu(uid, d["id"])
        return keep_id

    # 3) создаём
    vals = {"name": name, "parent_id": parent_id, "sequence": seq}
    if parent_like:
        vals.update(normalize_parent_vals(seq))
    else:
        vals.update(normalize_child_vals(url, seq))
    return create(uid, "website.menu", vals)

# 2) Главная — гарантируем "/" (а не "#")
home_id = upsert_menu(ROOT_ID, "Главная", "/", 10, parent_like=False)

# 3) Родители (НЕ mega, URL '#')
masters_parent = upsert_menu(ROOT_ID, "Мастера", "#", 20, parent_like=True)
salons_parent  = upsert_menu(ROOT_ID, "Салоны",  "#", 30, parent_like=True)
totem_parent   = upsert_menu(ROOT_ID, "TOTEM",   "#", 40, parent_like=True)

# 4) Дети — Мастера
masters_items = [
    ("Кабинет", "/masters/cabinet", 10),
    ("Расписание", "/masters/schedule", 20),
    ("Записи", "/masters/bookings", 30),
    ("Клиенты", "/masters/clients", 40),
    ("Деньги", "/masters/money", 50),
    ("Настройки", "/masters/settings", 60),
    ("Мои салоны", "/masters/salons", 70),
]
for n,u,sq in masters_items:
    upsert_menu(masters_parent, n, u, sq, parent_like=False)

# 5) Дети — Салоны
salons_items = [
    ("Кабинет", "/salons/cabinet", 10),
    ("Расписание", "/salons/schedule", 20),
    ("Записи", "/salons/bookings", 30),
    ("Клиенты", "/salons/clients", 40),
    ("Деньги", "/salons/money", 50),
    ("Настройки", "/salons/settings", 60),
    ("Мастера", "/salons/masters", 70),
]
for n,u,sq in salons_items:
    upsert_menu(salons_parent, n, u, sq, parent_like=False)

# 6) Дети — TOTEM (slug)
totem_items = [
    ("Салон", "/s/:slug", 10),
    ("Запись", "/s/:slug/booking", 20),
    ("Календарь", "/s/:slug/calendar", 30),
    ("Отчёты", "/s/:slug/reports", 40),
    ("Владелец", "/s/:slug/owner", 50),
]
for n,u,sq in totem_items:
    upsert_menu(totem_parent, n, u, sq, parent_like=False)

# 7) Убрать дубли “Войти/Регистрация” из меню (не из сайта, а из меню!)
for auth_url in ("/web/login", "/web/signup"):
    rows = find_by_url(auth_url)
    for r in rows:
        # не трогаем root, но auth пункты корневыми быть не должны, их выключаем
        disable_menu(uid, r["id"])

print("DONE: MENU FIXED (SAFE)")
print("CHECK:")
print(" - hover 'Мастера' -> should show /masters/* items")
print(" - hover 'Салоны'  -> should show /salons/* items")
print(" - hover 'TOTEM'   -> should show /s/:slug* items")
