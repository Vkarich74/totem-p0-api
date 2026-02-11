(function () {
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
})();