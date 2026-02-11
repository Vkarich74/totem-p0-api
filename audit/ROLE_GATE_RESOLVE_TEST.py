import requests
import base64
import json
import sys

# === CONFIG (HARD WIRED) ===
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

ATTACH_NAME = "totem_resolve_probe.js"
TIMEOUT = 60

PROBE_JS = r"""
(function(){
"use strict";

function show(data){
  var el = document.createElement("div");
  el.style.position = "fixed";
  el.style.bottom = "0";
  el.style.left = "0";
  el.style.right = "0";
  el.style.background = "#000";
  el.style.color = "#0f0";
  el.style.padding = "10px";
  el.style.zIndex = "999999";
  el.style.fontSize = "12px";
  el.innerText = "RESOLVE: " + JSON.stringify(data);
  document.body.appendChild(el);
}

fetch("/auth/resolve", {credentials:"include"})
  .then(r=>r.json())
  .then(show)
  .catch(e=>show({error:String(e)}));
})();
"""

def die(msg):
    print("FATAL:", msg)
    sys.exit(1)

def jsonrpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def main():

    # AUTH
    auth = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"common",
            "method":"authenticate",
            "args":[DB, LOGIN, API_KEY, {}]
        },
        "id":1
    }

    auth_res = jsonrpc(auth)
    uid = auth_res.get("result")
    if not uid:
        die("AUTH FAILED")

    # CREATE OR REPLACE ATTACHMENT
    search = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[
                DB, uid, API_KEY,
                "ir.attachment","search",
                [[["name","=",ATTACH_NAME]]]
            ]
        },
        "id":2
    }

    ids = jsonrpc(search).get("result") or []

    new_b64 = base64.b64encode(PROBE_JS.encode()).decode()

    if ids:
        write = {
            "jsonrpc":"2.0",
            "method":"call",
            "params":{
                "service":"object",
                "method":"execute_kw",
                "args":[
                    DB, uid, API_KEY,
                    "ir.attachment","write",
                    [[ids[0]],{"datas":new_b64,"mimetype":"text/javascript"}]
                ]
            },
            "id":3
        }
        jsonrpc(write)
        attach_id = ids[0]
    else:
        create = {
            "jsonrpc":"2.0",
            "method":"call",
            "params":{
                "service":"object",
                "method":"execute_kw",
                "args":[
                    DB, uid, API_KEY,
                    "ir.attachment","create",
                    [{
                        "name":ATTACH_NAME,
                        "datas":new_b64,
                        "mimetype":"text/javascript",
                        "public":True
                    }]
                ]
            },
            "id":4
        }
        attach_id = jsonrpc(create).get("result")

    print("PROBE ATTACHMENT READY:", attach_id)
    print("NOW OPEN THIS IN BROWSER:")
    print(f"{ODOO_URL}/web/content/{attach_id}")

if __name__ == "__main__":
    main()
