# ROLE_GATE_FULL_SYNC.py
# FULL AUTOMATION
# 1. AUTH
# 2. READ CURRENT totem_role_check.js
# 3. BACKUP
# 4. REPLACE WITH salon_admin MAPPING
# 5. VERIFY

import sys
import json
import base64
import datetime
import os
import requests

# === HARD WIRED CONFIG ===
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

ATTACH_NAME = "totem_role_check.js"
TIMEOUT = 60

NEW_JS = r"""(function () {
"use strict";

var RESOLVE_URL = "/auth/resolve";
var DEFAULT_PUBLIC_SLUG = "totem-demo-salon";

function redirect(url) {
  window.location.replace(url);
}

function denyToPublic(slug) {
  var s = slug || DEFAULT_PUBLIC_SLUG;
  redirect("/s/" + encodeURIComponent(s));
}

function run() {
  var path = window.location.pathname || "/";

  if (!path.startsWith("/masters") && !path.startsWith("/salons")) {
    return;
  }

  fetch(RESOLVE_URL, { method: "GET", credentials: "include" })
    .then(function (r) {
      if (!r.ok) throw new Error("resolve_failed");
      return r.json();
    })
    .then(function (data) {

      var role = (data.role || "public").toLowerCase();
      var salonSlug = data.salon_slug || "";

      if (role === "salon_admin") {
        if (path.startsWith("/salons")) return;
        if (path.startsWith("/masters")) return redirect("/salons/cabinet");
      }

      if (role === "master") {
        if (path.startsWith("/masters")) return;
        if (path.startsWith("/salons")) return redirect("/masters/cabinet");
      }

      if (role === "owner") {
        return;
      }

      denyToPublic(salonSlug);
    })
    .catch(function () {
      denyToPublic("");
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
})();"""

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
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "common",
            "method": "authenticate",
            "args": [DB, LOGIN, API_KEY, {}],
        },
        "id": 1,
    }

    auth_res = jsonrpc(auth)
    uid = auth_res.get("result")
    if not uid:
        die("AUTH FAILED: " + json.dumps(auth_res, indent=2))

    # SEARCH ATTACHMENT
    search = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [
                DB,
                uid,
                API_KEY,
                "ir.attachment",
                "search",
                [[["name", "=", ATTACH_NAME]]],
            ],
        },
        "id": 2,
    }

    search_res = jsonrpc(search)
    ids = search_res.get("result") or []
    if not ids:
        die("ATTACHMENT NOT FOUND")

    attach_id = ids[0]

    # READ CURRENT
    read = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [
                DB,
                uid,
                API_KEY,
                "ir.attachment",
                "read",
                [[attach_id], ["datas"]],
            ],
        },
        "id": 3,
    }

    read_res = jsonrpc(read)
    current_b64 = read_res["result"][0]["datas"]
    current_js = base64.b64decode(current_b64).decode("utf-8", errors="ignore")

    # BACKUP
    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    os.makedirs("audit", exist_ok=True)
    backup_path = f"audit\\BACKUP_totem_role_check_{attach_id}_{ts}.js"

    with open(backup_path, "w", encoding="utf-8") as f:
        f.write(current_js)

    # WRITE NEW
    new_b64 = base64.b64encode(NEW_JS.encode("utf-8")).decode("ascii")

    write = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [
                DB,
                uid,
                API_KEY,
                "ir.attachment",
                "write",
                [[attach_id], {"datas": new_b64, "mimetype": "text/javascript"}],
            ],
        },
        "id": 4,
    }

    write_res = jsonrpc(write)
    if write_res.get("result") is not True:
        die("WRITE FAILED: " + json.dumps(write_res, indent=2))

    print("SUCCESS")
    print("Attachment ID:", attach_id)
    print("Backup saved:", backup_path)

if __name__ == "__main__":
    main()
