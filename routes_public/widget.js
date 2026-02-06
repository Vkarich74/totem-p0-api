// routes_public/widget.js
// Public delivery of booking widget (JS only)

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function registerWidgetRoute(router) {
  router.get("/widget.js", (req, res) => {
    res.type("application/javascript");
    res.sendFile(path.join(__dirname, "../public/widget.js"));
  });
}
