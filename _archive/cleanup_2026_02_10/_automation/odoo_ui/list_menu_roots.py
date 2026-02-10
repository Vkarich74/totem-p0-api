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
    with urllib.request.urlopen(r,context=CTX) as f:
        j=json.loads(f.read().decode())
    if j.get("error"):
        print(json.dumps(j["error"],indent=2,ensure_ascii=False))
        sys.exit(1)
    return j["result"]

uid=rpc({"jsonrpc":"2.0","method":"call","params":{"service":"common","method":"login","args":[DB,LOGIN,API_KEY]},"id":1})

rows=rpc({"jsonrpc":"2.0","method":"call","params":{
    "service":"object","method":"execute_kw",
    "args":[DB,uid,API_KEY,"website.menu","search_read",[[["parent_id","=",False]]],{"fields":["id","name"]}]
},"id":1})

print("ROOT MENUS:")
for r in rows:
    print(r["id"], r["name"])
