# SOURCE-ONLY replacement candidate for existing automation 14 / action 1185.
# Odoo Online safe_eval context: records, env, UserError. No imports, SQL,
# network calls, payment or email; no automatic stage82 transition.
# Do not apply live until ACL, actual portal data and CRM concurrency tested.
for us_partner in records:
    if not us_partner or us_partner.company_id.id != 4 or us_partner.website_id.id != 5:
        continue
    if not us_partner.active or us_partner.x_totem_us_profile_status != 'approved':
        continue
    us_kind = us_partner.x_totem_us_account_kind
    if us_kind not in ('salon', 'master'):
        continue
    us_company = env['res.company'].sudo().browse(4).exists()
    us_team = env['crm.team'].sudo().browse(8).exists()
    us_hold = env['crm.stage'].sudo().browse(81).exists()
    if not us_company or not us_team or us_team.company_id.id != 4 or not us_hold or us_team not in us_hold.team_ids:
        raise UserError('TOTEM US: invalid CRM scope')
    us_mode = us_partner.x_totem_us_master_entry_mode if us_kind == 'master' else 'salon'
    if us_mode not in ('salon', 'own_salon', 'existing_salon') or (us_kind == 'master' and us_mode == 'salon'):
        raise UserError('TOTEM US: invalid master entry mode')
    us_email = (us_partner.email or '').strip().lower()
    if not us_email or '@' not in us_email or len(us_email) > 254:
        raise UserError('TOTEM US: invalid email')
    us_slug = False
    us_salon_slug = False
    us_state = False
    us_zip = False
    us_specialty = False
    us_street = False
    us_city = False
    us_desc = False
    if us_mode in ('salon', 'own_salon'):
        us_name = (us_partner.x_totem_us_business_name or '').strip()
        us_phone = (us_partner.x_totem_us_business_phone or '').strip()
        us_street = (us_partner.x_totem_us_business_street or '').strip()
        us_city = (us_partner.x_totem_us_business_city or '').strip()
        us_zip = (us_partner.x_totem_us_business_zip or '').strip()
        us_business_slug = (us_partner.x_totem_us_business_slug or '').strip().lower()
        us_state = us_partner.x_totem_us_business_state_id
        us_desc = (us_partner.x_totem_us_business_description or '').strip()
        if not us_state or us_state.country_id.code != 'US' or not us_name or not us_phone or not us_street or not us_city or not us_zip or not us_business_slug:
            raise UserError('TOTEM US: incomplete business profile')
        us_slug = us_business_slug
        if us_mode == 'own_salon':
            if us_partner.x_totem_us_master_salon_id:
                raise UserError('TOTEM US: own business must not reference another salon')
            us_salon_slug = us_business_slug
    else:
        us_salon = us_partner.x_totem_us_master_salon_id
        if not us_salon or us_salon.id == us_partner.id or not us_salon.active or us_salon.company_id.id != 4 or us_salon.website_id.id != 5 or us_salon.x_totem_us_account_kind != 'salon' or us_salon.x_totem_us_profile_status != 'approved':
            raise UserError('TOTEM US: invalid existing salon')
        us_salon_slug = (us_salon.x_totem_us_business_slug or '').strip().lower()
        if not us_salon_slug:
            raise UserError('TOTEM US: missing target salon slug')
        us_name = (us_partner.name or '').strip()
        us_phone = (us_partner.phone or '').strip()
        us_street = (us_partner.street or '').strip()
        us_city = (us_partner.city or '').strip() or (us_salon.x_totem_us_business_city or '').strip()
        us_desc = (us_partner.x_totem_us_master_bio or '').strip()
    if us_kind == 'master':
        us_slug = (us_partner.x_totem_us_master_slug or '').strip().lower()
        us_specialty = (us_partner.x_totem_us_master_specialty or '').strip()
        if not (us_partner.name or '').strip() or not (us_partner.phone or '').strip() or not us_specialty or not us_slug or us_slug == us_salon_slug:
            raise UserError('TOTEM US: incomplete or conflicting master profile')
    us_key = 'odoo-us-partner-' + str(us_partner.id)
    us_crm = env['crm.lead'].sudo().with_company(us_company).with_context(active_test=False, tracking_disable=True, mail_create_nosubscribe=True, mail_notify_force_send=False)
    # Reject duplicates and key collisions, including archived rows.
    # Odoo on_write serialization / DB unique enforcement still needs live proof.
    us_existing = us_crm.search([('company_id', '=', 4), ('team_id', '=', 8), '|', ('x_totem_us_source_partner_id', '=', us_partner.id), ('x_totem_us_source_key', '=', us_key)], limit=2)
    if len(us_existing) > 1:
        raise UserError('TOTEM US: duplicate CRM source, manual review required')
    if us_existing:
        if not us_existing.active or us_existing.x_totem_us_source_partner_id.id != us_partner.id or us_existing.partner_id.id != us_partner.id or us_existing.x_totem_us_source_key != us_key or us_existing.x_totem_us_source_marker != 'totem_us_portal_approved_v1' or us_existing.x_totem_us_website_id != 5 or us_existing.x_totem_us_owner_type != us_kind:
            raise UserError('TOTEM US: conflicting CRM source')
        # Never overwrite an existing reviewed source or create a second lead.
        continue
    us_values = {
        'name': 'TOTEM US - ' + us_kind + ' - ' + us_name,
        'type': 'lead', 'partner_id': us_partner.id, 'company_id': 4,
        'team_id': 8, 'stage_id': 81,
        'contact_name': us_partner.name or us_name, 'email_from': us_email,
        'phone': us_phone, 'street': us_street or False, 'city': us_city or False,
        'state_id': us_state.id if us_state else False, 'zip': us_zip or False,
        'description': us_desc or False,
        'x_totem_us_source_partner_id': us_partner.id,
        'x_totem_us_source_key': us_key,
        'x_totem_us_source_marker': 'totem_us_portal_approved_v1',
        'x_totem_us_owner_type': us_kind, 'x_totem_us_website_id': 5,
        'x_totem_us_slug_requested': us_slug,
        'x_totem_us_state_code': us_state.code.upper() if us_state else False,
        'x_totem_us_postal_code': us_zip or False,
        'x_totem_us_salon_slug': us_salon_slug or False,
        'x_totem_us_specialization': us_specialty or False,
    }
    us_crm.create(us_values)
