import requests
import sys
import json

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

VIEW_IDS = [2263,2233,2234,2262,2241,2242]

def rpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=60)
    r.raise_for_status()
    return r.json()

def auth():
    payload = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{"service":"common","method":"authenticate","args":[DB, LOGIN, API_KEY, {}]},
        "id":1
    }
    return rpc(payload)["result"]

def execute(uid, model, method, args):
    payload = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[DB, uid, API_KEY, model, method, args]
        },
        "id":2
    }
    return rpc(payload)

def main():
    uid = auth()
    for vid in VIEW_IDS:
        try:
            res = execute(uid, "ir.ui.view", "read", [[vid], ["id","name","arch_db"]])
            print("OK:", vid, res["result"][0]["name"])
        except Exception as e:
            print("BROKEN:", vid, str(e))

if __name__ == "__main__":
    main()
