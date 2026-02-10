# SAFE MENU REBUILD — NO ROOT TOUCH — NO LOOPS — STD LIB ONLY
import json, ssl, sys, urllib.request

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def rpc(payload):
    req = urllib.request.Request(
        JSONRPC,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        res = json.loads(r.read().decode())
    if res.get("error"):
        print(json.dumps(res["error"], ensure_ascii=False, indent=2))
        sys.exit(1)
    return res["result"]

def login():
    return rpc({
        "jsonrpc":"2.0","method":"call","id":1,
        "params":{"service":"common","method":"login","args":[DB,LOGIN,API_KEY]}
    })

def kw(uid, model, method, args=None, kwd=None):
    return rpc({
        "jsonrpc":"2.0","method":"call","id":2,
        "params":{"service":"object","method":"execute_kw",
                  "args":[DB,uid,API_KEY,model,method,args or [],kwd or {}]}
    })

uid = login()
print("UID =", uid)
if not uid:
    sys.exit("AUTH FAILED")

def sr(model, domain, fields, limit=200):
    return kw(uid, model, "search_read", [domain], {"fields":fields,"limit":limit})

def create(model, vals):
    return kw(uid, model, "create", [vals])

def write(mid, vals):
    return kw(uid, "website.menu", "write", [[mid], vals])

# 1️⃣ найти или создать НАШ root (не трогаем Default Main Menu)
roots = sr("website.menu", [["parent_id","=",False]], ["id","name"])
root = next((r for r in roots if r["name"]=="TOTEM Platform"), None)
if not root:
    ROOT_ID = create("website.menu", {"name":"TOTEM Platform","url":"#","sequence":50})
    print("CREATED ROOT:", ROOT_ID)
else:
    ROOT_ID = root["id"]
    print("USING ROOT:", ROOT_ID)

def upsert(parent, name, url, seq):
    rows = sr("website.menu", [["parent_id","=",parent],["name","=",name]], ["id","url"])
    if rows:
        write(rows[0]["id"], {"url":url,"sequence":seq})
        return rows[0]["id"]
    return create("website.menu", {
        "parent_id":parent,"name":name,"url":url,"sequence":seq
    })

# 2️⃣ родители
masters = upsert(ROOT_ID,"Мастера","#",10)
salons  = upsert(ROOT_ID,"Салоны","#",20)
totem   = upsert(ROOT_ID,"TOTEM","#",30)

# 3️⃣ дети
for n,u,s in [
    ("Кабинет","/masters/cabinet",10),
    ("Расписание","/masters/schedule",20),
    ("Записи","/masters/bookings",30),
    ("Клиенты","/masters/clients",40),
    ("Деньги","/masters/money",50),
    ("Настройки","/masters/settings",60),
    ("Мои салоны","/masters/salons",70),
]:
    upsert(masters,n,u,s)

for n,u,s in [
    ("Кабинет","/salons/cabinet",10),
    ("Расписание","/salons/schedule",20),
    ("Записи","/salons/bookings",30),
    ("Клиенты","/salons/clients",40),
    ("Деньги","/salons/money",50),
    ("Настройки","/salons/settings",60),
    ("Мастера","/salons/masters",70),
]:
    upsert(salons,n,u,s)

for n,u,s in [
    ("Салон","/s/:slug",10),
    ("Запись","/s/:slug/booking",20),
    ("Календарь","/s/:slug/calendar",30),
    ("Отчёты","/s/:slug/reports",40),
    ("Владелец","/s/:slug/owner",50),
]:
    upsert(totem,n,u,s)

print("DONE — MENU REBUILT SAFE (NO LOOPS)")
