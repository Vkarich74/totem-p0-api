import json, ssl, sys, urllib.request

ODOO_URL="https://totem-platform.odoo.com"
DB="totem-platform"
LOGIN="kantotemus@gmail.com"
API_KEY="710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC=f"{ODOO_URL}/jsonrpc"

CTX=ssl.create_default_context()
CTX.check_hostname=False
CTX.verify_mode=ssl.CERT_NONE

def rpc(p):
    d=json.dumps(p).encode("utf-8")
    req=urllib.request.Request(JSONRPC,data=d,headers={"Content-Type":"application/json"},method="POST")
    with urllib.request.urlopen(req,context=CTX,timeout=60) as r:
        res=json.loads(r.read().decode("utf-8","replace"))
    if res.get("error"):
        print(json.dumps(res["error"],indent=2,ensure_ascii=False))
        sys.exit(1)
    return res.get("result")

def login():
    uid=rpc({"jsonrpc":"2.0","method":"call","params":{"service":"common","method":"login","args":[DB,LOGIN,API_KEY]},"id":1})
    if not uid:
        print("LOGIN FAILED"); sys.exit(1)
    return uid

def exec_kw(uid, model, method, args=None, kwargs=None):
    return rpc({
        "jsonrpc":"2.0","method":"call",
        "params":{"service":"object","method":"execute_kw","args":[DB,uid,API_KEY,model,method,args or [],kwargs or {}]},
        "id":1
    })

uid = login()

def find_menu_by_name(name):
    rows = exec_kw(uid,"website.menu","search_read",[[["name","=",name],["parent_id","=",False]]],{"fields":["id","name"],"limit":5})
    return rows[0]["id"] if rows else None

def children(parent_id):
    return exec_kw(uid,"website.menu","search_read",[[["parent_id","=",parent_id]]],{"fields":["id","name","url","sequence","parent_id"],"limit":2000})

def find_child(parent_id, child_name):
    rows = exec_kw(uid,"website.menu","search_read",[[["parent_id","=",parent_id],["name","=",child_name]]],{"fields":["id","name","url"],"limit":5})
    return rows[0]["id"] if rows else None

def write(mid, vals):
    exec_kw(uid,"website.menu","write",[[mid],vals])

def unlink(ids):
    if ids:
        exec_kw(uid,"website.menu","unlink",[ids])

def dedupe_under(parent_id):
    rows = children(parent_id)
    seen = {}
    dup = []
    for r in rows:
        key = ((r.get("name") or "").strip().lower(), (r.get("url") or "").strip())
        if key in seen:
            dup.append(r["id"])
        else:
            seen[key]=r["id"]
    if dup:
        unlink(dup)
    return len(dup)

# --- TARGET MENUS ---
totem_platform_root = find_menu_by_name("TOTEM Platform")
default_root = find_menu_by_name("Главное меню по умолчанию")

if not totem_platform_root:
    print("ERROR: root 'TOTEM Platform' not found"); sys.exit(1)

# 1) УБРАТЬ ВХОД/РЕГИСТРАЦИЮ ИЗ МЕНЮ (они уже есть кнопками/CTA)
def remove_auth_items(root_id):
    rows = exec_kw(uid,"website.menu","search_read",
                   [[["parent_id","=",root_id],["url","in",["/web/login","/web/signup"]]]],
                   {"fields":["id","name","url"],"limit":50})
    unlink([r["id"] for r in rows])
    return len(rows)

removed_tp = remove_auth_items(totem_platform_root)
removed_def = remove_auth_items(default_root) if default_root else 0

# 2) СДЕЛАТЬ ССЫЛКИ КЛИКАБЕЛЬНЫМИ (НЕ '#')
#    - 'Главная' -> '/'
#    - 'Мастера' -> '/masters/cabinet'
#    - 'Салоны'  -> '/salons/cabinet'
#    - 'TOTEM'   -> '/s/:slug' (как канон)
def set_url(root_id, name, url):
    cid = find_child(root_id, name)
    if cid:
        write(cid, {"url": url})

set_url(totem_platform_root, "Главная", "/")
set_url(totem_platform_root, "Мастера", "/masters/cabinet")
set_url(totem_platform_root, "Салоны", "/salons/cabinet")
set_url(totem_platform_root, "TOTEM", "/s/:slug")

# 3) УБРАТЬ ДУБЛИ ВНУТРИ ОБОИХ МЕНЮ
dup_tp = dedupe_under(totem_platform_root)
dup_def = dedupe_under(default_root) if default_root else 0

print("FIX DONE")
print(f"removed auth items: TOTEM Platform={removed_tp}, Default={removed_def}")
print(f"duplicates removed: TOTEM Platform={dup_tp}, Default={dup_def}")
