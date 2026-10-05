const CUSTOM_KEYS = new Set(["owner_type", "work_mode", "salon_slug", "slug_requested", "specialization", "bridge_source", "market_code"]);
function text(value) { return String(value ?? "").trim(); }
function relationId(value) {
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function plainHtml(value) {
  return String(value ?? "")
    .replace(/<(?:br\b[^>]*|\/p|\/div|\/li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
      const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (_, name) => ({nbsp:" ",amp:"&",lt:"<",gt:">",quot:'"',apos:"'"}[name.toLowerCase()]))
    .replace(/\r\n?/g, "\n");
}
function failure(code) { return { error: { status: 400, code } }; }
export function mapOdooBridgeCrmForm(body = {}) {
  if (body._model !== "crm.lead" || !relationId(body._id)) return failure("ODOO_MODEL_UNSUPPORTED");
  if (relationId(body.company_id) !== 1 || relationId(body.team_id) !== 7 || relationId(body.stage_id) !== 80) {
    return failure("ODOO_BRIDGE_FORM_SCOPE_INVALID");
  }
  const notes = plainHtml(body.description);
  const separator = /(?:^|\n)_{11}\s*\n/g;
  let match, start = -1;
  while ((match = separator.exec(notes))) start = match.index + match[0].length;
  if (start < 0) return failure("ODOO_BRIDGE_FORM_METADATA_MISSING");
  const custom = {};
  for (const line of notes.slice(start).split("\n")) {
    const field = line.match(/^\s*([a-z_]+)\s*:\s*(.*)$/);
    if (!field || !CUSTOM_KEYS.has(field[1])) continue;
    if (Object.prototype.hasOwnProperty.call(custom, field[1])) return failure("ODOO_BRIDGE_FORM_METADATA_DUPLICATE");
    custom[field[1]] = field[2].trim();
  }
  if (custom.bridge_source !== "totem_bridge_v1") return failure("ODOO_BRIDGE_FORM_SOURCE_INVALID");
  if (!["salon", "master"].includes(custom.owner_type)) return failure("ODOO_BRIDGE_FORM_OWNER_TYPE_REQUIRED");
  // First release is KG; additional markets are enabled with their format contract.
  if (custom.market_code !== "KG") return failure("ODOO_BRIDGE_FORM_MARKET_UNSUPPORTED");
  const email = text(body.email_from).toLowerCase();
  if (!email) return failure("ODOO_EMAIL_REQUIRED");
  const name = text(body.name);
  if (!name) return failure("ODOO_BRIDGE_FORM_NAME_REQUIRED");
  const master = custom.owner_type === "master";
  const mode = master ? (custom.work_mode || "independent") : null;
  if (master && !["independent", "attached_to_salon"].includes(mode)) return failure("ODOO_BRIDGE_FORM_WORK_MODE_INVALID");
  if (mode === "attached_to_salon" && !custom.salon_slug) return failure("ODOO_BRIDGE_FORM_SALON_REQUIRED");
  return {
    payload: {
      odoo_request_id: `odoo-crm-lead-${relationId(body._id)}`,
      odoo_lead_id: String(relationId(body._id)),
      owner_type: custom.owner_type,
      name,
      salon_name: master ? "" : name,
      email,
      phone: text(body.phone),
      market_code: custom.market_code,
      city: text(body.city),
      address: text(body.street),
      slug_requested: custom.slug_requested || "",
      description: notes.slice(0, start).replace(/[^\n]*\n_{11}\s*\n$/, "").trim(),
      specialization: master ? (custom.specialization || "") : "",
      work_mode: mode,
      salon_slug: mode === "attached_to_salon" ? custom.salon_slug : "",
      comment: "Odoo portal bridge form v1; company=1; team=7",
    },
  };
}
