import json
import ssl
import urllib.request

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

url = ODOO_URL + "/web/session/authenticate"

payload = {
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
        "db": DB,
        "login": LOGIN,
        "password": API_KEY
    },
    "id": 1
}

req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
    res = json.loads(r.read().decode("utf-8"))

print(json.dumps(res, indent=2, ensure_ascii=False))

uid = res.get("result", {}).get("uid")
print("UID =", uid)
