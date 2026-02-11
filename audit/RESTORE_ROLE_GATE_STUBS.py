import requests
import sys

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

TIMEOUT = 60

def rpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        print("JSONRPC ERROR:", data)
        sys.exit(1)
    return data

def stub_arch(title, url):
    # STRICT: inside default Odoo website.layout
    return f"""<t t-name="totem.role_gate.stub">
  <section class="container py-5">
    <div class="row justify-content-center">
      <div class="col-lg-7">
        <div class="card shadow-sm">
          <div class="card-body p-4">
            <h2 class="mb-2">{title}</h2>
            <p class="text-muted mb-4">URL: {url}</p>

            <div class="alert alert-warning" role="alert">
              Этот раздел доступен только после подтверждения роли (Master/Salon) через ядро TOTEM (backend).
              Odoo-админка не является ролью продукта.
            </div>

            <div class="d-flex gap-2 flex-wrap">
              <a class="btn btn-primary" href="/start">Start</a>
              <a class="btn btn-outline-secondary" href="/waitlist">Waitlist</a>
              <a class="btn btn-link" href="/">Home</a>
            </div>

            <hr class="my-4"/>

            <p class="small text-muted mb-0">
              Статус: ROLE GATE STUB (v1). Следующий шаг: подключение role resolution к backend session.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</t>"""

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
    uid = rpc(auth).get("result")
    if not uid:
        print("FATAL: AUTH FAILED")
        sys.exit(1)

    # EXACT VIEWS WE BROKE (from your dump)
    # salon
    patches = [
        (2263, stub_arch("Salon cabinet locked", "/salons/cabinet")),
        (2233, stub_arch("Salon cabinet locked", "/salons/schedule")),
        (2234, stub_arch("Salon cabinet locked", "/salons/bookings")),
        # masters
        (2262, stub_arch("Master cabinet locked", "/masters/cabinet")),
        (2241, stub_arch("Master cabinet locked", "/masters/schedule")),
        (2242, stub_arch("Master cabinet locked", "/masters/bookings")),
    ]

    for view_id, arch in patches:
        write = {
            "jsonrpc":"2.0",
            "method":"call",
            "params":{
                "service":"object",
                "method":"execute_kw",
                "args":[
                    DB, uid, API_KEY,
                    "ir.ui.view", "write",
                    [[view_id], {"arch_db": arch, "active": True}]
                ]
            },
            "id":2
        }
        rpc(write)
        print("RESTORED VIEW:", view_id)

    print("DONE")

if __name__ == "__main__":
    main()
