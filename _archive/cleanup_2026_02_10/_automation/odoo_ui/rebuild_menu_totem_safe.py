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
    d=json.dumps(p).encode()
    r=urllib.request.Request(JSONRPC,data=d,headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(r,context=CTX,timeout=60) as h:
        j=json.loads(h.read().decode())
    if j.get("error"):
        print(json.dumps(j["error"],indent=2,ensure_ascii=False))
        sys.exit(1)
    return j["result"]

def login():
    return rpc({
        "jsonrpc":"2.0",
        "method":"call",
        "params":{"service":"common","method":"login","args":[DB,LOGIN,API_KEY]},
        "id":1
    })

def exec_kw(uid,model,method,args=None,kwargs=None):
    return rpc({
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[DB,uid,API_KEY,model,method,args or [],kwargs or {}]
        },
        "id":1
    })

uid=login()

# НАЙТИ СТАНДАРТНЫЙ ROOT (НЕ УДАЛЯЕМЫЙ)
roots=exec_kw(
    uid,
    "website.menu",
    "search_read",
    [[["parent_id","=",False]]],
    {"fields":["id","name"],"limit":10}
)

root_id=roots[0]["id"]

def upsert(name,url,parent,seq):
    rows=exec_kw(
        uid,
        "website.menu",
        "search_read",
        [[["parent_id","=",parent],["name","=",name]]],
        {"fields":["id"],"limit":1}
    )
    if rows:
        exec_kw(
            uid,
            "website.menu",
            "write",
            [[rows[0]["id"]],{"url":url,"sequence":seq}]
        )
        return rows[0]["id"]
    return exec_kw(
        uid,
        "website.menu",
        "create",
        [{"name":name,"url":url,"parent_id":parent,"sequence":seq}]
    )

# TOP
m_home=upsert("Главная","/",root_id,10)
m_app=upsert("Встреча","/appointment",root_id,20)
m_login=upsert("Войти","/web/login",root_id,30)
m_signup=upsert("Регистрация","/web/signup",root_id,40)
m_masters=upsert("Мастера","#",root_id,50)
m_salons=upsert("Салоны","#",root_id,60)
m_totem=upsert("TOTEM","#",root_id,70)

# MASTERS
upsert("Кабинет","/masters/cabinet",m_masters,10)
upsert("Расписание","/masters/schedule",m_masters,20)
upsert("Записи","/masters/bookings",m_masters,30)
upsert("Клиенты","/masters/clients",m_masters,40)
upsert("Деньги","/masters/money",m_masters,50)
upsert("Настройки","/masters/settings",m_masters,60)
upsert("Мои салоны","/masters/salons",m_masters,70)

# SALONS
upsert("Кабинет","/salons/cabinet",m_salons,10)
upsert("Расписание","/salons/schedule",m_salons,20)
upsert("Записи","/salons/bookings",m_salons,30)
upsert("Клиенты","/salons/clients",m_salons,40)
upsert("Деньги","/salons/money",m_salons,50)
upsert("Настройки","/salons/settings",m_salons,60)
upsert("Мастера","/salons/masters",m_salons,70)

# TOTEM SLUG
upsert("Салон","/s/:slug",m_totem,10)
upsert("Запись","/s/:slug/booking",m_totem,20)
upsert("Календарь","/s/:slug/calendar",m_totem,30)
upsert("Отчёты","/s/:slug/reports",m_totem,40)
upsert("Владелец","/s/:slug/owner",m_totem,50)

print("MENU REBUILD SAFE DONE")
