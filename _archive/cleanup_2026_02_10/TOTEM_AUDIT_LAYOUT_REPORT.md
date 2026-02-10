# TOTEM — AUDIT LAYOUT / HEADER / FOOTER (READ-ONLY)

## Meta
- Generated: 2026-02-09 22:30:19
- ODOO_URL: https://totem-platform.odoo.com
- DB: totem-platform
- Login: kantotemus@gmail.com
- UID: 2

## Counts
- websites: 0
- views_dumped: 702

## Aggregated Entrypoints (from layout/header/footer/theme views)
- hrefs: 1
- forms: 0
- onclicks: 0

- HREF: /web/signup

## Websites

## Views (DETAIL) — layout/header/footer/theme first
- kind=layout id=224 key=False name=Document Layout active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <form class="o_document_layout">
                    <group>
                        <group class="o_document_layout_company">
                            <field name="company_id" invisible="1"/>
                            <field name="external_report_layout_id" invisible="1"/>
                            <field name="logo_primary_color" invisible="1"/>
                            <field name="logo_secondary_color" invisible="1"/>
                            <field name="report_layout_id" string="Layout" widget="selection_badge" required="1" options="{'horizontal': true, 'size': 'sm'}"/>
                            <field name="report_tables_id" string="Tables" widget="selection_badge" required="1" options="{'horizontal': true, 'size': 'sm'}"/>
                            <field name="font" string="Text" widget="selection" required="1"/>
                            <field name="logo" string="Logo" widget="image" options="{'size': [0, 50]}"/>

                            <label for="primary_color" string="Colors"/>
                            <div class="o_document_layout_colors d-flex align-items-end mb-4">
                                <field name="primary_color" widget="color" class="w-auto m-0 me-1"/>
                                <field name="secondary_color" widget="color" class="w-auto m-0"/>
                                <a class="o_custom_colors btn btn-secondary btn-sm position-relative ms-2" role="button" title="Reset to logo colors" invisible="not custom_colors">
                                    <i class="fa fa-repeat"/> Reset
                                    <field name="custom_colors" class="position-absolute top-0 start-0 w-100 h-100 opacity-0" nolabel="1"/>
                                </a>
                            </div>

                            <field name="company_details" string="Address" options="{'resizable': false}"/>
                            <field name="report_header" string="Tagline" placeholder="e.g. Global Business Solutions" options="{'resizable': false}"/>
                            <field name="report_footer" placeholder="Write your phone, email, bank account, tax ID, ..." string="Footer" options="{'resizable': false}"/>
                            <field name="paperformat_id" widget="selection" required="1"/>
                        </group>
                        <div class="o_preview">
                            <field name="preview" widget="iframe_wrapper" class="preview_document_layout d-flex justify-content-center mb-0"/>
                        </div>
                    </group>
                    <footer>
                        <button string="Continue" class="btn-primary" type="object" name="document_layout_save" data-hotkey="q"/>
                        <button special="cancel" data-hotkey="x" string="Discard"/>
                    </footer>
                </form>

- kind=layout id=1568 key=appointment.portal_my_home_menu_appointment name=Portal layout : appointment menu entries active=True website=null inherit={"id": 506, "name": "Portal Breadcrumbs"}
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Portal layout : appointment menu entries">
        <xpath expr="//ol[hasclass('o_portal_submenu')]" position="inside">
            <li t-if="page_name == 'appointment' or event" t-attf-class="breadcrumb-item #{'active ' if not event else ''}">
                <a t-if="event" t-attf-href="/my/appointments?{{ keep_query() }}">Appointments</a>
                <t t-else="">Appointments</t>
            </li>
            <li t-if="event" class="breadcrumb-item active">
                <span t-field="event.name"/>
            </li>
        </xpath>
    </data>

- kind=layout id=562 key=digest.digest_mail_layout name=digest_mail_layout active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="digest.digest_mail_layout">
&lt;!DOCTYPE html&gt;
<html xmlns="http://www.w3.org/1999/xhtml">
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <meta name="format-detection" content="telephone=no"/>
        <meta name="viewport" content="width=device-width; initial-scale=1.0; maximum-scale=1.0; user-scalable=no;"/>
        <meta http-equiv="X-UA-Compatible" content="IE=9; IE=8; IE=7; IE=EDGE"/>
        <style type="text/css">
            <t t-set="color_company" t-value="company.email_secondary_color or '#714B67'"/>
            /* Remove space around the email design. */
            html,
            body {
                margin: 0 auto !important;
                padding: 0 !important;
                height: 100% !important;
                width: 100% !important;
                font-family: Arial, Helvetica, Verdana, sans-serif;
            }
            /* Prevent Windows 10 Mail from underlining links. Styles for underlined links should be inline. */
            a {
                text-decoration: none;
            }
            #header_background {
                padding-top:20px;
            }
            #header {
                border-top: 1px solid #d8dadd;
            }
            .global_layout {
                width: 588px;
                margin: 0 auto;
                background-color: #ffffff;
                border-left: 1px solid #d8dadd;
                border-right: 1px solid #d8dadd;
            }
            .company_name {
                display: inline;
                vertical-align: middle;
                color: #878d97;
                font-weight: bold;
                font-size: 24px;
            }
            .header_title {
                color: #374151;
                font-size: 18px;
                word-break: break-all;
            }
            .td_button {
                border-radius: 3px;
                white-space: nowrap;
            }
            .td_button_connect {
                background-color: <t t-out="color_company"/>;
            }
            #button_connect {
                color: #ffffff;
                font-size: 16px;
            }
            #button_open_report {
                color: #007e84;
                font-size: 14px;
            }
            .tip_title {
                margin-top: 0;
                font-weight: bold;
                font-size: 20px;
            }
            .tip_content {
                margin: 0 auto;
                color: #374151;
                text-align: justify;
                text-justify: inter-word;
                margin: 15px auto 0 auto;
                font-size: 16px;
                line-height: 25px;
            }
            .tip_button {
                background-color: <t t-out="color_company"/>;
                border-radius: 3px;
                padding: 10px;
                text-decoration: none;
            }
            .tip_button_text {
                color: #ffffff;
            }
            .illustration_border {
                width: 100%;
                border: 1px solid #d8dadd;
                margin-top: 20px;
            }
            .kpi_row_footer {
                padding-bottom: 20px;
            }
            .kpi_header {
                font-size: 14px;
                font-weight: bold;
                color: #374151;
            }
            .kpi_header_icon {
                width: 2em;
                height: 2em;
                vertical-align: middle;
            }
            .kpi_cell {
                width: 33%;
                text-align: center;
                padding-top: 10px;
                padding: 0;
            }
            .kpi_value {
                color: #374151;
                font-weight: bold;
                text-decoration: none;
                font-size: 28px;
            }
            .kpi_border_col {
                color: #374151;
            }
            .kpi_value_label {
                display: inline-block;
                margin-bottom: 10px;
                color: #878d97;
                font-size: 14px;
            }
            .kpi_margin_margin {
                margin-bottom: 10px;
            }
            .download_app {
                margin-bottom: 5px;
                display: inline-block;
            }
            .preference {
                margin-bottom: 15px;
                color: #374151;
                font-size: 14px;
            }
            .by_odoo {
                color: #878d97;
                font-size: 12px;
            }
            .odoo_link_text {
                font-weight: bold;
                color: <t t-out="color_company"/>;
            }
            .run_business {
                color: #374151;
                margin: 15px auto;
                font-size: 18px;
            }
            #footer {
                background-color: #F9FAFB;
                color: #878d97;
                text-align: center;
                font-size: 20px;
                border: 1px solid #F9FAFB;
                border-top: 0;
            }
            #stock_tip {
                overflow: auto;
                margin-top: 20px;
            }
            #stock_div_img {
                text-align: center;
            }
            #stock_img {
                width: 70%;
            }
            @media only screen and (max-width: 650px) {
                .global_layout {
                    width: 100% !important;
                }
                .d-block {
                    display: block !important;
                }
                #header_background {
                    padding-top: 0px;
                }
                #header {
                    padding: 15px 20px;
                    border: 1px solid #F9FAFB;
                }
                .company_name {
                    font-size: 15px;
                }
                .header_title {
                    margin: 5px auto;
  …

- kind=layout id=1637 key=knowledge.knowledge_mail_notification_layout name=knowledge_mail_notification_layout active=True website=null inherit={"id": 401, "name": "Mail: mail notification layout template"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
        <xpath expr="//div[@t-out='message.body']" position="replace">
            <span style="margin-bottom: 16px; font-size: 13px;"><t t-out="message.author_id.name"/> mentioned you in a comment:</span>
            <table style="padding-top: 16px">
                <tr style="padding-bottom: 0px; padding-top: 16px">
                    <td>
                        <div style="font-size: small; font-weight:bolder; padding-left: 8px;" t-out="message.author_id.name"/>
                    </td>
                </tr>
                <tr>
                    <td style="margin-left: 8px; padding-left: 8px; padding-right: 8px;">
                        <div t-out="message.body"/>
                    </td>
                </tr>
            </table>
        </xpath>
    <xpath expr="." position="attributes"><attribute name="t-name">knowledge.knowledge_mail_notification_layout</attribute></xpath></data>

- kind=layout id=401 key=mail.mail_notification_layout name=Mail: mail notification layout template active=True website=null inherit=null
  signals: hrefs_total=5 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Mail: mail notification layout template" t-name="mail.mail_notification_layout">
<html t-att-lang="lang">
<head>
    <meta http-equiv="Content-Type" content="text/html charset=UTF-8"/>
</head>
<body style="font-family:Verdana, Arial,sans-serif; color: #454748;">
<t t-set="subtype_internal" t-value="subtype and subtype.internal"/>
<t t-set="show_header" t-value="email_notification_force_header or (     email_notification_allow_header and has_button_access)"/>
<t t-set="show_footer" t-value="email_notification_force_footer or (     email_notification_allow_footer and show_header and author_user and author_user._is_internal())"/>
<t t-set="subtitles_highlight_index" t-value="subtitles_highlight_index or 0"/>
<!-- HEADER -->
<t t-call="mail.notification_preview"/>
<div style="max-width: 900px; width: 100%;">
<div t-if="show_header and has_button_access" itemscope="itemscope" itemtype="http://schema.org/EmailMessage">
    <div itemprop="potentialAction" itemscope="itemscope" itemtype="http://schema.org/ViewAction">
        <link itemprop="target" t-att-href="button_access['url']"/>
        <link itemprop="url" t-att-href="button_access['url']"/>
        <meta itemprop="name" t-att-content="button_access['title']"/>
    </div>
</div>
<div t-if="show_header and (subtitles or has_button_access or not is_discussion)" summary="o_mail_notification" style="padding: 0px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin-top: 5px;">
        <tbody>
            <tr>
                <td valign="center" style="white-space:nowrap;">
                    <table cellspacing="0" cellpadding="0" border="0">
                        <tbody>
                            <tr>
                                <td t-if="has_button_access" t-att-style="'border-radius: 3px; text-align: center; background: ' + (company.email_secondary_color or '#875A7B') + ';'">
                                    <a t-att-href="button_access['url']" t-att-style="'font-size: 12px; color: ' + (company.email_primary_color or '#FFFFFF') + '; display: block; padding: 8px 12px 11px; text-decoration: none !important; font-weight: bold;'">
                                        <t t-out="button_access['title']"/>
                                    </a>
                                </td>
                                <td t-if="has_button_access">&amp;nbsp;&amp;nbsp;</td>
                                <td t-if="subtitles" style="font-size: 12px;">
                                    <t t-foreach="subtitles" t-as="subtitle">
                                        <span t-out="subtitle" t-attf-style="{{                                             'font-size: 20px; font-weight: bold;' if subtitles_highlight_index == subtitle_index and subtitle_index &gt; 0                                             else 'font-weight:bold;' if subtitles_highlight_index == subtitle_index and subtitle_index == 0 else ''}}"/>
                                        <br t-if="not subtitle_last"/>
                                    </t>
                                </td>
                                <td t-else=""><span style="font-weight:bold;" t-out="record_name or (message.record_name and message.record_name.replace('/','-')) or ''"/><br/></td>

                            </tr>
                        </tbody>
                    </table>
                </td>
            </tr>
            <tr>
                <td valign="center">
                    <hr width="100%" style="background-color:rgb(204,204,204);border:medium none;clear:both;display:block;font-size:0px;min-height:1px;line-height:0;margin: 10px 0px;"/>
                </td>
            </tr>
        </tbody>
    </table>
</div>
<!-- CONTENT -->
<div t-out="message.body" style="font-size: 13px;"/>
<ul t-if="tracking_values">
    <t t-foreach="tracking_values" t-as="tracking">
        <li><t t-out="tracking[0]"/>: <t t-if="tracking[1]" t-out="tracking[1]"/><em t-else="">None</em> → <t t-if="tracking[2]" t-out="tracking[2]"/><em t-else="">None</em></li>
    </t>
</ul>
<t name="o_signature">
    <div t-if="email_add_signature and not is_html_empty(signature)" t-out="signature" class="o_signature" style="font-size: 13px;"/>
</t>
<!-- FOOTER -->
<div t-if="show_footer" style="margin-top:16px;">
    <hr width="100%" style="background-color:rgb(204,204,204);border:medium none;clear:both;display:block;font-size:0px;min-height:1px;line-height:0; margin: 16px 0px 4px 0px;"/>
    <b t-out="company.name" style="font-size:11px;"/><br/>
    <p style="color: #999999; margin-top:2px; font-size:11px;">
        <t t-out="company.phone"/>
        <t t-if="company.email and company.phone"> |</t>
        <a t-if="company.email" t-att-href="'mailto:%s' % company.email" style="text-decoration:none; color: #999999;" t-out="company.email"/>
        <t t-if="company.website and (company.phone or company.email)"> |</t>
        <a t-if="company.website" t-att-href="'%s' % company.website" style="text-decoration:none; color: #999999;" t-out="company.website"/>
    </p>
</div>
<div t-if="show_footer" style="color: #555555; font-size:11px;">
    Powered by <a target="_blank" href="https://www.odoo.com?utm_source=db&amp;utm_medium=email" t-attf-style="color: {{company.email_secondary_color or '#875A7B'}};">Odoo</a>
    <span t-if="show_unfollow" id="mail_unfollow">
        | <a href="/mail/unfollow" style="text-decoration:none; color:#555555;">Unfollow</a>
    </span>
</div>
</div>
</body></html>
        </t>

- kind=layout id=404 key=mail.mail_notification_layout_with_responsible_signature name=Mail: mail notification layout with responsible signature (user_id of the record) active=True website=null inherit={"id": 401, "name": "Mail: mail notification layout template"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Mail: mail notification layout with responsible signature (user_id of the record)">
            <xpath expr="//t[@name='o_signature']" position="replace">
                <t name="o_signature">
                    <div t-if="email_add_signature and record and 'user_id' in record and record.user_id and not record.env.user._is_superuser() and not is_html_empty(record.user_id.sudo().signature)" t-out="record.user_id.sudo().signature" class="o_signature" style="font-size: 13px;"/>
                </t>
            </xpath>
        <xpath expr="." position="attributes"><attribute name="t-name">mail.mail_notification_layout_with_responsible_signature</attribute></xpath></data>

- kind=layout id=424 key=mail.public_layout name=mail.public_layout active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="mail.public_layout">
        <t t-call="web.layout">
            <t t-set="html_data" t-value="{'style': 'height: 100%;'}"/>
            <t t-set="head">
                <t t-call-assets="web.assets_frontend" t-js="false"/>
                <title t-translation="off">
                    <t t-if="additional_title"><t t-out="additional_title"/> | </t><t t-out="res_company.name"/>
                </title>
            </t>
            <t t-out="0"/>
        </t>
    </t>

- kind=layout id=1984 key=planning.frontend_layout name=Planning Frontend Layout active=True website=null inherit={"id": 187, "name": "Frontend Layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Planning Frontend Layout">
        <xpath expr="//t[@t-call='web.brand_promotion']" position="replace">
            <t t-call="planning.brand_promotion"/>
        </xpath>
    <xpath expr="." position="attributes"><attribute name="t-name">planning.frontend_layout</attribute></xpath></data>

- kind=layout id=502 key=portal.frontend_layout name=Main Frontend Layout active=True website=null inherit={"id": 187, "name": "Frontend Layout"}
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Main Frontend Layout">
        <xpath expr="//body" position="before">
            <t t-set="classname_from_template" t-value="(' o_' + response_template.replace('.', '_')) if isinstance(response_template, str) else 'o_id_' + str(response_template) if response_template else ''"/>
            <t t-set="body_classname" t-valuef="{{body_classname}}{{classname_from_template}}"/>
        </xpath>
        <xpath expr="//div[@id='wrapwrap']" position="attributes">
            <attribute name="t-attf-class" add="#{request.env['res.lang']._get_data(code=request.env.lang).direction == 'rtl' and 'o_rtl' or ''}" separator=" "/>
            <attribute name="t-attf-class" add="#{'o_portal' if is_portal else ''}" separator=" "/>
        </xpath>
        <xpath expr="//div[@id='wrapwrap']/header" position="before">
            <a class="o_skip_to_content btn btn-primary rounded-0 visually-hidden-focusable position-absolute start-0" href="#wrap" groups="!base.group_user">Skip to Content</a>
        </xpath>
        <xpath expr="//div[@id='wrapwrap']/header/img" position="replace">
            <nav class="navbar navbar-expand navbar-light bg-light">
                <div class="container">
                    <a href="/" class="navbar-brand logo">
                        <img t-att-src="'/logo.png?company=%s' % res_company.id" t-att-alt="'Logo of %s' % res_company.name" t-att-title="res_company.name"/>
                    </a>
                    <ul id="top_menu" class="nav navbar-nav ms-auto">
                        <t t-call="portal.placeholder_user_sign_in">
                            <t t-set="_item_class" t-value="'nav-item'"/>
                            <t t-set="_link_class" t-value="'nav-link'"/>
                        </t>
                        <t t-call="portal.user_dropdown">
                            <t t-set="_user_name" t-value="true"/>
                            <t t-set="_item_class" t-value="'nav-item dropdown'"/>
                            <t t-set="_link_class" t-value="'nav-link'"/>
                            <t t-set="_dropdown_menu_class" t-value="'dropdown-menu-end'"/>
                        </t>
                    </ul>
                </div>
            </nav>
        </xpath>
        <xpath expr="//div[@id='wrapwrap']/main/t[@t-out='0']" position="before">
            <div t-if="o_portal_fullwidth_alert" class="container mt-3">
                <div class="alert alert-info alert-dismissible fade show d-print-none css_editable_mode_hidden">
                    <t t-out="o_portal_fullwidth_alert"/>
                </div>
            </div>
        </xpath>
        <xpath expr="//head/meta" position="after">
            <t t-if="preview_object">
                <!-- Remove seo_object to not define og and twitter tags twice when wesbite is installed -->
                <t t-set="seo_object" t-value="False"/>
                <t t-set="company" t-value="preview_object.company_id or request.env.company"/>
                <t t-set="not_uses_default_logo" t-value="company and not company.uses_default_logo"/>
                <meta property="og:title" t-att-content="preview_object.name"/>
                <meta property="og:description" t-att-content="preview_object.description.striptags() if preview_object.description else ''"/>
                <meta property="og:site_name" t-att-content="company.name if company else ''"/>
                <t t-if="not_uses_default_logo">
                    <meta property="og:image" t-attf-content="/web/binary/company_logo?company={{ company.id }}"/>
                </t>
                <meta property="og:image:width" content="300"/>
                <meta property="og:image:height" content="200"/>
                <meta name="twitter:card" content="summary_large_image"/>
            </t>
        </xpath>
    </data>

- kind=layout id=508 key=portal.portal_layout name=Portal Layout active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Portal Layout" t-name="portal.portal_layout">
        <t t-call="portal.frontend_layout">
            <t t-set="is_portal" t-value="True"/>

            <div t-if="not no_breadcrumbs and not my_details and not breadcrumbs_searchbar" class="o_portal container mt-3">
                <div class="d-flex justify-content-between align-items-center flex-wrap">
                    <t t-call="portal.portal_breadcrumbs"/>
                    <t t-if="prev_record or next_record" t-call="portal.record_pager"/>
                </div>
            </div>
            <div id="wrap" class="o_portal_wrap" data-name="My Account">
                <div class="container pt-3 pb-5">
                    <t t-if="my_details">
                        <div class="wrapper col-12 d-flex flex-wrap justify-content-between align-items-center">
                            <h3 class="my-3">My account</h3>
                            <button class="btn py-0 d-flex align-items-center gap-2 d-lg-none ms-auto" data-bs-toggle="offcanvas" data-bs-target="#accountOffCanvas">
                                <img class="o_avatar rounded" t-att-src="image_data_uri(user_id.partner_id.avatar_1024)" alt="Contact"/>
                            </button>
                        </div>
                        <div class="row justify-content-between">
                            <div t-attf-class="o_portal_content col-12 col-lg-8 mb-5">
                                <t t-out="0"/>
                            </div>
                            <div class="d-none d-lg-flex justify-content-end col-lg-4">
                                <t t-call="portal.side_content"/>
                            </div>
                            <div class="offcanvas offcanvas-start d-lg-none" id="accountOffCanvas">
                                <t t-call="portal.side_content">
                                    <t t-set="isOffcanvas" t-value="true"/>
                                </t>
                            </div>
                        </div>
                    </t>
                    <t t-else="">
                        <t t-out="0"/>
                    </t>
                </div>
            </div>
        </t>
    </t>

- kind=layout id=1769 key=project.portal_layout name=Portal layout: project menu entry active=True website=null inherit={"id": 506, "name": "Portal Breadcrumbs"}
  signals: hrefs_total=6 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Portal layout: project menu entry">
        <xpath expr="//ol[hasclass('o_portal_submenu')]" position="inside">
            <li t-if="page_name == 'project' or project" class="col-lg-2" t-attf-class="breadcrumb-item #{'active ' if not project else ''}">
                <a t-if="project" t-attf-href="/my/projects">Projects</a>
                <t t-else="">Projects</t>
            </li>
            <li t-if="page_name in ['project_task', 'project_subtasks', 'project_recurrent_tasks'] and project" class="breadcrumb-item active">
                <a t-if="project" t-attf-href="/my/projects/{{ project.id }}?{{ keep_query() }}"><t t-out="project.name"/></a>
            </li>
            <li t-elif="project" t-attf-class="breadcrumb-item #{'active ' if not project else ''} text-truncate col-8 col-lg-10">
                <t t-out="project.name"/>
            </li>
            <li t-if="page_name == 'task' or (task and not project)" t-attf-class="breadcrumb-item #{'active ' if not task else ''}">
                <a t-if="task" t-attf-href="/my/tasks?{{ keep_query() }}">Tasks</a>
                <t t-else="">Tasks</t>
            </li>
            <li t-if="page_name == 'project_subtasks' and task and project" class="breadcrumb-item active">
                <a t-attf-href="/my/projects/{{ project.id }}/task/{{ task.id }}"><t t-out="task.name"/></a>
            </li>
            <li t-elif="page_name == 'project_recurrent_tasks' and task and project" class="breadcrumb-item active text-truncate">
                <a t-attf-href="/my/projects/{{ project.id }}/task/{{ task.id }}?{{ keep_query() }}"><t t-out="task.name"/></a>
            </li>
            <li t-elif="task" class="breadcrumb-item active text-break">
                <span t-field="task.name"/>
            </li>
            <li t-if="page_name == 'project_subtasks' or (task and subtask and project)" t-attf-class="breadcrumb-item text-truncate #{'active ' if not subtask else ''}">
                <a t-if="subtask" t-attf-href="/my/tasks/{{ task.id }}/subtasks?{{ keep_query() }}">Sub-tasks</a>
                <t t-else="">Sub-tasks</t>
            </li>
            <li t-elif="page_name == 'project_recurrent_tasks' and task and project" t-attf-class="breadcrumb-item text-truncate">
                Recurrent tasks
            </li>
            <li t-if="subtask" class="breadcrumb-item active text-break">
                <span t-field="subtask.name"/>
            </li>
        </xpath>
    </data>

- kind=layout id=1778 key=project.task_link_preview_portal_layout name=task_link_preview_portal_layout active=True website=null inherit={"id": 508, "name": "Portal Layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
        <xpath expr="//t[@t-call='portal.frontend_layout']" position="attributes">
            <attribute name="t-call">project.task_link_preview_front_end</attribute>
        </xpath>
    <xpath expr="." position="attributes"><attribute name="t-name">project.task_link_preview_portal_layout</attribute></xpath></data>

- kind=layout id=1501 key=sign.portal_my_home_menu_sign name=Portal layout : sign menu entries active=True website=null inherit={"id": 506, "name": "Portal Breadcrumbs"}
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Portal layout : sign menu entries">
        <xpath expr="//ol[hasclass('o_portal_submenu')]" position="inside">
            <li t-if="page_name == 'signatures' or my_sign_item" t-attf-class="breadcrumb-item #{'active ' if not sign_requests else ''}">
                <a t-if="my_sign_item" t-attf-href="/my/signatures?{{ keep_query() }}">Signature requests</a>
                <t t-else="">Signature requests</t>
            </li>
            <li t-if="my_sign_item" class="breadcrumb-item active">
                <span t-field="my_sign_item.reference"/>
            </li>
        </xpath>
    </data>

- kind=layout id=557 key=snailmail.minimal_layout name=minimal_layout active=True website=null inherit={"id": 205, "name": "minimal_layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
        <xpath expr="//head" position="inside">
            <t t-if="env and env.context.get('snailmail_layout')" t-call-assets="snailmail.report_assets_snailmail" t-autoprefix="true"/>
        </xpath>
    </data>

- kind=layout id=556 key=snailmail.report_layout name=report_layout active=True website=null inherit={"id": 200, "name": "Report layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
        <xpath expr="//head" position="inside">
            <t t-if="env and env.context.get('snailmail_layout')" t-call-assets="snailmail.report_assets_snailmail" t-autoprefix="true"/>
        </xpath>
    </data>

- kind=layout id=2104 key=spreadsheet.public_spreadsheet_layout name=Public spreadsheet layout active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Public spreadsheet layout" t-name="spreadsheet.public_spreadsheet_layout">
    <t t-call="web.layout">
        <t t-set="head">
            <script>
                odoo.__session_info__ = <t t-out="json.dumps(session_info)"/>;
                odoo.__session_info__.spreadsheet_public_props = <t t-out="json.dumps(props)"/>;
            </script>
            <t t-call-assets="spreadsheet.public_spreadsheet"/>
        </t>
        <div class="d-flex flex-column justify-content vh-100 o-public-spreadsheet">
            <header class="container-fluid p-0 d-flex align-items-center justify-content-between border-bottom">
                <div t-out="spreadsheet_name" class="text-primary fw-bold ps-3"/>
                <div class="fst-italic flex-fill ps-3">
                    <t t-if="is_frozen">Frozen and copied on <span t-field="share.create_date"/></t>
                    <div class="d-inline-flex" t-if="props['downloadExcelUrl']">
                        <a class="btn btn-secondary o_download_btn" t-att-href="props['downloadExcelUrl']" title="Download"><i class="fa fa-download"/></a>
                    </div>
                </div>
                <div class="nav d-table my-auto">
                    <t t-call="portal.user_dropdown">
                        <t t-set="_user_name" t-value="True"/>
                        <t t-set="_item_class" t-valuef="nav-item d-table-cell text-center"/>
                        <t t-set="_link_class" t-valuef="nav-link fw-bold"/>
                    </t>
                    <t t-call="portal.user_sign_in_redirect">
                        <t t-set="_item_class" t-valuef="nav-item d-table-cell text-center"/>
                        <t t-set="_link_class" t-valuef="nav-link fw-bold"/>
                    </t>
                </div>
            </header>
            <main id="spreadsheet-mount-anchor" class="flex-fill"/>
        </div>
    </t>
</t>

- kind=layout id=2170 key=spreadsheet_edition.mail_notification_layout name=mail_notification_layout active=True website=null inherit={"id": 401, "name": "Mail: mail notification layout template"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
            <xpath expr="//div[@t-out='message.body']" position="replace">
                <span style="margin-bottom: 16px; font-size: 13px;"><t t-out="message.author_id.name"/> mentioned you in a comment:</span>
                <table style="padding-top: 16px">
                    <tr style="padding-bottom: 0px; padding-top: 16px">
                        <td>
                            <div style="font-size: small; font-weight:bolder; padding-left: 8px;" t-out="message.author_id.name"/>
                        </td>
                    </tr>
                    <tr>
                        <td style="margin-left: 8px; padding-left: 8px; padding-right: 8px;">
                            <div t-out="message.body"/>
                        </td>
                    </tr>
                </table>
            </xpath>
        <xpath expr="." position="attributes"><attribute name="t-name">spreadsheet_edition.mail_notification_layout</attribute></xpath></data>

- kind=layout id=1821 key=survey.layout name=Survey Layout active=True website=null inherit={"id": 187, "name": "Frontend Layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Survey Layout">
        <xpath expr="//head" position="before">
            <!--TODO DBE Fix me : If one day, there is a survey_livechat bridge module, put this in that module-->
            <t t-set="no_livechat" t-value="True"/>
        </xpath>
        <xpath expr="//div[@id='wrapwrap']" position="attributes">
            <attribute name="t-att-style" add="(('background-image: url(' + question.background_image_url + ');')                              if question and question.background_image_url                              else ('background-image: url(' + page.background_image_url + ');')                              if page and page.background_image_url                              else ('background-image: url(' + survey.background_image_url + ');')                              if survey and survey.background_image_url and not survey_data                              else '')"/>
            <attribute name="t-att-class" add="(('o_survey_background o_survey_background_shadow')                              if (question and question.background_image_url)                              or (page and page.background_image_url)                              or (survey and survey.background_image_url)                              else 'o_survey_background')" separator=" "/>
        </xpath>
        <xpath expr="//head/t[@t-call-assets][last()]" position="after">
            <t t-call-assets="survey.survey_assets" lazy_load="True"/>
        </xpath>
        <xpath expr="//header" position="before">
            <t t-set="no_header" t-value="True"/>
            <t t-set="no_footer" t-value="True"/>
        </xpath>
        <xpath expr="//header" position="after">
            <div id="wrap" class="oe_structure oe_empty"/>
        </xpath>
        <xpath expr="//footer" position="after">
            <div class="py-3 m-0 p-0 text-end">
                <div class="o_survey_progress_wrapper d-inline-block pe-1 text-start">
                    <t t-if="survey and survey.questions_layout != 'one_page' and answer and answer.state == 'in_progress' and (not question or not question.is_page) and not survey_form_readonly">
                        <t t-if="survey.questions_layout == 'page_per_section'">
                            <t t-set="page_ids" t-value="survey.page_ids.ids"/>
                            <t t-set="page_number" t-value="page_ids.index(page.id) + (1 if survey.progression_mode == 'number' else 0)"/>
                        </t>
                        <t t-else="">
                            <t t-if="not answer.is_session_answer and survey.questions_selection == 'random'" t-set="page_ids" t-value="answer.predefined_question_ids.ids"/>
                            <t t-else="" t-set="page_ids" t-value="survey.question_ids.ids"/>
                            <t t-set="page_number" t-value="page_ids.index(question.id)"/>
                        </t>
                        <t t-call="survey.survey_progression"/>
                    </t>
                </div>
                <div class="o_survey_brand_message float-end rounded me-3 border">
                    <div class="px-2 py-2 d-inline-block">
                        <t t-call="web.brand_promotion_message" _message.f="" _utm_medium.f="survey"/>
                    </div>
                    <div t-if="not no_survey_navigation" class="o_survey_navigation_wrapper d-inline-block d-print-none">
                        <t t-call="survey.survey_navigation"/>
                    </div>
                </div>
            </div>
        </xpath>
    <xpath expr="." position="attributes"><attribute name="t-name">survey.layout</attribute></xpath></data>

- kind=layout id=206 key=web.address_layout name=address_layout active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.address_layout">
        <t t-set="colclass" t-value="('col-sm-5' if report_type == 'html' else 'col-5') + ' ms-auto'"/>
        <div t-if="address" t-attf-class="address row {{custom_address_spacing or 'mb-4'}}" title="This block is not always present depending on the printed document.">
            <t t-if="information_block">
                <t t-set="colclass" t-value="'col-5 offset-1'"/>
                <div name="information_block" class="col-6">
                    <t t-out="information_block or None">
                        <div class="bg-light border-1 rounded h-100 d-flex flex-column align-items-center justify-content-center p-4 opacity-75 text-muted text-center">
                            <strong>Information block</strong>
                            <div>Usually contains a source address or a complementary address.</div>
                        </div>
                    </t>
                </div>
            </t>

            <div name="address" t-att-class="not custom_layout_address and colclass or information_block and colclass">
                <t t-out="address or None">
                    <div class="bg-light border-1 rounded h-100 d-flex flex-column align-items-center justify-content-center p-4 opacity-75 text-muted text-center">
                        <strong>Address block</strong>
                        <div>Usually contains the address of the document's recipient.</div>
                    </div>
                </t>
            </div>
        </div>
        <div class="oe_structure" t-else=""/>
    </t>

- kind=layout id=219 key=web.basic_layout name=basic_layout active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.basic_layout">
        <t t-call="web.html_container">
            <t t-if="not o" t-set="o" t-value="doc"/>
            <div class="article" t-att-data-oe-model="o and o._name" t-att-data-oe-id="o and o.id" t-att-data-oe-lang="o and o.env.context.get('lang')">
                <t t-out="0"/>
            </div>
        </t>
    </t>

- kind=layout id=217 key=web.external_layout name=external_layout active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.external_layout">
        <t t-if="not o" t-set="o" t-value="doc"/>

        <t t-if="not company">
            <!-- Multicompany -->
            <t t-if="company_id">
                <t t-set="company" t-value="company_id"/>
            </t>
            <t t-elif="o and 'company_id' in o and o.company_id.sudo()">
                <t t-set="company" t-value="o.company_id.sudo()"/>
            </t>
            <t t-else="else">
                <t t-set="company" t-value="res_company"/>
            </t>
        </t>

        <t t-if="company.external_report_layout_id" t-call="{{company.external_report_layout_id.sudo().key}}">
            <t t-out="0"/>
        </t>
        <t t-else="" t-call="web.external_layout_standard">
            <t t-out="0"/>
        </t>
    </t>

- kind=layout id=209 key=web.external_layout_body name=external_layout_body active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.external_layout_body">
        <t t-set="external_layout_body_style_classes" t-value="                 company.report_tables_id == 'light' and 'o_report_layout_standard o_table_standard' or                 company.report_tables_id == 'bold' and 'o_report_layout_bold o_table_bold' or                 company.report_tables_id == 'boxed' and 'o_report_layout_boxed o_table_boxed' or                 company.report_tables_id == 'striped' and 'o_report_layout_striped o_table_striped' or                 company.report_tables_id == 'bubble' and 'o_report_layout_bubble o_table_boxed-rounded' or                 company.report_tables_id == 'column' and 'o_report_layout_column o_table_column' or ''             "/>
        <div t-attf-class="o_company_#{company.id}_layout article {{external_layout_body_style_classes}} {{snail_mail_compatible and 'o_snail_mail' or ''}}" t-att-data-oe-model="o and o._name" t-att-data-oe-id="o and o.id" t-att-data-oe-lang="o and o.env.context.get('lang')">
            <t t-if="customized_address_layout" t-out="customized_address_layout"/>
            <t t-elif="not hide_recipient_address" t-call="web.address_layout"/>

            <!-- Required for multiple invoice sending, the heading tag in the
                body is used to identify invoices -->
            <h3 t-if="report_type == 'pdf'" t-out="layout_document_title" class="opacity-0 mb-0 h-0"/>
            <h2 t-if="not hide_title" t-out="layout_document_title"/>
            <t t-out="0"/>
        </div>
    </t>

- kind=layout id=212 key=web.external_layout_bubble name=external_layout_bubble active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.external_layout_bubble">
        <div t-attf-class="o_company_#{company.id}_layout header {{report_type == 'pdf' and 'pt-5'}}">
            <svg xmlns="http://www.w3.org/2000/svg" t-attf-class="o_shape_bubble_1 z-n1 {{report_type == 'pdf' and 'position-fixed' or 'position-absolute'}}" width="1100" height="1100">
                <circle cx="550" cy="550" r="550" t-att-fill="company.primary_color" fill-opacity=".1"/>
            </svg>
            <table class="o_ignore_layout_styling table table-borderless mb-0">
                <tbody>
                    <tr>
                        <td t-if="company.report_header" class="o_company_tagline fw-bold p-0 pe-2">
                            <span t-field="company.report_header">
                                Company tagline
                            </span>
                        </td>
                        <td class="p-0 text-end">
                            <img t-if="company.logo" class="o_company_logo mb-2" t-att-src="image_data_uri(company.logo)" alt="Logo"/>
                            <div name="company_address">
                                <t t-call="web.company_address_list"/>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <t t-call="web.external_layout_body">
            <t t-set="hide_title" t-value="True"/>
            <t t-set="customized_address_layout">
                <table class="o_ignore_layout_styling table table-borderless mb-0">
                    <tbody>
                        <tr>
                            <td t-attf-class="p-0 {{'pt-3' if information_block else ''}}">
                                <t t-call="web.address_layout" custom_layout_address="True"/>
                            </td>
                            <td t-if="not information_block" class="align-bottom p-0 ps-2">
                                <h2 class="mb-4 text-nowrap text-end" t-out="layout_document_title"/>
                            </td>
                        </tr>
                        <tr t-if="information_block">
                            <td colspan="2" class="align-bottom p-0">
                                <h2 class="text-nowrap text-end" t-out="layout_document_title"/>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </t>
            <t t-out="0"/>
        </t>
        <div t-attf-class="footer o_company_#{company.id}_layout {{report_type != 'pdf' and 'position-relative mt-auto mx-n5'}}">
            <svg xmlns="http://www.w3.org/2000/svg" t-attf-class="{{report_type == 'pdf' and 'position-fixed start-0'}}" width="500" height="228" viewBox="0 0 500 228" fill="none">
                <path d="M500 228H0V6.52743C26.3323 2.23278 53.3561 0 80.9008 0C256.522 0 410.969 90.7656 500 228Z" t-att-fill="company.secondary_color" fill-opacity=".1"/>
            </svg>
            <t t-call="web.external_layout_footer_content" is_centered_footer="True" footer_content_classes="(report_type != 'pdf' and 'position-absolute end-0 start-0 bottom-0 mx-5' or '') + ' pt-4 text-center'"/>
        </div>
    </t>

- kind=layout id=214 key=web.external_layout_center name=external_layout_center active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.external_layout_center">
        <div t-attf-class="o_company_#{company.id}_layout header">
            <div class="o_layout_center_header">
                <table class="w-100 table-borderless">
                    <tr>
                        <td class="align-top" style="width: 33.33%;">
                            <t t-call="web.company_address_list"/>
                        </td>
                        <td class="align-top text-center" style="width: 33.33%;">
                            <img t-if="company.logo" class="o_company_logo_mid mb-2" t-att-src="image_data_uri(company.logo)" alt="Logo"/>
                            <div t-if="company.report_header" t-field="company.report_header" class="o_company_tagline fw-bold">Company tagline</div>
                        </td>
                        <td class="align-top text-end" style="width: 33.33%;">
                            <t t-call="web.address_layout" custom_layout_address="True" information_block="False" custom_address_spacing="'mb-0'"/>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
        <t t-call="web.external_layout_body" hide_recipient_address="True" hide_title="True">
            <div class="mb-3" t-if="information_block" t-out="information_block"/>
            <h2 t-out="layout_document_title"/>
            <t t-out="0"/>
        </t>
        <div t-attf-class="footer o_company_#{company.id}_layout {{report_type != 'pdf' and 'mt-auto'}}">
            <t t-call="web.external_layout_footer_content" is_centered_footer="True" footer_content_classes="'text-center'"/>
        </div>
    </t>

- kind=layout id=215 key=web.external_layout_dual name=external_layout_dual active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.external_layout_dual">
        <div t-attf-class="o_company_#{company.id}_layout o_layout_dual_header header">
            <svg xmlns="http://www.w3.org/2000/svg" class="position-absolute start-0 top-0 z-n1" width="100%" height="60" preserveAspectRatio="none" viewBox="0 0 1000 60" fill="none">
                <path d="M0 0h1000v16L0 60z" t-att-fill="company.primary_color" fill-opacity=".15"/>
            </svg>
            <svg xmlns="http://www.w3.org/2000/svg" class="position-absolute start-0 top-0 z-n1" width="70" height="140" preserveAspectRatio="none" viewBox="0 0 80 160" fill="none">
                <path d="M0 0h80L0 160z" t-att-fill="company.secondary_color" fill-opacity=".15"/>
            </svg>
            <table class="w-100 table-borderless">
                <tr>
                    <td class="align-top pe-2">
                        <img t-if="company.logo" class="o_company_logo_big" t-att-src="image_data_uri(company.logo)" alt="Logo"/>
                    </td>
                    <td class="align-top ps-2 text-end">
                        <t t-call="web.company_address_list"/>
                    </td>
                </tr>
            </table>
        </div>
        <t t-call="web.external_layout_body" custom_layout_address="True">
            <t t-out="0"/>
        </t>
        <div t-attf-class="o_company_#{company.id}_layout o_layout_dual_footer footer position-relative {{report_type != 'pdf' and 'position-relative mt-auto mx-n5'}}">
            <svg xmlns="http://www.w3.org/2000/svg" t-attf-class="{{report_type == 'pdf' and 'position-fixed o_dual_shape_1' or 'position-absolute bottom-0'}} start-0" width="100%" height="60" preserveAspectRatio="none" viewBox="0 0 1000 60" fill="none">
                <path d="M0 0h1000v16L0 60z" t-att-fill="company.primary_color" fill-opacity=".15" transform="rotate(180 500 30)"/>
            </svg>
            <svg xmlns="http://www.w3.org/2000/svg" t-attf-class="{{report_type == 'pdf' and 'position-fixed' or 'position-absolute bottom-0'}} end-0" width="70" height="140" preserveAspectRatio="none" viewBox="0 0 80 160" fill="none">
                <path d="M0 0h80L0 160z" t-att-fill="company.secondary_color" fill-opacity=".15" transform="rotate(180 40 80)"/>
            </svg>
            <t t-call="web.external_layout_footer_content" footer_content_classes="(report_type != 'pdf' and 'mx-5' or '')" is_tagline_footer="True"/>
        </div>
    </t>

- kind=layout id=213 key=web.external_layout_folder name=external_layout_folder active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.external_layout_folder">
        <t t-set="header_shape_height" t-value="'174'"/>
        <div t-attf-class="o_company_#{company.id}_layout header {{report_type != 'pdf' and 'h-0'}}">
            <div class="o_folder_header_container position-absolute start-0 top-0 z-n1 w-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="100%" t-att-height="header_shape_height" fill="none" preserveAspectRatio="none">
                    <rect width="100%" t-att-height="header_shape_height"/>
                </svg>
                <div class="o_folder_adaptative_shape d-flex flex-start position-relative">
                    <svg xmlns="http://www.w3.org/2000/svg" class="d-block flex-grow-1" fill="none" height="100%">
                        <rect width="100%" height="100%"/>
                    </svg>
                    <svg xmlns="http://www.w3.org/2000/svg" class="o_folder_angle_shape" width="80" height="100%" viewBox="0 0 80 48" fill="none">
                        <path d="M5.70364 48H0V0.00100806H73.5404L80 0C74.2028 0.665869 68.7417 3.06684 64.332 6.88852L25.3513 40.6709C19.8969 45.3979 12.9212 48 5.70364 48Z"/>
                    </svg>
                    <h2 t-attf-class="{{layout_document_title and 'o_folder_title mt-2 text-nowrap' or 'w-25'}}">
                        <t t-out="layout_document_title"/>
                    </h2>
                </div>
            </div>
            <div class="o_folder_company_info d-flex justify-content-between">
                <div class="w-50">
                    <img t-if="company.logo" class="o_company_logo_big mb-2" t-att-src="image_data_uri(company.logo)" alt="Logo"/>
                    <div t-if="company.report_header" t-field="company.report_header" class="o_company_tagline fw-bold">Company tagline</div>
                </div>
                <div name="company_address" class="w-50 text-end">
                    <t t-call="web.company_address_list"/>
                </div>
            </div>
        </div>
        <t t-call="web.external_layout_body">
            <t t-set="hide_title" t-value="True"/>
            <t t-set="customized_address_layout">
                <div class="pt-2">
                    <t t-call="web.address_layout" custom_layout_address="True"/>
                </div>
            </t>
            <t t-out="0"/>
        </t>
        <div t-attf-class="footer o_company_#{company.id}_layout {{report_type != 'pdf' and 'mt-auto'}}">
            <t t-call="web.external_layout_footer_content" footer_content_classes="'border-top pt-2'"/>
        </div>
    </t>

- kind=layout id=216 key=web.external_layout_lines name=external_layout_lines active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.external_layout_lines">
        <div t-attf-class="o_company_#{company.id}_layout o_layout_lines_header header">
            <svg xmlns="http://www.w3.org/2000/svg" t-attf-class="{{report_type == 'pdf' and 'position-fixed' or 'position-absolute'}} z-n1" t-attf-style="{{report_type == 'pdf' and 'top: -50mm; right: -108mm;' or 'top: -142mm; right: -110mm'}}" t-att-width="report_type == 'pdf' and '1064' or '100%'" t-att-height="report_type == 'pdf' and '748' or '100%'" viewBox="0 0 1423 1061" fill="none">
                <path class="o_lines_path_1" d="M1422.5 907h-210c-168.64-9.078-185.42-238.3-199-382C999.921 381.3 860.195 256 657 256c-119.89 0-341.722-.532-405.5-111-8.833-15-28-52.5-28-145"/>
                <path class="o_lines_path_2" d="M1397.72 924.056h-210c-168.64-9.078-185.42-238.3-198.997-382-13.579-143.7-153.305-269-356.5-269-119.891 0-341.722-.533-405.5-111-8.834-15-28-52.5-28-145"/>
                <path class="o_lines_path_3" d="M1372.94 941.111h-210c-168.64-9.077-185.417-238.3-198.996-382-13.578-143.7-153.305-269-356.5-269-119.89 0-341.721-.532-405.5-111-8.833-15-28-52.5-28-145"/>
                <path class="o_lines_path_4" d="M1348.17 958.167h-210c-168.648-9.078-185.424-238.3-199.003-382-13.579-143.701-153.305-269-356.5-269-119.89 0-341.722-.533-405.5-111-8.833-15-28-52.5-28-145"/>
                <path class="o_lines_path_5" d="M1323.39 975.222h-210c-168.646-9.077-185.423-238.3-199.001-382s-153.305-269-356.5-269c-119.891 0-341.722-.532-405.5-111-8.834-15-28-52.5-28-145"/>
                <path class="o_lines_path_6" d="M1298.61 992.278h-210c-168.643-9.078-185.42-238.3-198.999-382-13.578-143.7-153.305-269-356.5-269-119.89 0-341.721-.533-405.5-111-8.833-15-28-52.5-28-145"/>
                <path class="o_lines_path_7" d="M1273.83 1009.33h-210c-168.642-9.07-185.418-238.296-198.997-381.997-13.579-143.7-153.305-269-356.5-269-119.89 0-341.722-.532-405.5-111-8.833-15-28-52.5-28-145"/>
                <path class="o_lines_path_8" d="M1249.06 1026.39h-210c-168.649-9.08-185.426-238.301-199.004-382.001s-153.305-269-356.5-269c-119.891 0-341.722-.533-405.5-111-8.834-15-28-52.5-28-145"/>
                <path class="o_lines_path_9" d="M1224.28 1043.44h-210c-168.647-9.07-185.424-238.296-199.003-381.996s-153.305-269-356.5-269c-119.89 0-341.721-.532-405.5-111-8.833-15-28-52.5-28-145"/>
                <path class="o_lines_path_10" d="M1199.5 1060.5h-210c-168.645-9.08-185.421-238.3-199-382s-153.305-269-356.5-269c-119.89 0-341.721-.532-405.5-111-8.833-15-28-52.5-28-145"/>
            </svg>
            <table class="w-100 table-borderless">
                <tr>
                    <td class="align-top text-start">
                        <t t-call="web.company_address_list"/>
                    </td>
                    <td class="align-top text-end">
                        <img t-if="company.logo" class="o_company_logo_big" t-att-src="image_data_uri(company.logo)" alt="Logo"/>
                    </td>
                </tr>
            </table>
        </div>
        <t t-call="web.external_layout_body" hide_recipient_address="True" hide_title="True">
            <h2 class="text-center" t-out="layout_document_title"/>
            <t t-call="web.address_layout" custom_layout_address="True" information_block="False"/>
            <t t-out="0"/>
        </t>
        <div t-attf-class="o_company_#{company.id}_layout footer position-relative {{report_type != 'pdf' and 'position-relative mt-auto mx-n5'}}">
            <svg xmlns="http://www.w3.org/2000/svg" t-attf-class="{{report_type == 'pdf' and 'position-fixed' or 'position-absolute bottom-0'}} start-0" style="top: -4mm" width="100%" height="206" viewBox="0 0 1508 206" fill="none">
                <path class="o_lines_path_1" d="M1 144C476.147 225.333 1031.85 225.333 1507 144"/>
                <path class="o_lines_path_2" d="M1 123.571C476.147 204.905 1031.85 204.905 1507 123.571"/>
                <path class="o_lines_path_3" d="M1 103.143C476.147 184.476 1031.85 184.476 1507 103.143"/>
                <path class="o_lines_path_4" d="M1 82.7144C476.147 164.048 1031.85 164.048 1507 82.7144"/>
                <path class="o_lines_path_5" d="M1 62.2856C476.147 143.619 1031.85 143.619 1507 62.2856"/>
                <path class="o_lines_path_6" d="M1 41.8569C476.147 123.19 1031.85 123.19 1507 41.8569"/>
                <path class="o_lines_path_7" d="M1 21.4287C476.147 102.762 1031.85 102.762 1507 21.4287"/>
                <path class="o_lines_path_8" d="M1 1C476.147 82.3333 1031.85 82.3333 1507 1"/>
            </svg>
            <t t-call="web.external_layout_footer_content" is_tagline_footer="True" footer_content_classes="(report_type != 'pdf' and 'mx-5' or '')"/>
        </div>
    </t>

- kind=layout id=210 key=web.external_layout_standard name=external_layout_standard active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.external_layout_standard">
        <div t-attf-class="o_company_#{company.id}_layout header">
            <table class="table-borderless">
                <tr>
                    <td t-if="company.logo" class="align-top pe-3">
                        <img class="o_company_logo_big" t-att-src="image_data_uri(company.logo)" alt="Logo"/>
                    </td>
                    <td class="align-top text-start">
                        <t t-call="web.company_address_list"/>
                    </td>
                </tr>
            </table>
        </div>
        <t t-call="web.external_layout_body" snail_mail_compatible="True">
            <t t-out="0"/>
        </t>
        <div t-attf-class="footer o_company_#{company.id}_layout {{report_type != 'pdf' and 'mt-auto'}}">
            <t t-call="web.external_layout_footer_content" is_tagline_footer="True" is_centered_footer="True" footer_content_classes="'border-top pt-2 text-center'"/>
        </div>
    </t>

- kind=layout id=211 key=web.external_layout_wave name=external_layout_wave active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.external_layout_wave">
        <t t-set="header_shape_height" t-value="'230'"/>

        <div t-attf-class="o_company_#{company.id}_layout header {{report_type != 'pdf' and 'h-0'}}">
            <svg xmlns="http://www.w3.org/2000/svg" t-attf-class="{{report_type == 'pdf' and 'position-fixed' or 'position-absolute'}} start-0 top-0 w-100 z-n1" preserveAspectRatio="none" t-att-height="header_shape_height" viewBox="0 0 1000 240" fill="none">
                <path d="M1000 230.734C937.384 240.621 803.83 250.266 562.185 220.602C311.343 189.809 104.626 201.375 0 211.598V0.5H1000V230.734Z" t-att-fill="company.primary_color" fill-opacity=".1"/>
            </svg>

            <div class="d-flex justify-content-between">
                <div class="w-50">
                    <img t-if="company.logo" class="o_company_logo mb-2" t-att-src="image_data_uri(company.logo)" alt="Logo"/>
                    <div t-if="company.report_header" t-field="company.report_header" class="o_company_tagline fw-bold">Company tagline</div>
                </div>
                <div name="company_address" class="w-50 text-end">
                    <t t-call="web.company_address_list"/>
                </div>
            </div>
        </div>
        <t t-call="web.external_layout_body" custom_layout_address="True">
            <t t-out="0"/>
        </t>
        <div t-attf-class="footer o_company_#{company.id}_layout {{report_type != 'pdf' and 'position-relative mt-auto mx-n5'}}">
            <svg xmlns="http://www.w3.org/2000/svg" t-attf-class="{{report_type == 'pdf' and 'position-fixed start-0'}} w-100" preserveAspectRatio="none" t-att-height="report_type == 'pdf' and '180'" viewBox="0 0 1000 180" fill="none">
                <path d="M427.731 19.757C686.904 51.3469 898.971 38.039 1000 27.6922V180H0V8.20934C66.363 -0.991089 198.347 -8.20218 427.731 19.757Z" t-att-fill="company.secondary_color" fill-opacity=".1"/>
            </svg>
            <t t-call="web.external_layout_footer_content" is_centered_footer="True" footer_content_classes="(report_type != 'pdf' and 'position-absolute end-0 start-0 bottom-0 mx-5 ' or '') + 'pt-5 text-center'"/>
        </div>
    </t>

- kind=layout id=187 key=web.frontend_layout name=Frontend Layout active=True website=null inherit={"id": 186, "name": "Web layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Frontend Layout">
      <xpath expr="//head/meta[last()]" position="after">
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
      </xpath>
      <xpath expr="//head/link[last()]" position="after">
        <t t-call-assets="web.fontawesome" t-binary="True"/>
        <t t-call-assets="web.odoo_ui_icons" t-binary="True"/>
        <t t-call-assets="web.assets_frontend" t-js="false"/>
      </xpath>
      <xpath expr="//head/script[@id='web.layout.odooscript']" position="after">
        <script type="text/javascript">
            odoo.__session_info__ = <t t-out="json.dumps(request.env['ir.http'].get_frontend_session_info())"/>;
            if (!/(^|;\s)tz=/.test(document.cookie)) {
                const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
                document.cookie = `tz=${userTZ}; path=/`;
            }
        </script>
        <t t-call-assets="web.assets_frontend_minimal" t-css="false" defer_load="True"/>
        <t t-call="web.conditional_assets_tests" ignore_missing_deps="True"/>
        <t t-call-assets="web.assets_frontend_lazy" t-css="false" lazy_load="True"/>
      </xpath>
        <xpath expr="//t[@t-out='0']" position="replace">
            <div id="wrapwrap" t-attf-class="#{pageName or ''}">
                <header t-if="not no_header" id="top" data-anchor="true">
                    <img class="img-responsive d-block mx-auto" t-attf-src="/web/binary/company_logo" alt="Logo"/>
                </header>
                <main>
                    <t t-out="0"/>
                </main>
                <footer t-if="not no_footer" id="bottom" data-anchor="true" t-attf-class="bg-light o_footer">
                    <div id="footer"/>
                    <div t-if="not no_copyright" class="o_footer_copyright">
                        <div class="container py-3">
                            <div class="row row-gap-2">
                                <div class="col-md text-center text-sm-start text-muted">
                                    <span class="o_footer_copyright_name me-2">Copyright &amp;copy; <span t-field="res_company.name" itemprop="name">Company name</span></span>
                                </div>
                                <div class="col-md text-center text-sm-end">
                                    <t t-call="web.brand_promotion"/>
                                </div>
                            </div>
                        </div>
                    </div>
                </footer>
            </div>
        </xpath>
    <xpath expr="." position="attributes"><attribute name="t-name">web.frontend_layout</attribute></xpath></data>

- kind=layout id=218 key=web.internal_layout name=internal_layout active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.internal_layout">
        <t t-if="not o" t-set="o" t-value="doc"/>

        <t t-if="not company">
            <!-- Multicompany -->
            <t t-if="company_id">
                <t t-set="company" t-value="company_id"/>
            </t>
            <t t-elif="o and 'company_id' in o and o.company_id.sudo()">
                <t t-set="company" t-value="o.company_id.sudo()"/>
            </t>
            <t t-else="else">
                <t t-set="company" t-value="res_company"/>
            </t>
        </t>

        <div class="header">
            <div class="row">
                <div class="col-3">
                    <span t-out="context_timestamp(datetime.datetime.now()).strftime('%Y-%m-%d %H:%M')"/>
                </div>
                <div class="col-2 offset-2 text-center">
                    <span t-out="company.name"/>
                </div>
                <div class="col-2 offset-3 text-end">
                    <ul class="list-inline">
                        <li class="list-inline-item"><span class="page"/></li>
                        <li class="list-inline-item">/</li>
                        <li class="list-inline-item"><span class="topage"/></li>
                    </ul>
                </div>
            </div>
        </div>
        <div class="article" t-att-data-oe-model="o and o._name" t-att-data-oe-id="o and o.id" t-att-data-oe-lang="o and o.env.context.get('lang')">
          <t t-out="0"/>
        </div>
    </t>

- kind=layout id=186 key=web.layout name=Web layout active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Web layout" t-name="web.layout">&lt;!DOCTYPE html&gt;
<html t-att="html_data or {}">
    <head>
        <meta charset="utf-8"/>
        <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
        <title t-out="title or 'Odoo'"/>
        <link type="image/x-icon" rel="shortcut icon" t-att-href="x_icon or '/web/static/img/favicon.ico'"/>
        <script id="web.layout.odooscript" type="text/javascript">
            var odoo = {
                csrf_token: "<t t-out="request.csrf_token(None)"/>",
                debug: "<t t-out="debug"/>",
            };
        </script>
        <t t-out="head or ''"/>
    </head>
    <body t-att-class="body_classname">
        <t t-out="0"/>
    </body>
</html>
    </t>

- kind=layout id=190 key=web.login_layout name=Login Layout active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Login Layout" t-name="web.login_layout">
        <t t-call="web.frontend_layout" html_data="{'style': 'height: 100%;'}" body_classname.f="bg-100" no_header="True" no_footer="True">

            <div class="container py-5">
                <div t-attf-class="card border-0 mx-auto bg-100 {{login_card_classes}} o_database_list" style="max-width: 300px;">
                    <div class="card-body">
                        <div class="text-center pb-3 border-bottom mb-4">
                            <img t-attf-src="/web/binary/company_logo{{ '?dbname='+db if db else '' }}" alt="Logo" style="max-height:120px; max-width: 100%; width:auto"/>
                        </div>
                        <t t-out="0"/>
                        <div class="text-center small mt-4 pt-3 border-top" t-if="not disable_footer">
                            <t t-if="not disable_database_manager">
                                <a class="border-end pe-2 me-1" href="/web/database/manager">Manage Databases</a>
                            </t>
                            <a href="https://www.odoo.com?utm_source=db&amp;utm_medium=auth" target="_blank">Powered by <span>Odoo</span></a>
                        </div>
                    </div>
                </div>
            </div>
        </t>
    </t>

- kind=layout id=205 key=web.minimal_layout name=minimal_layout active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.minimal_layout">
        &lt;!DOCTYPE html&gt;
        <html style="height: 0;">
            <head>
                <base t-att-href="base_url"/>
                <t t-call-assets="web.report_assets_pdf" t-js="false" t-autoprefix="true"/>
                <t t-call-assets="web.report_assets_common" t-js="false" t-autoprefix="true"/>
                <t t-call-assets="web.report_assets_pdf" t-css="false"/>
                <meta charset="utf-8"/>
                <script t-if="subst">
                    function subst() {
                        var vars = {};
                        var x = document.location.search.substring(1).split('&amp;');
                        for (var i in x) {
                            var z = x[i].split('=', 2);
                            vars[z[0]] = unescape(z[1]);
                        }
                        var x = ['sitepage', 'sitepages', 'section', 'subsection', 'subsubsection'];
                        var z = {'sitepage': 'page', 'sitepages': 'topage'};
                        for (var i in x) {
                            var y = document.getElementsByClassName(z[x[i]] || x[i])
                            for (var j=0; j&lt;y.length; ++j)
                                y[j].textContent = vars[x[i]];
                        }

                        var index = vars['webpage'].split('.', 4)[3];
                        var header = document.getElementById('minimal_layout_report_headers');
                        if(header){
                            var companyHeader = header.children[index];
                            header.textContent = '';
                            header.appendChild(companyHeader);
                        }
                        var footer = document.getElementById('minimal_layout_report_footers');
                        if(footer){
                            var companyFooter = footer.children[index];
                            footer.textContent = '';
                            footer.appendChild(companyFooter);
                        }
                    }
                </script>
            </head>
            <body t-attf-class="o_body_pdf {{env['ir.actions.report'].get_paperformat_by_xmlid(report_xml_id).css_margins and 'o_css_margins'}} container overflow-hidden" t-att-data-report-id="report_xml_id" t-att-onload="subst and 'subst()'" t-att-dir="env['res.lang']._get_data(code=lang or env.user.lang).direction or 'ltr'">
                <t t-out="body"/>
            </body>
        </html>
    </t>

- kind=layout id=222 key=web.preview_layout_report name=preview_layout_report active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.preview_layout_report">
        <t t-set="company" t-value="env.company"/>
        <t t-call="web.html_container" o="res_company">
            <t t-call="web.report_invoice_wizard_preview"/>
        </t>
    </t>

- kind=layout id=200 key=web.report_layout name=Report layout active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Report layout" t-name="web.report_layout">&lt;!DOCTYPE html&gt;
        <html t-att-lang="lang and lang.replace('_', '-')" t-att-data-report-margin-top="data_report_margin_top" t-att-data-report-header-spacing="data_report_header_spacing" t-att-data-report-dpi="data_report_dpi" t-att-data-report-landscape="data_report_landscape" t-att-web-base-url="web_base_url">
            <head>
                <meta charset="utf-8"/>
                <meta name="viewport" content="initial-scale=1"/>
                <title><t t-out="title or 'Odoo Report'"/></title>
                <t t-call-assets="web.report_assets_common" t-autoprefix="true"/>
                <!-- Temporary code: only used to maintain CSS for legacy HTML reports (full width...) -->
                <!-- Should be removed once the reports are fully converted. -->
                <script type="text/javascript">
                    document.addEventListener('DOMContentLoaded', () =&gt; {
                        if (window.self !== window.top) {
                            document.body.classList.add("o_in_iframe", "container-fluid");
                            document.body.classList.remove("container");
                        }
                    });
                </script>
            </head>
            <body t-attf-class="o_body_html {{'container' if not full_width else 'container-fluid'}} overflow-x-hidden" t-att-dir="env['res.lang']._get_data(code=lang or env.user.lang).direction or 'ltr'">
                <div id="wrapwrap">
                    <main>
                        <t t-out="0"/>
                    </main>
                </div>
            </body>
        </html>
    </t>

- kind=layout id=201 key=web.report_preview_layout name=Report layout active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Report layout" t-name="web.report_preview_layout">&lt;!DOCTYPE html&gt;
        <html t-att-lang="lang and lang.replace('_', '-')" t-att-data-report-margin-top="data_report_margin_top" t-att-data-report-header-spacing="data_report_header_spacing" t-att-data-report-dpi="data_report_dpi" t-att-data-report-landscape="data_report_landscape" t-att-web-base-url="web_base_url">
            <head>
                <meta charset="utf-8"/>
                <meta name="viewport" content="initial-scale=1"/>
                <title><t t-out="title or 'Odoo Report'"/></title>
                <t t-call-assets="web.report_assets_common" t-js="false"/>
                <style>
                    <t t-out="preview_css"/>

                    /**
                        Some css is overridden as it doesn't work properly in the preview.
                        Before generating 'real' reports, a lot of processing is applied. It is therefore quite
                        complicated to have an almost exact replica of the pdf report.
                        This changes down here are hacks to make the preview look as good as possible.
                    **/
                    .article {
                        z-index: -2;
                    }

                    .loading-spinner {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        border-top: 8px solid #e3e3e3;
                        border-radius: 50%;
                        width: 60px;
                        height: 60px;
                        animation: spin 1s linear infinite;
                    }

                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </head>
            <body class="o_body_html container-fluid" style="overflow:hidden" t-att-dir="env['res.lang']._get_data(code=lang or env.user.lang).direction or 'ltr'">
                <!-- display a spinner instead of the iframe content until the stylesheet is loaded -->
                <div id="wrapwrap" class="d-block d-flex flex-column h-100" style="display:none;">
                    <t t-out="0"/>
                </div>
                <div class="loading-spinner d-none"/>
            </body>
        </html>
    </t>

- kind=layout id=588 key=website.custom_code_layout name=Custom Code Layout active=True website=null inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Custom Code Layout">
    <xpath expr="//head" position="inside">
        <t t-out="website.custom_code_head"/>
    </xpath>
    <xpath expr="//body" position="inside">
        <t t-out="website.custom_code_footer"/>
    </xpath>
</data>

- kind=layout id=586 key=website.layout name=Main layout active=True website=null inherit={"id": 502, "name": "Main Frontend Layout"}
  signals: hrefs_total=11 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Main layout">
    <xpath expr="//html" position="before">
        <t t-set="html_data" t-value="{             'lang': lang.replace('_', '-'),             'data-website-id': website.id,             'data-edit_translations': '1' if edit_translations else None,             'data-main-object': repr(main_object) if main_object else None,             'data-seo-object': repr(seo_object) if seo_object else None,         }"/>
        <t t-if="not request.env.user._is_public()" t-set="nothing" t-value="html_data.update({             'data-is-published': 'website_published' in main_object._fields and main_object.sudo().website_published,             'data-publish-on': 'publish_on' in main_object._fields and (main_object.sudo().publish_on or ''),             'data-can-optimize-seo': 'website_meta_description' in main_object._fields,             'data-can-publish': 'can_publish' in main_object._fields and main_object.sudo(False).can_publish,             'data-editable-in-backend': edit_in_backend or ('website_published' in main_object._fields and main_object._name != 'website.page'),         })"/>
        <t t-if="editable or translatable" t-set="nothing" t-value="html_data.update({             'data-editable': '1' if editable else None,             'data-translatable': '1' if translatable else None,             'data-view-xmlid': xmlid,             'data-viewid': viewid,             'data-default-lang-name': website.default_lang_id.name.split('/').pop() if translatable else None,             'data-lang-name': website.env['res.lang']._get_data(code=lang).name.split('/').pop() if translatable else None,         })"/>
    </xpath>

    <xpath expr="//head/*[1]" position="before">
        <t t-if="not title">
            <t t-if="not additional_title and main_object and 'name' in main_object">
                <t t-set="additional_title" t-value="main_object.sudo().name"/>
            </t>
            <t t-set="default_title" t-translation="off" t-value="(additional_title + ' | ' if additional_title else '') + website.name"/>
            <t t-set="seo_object" t-value="seo_object or main_object"/>
            <t t-if="seo_object and 'website_meta_title' in seo_object and seo_object.sudo().website_meta_title">
                <t t-set="title" t-value="seo_object.sudo().website_meta_title"/>
            </t>
            <t t-else="">
                <t t-set="title" t-value="default_title"/>
            </t>
        </t>
        <t t-set="x_icon" t-value="website.image_url(website, 'favicon')"/>
    </xpath>
    <xpath expr="//head/meta[last()]" position="after">
        <meta name="generator" content="Odoo"/>
        <t t-set="website_meta" t-value="seo_object and seo_object.sudo().get_website_meta() or {}"/>
        <meta name="default_title" t-att-content="default_title" groups="website.group_website_designer"/>
        <t t-set="no_index" t-value="             (main_object and 'website_indexed' in main_object and not main_object.sudo().website_indexed)             or (website.domain and not website._is_indexable_url(request.httprequest.url_root))             or (pager and isinstance(pager, dict) and pager.get('page', {}).get('num', 1) != 1)         "/>
        <meta t-if="no_index" name="robots" content="noindex"/>
        <t t-set="seo_object" t-value="seo_object or main_object"/>
        <t t-set="meta_description" t-value="seo_object and 'website_meta_description' in seo_object             and seo_object.sudo().website_meta_description or website_meta_description or website_meta.get('meta_description', '')"/>
        <t t-set="meta_keywords" t-value="seo_object and 'website_meta_keywords' in seo_object             and seo_object.sudo().website_meta_keywords or website_meta_keywords"/>
        <meta t-if="meta_description or editable" name="description" t-att-content="meta_description"/>
        <meta t-if="meta_keywords or editable" name="keywords" t-att-content="meta_keywords"/>
        <t t-if="seo_object">
        <meta name="default_description" t-att-content="website_meta_description or website_meta.get('meta_description')" groups="website.group_website_designer"/>
            <!-- OpenGraph tags for Facebook sharing -->
            <t t-set="opengraph_meta" t-value="website_meta.get('opengraph_meta')"/>
            <t t-if="opengraph_meta">
                <t t-foreach="opengraph_meta" t-as="property">
                    <t t-if="isinstance(opengraph_meta[property], list)">
                        <t t-foreach="opengraph_meta[property]" t-as="meta_content">
        <meta t-att-property="property" t-att-content="meta_content"/>
                        </t>
                    </t>
                    <t t-else="">
        <meta t-att-property="property" t-att-content="opengraph_meta[property]"/>
                    </t>
                </t>
            </t>
            <!-- Twitter tags for sharing -->
            <t t-set="twitter_meta" t-value="website_meta.get('twitter_meta')"/>
            <t t-if="opengraph_meta">
                <t t-foreach="twitter_meta" t-as="t_meta">
        <meta t-att-name="t_meta" t-att-content="twitter_meta[t_meta]"/>
                </t>
            </t>
        </t>
        <t t-set="canonical_domain" t-value="website.get_base_url()"/>
        <!-- no hreflang on non-canonical pages or if no alternate language -->
        <t t-if="request.is_frontend_multilang and website._is_canonical_url() and len(frontend_languages) &gt; 1">
            <t t-foreach="frontend_languages.values()" t-as="lg">
        <link rel="alternate" t-att-hreflang="lg.hreflang" t-att-href="url_localized(lang_code=lg.code, prefetch_langs=True, canonical_domain=canonical_domain)"/>
            </t>
        <link rel="alternate" hreflang="x-default" t-att-href="url_localized(lang_code=website.default_lang_id.code, canonical_domain=canonical_domain)"/>
        </t>
        <link rel="canonical" t-att-href="website._get_canonical_url()"/>
        <!-- TODO: Once we have style in DB,…

- kind=layout id=650 key=website.login_layout name=Website Login Layout active=True website=null inherit={"id": 190, "name": "Login Layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Website Login Layout">
    <xpath expr="t[@t-call]" position="replace">
        <t t-call="website.layout">
            <div class="oe_website_login_container" t-out="0"/>
        </t>
    </xpath>
</data>

- kind=layout id=2061 key=website_appointment.appointments_list_layout name=Appointment: Appointments List Layout active=True website=null inherit={"id": 1555, "name": "Appointment Types"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Appointment: Appointments List Layout">
        <xpath expr="//t[@t-call='portal.portal_layout']" position="attributes">
            <attribute name="t-call">website.layout</attribute>
        </xpath>
        <xpath expr="//div[hasclass('o_appointment_choice')]" position="before">
            <t t-call="website_appointment.website_calendar_index"/>
        </xpath>
        <xpath expr="//div[hasclass('o_appointment_index')]" position="attributes">
            <attribute name="class">o_appointment_index bg-o-color-4</attribute>
        </xpath>
        <xpath expr="//div[hasclass(&quot;o_appointment_svg&quot;)]" position="before">
            <div class="alert alert-info text-center d-none" groups="appointment.group_appointment_manager">
                <p class="m-0">Use the top button '<b>+ New</b>' to create an appointment type.</p>
            </div>
        </xpath>
    </data>

- kind=layout id=1348 key=website_enterprise.layout name=layout active=True website=null inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//a[hasclass('o_frontend_to_backend_apps_btn')]" position="attributes">
        <attribute name="href">/odoo</attribute>
        <attribute name="data-bs-toggle"/>
    </xpath>
    <xpath expr="//div[hasclass('o_frontend_to_backend_apps_menu')]" position="replace"/>
</data>

- kind=layout id=2040 key=website_knowledge.layout name=Knowledge Public Layout active=True website=null inherit={"id": 187, "name": "Frontend Layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Knowledge Public Layout">
        <xpath expr="//t[@t-call-assets='web.assets_frontend']" position="replace">
            <t t-call-assets="website_knowledge.assets_public_knowledge" t-js="false"/>
        </xpath>
        <xpath expr="//header" position="before">
            <t t-set="no_header" t-value="True"/>
            <t t-set="no_footer" t-value="True"/>
            <t t-set="no_livechat" t-value="True"/>
        </xpath>
        <xpath expr="//body" position="replace">
            <body>
                <div id="wrapwrap">
                    <t t-out="0"/>
                </div>
            </body>
        </xpath>
    <xpath expr="." position="attributes"><attribute name="t-name">website_knowledge.layout</attribute></xpath></data>

- kind=header id=1823 key=survey.survey_fill_header name=Survey: main page header active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Survey: main page header" t-name="survey.survey_fill_header">
        <div class="d-flex flex-wrap flex-md-nowrap justify-content-between pt16 mb-2">
            <div t-attf-class="o_survey_nav flex-grow-1 #{'order-2 order-md-1' if languages else None}">
                <div class="container m-0 p-0">
                    <div class="row">
                        <div class="col-lg-10">
                            <t t-set="displayTitle" t-value="answer.state == 'in_progress' and survey.questions_layout != 'page_per_question'"/>
                            <h1 t-out="survey.title" class="o_survey_main_title o_survey_main_title_fade pt-4" t-attf-class="o_survey_main_title o_survey_main_title_fade pt-4 {{'opacity-0' if not displayTitle else 'opacity-100'}}"/>
                        </div>
                        <div class="o_survey_timer col-lg-2 pt-4">
                            <h1 class="o_survey_timer_container timer text-end"/>
                        </div>
                    </div>
                </div>
                <div t-att-class="'o_survey_breadcrumb_container mt8' + (' d-none ' if answer.state != 'in_progress' else '')" t-if="not survey.has_conditional_questions and survey.questions_layout == 'page_per_section' and answer.state != 'done'" t-att-data-can-go-back="survey.users_can_go_back" t-att-data-pages="json.dumps(breadcrumb_pages)"/>
            </div>
            <div t-if="languages" class="order-1 order-md-2">
                <select name="lang_code" t-attf-class="form-select o_survey_lang_selector #{'d-none' if len(languages) == 1 else ''}" aria-label="Select a language">
                    <option t-foreach="languages" t-as="language" t-att-value="language[0]" t-out="language[1]" t-att-selected="language[0] == lang_code and 'selected' or None"/>
                </select>
            </div>
        </div>
    </t>

- kind=header id=1853 key=survey.survey_page_statistics_header name=Survey: result statistics header active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Survey: result statistics header" t-name="survey.survey_page_statistics_header">
        <div class="o_survey_statistics_header mt32">
            <h2 t-field="survey.title"/>
            <div class="d-flex align-items-start">
                <div t-if="question_and_page_data" class="o_survey_results_topbar d-print-none"><t t-call="survey.survey_results_filters"/></div>
                <h3 t-else="">
                    Sorry, no one answered this survey yet.
                </h3>
                <button class="btn btn-primary d-print-none o_survey_results_print mt-1 ms-auto" aria-label="Print" title="Print">
                    <i class="fa fa-print"/>
                </button>
            </div>
        </div>
    </t>

- kind=header id=686 key=website.header_call_to_action name=Header Call to Action active=True website=null inherit={"id": 685, "name": "Placeholder Header Call to Action"}
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Call to Action">
    <xpath expr="." position="inside">
        <li t-attf-class="#{_item_class}">
            <div t-attf-class="oe_structure oe_structure_solo #{_div_class}">
                <section class="oe_unremovable oe_unmovable s_text_block" data-snippet="s_text_block" data-name="Text">
                    <div class="container">
                        <a href="/contactus" class="oe_unremovable btn btn-primary btn_cta">Contact Us</a>
                    </div>
                </section>
            </div>
        </li>
    </xpath>
</data>

- kind=header id=2251 key=website.header_call_to_action name=Header Call to Action active=True website={"id": 1, "name": "TOTEM Platform"} inherit={"id": 685, "name": "Placeholder Header Call to Action"}
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=1 interesting_forms=0 interesting_onclicks=0
  interesting_hrefs: ['/web/signup']
  arch_snip: <data name="Header Call to Action">
    <xpath expr="." position="inside">
        <li t-attf-class="#{_item_class}">
            <div t-attf-class="oe_structure oe_structure_solo #{_div_class}" class="oe_structure oe_structure_solo">
                <section class="oe_unremovable oe_unmovable s_text_block o_colored_level" data-snippet="s_text_block" data-name="Text">
                    <div class="container">
                        <a class="mb-2 btn btn-primary" href="/web/signup">Регистрация</a> <a href="/contactus" class="oe_unremovable btn btn-primary mb-2">Свяжитесь с нами</a>
                    </div>
                </section>
            </div>
        </li>
    </xpath>
</data>

- kind=header id=687 key=website.header_call_to_action_large name=Header Call to Action - Large active=True website=null inherit={"id": 686, "name": "Header Call to Action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Call to Action - Large">
    <xpath expr="//a[hasclass('oe_unremovable')]" position="attributes">
        <attribute name="class" remove="" add="w-100" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.header_call_to_action_large</attribute></xpath></data>

- kind=header id=2252 key=website.header_call_to_action_large name=Header Call to Action - Large active=True website={"id": 1, "name": "TOTEM Platform"} inherit={"id": 2251, "name": "Header Call to Action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Call to Action - Large">
    <xpath expr="//a[hasclass('oe_unremovable')]" position="attributes">
        <attribute name="class" remove="" add="w-100" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.header_call_to_action_large</attribute></xpath></data>

- kind=header id=688 key=website.header_call_to_action_sidebar name=Header Call to Action - Sidebar active=True website=null inherit={"id": 687, "name": "Header Call to Action - Large"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Call to Action - Sidebar">
    <xpath expr="//section/div" position="attributes">
        <attribute name="class" remove="" add="p-0" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.header_call_to_action_sidebar</attribute></xpath></data>

- kind=header id=2253 key=website.header_call_to_action_sidebar name=Header Call to Action - Sidebar active=True website={"id": 1, "name": "TOTEM Platform"} inherit={"id": 2252, "name": "Header Call to Action - Large"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Call to Action - Sidebar">
    <xpath expr="//section/div" position="attributes">
        <attribute name="class" remove="" add="p-0" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.header_call_to_action_sidebar</attribute></xpath></data>

- kind=header id=689 key=website.header_call_to_action_stretched name=Header Call to Action - Stretched active=True website=null inherit={"id": 686, "name": "Header Call to Action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Call to Action - Stretched">
    <xpath expr="//section/div" position="attributes">
        <attribute name="class" remove="" add="h-100" separator=" "/>
    </xpath>
    <xpath expr="//a[hasclass('oe_unremovable')]" position="attributes">
        <attribute name="class" remove="" add="d-flex align-items-center h-100 rounded-0" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.header_call_to_action_stretched</attribute></xpath></data>

- kind=header id=2254 key=website.header_call_to_action_stretched name=Header Call to Action - Stretched active=True website={"id": 1, "name": "TOTEM Platform"} inherit={"id": 2251, "name": "Header Call to Action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Call to Action - Stretched">
    <xpath expr="//section/div" position="attributes">
        <attribute name="class" remove="" add="h-100" separator=" "/>
    </xpath>
    <xpath expr="//a[hasclass('oe_unremovable')]" position="attributes">
        <attribute name="class" remove="" add="d-flex align-items-center h-100 rounded-0" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.header_call_to_action_stretched</attribute></xpath></data>

- kind=header id=676 key=website.header_language_selector name=Header Language Selector active=True website=null inherit={"id": 675, "name": "Placeholder Header Language Selector"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Language Selector">
    <xpath expr="." position="inside">
        <li t-if="len(frontend_languages) &gt; 1" data-name="Language Selector" t-attf-class="o_header_language_selector #{_item_class}">
            <t id="header_language_selector_call" t-call="portal.language_selector" _div_classes="(_div_classes or '') + ' dropdown'"/>
        </li>
    </xpath>
</data>

- kind=header id=723 key=website.header_search_box name=Header Search Bar active=True website=null inherit={"id": 722, "name": "Placeholder Header Search Bar"}
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Search Bar">
    <xpath expr="." position="inside">
        <li t-attf-class="#{_item_class}">
            <t t-if="_layout == 'modal'">
                <div class="modal fade css_editable_mode_hidden" id="o_search_modal" aria-hidden="true" tabindex="-1">
                    <div class="modal-dialog modal-lg pt-5">
                        <div class="modal-content mt-5">
                            <t t-call="website.header_search_box_input" _classes.f="input-group-lg"/>
                        </div>
                    </div>
                </div>
                <a t-attf-class="btn rounded-circle p-1 lh-1 #{_button_classes or 'bg-o-color-3'} o_not_editable" data-bs-target="#o_search_modal" data-bs-toggle="modal" role="button" title="Search" href="#">
                    <i class="oi oi-search fa-stack lh-lg"/>
                </a>
            </t>
            <t t-else="">
                <t t-call="website.header_search_box_input"/>
            </t>
        </li>
    </xpath>
</data>

- kind=header id=721 key=website.header_search_box_input name=Header Search Box Input active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Header Search Box Input" t-name="website.header_search_box_input">
    <t t-call="website.website_search_box_input" search_type.f="all" action.f="/website/search" limit="limit or '5'" display_image.f="true" display_description.f="true" display_extra_link.f="true" display_detail.f="true"/>
</t>

- kind=header id=725 key=website.header_text_element name=Header Text element active=True website=null inherit={"id": 724, "name": "Placeholder Header Text element"}
  signals: hrefs_total=5 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Text element">
    <xpath expr="." position="inside">
        <li t-attf-class="#{_item_class}">
            <t t-if="_txt_elt_content == 'sentence'">
                <div t-attf-class="s_text_block #{_div_class}" data-name="Text">
                    <small>Free Returns and Standard Shipping</small>
                </div>
            </t>
            <t t-elif="_txt_elt_content == 'list'">
                <div t-attf-class="s_text_block d-flex flex-column flex-lg-row gap-1 gap-lg-4 align-items-lg-center #{_div_class}" data-name="Text">
                    <small class="d-flex align-items-center">
                        <i class="fa fa-1x fa-fw fa-usd fa-stack me-1"/>
                        Low Price Guarantee
                    </small>
                    <small class="d-flex align-items-center">
                        <i class="fa fa-1x fa-fw fa-shopping-basket fa-stack me-1"/>
                        30 Days Online Returns
                    </small>
                    <small class="d-flex align-items-center">
                        <i class="fa fa-1x fa-fw fa-truck fa-stack me-1"/>
                        Standard Shipping
                    </small>
                </div>
            </t>
            <t t-elif="_txt_elt_content == 'phone_mail'">
                <div t-attf-class="s_text_block #{_div_class}" data-name="Text">
                    <a href="tel:+1 555-555-5556" class="nav-link o_nav-link_secondary">
                        <small>
                            <i class="fa fa-1x fa-fw fa-phone me-1"/>͏ <!-- Empty character needed to be able to delete the icon. -->
                            <span class="o_force_ltr">+1 555-555-5556</span>
                        </small>
                    </a>
                    <a href="mailto:info@yourcompany.example.com" class="nav-link o_nav-link_secondary">
                        <small>
                            <i class="fa fa-1x fa-fw fa-envelope me-1"/>
                            info@yourcompany.example.com
                        </small>
                    </a>
                </div>
            </t>
            <t t-elif="_txt_elt_content == 'mail'">
                <div t-attf-class="s_text_block #{_div_class}" data-name="Text">
                    <a href="mailto:info@yourcompany.example.com" class="nav-link o_nav-link_secondary">
                        <small><i class="fa fa-1x fa-fw fa-envelope me-1"/> info@yourcompany.example.com</small>
                    </a>
                </div>
            </t>
            <t t-elif="_txt_elt_content == 'mail_stretched'">
                <div t-attf-class="s_text_block #{_div_class}" data-name="Text">
                    <a href="tel:+1 555-555-5556" class="nav-link o_nav-link_secondary p-2 o_navlink_background_hover d-flex align-items-center h-100 text-reset">
                        <i class="fa fa-1x fa-fw fa-phone me-1"/>
                        <span class="o_force_ltr"><small>+1 555-555-5556</small></span>
                    </a>
                </div>
            </t>
            <t t-else="">
                <div t-attf-class="s_text_block #{_div_class}" data-name="Text">
                    <a href="tel:+1 555-555-5556" class="nav-link o_nav-link_secondary p-2">
                        <i class="fa fa-1x fa-fw fa-phone me-1"/>
                        <span class="o_force_ltr"><small>+1 555-555-5556</small></span>
                    </a>
                </div>
            </t>
        </li>
    </xpath>
</data>

- kind=header id=2255 key=website.header_text_element name=Header Text element active=True website={"id": 1, "name": "TOTEM Platform"} inherit={"id": 724, "name": "Placeholder Header Text element"}
  signals: hrefs_total=5 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Text element">
    <xpath expr="." position="inside">
        <li t-attf-class="#{_item_class}">
            <t t-if="_txt_elt_content == 'sentence'">
                <div t-attf-class="s_text_block #{_div_class}" data-name="Text">
                    <small>Бесплатный возврат и стандартная доставка</small>
                </div>
            </t>
            <t t-elif="_txt_elt_content == 'list'">
                <div t-attf-class="s_text_block d-flex flex-column flex-lg-row gap-1 gap-lg-4 align-items-lg-center #{_div_class}" data-name="Text">
                    <small class="d-flex align-items-center">
                       <i class="fa fa-1x fa-fw fa-usd fa-stack me-1"/>
                        Гарантия низких цен
                    </small>
                    <small class="d-flex align-items-center">
                       <i class="fa fa-1x fa-fw fa-shopping-basket fa-stack me-1"/>
                        возврат товара в течение 30 дней в режиме онлайн
                    </small>
                    <small class="d-flex align-items-center">
                       <i class="fa fa-1x fa-fw fa-truck fa-stack me-1"/>
                        Стандартная доставка
                    </small>
                </div>
            </t>
            <t t-elif="_txt_elt_content == 'phone_mail'">
                <div t-attf-class="s_text_block #{_div_class}" data-name="Text">
                    <a href="tel:+1 555-555-5556" class="nav-link o_nav-link_secondary">
                        <small>
                            <i class="fa fa-1x fa-fw fa-phone me-1"/>͏ <!-- Empty character needed to be able to delete the icon. -->
                            <span class="o_force_ltr">+1 555-555-5556</span>
                        </small>
                    </a>
                    <a href="mailto:info@yourcompany.example.com" class="nav-link o_nav-link_secondary">
                        <small>
                           <i class="fa fa-1x fa-fw fa-envelope me-1"/>
                            info@yourcompany.example.com
                        </small>
                    </a>
                </div>
            </t>
            <t t-elif="_txt_elt_content == 'mail'">
                <div t-attf-class="s_text_block #{_div_class}" data-name="Text">
                    <a href="mailto:info@yourcompany.example.com" class="nav-link o_nav-link_secondary">
                        <small><i class="fa fa-1x fa-fw fa-envelope me-1"/> info@yourcompany.example.com</small>
                    </a>
                </div>
            </t>
            <t t-elif="_txt_elt_content == 'mail_stretched'">
                <div t-attf-class="s_text_block #{_div_class}" data-name="Text">
                    <a href="tel:+1 555-555-5556" class="nav-link o_nav-link_secondary p-2 o_navlink_background_hover d-flex align-items-center h-100 text-reset">
                        <i class="fa fa-1x fa-fw fa-phone me-1"/>
                        <span class="o_force_ltr"><small>+1 555-555-5556</small></span>
                    </a>
                </div>
            </t>
            <t t-else="">
                <div t-attf-class="s_text_block #{_div_class}" data-name="Text" class="s_text_block">
                    <a href="tel:+1 555-555-5556" class="nav-link o_nav-link_secondary p-2">
                        <i class="fa fa-1x fa-fw fa-phone me-1"/>
                        <span class="o_force_ltr"><small>+1 555-555-5556</small></span>
                    </a>
                </div>
            </t>
        </li>
    </xpath>
</data>

- kind=header id=641 key=website.header_visibility_standard name=Header Visibility Standard active=True website=null inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Visibility Standard">
    <xpath expr="//header" position="attributes">
        <attribute name="t-attf-class" add="o_header_standard" separator=" "/>
    </xpath>
</data>

- kind=header id=592 key=website.navbar name=Navbar active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Navbar" t-name="website.navbar">
    <t t-set="_navbar_expand_class" t-value="_navbar_expand_class is None and 'navbar-expand-lg' or _navbar_expand_class"/>
    <nav data-name="Navbar" t-attf-aria-label="#{_navbar_name if _navbar_name else 'Main'}" t-attf-class="navbar #{_navbar_expand_class} navbar-light o_colored_level o_cc #{_navbar_classes} #{_extra_navbar_classes}">
        <t t-out="0"/>
    </nav>
</t>

- kind=header id=593 key=website.navbar_nav name=Navbar Nav active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Navbar Nav" t-name="website.navbar_nav">
    <ul t-att-id="not is_mobile and 'top_menu'" t-attf-class="nav navbar-nav top_menu #{'' if _no_autohide_menu_mobile else 'o_menu_loading'} #{is_vertical_nav and 'o_mega_menu_is_offcanvas mx-n3'} #{_nav_class} #{(_navbar_pills and not is_mobile) and 'nav-pills'}" role="menu">
        <t t-out="0"/>
    </ul>
</t>

- kind=header id=594 key=website.navbar_nav_wrapper name=Navbar Nav Wrapper active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Navbar Nav Wrapper" t-name="website.navbar_nav_wrapper">
    <div t-attf-class="d-flex w-100 #{_wrapper_class}">
        <t t-out="0"/>
    </div>
</t>

- kind=header id=591 key=website.navbar_toggler name=Navbar Toggler active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Navbar Toggler" t-name="website.navbar_toggler">
    <button type="button" t-attf-class="navbar-toggler #{_toggler_class} o_not_editable" data-bs-toggle="offcanvas" data-bs-target="#top_menu_collapse" aria-controls="top_menu_collapse">
        <span class="navbar-toggler-icon o_not_editable"/>
    </button>
</t>

- kind=header id=639 key=website.option_header_brand_logo name=Header Brand Logo active=True website=null inherit={"id": 638, "name": "Placeholder Header Brand"}
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Header Brand Logo">
    <xpath expr="//*[@id='o_fake_navbar_brand']" position="replace">
        <a data-name="Navbar Logo" href="/" t-attf-class="navbar-brand logo #{_link_class}">
            <!--
            Note: setting width *and* height attributes allows to reserve some
            space to avoid layout shift during page loading. Of course, CSS
            rules set the height the user chose, while the width is set to
            'auto'. But while the image is loading, it is best to already
            reserve some width to reduce layout shift (like making the menu move
            or even re-render itself into a "+" menu).

            The chosen values for the space reservation are the ones of the
            default logo and theme, but it does not really matter as long as
            they are coherent. While the image is being loaded, the chosen user
            height is still applied and the 'auto' width rule induces a width
            that respects the aspect ratio set by the width and height
            attributes. That could be a problem if the real logo has a larger
            height than width, in which case the layout shift would be increased
            because of the arbitrary values set as width and height, but in most
            cases, this should reduce it.

            This also allows to gain some page speed scoring.
            -->
            <t t-set="base_options" t-value="{'widget': 'image'}"/>
            <span t-field="website.logo" t-options="base_options if editable else dict(base_options, width=95, height=40)" role="img" t-att-aria-label="'Logo of %s' % website.name" t-att-title="website.name"/>
        </a>
    </xpath>
</data>

- kind=header id=638 key=website.placeholder_header_brand name=Placeholder Header Brand active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Placeholder Header Brand" t-name="website.placeholder_header_brand">
    <span id="o_fake_navbar_brand"/><!-- Need a fake element so that the menu is still placed correctly -->
</t>

- kind=header id=685 key=website.placeholder_header_call_to_action name=Placeholder Header Call to Action active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Placeholder Header Call to Action" t-name="website.placeholder_header_call_to_action"/>

- kind=header id=675 key=website.placeholder_header_language_selector name=Placeholder Header Language Selector active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Placeholder Header Language Selector" t-name="website.placeholder_header_language_selector"/>

- kind=header id=722 key=website.placeholder_header_search_box name=Placeholder Header Search Bar active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Placeholder Header Search Bar" t-name="website.placeholder_header_search_box"/>

- kind=header id=719 key=website.placeholder_header_social_links name=Placeholder Header Social Links active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Placeholder Header Social Links" t-name="website.placeholder_header_social_links"/>

- kind=header id=724 key=website.placeholder_header_text_element name=Placeholder Header Text element active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Placeholder Header Text element" t-name="website.placeholder_header_text_element"/>

- kind=header id=600 key=website.template_header_default name=Template Header Default active=True website=null inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Template Header Default">
    <xpath expr="//header//nav" position="replace">
        <t t-call="website.navbar">
            <t t-set="_navbar_classes" t-valuef="d-none d-lg-block shadow-sm"/>

            <div id="o_main_nav" t-attf-class="o_main_nav #{header_content_width}">
                <!-- Brand -->
                <t t-call="website.placeholder_header_brand" _link_class.f="me-4"/>
                <!-- Navbar -->
                <t t-call="website.navbar_nav" _nav_class.f="me-auto">
                    <!-- Menu -->
                    <t t-foreach="website.menu_id.child_id" t-as="submenu">
                        <t t-call="website.submenu" item_class.f="nav-item" link_class.f="nav-link"/>
                    </t>
                </t>
                <!-- Extra elements -->
                <ul class="navbar-nav align-items-center gap-2 flex-shrink-0 justify-content-end ps-3">
                    <!-- Search Bar -->
                    <t t-call="website.placeholder_header_search_box" _layout.f="modal" _input_classes.f="border border-end-0 p-3" _submit_classes.f="border border-start-0 px-4 bg-o-color-4" _button_classes.f="o_navlink_background text-reset"/>
                    <!-- Text element -->
                    <t t-call="website.placeholder_header_text_element"/>
                    <!-- Social -->
                    <t t-call="website.placeholder_header_social_links"/>
                    <!-- Language Selector -->
                    <t t-call="website.placeholder_header_language_selector" _btn_class="_additional_btn_color or 'nav-link'" _dropdown_menu_class.f="dropdown-menu-end"/>
                    <!-- Sign In -->
                    <t t-call="portal.placeholder_user_sign_in" _link_class="_additional_btn_color or 'o_nav_link_btn nav-link border px-3'"/>
                    <!-- User Dropdown -->
                    <t t-call="portal.user_dropdown" _user_name="True" _item_class.f="dropdown" _link_class.f="{{_additional_btn_color or 'nav-link'}} border-0" _dropdown_menu_class.f="dropdown-menu-end"/>
                    <!-- Call To Action -->
                    <t t-call="website.placeholder_header_call_to_action"/>
                </ul>
            </div>
        </t>
        <t t-call="website.template_header_mobile"/>
    </xpath>
</data>

- kind=header id=2204 key=website.template_header_default name=Template Header Default active=True website={"id": 1, "name": "TOTEM Platform"} inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Template Header Default">
    <xpath expr="//header//nav" position="replace">
        <t t-call="website.navbar">
            <t t-set="_navbar_classes" t-valuef="d-none d-lg-block shadow-sm"/>

            <div id="o_main_nav" t-attf-class="o_main_nav #{header_content_width}">
                <!-- Brand -->
                <t t-call="website.placeholder_header_brand" _link_class.f="me-4"/>
                <!-- Navbar -->
                <t t-call="website.navbar_nav" _nav_class.f="me-auto">
                    <!-- Menu -->
                    <t t-foreach="website.menu_id.child_id" t-as="submenu">
                        <t t-call="website.submenu" item_class.f="nav-item" link_class.f="nav-link"/>
                    </t>
                </t>
                <!-- Extra elements -->
                <ul class="navbar-nav align-items-center gap-2 flex-shrink-0 justify-content-end ps-3">
                    <!-- Search Bar -->
                    <t t-call="website.placeholder_header_search_box" _layout.f="modal" _input_classes.f="border border-end-0 p-3" _submit_classes.f="border border-start-0 px-4 bg-o-color-4" _button_classes.f="o_navlink_background text-reset"/>
                    <!-- Text element -->
                    <t t-call="website.placeholder_header_text_element"/>
                    <!-- Social -->
                    <t t-call="website.placeholder_header_social_links"/>
                    <!-- Language Selector -->
                    <t t-call="website.placeholder_header_language_selector" _btn_class="_additional_btn_color or 'nav-link'" _dropdown_menu_class.f="dropdown-menu-end"/>
                    <!-- Sign In -->
                    <t t-call="portal.placeholder_user_sign_in" _link_class="_additional_btn_color or 'o_nav_link_btn nav-link border px-3'"/>
                    <!-- User Dropdown -->
                    <t t-call="portal.user_dropdown" _user_name="True" _item_class.f="dropdown" _link_class.f="{{_additional_btn_color or 'nav-link'}} border-0" _dropdown_menu_class.f="dropdown-menu-end"/>
                    <!-- Call To Action -->
                    <t t-call="website.placeholder_header_call_to_action"/>
                </ul>
            </div>
        </t>
        <t t-call="website.template_header_mobile"/>
    </xpath>
</data>

- kind=header id=595 key=website.template_header_mobile name=Template Header Mobile active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Template Header Mobile" t-name="website.template_header_mobile">
    <t t-set="is_mobile" t-value="True"/>

    <t t-call="website.navbar" _navbar_classes.f="o_header_mobile d-block d-lg-none shadow-sm" _navbar_expand_class.f="" _navbar_name.f="Mobile">

        <div class="o_main_nav container flex-wrap justify-content-between">
            <div class="d-flex flex-grow-1">
                <!-- Brand -->
                <t t-call="website.placeholder_header_brand"/>
                <ul class="o_header_mobile_buttons_wrap navbar-nav d-flex flex-row align-items-center gap-2 mb-0 ms-auto"/>
            </div>
            <button class="nav-link btn p-2 o_not_editable" type="button" data-bs-toggle="offcanvas" data-bs-target="#top_menu_collapse_mobile" aria-controls="top_menu_collapse_mobile" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"/>
            </button>
            <div t-attf-class="offcanvas #{_side or 'offcanvas-end'} o_navbar_mobile" id="top_menu_collapse_mobile">
                <div class="offcanvas-header justify-content-end o_not_editable">
                    <button type="button" class="nav-link btn-close" data-bs-dismiss="offcanvas" aria-label="Close"/>
                </div>
                <div class="offcanvas-body d-flex flex-column justify-content-between h-100 w-100 pt-0">
                    <ul class="navbar-nav">
                        <!-- Search bar -->
                        <t t-call="website.placeholder_header_search_box" _classes.f="mb-3" _input_classes.f="rounded-start-pill text-bg-light ps-3" _submit_classes.f="rounded-end-pill bg-o-color-3 pe-3" limit.f="0"/>
                        <!-- Navbar -->
                        <li>
                            <t t-set="is_vertical_nav" t-valuef="True"/>
                            <t t-call="website.navbar_nav" _no_autohide_menu_mobile.f="True">
                                <t t-set="offcanvas_is_leftside" t-valuef=""/>
                                <!-- Menu -->
                                <t t-foreach="website.menu_id.child_id" t-as="submenu">
                                    <t t-call="website.submenu" item_class.f="nav-item border-top #{submenu_last and 'border-bottom'}" link_class.f="nav-link p-3 text-wrap" dropdown_toggler_classes.f="d-flex justify-content-between align-items-center" dropdown_menu_classes.f="position-relative rounded-0 o_dropdown_without_offset"/>
                                </t>
                            </t>
                        </li>
                        <!-- Text element -->
                        <t t-call="website.placeholder_header_text_element" _div_class.f="mt-2"/>
                        <!-- Social -->
                        <t t-call="website.placeholder_header_social_links" _div_class.f="mt-2"/>
                    </ul>
                    <ul class="navbar-nav gap-2 mt-3 w-100">
                        <!-- Language Selector -->
                        <t t-call="website.placeholder_header_language_selector" _btn_class.f="{{_additional_btn_color or 'nav-link'}} d-flex align-items-center w-100" _txt_class.f="me-auto small" _flag_class.f="me-2" _div_classes.f="dropup" _dropdown_menu_class.f="w-100"/>
                        <!-- Sign In -->
                        <t t-call="portal.placeholder_user_sign_in" _link_class.f="{{_additional_btn_color or 'nav-link o_nav_link_btn'}} w-100 border text-center"/>
                        <!-- User Dropdown -->
                        <t t-call="portal.user_dropdown" _icon="true" _user_name="true" _user_name_class.f="me-auto small" _link_class.f="{{ _additional_btn_color or 'nav-link'}} d-flex align-items-center border-0" _icon_class.f="me-2" _item_class.f="dropdown dropup" _dropdown_menu_class.f="w-100"/>
                        <!-- Call To Action -->
                        <t t-call="website.header_call_to_action_large"/>
                    </ul>
                </div>
            </div>
        </div>
    </t>
</t>

- kind=footer id=498 key=portal.address_footer name=portal.address_footer active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="portal.address_footer">
        <div class="d-flex flex-column flex-md-row align-items-center justify-content-between mt32 mb32">
            <a role="button" t-att-href="discard_url or '/my/'" class="btn btn-outline-secondary w-100 w-md-auto order-md-1 order-3">
                <i class="fw-light fa fa-angle-left me-2"/>Discard
            </a>
            <div class="position-relative w-100 d-flex d-md-none justify-content-center align-items-center order-2 my-2 opacity-75">
                <hr class="w-100"/>
                <span class="px-3">or</span>
                <hr class="w-100"/>
            </div>
            <button id="save_address" class="btn btn-primary w-100 w-md-auto order-1 order-md-3">
                <t name="save_address_label">Save Address</t>
                <i class="fw-light fa fa-angle-right ms-2"/>
            </button>
        </div>
    </t>

- kind=footer id=503 key=portal.footer_language_selector name=Footer Language Selector active=True website=null inherit={"id": 502, "name": "Main Frontend Layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Footer Language Selector">
        <xpath expr="//*[hasclass('o_footer_copyright_name')]" position="after">
            <t id="language_selector_call" t-call="portal.language_selector" _div_classes="(_div_classes or '') + ' dropup'"/>
        </xpath>
    </data>

- kind=footer id=208 key=web.external_layout_footer_content name=external_layout_footer_content active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="web.external_layout_footer_content">
        <div t-attf-class="o_footer_content {{footer_content_classes}}">
            <table class="table-borderless w-100">
                <t t-set="footer_additionnal_content">
                    <strong t-if="not is_html_empty(company.report_header) and is_tagline_footer" t-field="company.report_header" class="o_company_tagline" t-attf-class="{{is_centered_footer and 'w-100' or 'text-nowrap'}}">
                        Company tagline
                    </strong>
                    <div t-if="report_type == 'pdf' and display_name_in_footer" t-out="o.name">(document name)</div>
                </t>
                <t t-set="footer_pager">
                    <div t-if="report_type == 'pdf'" class="o_footer_pager o_footer_pager_pdf text-nowrap text-muted">Page <span class="page"/> / <span class="topage"/></div>
                    <div t-if="is_preview" class="o_footer_pager text-nowrap text-muted">Page 1 / 1</div>
                </t>
                <tr>
                    <td class="o_footer_content_text align-top" t-att-rowspan="not is_centered_footer and 2">
                        <div t-field="company.report_footer"/>
                    </td>
                    <td t-if="not is_centered_footer" class="align-top text-end ps-3">
                        <t t-out="footer_additionnal_content"/>
                    </td>
                </tr>
                <tr t-if="not is_centered_footer and (is_preview or report_type == 'pdf')">
                    <td class="align-bottom text-end ps-3">
                        <t t-out="footer_pager"/>
                    </td>
                </tr>
                <tr t-elif="is_centered_footer">
                    <td class="align-top text-center">
                        <t t-out="footer_additionnal_content"/>
                        <t t-out="footer_pager"/>
                    </td>
                </tr>
            </table>
        </div>
    </t>

- kind=footer id=669 key=website.footer_cookie_policy_link name=Footer Cookie Policy Link active=True website=null inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Footer Cookie Policy Link">
    <xpath expr="//div[@id='footer']" position="after">
        <div t-if="website.cookies_bar" class="o_cookie_policy_link_container container text-center text-md-start">
            <p class="m-0">
                <a href="/cookie-policy" class="oe_unremovable btn btn-link btn-sm px-0 o_translate_inline">Cookie Policy</a>
            </p>
        </div>
    </xpath>
</data>

- kind=footer id=668 key=website.footer_copyright_company_name name=footer_copyright_company_name active=True website=null inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//footer//span[hasclass('o_footer_copyright_name')]" position="replace">
        <span class="o_footer_copyright_name me-2 small">Copyright &amp;copy; Company name</span>
    </xpath>
    <xpath expr="//footer//span[hasclass('o_footer_copyright_name')]/.." position="attributes">
        <attribute name="class" remove="text-sm-start" add="d-flex flex-column-reverse gap-2 text-md-start" separator=" "/>
    </xpath>
</data>

- kind=footer id=652 key=website.footer_custom name=Default active=True website=null inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=14 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Default">
    <xpath expr="//div[@id='footer']" position="replace">
        <div id="footer" class="oe_structure oe_structure_solo border text-break" t-ignore="true" t-if="not no_footer" style="--box-border-left-width: 0px; --box-border-right-width: 0px;">
            <section class="s_text_block pt40 pb16" data-snippet="s_text_block" data-name="Container">
                <div class="container">
                    <div class="row">
                        <div class="col-lg-2 pt24 pb24">
                            <h5>Useful Links</h5>
                            <ul class="list-unstyled">
                                <li><a href="/">Home</a></li>
                                <li><a href="#">About us</a></li>
                                <li><a href="#">Products</a></li>
                                <li><a href="#">Services</a></li>
                                <li><a href="#">Legal</a></li>
                                <t t-set="configurator_footer_links" t-value="[]"/>
                                <li t-foreach="configurator_footer_links" t-as="link">
                                    <a t-att-href="link['href']" t-out="link['text']"/>
                                </li>
                                <li><a href="/contactus">Contact us</a></li>
                            </ul>
                        </div>
                        <div class="col-lg-5 pt24 pb24">
                            <h5>About us</h5>
                            <p>We are a team of passionate people whose goal is to improve everyone's life through disruptive products. We build great products to solve your business problems.
                            <br/><br/>Our products are designed for small to medium size companies willing to optimize their performance.</p>
                        </div>
                        <div class="col-lg-4 offset-lg-1 pt24 pb24">
                            <h5>Connect with us</h5>
                            <ul class="list-unstyled">
                                <li><i class="fa fa-comment fa-fw me-2"/><a href="/contactus">Contact us</a></li>
                                <li><i class="fa fa-envelope fa-fw me-2"/><a href="mailto:info@yourcompany.example.com">info@yourcompany.example.com</a></li>
                                <li><i class="fa fa-phone fa-fw me-2"/><a href="tel:+1 555-555-5556"><span class="o_force_ltr">+1 555-555-5556</span></a></li>
                            </ul>
                            <div class="s_social_media text-start o_not_editable" data-snippet="s_social_media" data-name="Social Media" contenteditable="false">
                                <h5 class="s_social_media_title d-none" contenteditable="true">Follow us</h5>
                                <a href="/website/social/facebook" class="s_social_media_facebook" target="_blank" aria-label="Facebook">
                                    <i class="fa fa-facebook rounded-circle shadow-sm o_editable_media"/>
                                </a>
                                <a href="/website/social/twitter" class="s_social_media_twitter" target="_blank" aria-label="X">
                                    <i class="fa fa-twitter rounded-circle shadow-sm o_editable_media"/>
                                </a>
                                <a href="/website/social/linkedin" class="s_social_media_linkedin" target="_blank" aria-label="LinkedIn">
                                    <i class="fa fa-linkedin rounded-circle shadow-sm o_editable_media"/>
                                </a>
                                <a href="/" class="text-800" aria-label="Extra page">
                                    <i class="fa fa-home rounded-circle shadow-sm o_editable_media"/>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </xpath>
</data>

- kind=footer id=2207 key=website.footer_custom name=Default active=True website={"id": 1, "name": "TOTEM Platform"} inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=14 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Default">
    <xpath expr="//div[@id='footer']" position="replace">
        <div id="footer" class="oe_structure oe_structure_solo border text-break" t-ignore="true" t-if="not no_footer" style="--box-border-left-width: 0px; --box-border-right-width: 0px;">
            <section class="s_text_block pt40 pb16" data-snippet="s_text_block" data-name="Container">
                <div class="container">
                    <div class="row">
                        <div class="col-lg-2 pt24 pb24">
                            <h5>Useful Links</h5>
                            <ul class="list-unstyled">
                                <li><a href="/">Home</a></li>
                                <li><a href="#">About us</a></li>
                                <li><a href="#">Products</a></li>
                                <li><a href="#">Services</a></li>
                                <li><a href="#">Legal</a></li>
                                <t t-set="configurator_footer_links" t-value="[]"/>
                                <li t-foreach="configurator_footer_links" t-as="link">
                                    <a t-att-href="link['href']" t-out="link['text']"/>
                                </li>
                                <li><a href="/contactus">Contact us</a></li>
                            </ul>
                        </div>
                        <div class="col-lg-5 pt24 pb24">
                            <h5>About us</h5>
                            <p>We are a team of passionate people whose goal is to improve everyone's life through disruptive products. We build great products to solve your business problems.
                            <br/><br/>Our products are designed for small to medium size companies willing to optimize their performance.</p>
                        </div>
                        <div class="col-lg-4 offset-lg-1 pt24 pb24">
                            <h5>Connect with us</h5>
                            <ul class="list-unstyled">
                                <li><i class="fa fa-comment fa-fw me-2"/><a href="/contactus">Contact us</a></li>
                                <li><i class="fa fa-envelope fa-fw me-2"/><a href="mailto:info@yourcompany.example.com">info@yourcompany.example.com</a></li>
                                <li><i class="fa fa-phone fa-fw me-2"/><a href="tel:+1 555-555-5556"><span class="o_force_ltr">+1 555-555-5556</span></a></li>
                            </ul>
                            <div class="s_social_media text-start o_not_editable" data-snippet="s_social_media" data-name="Social Media" contenteditable="false">
                                <h5 class="s_social_media_title d-none" contenteditable="true">Follow us</h5>
                                <a href="/website/social/facebook" class="s_social_media_facebook" target="_blank" aria-label="Facebook">
                                    <i class="fa fa-facebook rounded-circle shadow-sm o_editable_media"/>
                                </a>
                                <a href="/website/social/twitter" class="s_social_media_twitter" target="_blank" aria-label="X">
                                    <i class="fa fa-twitter rounded-circle shadow-sm o_editable_media"/>
                                </a>
                                <a href="/website/social/linkedin" class="s_social_media_linkedin" target="_blank" aria-label="LinkedIn">
                                    <i class="fa fa-linkedin rounded-circle shadow-sm o_editable_media"/>
                                </a>
                                <a href="/" class="text-800" aria-label="Extra page">
                                    <i class="fa fa-home rounded-circle shadow-sm o_editable_media"/>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </xpath>
</data>

- kind=footer id=681 key=website.footer_language_selector_inline name=Footer Language Selector Inline active=True website=null inherit={"id": 503, "name": "Footer Language Selector"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Footer Language Selector Inline">
    <xpath expr="//t[@id='language_selector_call']" position="attributes">
        <attribute name="t-call">website.language_selector_inline</attribute>
    </xpath>
</data>

- kind=theme id=1302 key=False name=Themes Kanban active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <kanban create="false" can_open="0" default_order="state,sequence,name" js_class="theme_preview_kanban">
                    <field name="icon"/>
                    <field name="summary"/>
                    <field name="name"/>
                    <field name="state"/>
                    <field name="url"/>
                    <field name="image_ids"/>
                    <field name="category_id"/>
                    <field name="display_name"/>
                    <field name="is_installed_on_current_website"/>
                    <templates>
                        <div t-name="card" t-attf-class="o_theme_preview #{record.is_installed_on_current_website.raw_value? 'o_theme_installed' : ''}">
                            <t t-set="has_image" t-value="record.image_ids.raw_value.length &gt; 0"/>
                            <t t-set="has_screenshot" t-value="record.image_ids.raw_value.length &gt; 1"/>
                            <t t-set="image_url" t-value="has_image ? '/web/image/' + record.image_ids.raw_value[0] : record.icon.value"/>

                            <div class="o_theme_preview_top position-relative border rounded-3 transition-base">
                                <div t-attf-class="bg-gray-lighter #{has_screenshot? 'o_theme_screenshot' : (has_image ? 'o_theme_cover' : 'o_theme_logo')} rounded-3" t-attf-style="background-image: url(#{image_url});"/>
                                <div t-if="record.is_installed_on_current_website.raw_value or !record.url.value" class="o_button_area position-absolute top-50 start-50 translate-middle d-flex align-items-center justify-content-center w-100 h-100 bg-dark bg-opacity-50 rounded opacity-0 opacity-100-hover transition-fade">
                                    <div class="d-flex flex-column gap-2 w-50">
                                        <t t-if="record.is_installed_on_current_website.raw_value">
                                            <button type="object" name="button_refresh_theme" class="btn btn-primary">Update theme</button>
                                            <button type="object" name="button_remove_theme" class="btn btn-secondary">Remove theme</button>
                                        </t>
                                        <t t-else="">
                                            <button type="object" name="button_choose_theme" class="btn btn-primary">Use this theme</button>
                                        </t>
                                    </div>
                                </div>
                                <t t-else="">
                                    <button class="position-absolute top-0 start-0 h-100 w-100 opacity-0" role="button" type="open" t-if="record.url.value"/>
                                </t>
                            </div>
                            <div class="o_theme_preview_bottom mt-2 mb-3 px-2">
                                <small t-if="record.summary.value" class="text-uppercase text-muted">
                                    <b><t t-out="record.summary.value.split(',')[0]"/></b>
                                </small>
                                <h3 t-if="record.display_name.value">
                                    <b><t t-out="record.display_name.value.replace('Theme', '').replace('theme', '')"/></b>
                                </h3>
                            </div>
                        </div>
                    </templates>
                </kanban>

- kind=theme id=1303 key=False name=Themes Search active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <search>
                    <field name="name" filter_domain="['|', '|', ('summary', 'ilike', self), ('shortdesc', 'ilike', self), ('name', 'ilike', self)]" string="Theme"/>
                    <field name="category_id" filter_domain="['|', '|', ('summary', 'ilike', self), ('shortdesc', 'ilike', self), ('category_id', 'ilike', self)]" string="Category"/>
                    <group>
                        <filter string="Author" name="author" domain="[]" context="{'group_by':'author'}"/>
                        <filter string="Category" name="category" domain="[]" context="{'group_by':'category_id'}"/>
                    </group>
                </search>

- kind=other id=1362 key=ai_website.snippets name=snippets active=True website=null inherit={"id": 726, "name": "snippets"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <!-- Use xpath to make the snippet appear before other snippets -->
    <xpath expr="//t[@t-snippet='website.s_title_form']" position="before">
        <t t-install="ai_website_livechat" string="AI Livechat" group="contact_and_forms" label="AI" t-image-preview="/ai_website/static/src/img/snippets_thumbs/ai_livechat.png"/>
        <t id="ai_livechat_hook"/>
    </xpath>
</data>

- kind=other id=703 key=website.404_plausible name=Plausible 404 active=True website=null inherit={"id": 276, "name": "Page Not Found"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Plausible 404">
    <div id="wrap" position="inside">
        <input t-if="website.plausible_shared_key" type="hidden" class="js_plausible_push" data-event-name="404" t-attf-data-event-params="{&quot;path&quot;: &quot;#{request.httprequest.path}&quot;}"/>
    </div>
</data>

- kind=other id=579 key=website.aboutus name=About Us active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="About Us" t-name="website.aboutus">
        <t t-call="website.layout">
            <div id="wrap">
                <div class="oe_structure">
                    <section class="s_title parallax s_parallax_is_fixed bg-black-50 pt24 pb24" data-vcss="001" data-snippet="s_title" data-scroll-background-ratio="1">
                        <span class="s_parallax_bg_wrap">
                            <span class="s_parallax_bg oe_img_bg" style="background-image: url('/web/image/website.s_parallax_default_image'); background-position: 50% 0;"/>
                        </span>
                        <div class="o_we_bg_filter bg-black-50"/>
                        <div class="container">
                            <h1>About us</h1>
                        </div>
                    </section>
                </div>
                <div class="oe_structure"/>
            </div>
        </t>
    </t>

- kind=other id=587 key=website.auth_pages_meta_robots name=Auth Pages - No Index active=True website=null inherit={"id": 190, "name": "Login Layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Auth Pages - No Index">
    <xpath expr="t[@t-call]" position="before">
        <t t-set="head">
            <meta name="robots" content="noindex, nofollow"/>
        </t>
    </xpath>
</data>

- kind=other id=590 key=website.brand_promotion name=Brand Promotion active=True website=null inherit={"id": 189, "name": "Brand Promotion"}
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Brand Promotion">
    <xpath expr="//t[@t-call='web.brand_promotion_message']" position="replace">
        <t t-set="_message">
            Create a <a target="_blank" href="http://www.odoo.com/app/website?utm_source=db&amp;utm_medium=website">free website</a>
        </t>
        <t t-call="web.brand_promotion_message" _utm_medium.f="website"/>
    </xpath>
</data>

- kind=other id=1043 key=website.configurator_about_us_s_company_team name=Snippet 's_company_team' for 'about_us' pages generated by the configurator active=True website=null inherit={"id": 1034, "name": "Snippet 's_company_team' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1042 key=website.configurator_about_us_s_image_text name=Snippet 's_image_text' for 'about_us' pages generated by the configurator active=True website=null inherit={"id": 1029, "name": "Snippet 's_image_text' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1044 key=website.configurator_about_us_s_text_image name=Snippet 's_text_image' for 'about_us' pages generated by the configurator active=True website=null inherit={"id": 1035, "name": "Snippet 's_text_image' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1045 key=website.configurator_about_us_s_title name=Snippet 's_title' for 'about_us' pages generated by the configurator active=True website=null inherit={"id": 1031, "name": "Snippet 's_title' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1039 key=website.configurator_homepage_s_cover name=Snippet 's_cover' for 'homepage' pages generated by the configurator active=True website=null inherit={"id": 1037, "name": "Snippet 's_cover' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1041 key=website.configurator_homepage_s_numbers name=Snippet 's_numbers' for 'homepage' pages generated by the configurator active=True website=null inherit={"id": 1038, "name": "Snippet 's_numbers' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1040 key=website.configurator_homepage_s_text_image name=Snippet 's_text_image' for 'homepage' pages generated by the configurator active=True website=null inherit={"id": 1035, "name": "Snippet 's_text_image' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1046 key=website.configurator_our_services_s_quotes_carousel name=Snippet 's_quotes_carousel' for 'our_services' pages generated by the configurator active=True website=null inherit={"id": 1030, "name": "Snippet 's_quotes_carousel' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1047 key=website.configurator_our_services_s_references name=Snippet 's_references' for 'our_services' pages generated by the configurator active=True website=null inherit={"id": 1036, "name": "Snippet 's_references' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1048 key=website.configurator_our_services_s_three_columns name=Snippet 's_three_columns' for 'our_services' pages generated by the configurator active=True website=null inherit={"id": 1033, "name": "Snippet 's_three_columns' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1049 key=website.configurator_pricing_s_comparisons name=Snippet 's_comparisons' for 'pricing' pages generated by the configurator active=True website=null inherit={"id": 1028, "name": "Snippet 's_comparisons' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1050 key=website.configurator_privacy_policy_s_faq_collapse name=Snippet 's_faq_collapse' for 'privacy_policy' pages generated by the configurator active=True website=null inherit={"id": 1032, "name": "Snippet 's_faq_collapse' for pages generated by the configurator"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1034 key=website.configurator_s_company_team name=Snippet 's_company_team' for pages generated by the configurator active=True website=null inherit={"id": 777, "name": "Team"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1028 key=website.configurator_s_comparisons name=Snippet 's_comparisons' for pages generated by the configurator active=True website=null inherit={"id": 775, "name": "Comparisons"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1037 key=website.configurator_s_cover name=Snippet 's_cover' for pages generated by the configurator active=True website=null inherit={"id": 731, "name": "Cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1032 key=website.configurator_s_faq_collapse name=Snippet 's_faq_collapse' for pages generated by the configurator active=True website=null inherit={"id": 790, "name": "FAQ"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1029 key=website.configurator_s_image_text name=Snippet 's_image_text' for pages generated by the configurator active=True website=null inherit={"id": 736, "name": "Image - Text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1038 key=website.configurator_s_numbers name=Snippet 's_numbers' for pages generated by the configurator active=True website=null inherit={"id": 803, "name": "Numbers"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1030 key=website.configurator_s_quotes_carousel name=Snippet 's_quotes_carousel' for pages generated by the configurator active=True website=null inherit={"id": 799, "name": "Quotes"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1036 key=website.configurator_s_references name=Snippet 's_references' for pages generated by the configurator active=True website=null inherit={"id": 785, "name": "References"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1035 key=website.configurator_s_text_image name=Snippet 's_text_image' for pages generated by the configurator active=True website=null inherit={"id": 735, "name": "Text - Image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1033 key=website.configurator_s_three_columns name=Snippet 's_three_columns' for pages generated by the configurator active=True website=null inherit={"id": 746, "name": "Columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1031 key=website.configurator_s_title name=Snippet 's_title' for pages generated by the configurator active=True website=null inherit={"id": 730, "name": "Title"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=576 key=website.contactus name=Contact Us active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=1 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Contact Us" t-name="website.contactus">
        <t t-call="website.layout">
            <t t-set="logged_partner" t-value="request.env['website.visitor']._get_visitor_from_request().partner_id"/>
            <t t-set="contactus_form_values" t-value="{                 'email_to': res_company.email,                 'name': request.params.get('name', ''),                 'phone': request.params.get('phone', ''),                 'email_from': request.params.get('email_from', ''),                 'company': request.params.get('company', ''),                 'subject': request.params.get('subject', ''),             }"/>
            <span class="hidden" data-for="contactus_form" t-att-data-values="contactus_form_values"/>
            <div id="wrap" class="oe_structure oe_empty">
                <section class="s_form_aside pt48 pb120" data-snippet="s_form_aside" data-name="Form Aside" data-oe-shape-data="{'shape': 'html_builder/Connections/14', 'colors': {'c5': 'o-color-1'}, 'showOnMobile': true}" style="position: relative;">
                    <div class="o_we_shape o_html_builder_Connections_14 o_shape_show_mobile" style="background-image: url('/html_editor/shape/html_builder/Connections/14.svg?c5=o-color-1');"/>
                    <div class="container">
                        <div class="row">
                            <div class="col-12 col-lg-6 order-lg-0" style="order: 1;">
                                <h1 class="h2-fs">Contact us</h1>
                                <p class="lead">
                                    Contact us about anything related to our company or services.
                                </p>
                                <section class="s_website_form" data-vcss="001" data-snippet="s_website_form">
                                    <div class="container">
                                        <form id="contactus_form" action="/website/form/" method="post" enctype="multipart/form-data" class="o_mark_required" data-mark="*" data-model_name="mail.mail" data-success-mode="redirect" data-success-page="/contactus-thank-you" data-pre-fill="true">
                                            <div class="s_website_form_rows row s_col_no_bgcolor">
                                                <div class="mb-3 col-lg-6 s_website_form_field s_website_form_custom s_website_form_required" data-type="char" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact1">
                                                        <span class="s_website_form_label_content">Name</span>
                                                        <span class="s_website_form_mark"> *</span>
                                                    </label>
                                                    <input id="contact1" type="text" placeholder="John Doe" class="form-control s_website_form_input" name="name" required="" data-fill-with="name"/>
                                                </div>
                                                <div class="mb-3 col-lg-6 s_website_form_field s_website_form_custom" data-type="char" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact2">
                                                        <span class="s_website_form_label_content">Phone Number</span>
                                                    </label>
                                                    <input id="contact2" type="tel" placeholder="+1 555-555-5556" class="form-control s_website_form_input" name="phone" data-fill-with="phone"/>
                                                </div>
                                                <div class="mb-3 col-lg-6 s_website_form_field s_website_form_required s_website_form_model_required" data-type="email" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact3">
                                                        <span class="s_website_form_label_content">Email</span>
                                                        <span class="s_website_form_mark"> *</span>
                                                    </label>
                                                    <input id="contact3" type="email" placeholder="example@mail.com" class="form-control s_website_form_input" name="email_from" required="" data-fill-with="email"/>
                                                </div>
                                                <div class="mb-3 col-lg-6 s_website_form_field s_website_form_custom" data-type="char" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact4">
                                                        <span class="s_website_form_label_content">Company</span>
                                                    </label>
                                                    <input id="contact4" type="text" placeholder="ACME Corp" class="form-control s_website_form_input" name="company" data-fill-with="parent_name"/>
                                                </div>
                                                <div class="mb-3 col-12 s_website_form_field s_website_form_required s_website_form_model_required" data-type="char" data-name="Field">
                                                    <label class="s_website_form_label" style="width: 200px" for="contact5">
                                                        <span class="s_website_form_label_content">Subject</span>
                                                        <span class="s_website_form_mark"> *</span>
                                                    </label>
                                                    <input id="contact5" type="text" placeholder=…

- kind=other id=577 key=website.contactus_thanks name=Thanks (Contact us) active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Thanks (Contact us)" t-name="website.contactus_thanks">
                <t t-call="website.layout">
                    <div id="wrap" class="oe_structure oe_empty">
                        <section class="s_text_block pt80 pb80" data-snippet="s_text_block" data-name="Thank You Section">
                            <div class="container s_allow_columns">
                                <div class="row">
                                    <div class="col-lg-12" style="text-align: center;">
                                        <i class="fa fa-paper-plane fa-2x mb-3 rounded-circle text-bg-success" role="presentation"/>
                                        <h1 class="fw-bolder">Thank You!</h1>
                                        <p class="lead">Your message has been sent. <br/>We will get back to you shortly.</p>
                                        <a href="/">Go to Homepage</a>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                    <input t-if="website.plausible_shared_key" type="hidden" class="js_plausible_push" data-event-name="Lead Generation" data-event-params="{&quot;CTA&quot;: &quot;Contact Us&quot;}"/>
                </t>
            </t>

- kind=other id=578 key=website.cookie_policy name=Cookie Policy active=True website=null inherit=null
  signals: hrefs_total=3 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Cookie Policy" t-name="website.cookie_policy">
        <t t-call="website.layout">
            <div id="wrap" class="oe_structure">
                <section class="s_cta_mockups o_cc o_cc2 pt64 pb64 o_colored_level oe_unremovable" data-snippet="s_cta_mockups" data-name="Call to Action Mockups">
                    <div class="container">
                        <div class="row o_grid_mode" data-row-count="9">
                            <div class="o_grid_item g-height-6 g-col-lg-4 col-lg-4 o_colored_level oe_unremovable" style="grid-area: 3 / 1 / 9 / 5; z-index: 2;">
                                <h1 class="h3-fs">Manage Your Cookie Preferences</h1>
                                <p class="lead">We use cookies to enhance your experience on our website and personalize content. You have full control over your choices and can update your preferences at any time.</p>
                                <a href="#" class="o_cookies_bar_toggle btn btn-primary btn-md rounded-circle oe_unremovable">Update My Cookie Preferences</a>
                            </div>
                            <div class="o_grid_item o_grid_item_image g-height-9 g-col-lg-7 col-lg-7 o_colored_level" style="grid-area: 1 / 6 / 10 / 13; z-index: 1;">
                                <img src="html_editor/image_shape/website.s_cta_mockups_default_image/html_builder/devices/macbook_front.svg" class="img img-fluid" data-shape="html_builder/devices/macbook_front" data-format-mimetype="image/webp" data-file-name="s_cta_mockups.webp" alt="" loading="lazy" data-mimetype="image/webp" style=""/>
                            </div>
                            <div class="o_grid_item o_grid_item_image o_snippet_mobile_invisible g-height-8 g-col-lg-2 col-lg-2 d-none d-lg-block o_colored_level" style="grid-area: 2 / 6 / 10 / 8; z-index: 3;" data-invisible="1">
                                <img src="html_editor/image_shape/website.s_cta_mockups_default_image_1/html_builder/devices/iphone_front_portrait.svg" class="img img-fluid" data-shape="html_builder/devices/iphone_front_portrait" data-format-mimetype="image/webp" data-file-name="s_cta_mockups_1.webp" alt="" loading="lazy" data-mimetype="image/webp" style=""/>
                            </div>
                        </div>
                    </div>
                </section>
                <section class="pt8 pb8">
                    <div class="container">
                        <h2 class="pt16 h2-fs">Cookie Policy</h2>
                        <p>
                            Cookies are small bits of text sent by our servers to your computer or device when you access our services.
                            They are stored in your browser and later sent back to our servers so that we can provide contextual content.
                            Without cookies, using the web would be a much more frustrating experience.
                            We use them to support your activities on our website. For example, your session (so you don't have to login again) or your shopping cart.
                            <br/>
                            Cookies are also used to help us understand your preferences based on previous or current activity on our website (the pages you have
                            visited), your language and country, which enables us to provide you with improved services.
                            We also use cookies to help us compile aggregate data about site traffic and site interaction so that we can offer
                            better site experiences and tools in the future.
                        </p>
                        <p>
                            Here is an overview of the cookies that may be stored on your device when you visit our website:
                        </p>
                        <div class="table-responsive">
                            <table class="small table table-bordered text-center">
                                <thead class="table-light">
                                    <tr>
                                        <th scope="col" style="width: 20%">Category of Cookie</th>
                                        <th scope="col" style="width: 50%; min-width: 200px;">Purpose</th>
                                        <th scope="col" style="width: 30%">Examples</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>
                                            <p>Session &amp; Security<br/>(essential)</p>
                                        </td>
                                        <td>
                                            <p>
                                                Authenticate users, protect user data and allow the website to deliver the services users expects,
                                                such as maintaining the content of their cart, or allowing file uploads.
                                            </p>
                                            <p>The website will not work properly if you reject or discard those cookies.</p>
                                        </td>
                                        <td>
                                            session_id (Odoo)<br/>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p>Preferences<br/>(essential)</p>
                                        </td>
                                        <td>
                                            <p>Remember information about the preferred look or behavior of the website, such as your preferred language or region.</p>
                                            <p>Your experience may be degraded if you discard those coo…

- kind=other id=671 key=website.cookies_bar name=Cookies Bar active=True website=null inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=3 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Cookies Bar">
    <xpath expr="//footer" position="after">
        <div id="website_cookies_bar" t-if="website.cookies_bar" class="s_popup o_snippet_invisible d-none o_no_save" data-name="Cookies Bar" data-vcss="001" data-invisible="1">
            <div class="modal s_popup_bottom s_popup_no_backdrop o_cookies_discrete" data-show-after="500" data-display="afterDelay" data-consents-duration="999" data-bs-focus="false" data-bs-backdrop="false" data-bs-keyboard="false" tabindex="-1" role="dialog">
                <div class="modal-dialog d-flex s_popup_size_full">
                    <div class="modal-content oe_structure">
                        <!-- Keep this section equivalent to the rendering of the `website.cookies_bar.discrete` client template -->
                        <section class="o_colored_level o_cc o_cc1">
                            <div class="container">
                                <div class="row">
                                    <div class="col-lg-8 pt16">
                                        <p>
                                            <span class="pe-1">We use cookies to provide you a better user experience on this website.</span>
                                            <a href="/cookie-policy" class="o_cookies_bar_text_policy btn btn-link btn-sm px-0 o_translate_inline">Cookie Policy</a>
                                        </p>
                                    </div>
                                    <div class="col-lg-4 text-end pt16 pb16">
                                        <a href="#" id="cookies-consent-essential" role="button" class="js_close_popup btn btn-outline-primary rounded-circle btn-sm px-2">Only essentials</a>
                                        <a href="#" id="cookies-consent-all" role="button" class="js_close_popup btn btn-outline-primary rounded-circle btn-sm">I agree</a>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    </xpath>
</data>

- kind=other id=698 key=website.default_css name=default_css active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.default_css">
    <style type="text/css">
        div#wrap div &gt; h1{
            color: #875A7B;
        }
    </style>
</t>

- kind=other id=701 key=website.default_csv name=default_csv active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.default_csv">
    <t t-translation="off">1,2,3</t>
</t>

- kind=other id=696 key=website.default_js name=default_js active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.default_js">
    <script type="text/javascript">
        if (0 &gt; 1) {
            let it_cant_be = false;
        }
    </script>
</t>

- kind=other id=699 key=website.default_less name=default_less active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.default_less">
    <style type="text/less">
        div#wrap div &gt; h1 {
            color: @o-brand-odoo;
        }
    </style>
</t>

- kind=other id=695 key=website.default_page name=default_page active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.default_page">
    <t t-call="website.layout">
        <div id="wrap" class="oe_structure oe_empty"/>
    </t>
</t>

- kind=other id=700 key=website.default_scss name=default_scss active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.default_scss">
    <style type="text/scss">
        div#wrap div &gt; h1 {
            color: $o-brand-odoo;
        }
    </style>
</t>

- kind=other id=697 key=website.default_xml name=default_xml active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.default_xml">
    <t t-translation="off">&lt;?xml version="1.0" encoding="UTF-8"?&gt;</t>
</t>

- kind=other id=1346 key=website.empty_search_svg name=website.empty_search_svg active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.empty_search_svg">
        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100" viewBox="0 0 115 80" fill="none">
            <style>
                .headShake {
                    animation: headShake 1.3s ease-in-out forwards;
                    animation-delay: 0.75s;
                }
                @keyframes headShake {
                    0% {
                        transform: translateX(0)
                    }

                    6.5% {
                        transform: translateX(-6px) rotateY(-9deg)
                    }

                    18.5% {
                        transform: translateX(5px) rotateY(7deg)
                    }

                    31.5% {
                        transform: translateX(-3px) rotateY(-5deg)
                    }

                    43.5% {
                        transform: translateX(2px) rotateY(3deg)
                    }

                    50% {
                        transform: translateX(0)
                    }
                }
            </style>
            <path class="headShake" d="M39.2256 21.8668C46.3304 13.0757 59.2314 11.7663 68.019 19.0611C76.5217 26.1193 77.8477 38.4309 71.3195 47.1853L85.8336 61.6996L81.8665 65.6667L67.5676 51.368C59.9375 57.2137 49.2986 57.044 41.8431 50.8589C33.0555 43.5641 32.1207 30.658 39.2256 21.8668ZM54.9349 20.0096C46.6261 20.0096 39.9791 26.6566 39.9791 34.9654C39.9791 43.2742 46.7923 49.9212 54.9349 49.9212C63.2436 49.9212 69.8906 43.2742 69.8906 34.9654C69.8906 26.6566 63.2436 20.0096 54.9349 20.0096Z" fill="currentColor"/>
        </svg>
    </t>

- kind=other id=727 key=website.external_snippets name=external_snippets active=True website=null inherit={"id": 726, "name": "snippets"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//snippets[@id='snippet_structure']" position="inside">
        <t t-install="mass_mailing" string="Newsletter Block" group="contact_and_forms" t-image-preview="/website/static/src/img/snippets_previews/s_newsletter_block_preview.png"/>
        <t t-install="mass_mailing" string="Newsletter Aside" group="contact_and_forms" t-image-preview="/website/static/src/img/snippets_previews/s_newsletter_aside_preview.webp"/>
        <t t-install="mass_mailing" string="Newsletter Centered" group="contact_and_forms" t-image-preview="/website/static/src/img/snippets_previews/s_newsletter_centered_preview.jpg"/>
        <t t-install="mass_mailing" string="Newsletter Grid" group="contact_and_forms" t-image-preview="/website/static/src/img/snippets_previews/s_newsletter_grid_preview.jpg"/>
        <t t-install="mass_mailing" string="Newsletter Popup" group="contact_and_forms" t-image-preview="/website/static/src/img/snippets_previews/s_newsletter_subscribe_popup_preview.png"/>
        <t t-install="mass_mailing" string="Newsletter Box" group="contact_and_forms" t-image-preview="/website/static/src/img/snippets_previews/s_newsletter_box_preview.jpg"/>
        <t t-install="mass_mailing_sms" string="Newsletter SMS Notifications" group="contact_and_forms" t-image-preview="/website/static/src/img/snippets_previews/s_newsletter_sms_notifications_preview.png"/>
        <t t-install="mass_mailing" string="Newsletter Benefits" group="contact_and_forms" t-image-preview="/website/static/src/img/snippets_previews/s_newsletter_benefits_popup_preview.webp"/>
        <t t-install="website_payment" string="Donation" group="contact_and_forms" t-image-preview="/website/static/src/img/snippets_previews/s_donation_preview.png"/>
        <t t-install="website_sale" string="Products Carousel" group="catalog" t-image-preview="/website/static/src/img/snippets_previews/s_dynamic_snippet_products_preview.webp"/>
    </xpath>
    <xpath expr="//snippets[@id='snippet_content']" position="inside">
        <t id="newsletter_snippet" t-install="mass_mailing" string="Newsletter" t-thumbnail="/website/static/src/img/snippets_thumbs/s_newsletter_subscribe_form.svg"/>
        <t t-install="website_mail_group" string="Discussion Group" t-thumbnail="/website/static/src/img/snippets_thumbs/s_group.svg"/>
        <t t-install="website_payment" string="Donation Button" t-thumbnail="/website/static/src/img/snippets_thumbs/s_donation_button.svg"/>
        <t t-install="website_sale" string="Add to Cart Button" t-thumbnail="/website/static/src/img/snippets_thumbs/s_donation_button.svg"/>
    </xpath>
</data>

- kind=other id=575 key=website.homepage name=Home active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Home" t-name="website.homepage">
        <t t-call="website.layout" pageName.f="homepage">
            <div id="wrap" class="oe_structure oe_empty"/>
        </t>
    </t>

- kind=other id=583 key=website.homepage name=Home active=True website={"id": 1, "name": "TOTEM Platform"} inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Homepage" t-name="website.homepage">
    <t t-call="website.layout" pageName.f="homepage">
        <div id="wrap" class="oe_structure oe_empty"/>
    </t>
</t>

- kind=other id=718 key=website.iframefallback name=iframefallback active=True website=null inherit={"id": 186, "name": "Web layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//head/link[last()]" position="after">
        <t t-call-assets="web.assets_frontend" t-js="false"/>
        <t t-call-assets="website.assets_wysiwyg" t-js="false"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.iframefallback</attribute></xpath></data>

- kind=other id=2210 key=website.join-master name=Join Master active=True website={"id": 1, "name": "TOTEM Platform"} inherit=null
  signals: hrefs_total=1 forms_total=1 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.join-master">
    <t t-call="website.layout">
        <div id="wrap" class="oe_structure oe_empty"><section class="s_website_form pt16 pb16 o_colored_level" data-vcss="001" data-snippet="s_website_form" data-name="Форма">
        <div class="container-fluid">
            <form action="/website/form/" method="post" enctype="multipart/form-data" class="o_mark_required" data-mark="*" data-pre-fill="true" data-model_name="crm.lead" data-success-mode="redirect" data-success-page="/contactus-thank-you">
                <div class="s_website_form_rows row s_col_no_bgcolor">
                    
                    
                    
                    
                    
                    
                    
                    <div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_required undefined" data-type="char" data-translated-name="Ваше имя"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="o5k3gi7z2nr6"><span class="s_website_form_label_content">Имя</span><span class="s_website_form_mark"> *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="text" name="contact_name" required="1" data-fill-with="name" id="o5k3gi7z2nr6"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 undefined s_website_form_required" data-type="tel" data-translated-name="Номер телефона"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="oxi79e90crg"><span class="s_website_form_label_content">Телефон</span><span class="s_website_form_mark"> *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="tel" name="phone" data-fill-with="phone" id="oxi79e90crg" required=""/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_required undefined" data-type="email" data-translated-name="Ваш Email"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="o8mioecfbqoy"><span class="s_website_form_label_content">Электронная почта</span><span class="s_website_form_mark"> *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="email" name="email_from" required="1" data-fill-with="email" id="o8mioecfbqoy"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_custom s_website_form_required" data-type="char" data-translated-name="Город"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="ocykmq7w652s"><span class="s_website_form_label_content">Город</span><span class="s_website_form_mark">   *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="text" name="Город" required="" value="" placeholder="" id="ocykmq7w652s" data-fill-with="undefined"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_model_required undefined" data-type="char" data-translated-name="Тема"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="ojlhtra6nnjn"><span class="s_website_form_label_content">Специализация</span><span class="s_website_form_mark"> *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="text" name="name" required="" id="ojlhtra6nnjn"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 undefined s_website_form_required" data-type="text" data-translated-name="Ваш вопрос"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="o1esyc7wnrk3"><span class="s_website_form_label_content">Комментарий</span><span class="s_website_form_mark"> *</span></label><div class="col-sm"><textarea class="form-control s_website_form_input" name="description" required="1" id="o1esyc7wnrk3" rows="3"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_custom s_website_form_required s_website_form_field_hidden" data-type="char" data-translated-name="Город"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="obw1s2znegoo"><span class="s_website_form_label_content">source</span><span class="s_website_form_mark">  *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="text" name="source" required="" value="website_join_master" placeholder="" id="obw1s2znegoo" data-fill-with="undefined"/></div></div></div><div class="mb-0 py-2 col-12 s_website_form_submit text-end s_website_form_no_submit_label" data-name="Submit Button">
                        <div style="width: 200px;" class="s_website_form_label"/>
                        <span id="s_website_form_result"/>
                        <a href="#" role="button" class="btn btn-primary s_website_form_send">Отправить</a>
                    </div>
                </div>
            </form>
        </div>
    </section></div>
    </t>
</t>

- kind=other id=2209 key=website.join-salon name=Join Salon active=True website={"id": 1, "name": "TOTEM Platform"} inherit=null
  signals: hrefs_total=1 forms_total=1 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.join-salon">
    <t t-call="website.layout">
        <div id="wrap" class="oe_structure oe_empty"><section class="s_website_form pt16 pb16 o_colored_level" data-vcss="001" data-snippet="s_website_form" data-name="Форма">
        <div class="container-fluid">
            <form action="/website/form/" method="post" enctype="multipart/form-data" class="o_mark_required" data-mark="*" data-pre-fill="true" data-model_name="crm.lead" data-success-mode="redirect" data-success-page="/contactus-thank-you">
                <div class="s_website_form_rows row s_col_no_bgcolor">
                    
                    
                    
                    
                    
                    
                    
                    <div data-name="Field" class="s_website_form_field mb-3 col-12 undefined s_website_form_required" data-type="char" data-translated-name="Ваше имя"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="oyc59jz283ue"><span class="s_website_form_label_content">Имя контактного лица</span><span class="s_website_form_mark"> *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="text" name="contact_name" required="1" data-fill-with="name" id="oyc59jz283ue"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_required undefined" data-type="tel" data-translated-name="Номер телефона"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="osxcqrln82cd"><span class="s_website_form_label_content">Телефон</span><span class="s_website_form_mark"> *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="tel" name="phone" data-fill-with="phone" id="osxcqrln82cd" required=""/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_required undefined" data-type="email" data-translated-name="Ваш Email"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="o0f0mtwztqmbh"><span class="s_website_form_label_content">Электронная почта</span><span class="s_website_form_mark"> *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="email" name="email_from" required="1" data-fill-with="email" id="o0f0mtwztqmbh"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 undefined s_website_form_required" data-type="char" data-translated-name="Ваша компания"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="o53qizgm9aa9"><span class="s_website_form_label_content">Название салона</span><span class="s_website_form_mark"> *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="text" name="partner_name" id="o53qizgm9aa9" required=""/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_model_required undefined" data-type="char" data-translated-name="Тема"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="o1aajufsw2k6"><span class="s_website_form_label_content">Город</span><span class="s_website_form_mark"> *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="text" name="name" required="" id="o1aajufsw2k6"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_custom s_website_form_required" data-type="char" data-translated-name="Ваш вопрос"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="of13guepi4n9"><span class="s_website_form_label_content">Адрес (улица, дом)</span><span class="s_website_form_mark">  *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="text" name="Адрес (улица, дом)" required="" value="" placeholder="" id="of13guepi4n9" data-fill-with="undefined"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_custom s_website_form_required" data-type="char" data-translated-name="Адрес (улица, дом)"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="ocky2bmx4e1"><span class="s_website_form_label_content">Специализация салона</span><span class="s_website_form_mark">   *</span></label><div class="col-sm"><input class="form-control s_website_form_input" type="text" name="Специализация салона" required="" value="" placeholder="" id="ocky2bmx4e1" data-fill-with="undefined"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_custom s_website_form_required" data-type="float" data-translated-name="Количество мастеров"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="op8djkzd3nea"><span class="s_website_form_label_content">Количество мастеров</span><span class="s_website_form_mark">     *</span></label><div class="col-sm"><input type="number" class="form-control s_website_form_input" step="any" name="Количество мастеров" required="" value="" placeholder="" id="op8djkzd3nea" data-fill-with="undefined"/></div></div></div><div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_custom s_website_form_required" data-type="text" data-translated-name="Комментарий"><div class="row s_col_no_resize s_col_no_bgcolor"><label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="o92xtfpnzxyl"><span class="s_website_form_label_content">Комментарий</span><span class="s_…

- kind=other id=672 key=website.lang_flag name=Language Flag active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Language Flag" t-name="website.lang_flag">
    <img t-attf-class="o_lang_flag #{_flag_class}" t-attf-src="#{flag_image_url}?height=25" t-att-alt="flag_lang_alt or ''"/>
</t>

- kind=other id=673 key=website.language_selector name=language_selector active=True website=null inherit={"id": 504, "name": "Language Selector"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//t[@t-set='active_lang']" position="before">
        <t t-if="lang not in frontend_languages">
            <t t-set="lang" t-value="website.default_lang_id.code"/>
        </t>
    </xpath>

    <!-- Add the 'flags' possibility -->
    <xpath expr="//button[contains(@t-attf-class, 'dropdown-toggle')]/span" position="before">
        <t t-if="flags">
            <t t-if="no_text and not codes" t-set="flag_lang_alt" t-value="active_lang.name.split('/').pop()"/>
            <t t-call="website.lang_flag" flag_image_url="active_lang.flag_image_url"/>
        </t>
    </xpath>
    <xpath expr="//*[contains(@t-attf-class, 'js_change_lang')]/span" position="before">
        <t t-if="flags">
            <t t-call="website.lang_flag" flag_image_url="lg.flag_image_url"/>
        </t>
    </xpath>
</data>

- kind=other id=674 key=website.language_selector_inline name=language_selector_inline active=True website=null inherit={"id": 673, "name": "language_selector"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//*[contains(@t-attf-class, 'js_language_selector')]" position="attributes">
        <attribute name="t-attf-class" remove="dropup" add="small o_prevent_link_editor" separator=" "/>
    </xpath>
    <xpath expr="//*[contains(@t-attf-class, 'dropdown-toggle')]" position="replace"/>
    <xpath expr="//*[@role='menu']" position="attributes">
        <attribute name="t-attf-class" remove="dropdown-menu" add="list-inline" separator=" "/>
    </xpath>
    <xpath expr="//*[contains(@t-attf-class,'dropdown-item')]" position="attributes">
        <attribute name="t-attf-class" remove="dropdown-item" add="list-inline-item" separator=" "/>
    </xpath>
    <xpath expr="//t[@t-foreach='frontend_languages.values()']" position="inside">
        <t t-if="not lg_last and not no_text">
            <span class="list-inline-item">|</span>
        </t>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.language_selector_inline</attribute></xpath></data>

- kind=other id=714 key=website.list_hybrid name=Any Search Results active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Any Search Results" t-name="website.list_hybrid">
    <t t-call="website.layout">
        <div id="wrap">
            <div class="container pt24 pb24">
                <t t-call="website.website_search_box_input" _classes.f="mt8" search_type.f="all" action.f="/website/search"/>
                <h1 class="mt24 h3-fs">Search Results</h1>
                <t t-if="not results">
                    <div class="text-center">
                        <div class="mt-5 mb-3"><t t-call="website.empty_search_svg"/></div>
                        <t t-if="search">
                            Your search '<t t-out="search"/>' did not match anything.
                        </t>
                        <t t-else="">
                            Specify a search term.
                        </t>
                    </div>
                </t>
                <t t-elif="fuzzy_search">
                    <div class="alert alert-warning mt8" role="alert">
                        Your search '<t t-out="search"/>' did not match anything.
                        Results are displayed for '<t t-out="fuzzy_search"/>'.
                    </div>
                </t>
                <div t-if="results" class="table-responsive">
                    <t t-call="website.one_hybrid" t-foreach="results" t-as="result" t-key="result_index"/>
                </div>
                <div t-if="pager" class="o_portal_pager d-flex justify-content-center">
                    <t t-call="website.pager"/>
                </div>
            </div>
        </div>
    </t>
</t>

- kind=other id=713 key=website.list_website_public_pages name=Website Pages active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Website Pages" t-name="website.list_website_public_pages">
    <t t-call="website.layout">
        <div id="wrap">
            <div class="container">
                <t t-call="website.website_search_box_input" _form_classes.f="mt8 float-end" search_type.f="pages" action.f="/pages" search="original_search or search"/>
                <h1 class="mt16 h3-fs">Pages</h1>
                <t t-if="not pages">
                    <div t-if="search" class="alert alert-warning mt8" role="alert">
                        Your search '<t t-out="search"/>' did not match any pages.
                    </div>
                    <div t-else="" class="alert alert-warning mt8" role="alert">
                        There are currently no pages for this website.
                    </div>
                </t>
                <div t-elif="original_search" class="alert alert-warning mt8" role="alert">
                    No results found for '<span t-out="original_search"/>'. Showing results for '<span t-out="search"/>'.
                </div>
                <div t-if="pages" class="table-responsive">
                    <table class="table table-hover">
                        <tbody>
                            <tr t-foreach="pages" t-as="page">
                                <td><a t-att-href="page.url"><t t-out="page.name"/></a></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div t-if="pager" class="o_portal_pager d-flex justify-content-center">
                    <t t-call="website.pager"/>
                </div>
            </div>
        </div>
    </t>
</t>

- kind=other id=1149 key=website.new_page_template_about_full_1_s_call_to_action name=Snippet 's_call_to_action' for new page 'about' template 'full_1' active=True website=null inherit={"id": 1078, "name": "Snippet 's_call_to_action' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1146 key=website.new_page_template_about_full_1_s_company_team name=Snippet 's_company_team' for new page 'about' template 'full_1' active=True website=null inherit={"id": 979, "name": "new_page_template_about_s_company_team"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1148 key=website.new_page_template_about_full_1_s_quotes_carousel name=Snippet 's_quotes_carousel' for new page 'about' template 'full_1' active=True website=null inherit={"id": 1076, "name": "Snippet 's_quotes_carousel' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1147 key=website.new_page_template_about_full_1_s_references name=Snippet 's_references' for new page 'about' template 'full_1' active=True website=null inherit={"id": 1074, "name": "Snippet 's_references' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=919 key=website.new_page_template_about_full_1_s_text_block_h1 name=new_page_template_about_full_1_s_text_block_h1 active=True website=null inherit={"id": 918, "name": "new_page_template_about_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pb40" remove="pb0" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_full_1_s_text_block_h1</attribute></xpath></data>

- kind=other id=930 key=website.new_page_template_about_full_1_s_text_block_h2 name=new_page_template_about_full_1_s_text_block_h2 active=True website=null inherit={"id": 929, "name": "new_page_template_about_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pb40" remove="pb0" separator=" "/>
    </xpath>
    <xpath expr="//h2" position="replace" mode="inner">Meet The Team</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_full_1_s_text_block_h2</attribute></xpath></data>

- kind=other id=1145 key=website.new_page_template_about_full_1_s_three_columns name=Snippet 's_three_columns' for new page 'about' template 'full_1' active=True website=null inherit={"id": 997, "name": "new_page_template_about_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=945 key=website.new_page_template_about_full_s_image_text name=new_page_template_about_full_s_image_text active=True website=null inherit={"id": 944, "name": "new_page_template_about_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level pt48 pb56" remove="pt80 pb80" separator=" "/>
    </xpath>
    <xpath expr="//h2" position="replace">
        <h2>Our Story</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p>Embark on a journey through time as we share the story of our humble beginnings. What started as a simple idea in a garage has evolved into an innovative force in the industry.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_full_s_image_text</attribute></xpath></data>

- kind=other id=976 key=website.new_page_template_about_full_s_numbers name=new_page_template_about_full_s_numbers active=True website=null inherit={"id": 975, "name": "new_page_template_about_s_numbers"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_cc3 o_colored_level" remove="o_cc1" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_full_s_numbers</attribute></xpath></data>

- kind=other id=1142 key=website.new_page_template_about_full_s_picture name=Snippet 's_picture' for new page 'about' template 'full' active=True website=null inherit={"id": 963, "name": "new_page_template_about_s_picture"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1143 key=website.new_page_template_about_full_s_quotes_carousel name=Snippet 's_quotes_carousel' for new page 'about' template 'full' active=True website=null inherit={"id": 1076, "name": "Snippet 's_quotes_carousel' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1144 key=website.new_page_template_about_full_s_references name=Snippet 's_references' for new page 'about' template 'full' active=True website=null inherit={"id": 1074, "name": "Snippet 's_references' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1141 key=website.new_page_template_about_full_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'about' template 'full' active=True website=null inherit={"id": 918, "name": "new_page_template_about_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=957 key=website.new_page_template_about_full_s_text_image name=new_page_template_about_full_s_text_image active=True website=null inherit={"id": 956, "name": "new_page_template_about_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level pt56 pb56" remove="pt80 pb80" separator=" "/>
    </xpath>
    <xpath expr="//h2|//h3" position="replace">
        <h2 class="h3-fs">Our Goals</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p>We're driven by the aspiration to redefine industry standards, to exceed the expectations of our clients, and to foster a culture of continuous growth.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_full_s_text_image</attribute></xpath></data>

- kind=other id=1162 key=website.new_page_template_about_map_s_images_wall name=Snippet 's_images_wall' for new page 'about' template 'map' active=True website=null inherit={"id": 1075, "name": "Snippet 's_images_wall' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1161 key=website.new_page_template_about_map_s_map name=Snippet 's_map' for new page 'about' template 'map' active=True website=null inherit={"id": 1081, "name": "Snippet 's_map' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1159 key=website.new_page_template_about_map_s_numbers name=Snippet 's_numbers' for new page 'about' template 'map' active=True website=null inherit={"id": 975, "name": "new_page_template_about_s_numbers"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1158 key=website.new_page_template_about_map_s_text_block name=Snippet 's_text_block' for new page 'about' template 'map' active=True website=null inherit={"id": 1077, "name": "Snippet 's_text_block' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=910 key=website.new_page_template_about_map_s_text_block_2nd name=new_page_template_about_map_s_text_block_2nd active=True website=null inherit={"id": 909, "name": "new_page_template_about_s_text_block_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" remove="o_colored_level" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_map_s_text_block_2nd</attribute></xpath></data>

- kind=other id=920 key=website.new_page_template_about_map_s_text_block_h1 name=new_page_template_about_map_s_text_block_h1 active=True website=null inherit={"id": 918, "name": "new_page_template_about_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace" mode="inner">Title</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_map_s_text_block_h1</attribute></xpath></data>

- kind=other id=931 key=website.new_page_template_about_map_s_text_block_h2 name=new_page_template_about_map_s_text_block_h2 active=True website=null inherit={"id": 929, "name": "new_page_template_about_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="replace" mode="inner">Our Offices</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_map_s_text_block_h2</attribute></xpath></data>

- kind=other id=1160 key=website.new_page_template_about_map_s_text_image name=Snippet 's_text_image' for new page 'about' template 'map' active=True website=null inherit={"id": 956, "name": "new_page_template_about_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1150 key=website.new_page_template_about_mini_s_cover name=Snippet 's_cover' for new page 'about' template 'mini' active=True website=null inherit={"id": 984, "name": "new_page_template_about_s_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1152 key=website.new_page_template_about_mini_s_picture_only name=Snippet 's_picture_only' for new page 'about' template 'mini' active=True website=null inherit={"id": 1083, "name": "Snippet 's_picture_only' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1151 key=website.new_page_template_about_mini_s_text_block_2nd name=Snippet 's_text_block_2nd' for new page 'about' template 'mini' active=True website=null inherit={"id": 909, "name": "new_page_template_about_s_text_block_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=932 key=website.new_page_template_about_mini_s_text_block_h2 name=new_page_template_about_mini_s_text_block_h2 active=True website=null inherit={"id": 929, "name": "new_page_template_about_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="attributes">
        <attribute name="style">text-align: left;</attribute>
    </xpath>
    <xpath expr="//h2" position="replace" mode="inner">Our Story</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_mini_s_text_block_h2</attribute></xpath></data>

- kind=other id=1153 key=website.new_page_template_about_mini_s_text_block_h2_contact name=Snippet 's_text_block_h2_contact' for new page 'about' template 'mini' active=True website=null inherit={"id": 1080, "name": "Snippet 's_text_block_h2_contact' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1154 key=website.new_page_template_about_mini_s_website_form name=Snippet 's_website_form' for new page 'about' template 'mini' active=True website=null inherit={"id": 1073, "name": "Snippet 's_website_form' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1157 key=website.new_page_template_about_personal_s_call_to_action_about name=Snippet 's_call_to_action_about' for new page 'about' template 'personal' active=True website=null inherit={"id": 1079, "name": "Snippet 's_call_to_action_about' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1156 key=website.new_page_template_about_personal_s_features name=Snippet 's_features' for new page 'about' template 'personal' active=True website=null inherit={"id": 972, "name": "new_page_template_about_s_features"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=946 key=website.new_page_template_about_personal_s_image_text name=new_page_template_about_personal_s_image_text active=True website=null inherit={"id": 944, "name": "new_page_template_about_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="replace">
        <h2 class="h3-fs">About Me</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p>I'm a fullstack developer with a background in management. My analytical skills, coupled with effective communication, enable me to lead cross-functional teams to success.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_personal_s_image_text</attribute></xpath></data>

- kind=other id=977 key=website.new_page_template_about_personal_s_numbers name=new_page_template_about_personal_s_numbers active=True website=null inherit={"id": 975, "name": "new_page_template_about_s_numbers"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pt0 o_cc3 o_colored_level" remove="o_cc1 pt80" separator=" "/>
    </xpath>
    <xpath expr="//span[hasclass('h5-fs')]" position="replace" mode="inner">
        Clients
    </xpath>
    <xpath expr="(//span[hasclass('h5-fs')])[2]" position="replace" mode="inner">
        Growth Rate
    </xpath>
    <xpath expr="(//span[hasclass('h5-fs')])[3]" position="replace" mode="inner">
        Websites
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_personal_s_numbers</attribute></xpath></data>

- kind=other id=933 key=website.new_page_template_about_personal_s_text_block_h2 name=new_page_template_about_personal_s_text_block_h2 active=True website=null inherit={"id": 929, "name": "new_page_template_about_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_cc o_cc3" separator=" "/>
    </xpath>
    <xpath expr="//h2" position="replace" mode="inner">What Makes Me Proud</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_personal_s_text_block_h2</attribute></xpath></data>

- kind=other id=1155 key=website.new_page_template_about_personal_s_text_cover name=Snippet 's_text_cover' for new page 'about' template 'personal' active=True website=null inherit={"id": 968, "name": "new_page_template_about_s_text_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=990 key=website.new_page_template_about_s_banner name=new_page_template_about_s_banner active=True website=null inherit={"id": 989, "name": "new_page_template_s_banner"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace">
        <h1>Hello, I'm Tony Fred</h1>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead">Experienced fullstack developer.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_banner</attribute></xpath></data>

- kind=other id=1078 key=website.new_page_template_about_s_call_to_action name=Snippet 's_call_to_action' for new page 'about' templates active=True website=null inherit={"id": 1011, "name": "new_page_template_s_call_to_action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1079 key=website.new_page_template_about_s_call_to_action_about name=Snippet 's_call_to_action_about' for new page 'about' templates active=True website=null inherit={"id": 1055, "name": "Snippet 's_call_to_action_about' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=979 key=website.new_page_template_about_s_company_team name=new_page_template_about_s_company_team active=True website=null inherit={"id": 978, "name": "new_page_template_s_company_team"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level" remove="pt48" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_company_team</attribute></xpath></data>

- kind=other id=984 key=website.new_page_template_about_s_cover name=new_page_template_about_s_cover active=True website=null inherit={"id": 983, "name": "new_page_template_s_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pt40 pb40" remove="pt232 pb232" separator=" "/>
    </xpath>
    <xpath expr="//h1" position="replace">
        <h1 style="text-align: center;">About Us</h1>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_cover</attribute></xpath></data>

- kind=other id=972 key=website.new_page_template_about_s_features name=new_page_template_about_s_features active=True website=null inherit={"id": 971, "name": "new_page_template_s_features"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h3" position="replace">
        <h3 class="h5-fs">My Skills</h3>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[1]/div/h3" position="replace">
        <h3 class="h5-fs">Backend</h3>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[2]/div/h3" position="replace">
        <h3 class="h5-fs">Frontend</h3>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[3]/div/h3" position="replace">
        <h3 class="h5-fs">Management</h3>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[1]/div/p" position="replace">
        <p>Proficient in backend development, specializing in Python, Django, and database management to create efficient and scalable solutions.</p>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[2]/div/p" position="replace">
        <p>Mastering frontend craftsmanship with expertise in HTML, CSS, and JavaScript to craft captivating and responsive user experiences.</p>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[3]/div/p" position="replace">
        <p>Experienced in effective project management, adept at leading cross-functional teams and delivering successful outcomes with a strategic approach.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_features</attribute></xpath></data>

- kind=other id=944 key=website.new_page_template_about_s_image_text name=new_page_template_about_s_image_text active=True website=null inherit={"id": 943, "name": "new_page_template_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_image_text</attribute></xpath></data>

- kind=other id=1075 key=website.new_page_template_about_s_images_wall name=Snippet 's_images_wall' for new page 'about' templates active=True website=null inherit={"id": 1024, "name": "new_page_template_s_images_wall"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1081 key=website.new_page_template_about_s_map name=Snippet 's_map' for new page 'about' templates active=True website=null inherit={"id": 1027, "name": "new_page_template_s_map"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=975 key=website.new_page_template_about_s_numbers name=new_page_template_about_s_numbers active=True website=null inherit={"id": 974, "name": "new_page_template_s_numbers"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_numbers</attribute></xpath></data>

- kind=other id=963 key=website.new_page_template_about_s_picture name=new_page_template_about_s_picture active=True website=null inherit={"id": 961, "name": "new_page_template_s_picture"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level" separator=" "/>
    </xpath>
    <xpath expr="//h1|//h2" position="replace">
        <h2 style="text-align: center;">Our Team</h2>
    </xpath>
    <xpath expr="//p" position="replace"/>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_picture</attribute></xpath></data>

- kind=other id=1083 key=website.new_page_template_about_s_picture_only name=Snippet 's_picture_only' for new page 'about' templates active=True website=null inherit={"id": 1064, "name": "Snippet 's_picture_only' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1076 key=website.new_page_template_about_s_quotes_carousel name=Snippet 's_quotes_carousel' for new page 'about' templates active=True website=null inherit={"id": 980, "name": "new_page_template_s_quotes_carousel"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1074 key=website.new_page_template_about_s_references name=Snippet 's_references' for new page 'about' templates active=True website=null inherit={"id": 982, "name": "new_page_template_s_references"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1077 key=website.new_page_template_about_s_text_block name=Snippet 's_text_block' for new page 'about' templates active=True website=null inherit={"id": 1054, "name": "Snippet 's_text_block' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=909 key=website.new_page_template_about_s_text_block_2nd name=new_page_template_about_s_text_block_2nd active=True website=null inherit={"id": 908, "name": "new_page_template_s_text_block_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_text_block_2nd</attribute></xpath></data>

- kind=other id=918 key=website.new_page_template_about_s_text_block_h1 name=new_page_template_about_s_text_block_h1 active=True website=null inherit={"id": 915, "name": "new_page_template_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace" mode="inner">About Us</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_text_block_h1</attribute></xpath></data>

- kind=other id=929 key=website.new_page_template_about_s_text_block_h2 name=new_page_template_about_s_text_block_h2 active=True website=null inherit={"id": 928, "name": "new_page_template_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_text_block_h2</attribute></xpath></data>

- kind=other id=1080 key=website.new_page_template_about_s_text_block_h2_contact name=Snippet 's_text_block_h2_contact' for new page 'about' templates active=True website=null inherit={"id": 1056, "name": "Snippet 's_text_block_h2_contact' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=968 key=website.new_page_template_about_s_text_cover name=new_page_template_about_s_text_cover active=True website=null inherit={"id": 966, "name": "new_page_template_s_text_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_full_screen_height" separator=" "/>
    </xpath>
    <xpath expr="//h1" position="replace">
        <h1>Hello, I'm Tony Fred</h1>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead">Experienced fullstack developer.</p>
    </xpath>
    <xpath expr="//p" position="after">
        <t t-snippet-call="website.s_social_media" string="Social"/>
        <t t-snippet-call="website.s_hr" string="Separator"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_text_cover</attribute></xpath></data>

- kind=other id=956 key=website.new_page_template_about_s_text_image name=new_page_template_about_s_text_image active=True website=null inherit={"id": 955, "name": "new_page_template_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_text_image</attribute></xpath></data>

- kind=other id=997 key=website.new_page_template_about_s_three_columns name=new_page_template_about_s_three_columns active=True website=null inherit={"id": 996, "name": "new_page_template_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2|//h3|//h4|//h5" position="replace">
        <h2 class="card-title h5-fs">Our Story</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[2]" position="replace">
        <h2 class="card-title h5-fs">Our Mission</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[3]" position="replace">
        <h2 class="card-title h5-fs">Our Values</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="card-text">Step into our past and witness the transformation of a simple idea into an innovative force. Our journey, born in a garage, reflects the power of passion and hard work.</p>
    </xpath>
    <xpath expr="(//p)[2]" position="replace">
        <p class="card-text">Our mission is to create transformative experiences and foster growth, driven by a relentless pursuit of innovation and a commitment to exceeding expectations.</p>
    </xpath>
    <xpath expr="(//p)[3]" position="replace">
        <p class="card-text">Our values shape our culture, influence our decisions, and guide us in providing exceptional service. They reflect our dedication to integrity, collaboration, and client satisfaction.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_s_three_columns</attribute></xpath></data>

- kind=other id=1082 key=website.new_page_template_about_s_timeline name=Snippet 's_timeline' for new page 'about' templates active=True website=null inherit={"id": 1060, "name": "Snippet 's_timeline' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1073 key=website.new_page_template_about_s_website_form name=Snippet 's_website_form' for new page 'about' templates active=True website=null inherit={"id": 1026, "name": "new_page_template_s_website_form"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1163 key=website.new_page_template_about_timeline_s_banner name=Snippet 's_banner' for new page 'about' template 'timeline' active=True website=null inherit={"id": 990, "name": "new_page_template_about_s_banner"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1166 key=website.new_page_template_about_timeline_s_call_to_action_about name=Snippet 's_call_to_action_about' for new page 'about' template 'timeline' active=True website=null inherit={"id": 1079, "name": "Snippet 's_call_to_action_about' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1164 key=website.new_page_template_about_timeline_s_text_block name=Snippet 's_text_block' for new page 'about' template 'timeline' active=True website=null inherit={"id": 1077, "name": "Snippet 's_text_block' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=934 key=website.new_page_template_about_timeline_s_text_block_h2 name=new_page_template_about_timeline_s_text_block_h2 active=True website=null inherit={"id": 929, "name": "new_page_template_about_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="replace" mode="inner">About Me</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_about_timeline_s_text_block_h2</attribute></xpath></data>

- kind=other id=1165 key=website.new_page_template_about_timeline_s_timeline name=Snippet 's_timeline' for new page 'about' template 'timeline' active=True website=null inherit={"id": 1082, "name": "Snippet 's_timeline' for new page 'about' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1126 key=website.new_page_template_basic_1_s_image_text name=Snippet 's_image_text' for new page 'basic' template '1' active=True website=null inherit={"id": 1066, "name": "Snippet 's_image_text' for new page 'basic' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1125 key=website.new_page_template_basic_1_s_text_block name=Snippet 's_text_block' for new page 'basic' template '1' active=True website=null inherit={"id": 1070, "name": "Snippet 's_text_block' for new page 'basic' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1124 key=website.new_page_template_basic_1_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'basic' template '1' active=True website=null inherit={"id": 916, "name": "new_page_template_basic_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1127 key=website.new_page_template_basic_1_s_text_image name=Snippet 's_text_image' for new page 'basic' template '1' active=True website=null inherit={"id": 1071, "name": "Snippet 's_text_image' for new page 'basic' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1128 key=website.new_page_template_basic_2_s_picture name=Snippet 's_picture' for new page 'basic' template '2' active=True website=null inherit={"id": 962, "name": "new_page_template_basic_s_picture"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1129 key=website.new_page_template_basic_2_s_text_block name=Snippet 's_text_block' for new page 'basic' template '2' active=True website=null inherit={"id": 1070, "name": "Snippet 's_text_block' for new page 'basic' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=917 key=website.new_page_template_basic_2_s_text_block_h1 name=new_page_template_basic_2_s_text_block_h1 active=True website=null inherit={"id": 916, "name": "new_page_template_basic_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_cc2" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_basic_2_s_text_block_h1</attribute></xpath></data>

- kind=other id=1130 key=website.new_page_template_basic_3_s_parallax name=Snippet 's_parallax' for new page 'basic' template '3' active=True website=null inherit={"id": 1067, "name": "Snippet 's_parallax' for new page 'basic' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1132 key=website.new_page_template_basic_3_s_text_block name=Snippet 's_text_block' for new page 'basic' template '3' active=True website=null inherit={"id": 1070, "name": "Snippet 's_text_block' for new page 'basic' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1131 key=website.new_page_template_basic_3_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'basic' template '3' active=True website=null inherit={"id": 916, "name": "new_page_template_basic_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1133 key=website.new_page_template_basic_3_s_three_columns name=Snippet 's_three_columns' for new page 'basic' template '3' active=True website=null inherit={"id": 1069, "name": "Snippet 's_three_columns' for new page 'basic' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1134 key=website.new_page_template_basic_4_s_text_cover name=Snippet 's_text_cover' for new page 'basic' template '4' active=True website=null inherit={"id": 967, "name": "new_page_template_basic_s_text_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1137 key=website.new_page_template_basic_5_s_features name=Snippet 's_features' for new page 'basic' template '5' active=True website=null inherit={"id": 1072, "name": "Snippet 's_features' for new page 'basic' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1138 key=website.new_page_template_basic_5_s_quotes_carousel name=Snippet 's_quotes_carousel' for new page 'basic' template '5' active=True website=null inherit={"id": 981, "name": "new_page_template_basic_s_quotes_carousel"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1136 key=website.new_page_template_basic_5_s_text_block name=Snippet 's_text_block' for new page 'basic' template '5' active=True website=null inherit={"id": 1070, "name": "Snippet 's_text_block' for new page 'basic' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1135 key=website.new_page_template_basic_5_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'basic' template '5' active=True website=null inherit={"id": 916, "name": "new_page_template_basic_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1140 key=website.new_page_template_basic_6_s_table_of_content name=Snippet 's_table_of_content' for new page 'basic' template '6' active=True website=null inherit={"id": 1068, "name": "Snippet 's_table_of_content' for new page 'basic' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1139 key=website.new_page_template_basic_6_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'basic' template '6' active=True website=null inherit={"id": 916, "name": "new_page_template_basic_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1072 key=website.new_page_template_basic_s_features name=Snippet 's_features' for new page 'basic' templates active=True website=null inherit={"id": 971, "name": "new_page_template_s_features"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1066 key=website.new_page_template_basic_s_image_text name=Snippet 's_image_text' for new page 'basic' templates active=True website=null inherit={"id": 943, "name": "new_page_template_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1067 key=website.new_page_template_basic_s_parallax name=Snippet 's_parallax' for new page 'basic' templates active=True website=null inherit={"id": 1018, "name": "new_page_template_s_parallax"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=962 key=website.new_page_template_basic_s_picture name=new_page_template_basic_s_picture active=True website=null inherit={"id": 961, "name": "new_page_template_s_picture"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level" separator=" "/>
    </xpath>
    <xpath expr="//h1|//h2" position="replace"/>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_basic_s_picture</attribute></xpath></data>

- kind=other id=981 key=website.new_page_template_basic_s_quotes_carousel name=new_page_template_basic_s_quotes_carousel active=True website=null inherit={"id": 980, "name": "new_page_template_s_quotes_carousel"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" remove="o_colored_level o_cc o_cc1" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_basic_s_quotes_carousel</attribute></xpath></data>

- kind=other id=1068 key=website.new_page_template_basic_s_table_of_content name=Snippet 's_table_of_content' for new page 'basic' templates active=True website=null inherit={"id": 1057, "name": "Snippet 's_table_of_content' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1070 key=website.new_page_template_basic_s_text_block name=Snippet 's_text_block' for new page 'basic' templates active=True website=null inherit={"id": 1054, "name": "Snippet 's_text_block' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=916 key=website.new_page_template_basic_s_text_block_h1 name=new_page_template_basic_s_text_block_h1 active=True website=null inherit={"id": 915, "name": "new_page_template_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_basic_s_text_block_h1</attribute></xpath></data>

- kind=other id=967 key=website.new_page_template_basic_s_text_cover name=new_page_template_basic_s_text_cover active=True website=null inherit={"id": 966, "name": "new_page_template_s_text_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_full_screen_height" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_basic_s_text_cover</attribute></xpath></data>

- kind=other id=1071 key=website.new_page_template_basic_s_text_image name=Snippet 's_text_image' for new page 'basic' templates active=True website=null inherit={"id": 955, "name": "new_page_template_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1069 key=website.new_page_template_basic_s_three_columns name=Snippet 's_three_columns' for new page 'basic' templates active=True website=null inherit={"id": 996, "name": "new_page_template_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1181 key=website.new_page_template_gallery_0_s_images_wall name=Snippet 's_images_wall' for new page 'gallery' template '0' active=True website=null inherit={"id": 1100, "name": "Snippet 's_images_wall' for new page 'gallery' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1180 key=website.new_page_template_gallery_0_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'gallery' template '0' active=True website=null inherit={"id": 939, "name": "new_page_template_gallery_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1183 key=website.new_page_template_gallery_1_s_image_text name=Snippet 's_image_text' for new page 'gallery' template '1' active=True website=null inherit={"id": 1093, "name": "Snippet 's_image_text' for new page 'gallery' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1185 key=website.new_page_template_gallery_1_s_image_text_2nd name=Snippet 's_image_text_2nd' for new page 'gallery' template '1' active=True website=null inherit={"id": 951, "name": "new_page_template_gallery_s_image_text_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1182 key=website.new_page_template_gallery_1_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'gallery' template '1' active=True website=null inherit={"id": 939, "name": "new_page_template_gallery_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1184 key=website.new_page_template_gallery_1_s_text_image name=Snippet 's_text_image' for new page 'gallery' template '1' active=True website=null inherit={"id": 1097, "name": "Snippet 's_text_image' for new page 'gallery' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1186 key=website.new_page_template_gallery_2_s_banner name=Snippet 's_banner' for new page 'gallery' template '2' active=True website=null inherit={"id": 994, "name": "new_page_template_gallery_s_banner"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1188 key=website.new_page_template_gallery_2_s_image_gallery name=Snippet 's_image_gallery' for new page 'gallery' template '2' active=True website=null inherit={"id": 1098, "name": "Snippet 's_image_gallery' for new page 'gallery' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1189 key=website.new_page_template_gallery_2_s_picture_only name=Snippet 's_picture_only' for new page 'gallery' template '2' active=True website=null inherit={"id": 1094, "name": "Snippet 's_picture_only' for new page 'gallery' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1187 key=website.new_page_template_gallery_2_s_text_block_2nd name=Snippet 's_text_block_2nd' for new page 'gallery' template '2' active=True website=null inherit={"id": 911, "name": "new_page_template_gallery_s_text_block_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1191 key=website.new_page_template_gallery_3_s_text_block name=Snippet 's_text_block' for new page 'gallery' template '3' active=True website=null inherit={"id": 1096, "name": "Snippet 's_text_block' for new page 'gallery' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1190 key=website.new_page_template_gallery_3_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'gallery' template '3' active=True website=null inherit={"id": 939, "name": "new_page_template_gallery_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1192 key=website.new_page_template_gallery_3_s_three_columns name=Snippet 's_three_columns' for new page 'gallery' template '3' active=True website=null inherit={"id": 1095, "name": "Snippet 's_three_columns' for new page 'gallery' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1193 key=website.new_page_template_gallery_3_s_three_columns_2nd name=Snippet 's_three_columns_2nd' for new page 'gallery' template '3' active=True website=null inherit={"id": 1092, "name": "Snippet 's_three_columns_2nd' for new page 'gallery' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1194 key=website.new_page_template_gallery_4_s_cover name=Snippet 's_cover' for new page 'gallery' template '4' active=True website=null inherit={"id": 1099, "name": "Snippet 's_cover' for new page 'gallery' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1195 key=website.new_page_template_gallery_4_s_media_list name=Snippet 's_media_list' for new page 'gallery' template '4' active=True website=null inherit={"id": 1091, "name": "Snippet 's_media_list' for new page 'gallery' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=994 key=website.new_page_template_gallery_s_banner name=new_page_template_gallery_s_banner active=True website=null inherit={"id": 989, "name": "new_page_template_s_banner"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace">
        <h1>Discover Our Univers</h1>
    </xpath>
    <xpath expr="//p" position="replace"/>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_gallery_s_banner</attribute></xpath></data>

- kind=other id=1099 key=website.new_page_template_gallery_s_cover name=Snippet 's_cover' for new page 'gallery' templates active=True website=null inherit={"id": 983, "name": "new_page_template_s_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1098 key=website.new_page_template_gallery_s_image_gallery name=Snippet 's_image_gallery' for new page 'gallery' templates active=True website=null inherit={"id": 1022, "name": "new_page_template_s_image_gallery"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1093 key=website.new_page_template_gallery_s_image_text name=Snippet 's_image_text' for new page 'gallery' templates active=True website=null inherit={"id": 943, "name": "new_page_template_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=951 key=website.new_page_template_gallery_s_image_text_2nd name=new_page_template_gallery_s_image_text_2nd active=True website=null inherit={"id": 950, "name": "new_page_template_s_image_text_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level pt48 pb56" remove="pt80 pb80" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_gallery_s_image_text_2nd</attribute></xpath></data>

- kind=other id=1100 key=website.new_page_template_gallery_s_images_wall name=Snippet 's_images_wall' for new page 'gallery' templates active=True website=null inherit={"id": 1024, "name": "new_page_template_s_images_wall"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1091 key=website.new_page_template_gallery_s_media_list name=Snippet 's_media_list' for new page 'gallery' templates active=True website=null inherit={"id": 1020, "name": "new_page_template_s_media_list"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1094 key=website.new_page_template_gallery_s_picture_only name=Snippet 's_picture_only' for new page 'gallery' templates active=True website=null inherit={"id": 1064, "name": "Snippet 's_picture_only' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1096 key=website.new_page_template_gallery_s_text_block name=Snippet 's_text_block' for new page 'gallery' templates active=True website=null inherit={"id": 1054, "name": "Snippet 's_text_block' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=911 key=website.new_page_template_gallery_s_text_block_2nd name=new_page_template_gallery_s_text_block_2nd active=True website=null inherit={"id": 908, "name": "new_page_template_s_text_block_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//p" position="replace">
        <p>Explore our captivating gallery, a visual journey showcasing our finest work and creative projects. Immerse yourself in a collection of images that capture the essence of our craftsmanship, innovation, and dedication to excellence.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_gallery_s_text_block_2nd</attribute></xpath></data>

- kind=other id=939 key=website.new_page_template_gallery_s_text_block_h1 name=new_page_template_gallery_s_text_block_h1 active=True website=null inherit={"id": 915, "name": "new_page_template_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace" mode="inner">Gallery</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_gallery_s_text_block_h1</attribute></xpath></data>

- kind=other id=1097 key=website.new_page_template_gallery_s_text_image name=Snippet 's_text_image' for new page 'gallery' templates active=True website=null inherit={"id": 955, "name": "new_page_template_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1095 key=website.new_page_template_gallery_s_three_columns name=Snippet 's_three_columns' for new page 'gallery' templates active=True website=null inherit={"id": 996, "name": "new_page_template_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1092 key=website.new_page_template_gallery_s_three_columns_2nd name=Snippet 's_three_columns_2nd' for new page 'gallery' templates active=True website=null inherit={"id": 1052, "name": "Snippet 's_three_columns_2nd' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=906 key=website.new_page_template_groups name=new_page_template_groups active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.new_page_template_groups">
    <div id="basic">Basic</div>
    <div id="about">About</div>
    <div id="landing">Landing Pages</div>
    <div id="gallery">Gallery</div>
    <div id="services">Services</div>
    <div id="pricing">Pricing Plans</div>
    <div id="team">Team</div>
    <div id="custom">Custom</div>
</t>

- kind=other id=986 key=website.new_page_template_landing_0_s_cover name=new_page_template_landing_0_s_cover active=True website=null inherit={"id": 985, "name": "new_page_template_landing_s_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pt256 pb256" remove="pt232 pb232" separator=" "/>
    </xpath>
    <xpath expr="//h1" position="replace">
        <h1 style="text-align: center;">Coming Soon</h1>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_0_s_cover</attribute></xpath></data>

- kind=other id=992 key=website.new_page_template_landing_1_s_banner name=new_page_template_landing_1_s_banner active=True website=null inherit={"id": 991, "name": "new_page_template_landing_s_banner"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace">
        <h1>Elevate Your Brand With Us</h1>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead">By Crafting unique and compelling brand identities that leave a lasting impact.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_1_s_banner</attribute></xpath></data>

- kind=other id=1169 key=website.new_page_template_landing_1_s_call_to_action_digital name=Snippet 's_call_to_action_digital' for new page 'landing' template '1' active=True website=null inherit={"id": 1086, "name": "Snippet 's_call_to_action_digital' for new page 'landing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1167 key=website.new_page_template_landing_1_s_features name=Snippet 's_features' for new page 'landing' template '1' active=True website=null inherit={"id": 973, "name": "new_page_template_landing_s_features"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1168 key=website.new_page_template_landing_1_s_masonry_block_default_template name=Snippet 's_masonry_block_default_template' for new page 'landing' template '1' active=True website=null inherit={"id": 1090, "name": "Snippet 's_masonry_block_default_template' for new page 'landing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1171 key=website.new_page_template_landing_1_s_quotes_carousel name=Snippet 's_quotes_carousel' for new page 'landing' template '1' active=True website=null inherit={"id": 1085, "name": "Snippet 's_quotes_carousel' for new page 'landing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1170 key=website.new_page_template_landing_1_s_references name=Snippet 's_references' for new page 'landing' template '1' active=True website=null inherit={"id": 1088, "name": "Snippet 's_references' for new page 'landing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1013 key=website.new_page_template_landing_2_s_call_to_action name=new_page_template_landing_2_s_call_to_action active=True website=null inherit={"id": 1012, "name": "new_page_template_landing_s_call_to_action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2|//h3|//h4" position="replace">
        <h3>Ready to Embrace Your Fitness Journey?</h3>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead">Contact us today to embark on your path to a healthier, more vibrant you. Your fitness journey begins here.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_2_s_call_to_action</attribute></xpath></data>

- kind=other id=987 key=website.new_page_template_landing_2_s_cover name=new_page_template_landing_2_s_cover active=True website=null inherit={"id": 985, "name": "new_page_template_landing_s_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace">
        <h1 class="text-center">Personalized Fitness</h1>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_2_s_cover</attribute></xpath></data>

- kind=other id=936 key=website.new_page_template_landing_2_s_text_block_h2 name=new_page_template_landing_2_s_text_block_h2 active=True website=null inherit={"id": 935, "name": "new_page_template_landing_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_cc2" separator=" "/>
    </xpath>
    <xpath expr="//h2" position="replace" mode="inner">Our Services</xpath>
    <xpath expr="//h2" position="after">
        <t t-snippet-call="website.s_searchbar_input" string="Search Input"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_2_s_text_block_h2</attribute></xpath></data>

- kind=other id=1172 key=website.new_page_template_landing_2_s_text_image name=Snippet 's_text_image' for new page 'landing' template '2' active=True website=null inherit={"id": 958, "name": "new_page_template_landing_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=999 key=website.new_page_template_landing_2_s_three_columns name=new_page_template_landing_2_s_three_columns active=True website=null inherit={"id": 998, "name": "new_page_template_landing_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2|//h3|//h4|//h5" position="replace">
        <h2 class="card-title h5-fs">Personalized Workouts</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[2]" position="replace">
        <h2 class="card-title h5-fs">Nutritional Guidance</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[3]" position="replace">
        <h2 class="card-title h5-fs">Progress Tracking</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="card-text">Our experienced fitness coaches design workouts that align with your goals, fitness level, and preferences.</p>
    </xpath>
    <xpath expr="(//p)[2]" position="replace">
        <p class="card-text">Achieve holistic health with personalized nutritional advice that complements your workouts, promoting overall well-being.</p>
    </xpath>
    <xpath expr="(//p)[3]" position="replace">
        <p class="card-text">We monitor your progress meticulously, adjusting your plan as needed to ensure continuous improvement and results.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_2_s_three_columns</attribute></xpath></data>

- kind=other id=1014 key=website.new_page_template_landing_3_s_call_to_action name=new_page_template_landing_3_s_call_to_action active=True website=null inherit={"id": 1012, "name": "new_page_template_landing_s_call_to_action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2|//h3|//h4" position="replace">
        <h3>Elevate Your Audio Journey Today</h3>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead">Ready to embark on your auditory adventure? Order your EchoTunes Wireless Earbuds today and let the symphony begin.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_3_s_call_to_action</attribute></xpath></data>

- kind=other id=1175 key=website.new_page_template_landing_3_s_color_blocks_2 name=Snippet 's_color_blocks_2' for new page 'landing' template '3' active=True website=null inherit={"id": 1008, "name": "new_page_template_landing_s_color_blocks_2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1176 key=website.new_page_template_landing_3_s_quotes_carousel name=Snippet 's_quotes_carousel' for new page 'landing' template '3' active=True website=null inherit={"id": 1085, "name": "Snippet 's_quotes_carousel' for new page 'landing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1174 key=website.new_page_template_landing_3_s_showcase name=Snippet 's_showcase' for new page 'landing' template '3' active=True website=null inherit={"id": 1010, "name": "new_page_template_landing_s_showcase"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=937 key=website.new_page_template_landing_3_s_text_block_h2 name=new_page_template_landing_3_s_text_block_h2 active=True website=null inherit={"id": 935, "name": "new_page_template_landing_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_cc2" separator=" "/>
    </xpath>
    <xpath expr="//h2" position="replace" mode="inner">Our Offer</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_3_s_text_block_h2</attribute></xpath></data>

- kind=other id=1173 key=website.new_page_template_landing_3_s_text_cover name=Snippet 's_text_cover' for new page 'landing' template '3' active=True website=null inherit={"id": 969, "name": "new_page_template_landing_s_text_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1000 key=website.new_page_template_landing_3_s_three_columns name=new_page_template_landing_3_s_three_columns active=True website=null inherit={"id": 998, "name": "new_page_template_landing_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2|//h3|//h4|//h5" position="replace">
        <h2 class="card-title h5-fs">Amazing Sound Quality</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[2]" position="replace">
        <h2 class="card-title h5-fs">Wireless Freedom</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[3]" position="replace">
        <h2 class="card-title h5-fs">All-Day Comfort</h2>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_3_s_three_columns</attribute></xpath></data>

- kind=other id=988 key=website.new_page_template_landing_4_s_cover name=new_page_template_landing_4_s_cover active=True website=null inherit={"id": 985, "name": "new_page_template_landing_s_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_half_screen_height" remove="o_full_screen_height" separator=" "/>
    </xpath>
    <xpath expr="//h1" position="replace">
        <h1 style="text-align: center;">We Are Coming Soon</h1>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_4_s_cover</attribute></xpath></data>

- kind=other id=1177 key=website.new_page_template_landing_4_s_text_block name=Snippet 's_text_block' for new page 'landing' template '4' active=True website=null inherit={"id": 1087, "name": "Snippet 's_text_block' for new page 'landing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=938 key=website.new_page_template_landing_4_s_text_block_h2 name=new_page_template_landing_4_s_text_block_h2 active=True website=null inherit={"id": 935, "name": "new_page_template_landing_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pb40" remove="pb0" separator=" "/>
    </xpath>
    <xpath expr="//h2" position="replace" mode="inner">About Us</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_4_s_text_block_h2</attribute></xpath></data>

- kind=other id=1178 key=website.new_page_template_landing_4_s_text_block_h2_contact name=Snippet 's_text_block_h2_contact' for new page 'landing' template '4' active=True website=null inherit={"id": 1084, "name": "Snippet 's_text_block_h2_contact' for new page 'landing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1179 key=website.new_page_template_landing_4_s_website_form name=Snippet 's_website_form' for new page 'landing' template '4' active=True website=null inherit={"id": 1089, "name": "Snippet 's_website_form' for new page 'landing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=993 key=website.new_page_template_landing_5_s_banner name=new_page_template_landing_5_s_banner active=True website=null inherit={"id": 991, "name": "new_page_template_landing_s_banner"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_full_screen_height" separator=" "/>
    </xpath>
    <xpath expr="//h1" position="replace">
        <h1 style="text-align: center;">We Are Down for Maintenance</h1>
    </xpath>
    <xpath expr="//p" position="replace"/>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_5_s_banner</attribute></xpath></data>

- kind=other id=991 key=website.new_page_template_landing_s_banner name=new_page_template_landing_s_banner active=True website=null inherit={"id": 989, "name": "new_page_template_s_banner"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_s_banner</attribute></xpath></data>

- kind=other id=1012 key=website.new_page_template_landing_s_call_to_action name=new_page_template_landing_s_call_to_action active=True website=null inherit={"id": 1011, "name": "new_page_template_s_call_to_action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_s_call_to_action</attribute></xpath></data>

- kind=other id=1086 key=website.new_page_template_landing_s_call_to_action_digital name=Snippet 's_call_to_action_digital' for new page 'landing' templates active=True website=null inherit={"id": 1059, "name": "Snippet 's_call_to_action_digital' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1008 key=website.new_page_template_landing_s_color_blocks_2 name=new_page_template_landing_s_color_blocks_2 active=True website=null inherit={"id": 1007, "name": "new_page_template_s_color_blocks_2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="replace">
        <h2 class="h3-fs">Crystal Clear Sound</h2>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_s_color_blocks_2</attribute></xpath></data>

- kind=other id=985 key=website.new_page_template_landing_s_cover name=new_page_template_landing_s_cover active=True website=null inherit={"id": 983, "name": "new_page_template_s_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_s_cover</attribute></xpath></data>

- kind=other id=973 key=website.new_page_template_landing_s_features name=new_page_template_landing_s_features active=True website=null inherit={"id": 971, "name": "new_page_template_s_features"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//div[hasclass('row')]/div[1]/div/h3" position="replace">
        <h3 class="h5-fs">Marketing</h3>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[2]/div/h3" position="replace">
        <h3 class="h5-fs">Rebranding</h3>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[3]/div/h3" position="replace">
        <h3 class="h5-fs">Consulting</h3>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[1]/div/p" position="replace">
        <p>From SEO to social media, we create campaigns that not only get you noticed but also drive engagement and conversions.</p>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[2]/div/p" position="replace">
        <p>Your brand is your story. We help you tell it through cohesive visual identity and messaging that resonates with your audience.</p>
    </xpath>
    <xpath expr="//div[hasclass('row')]/div[3]/div/p" position="replace">
        <p>Empowering your business through strategic digital insights and expertise.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_s_features</attribute></xpath></data>

- kind=other id=1090 key=website.new_page_template_landing_s_masonry_block_default_template name=Snippet 's_masonry_block_default_template' for new page 'landing' templates active=True website=null inherit={"id": 1065, "name": "Snippet 's_masonry_block_default_template' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1085 key=website.new_page_template_landing_s_quotes_carousel name=Snippet 's_quotes_carousel' for new page 'landing' templates active=True website=null inherit={"id": 980, "name": "new_page_template_s_quotes_carousel"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1088 key=website.new_page_template_landing_s_references name=Snippet 's_references' for new page 'landing' templates active=True website=null inherit={"id": 982, "name": "new_page_template_s_references"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1010 key=website.new_page_template_landing_s_showcase name=new_page_template_landing_s_showcase active=True website=null inherit={"id": 1009, "name": "new_page_template_s_showcase"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h3" position="replace" mode="inner">
        Intuitive Touch Controls
    </xpath>
    <xpath expr="(//h3)[2]" position="replace" mode="inner">
        Secure and Comfortable Fit
    </xpath>
    <xpath expr="(//h3)[3]" position="replace" mode="inner">
        On-the-Go Charging
    </xpath>
    <xpath expr="//p" position="replace">
        <p>Adjust volume, skip tracks, answer calls, and activate voice assistants with a simple tap, keeping your hands free and your focus on what matters most.</p>
    </xpath>
    <xpath expr="(//p)[2]" position="replace">
        <p>EchoTunes comes with customizable ear tip sizes that provide a secure and comfortable fit.</p>
    </xpath>
    <xpath expr="(//p)[3]" position="replace">
        <p>The compact charging case offers convenient on-the-go charging with a battery life that lasts up to 17h, you can enjoy your favorite tunes without interruption.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_s_showcase</attribute></xpath></data>

- kind=other id=1087 key=website.new_page_template_landing_s_text_block name=Snippet 's_text_block' for new page 'landing' templates active=True website=null inherit={"id": 1054, "name": "Snippet 's_text_block' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=935 key=website.new_page_template_landing_s_text_block_h2 name=new_page_template_landing_s_text_block_h2 active=True website=null inherit={"id": 928, "name": "new_page_template_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_s_text_block_h2</attribute></xpath></data>

- kind=other id=1084 key=website.new_page_template_landing_s_text_block_h2_contact name=Snippet 's_text_block_h2_contact' for new page 'landing' templates active=True website=null inherit={"id": 1056, "name": "Snippet 's_text_block_h2_contact' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=969 key=website.new_page_template_landing_s_text_cover name=new_page_template_landing_s_text_cover active=True website=null inherit={"id": 966, "name": "new_page_template_s_text_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace">
        <h1>EchoTunes Wireless Earbuds</h1>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead">Designed to provide an immersive audio experience on the go.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_s_text_cover</attribute></xpath></data>

- kind=other id=958 key=website.new_page_template_landing_s_text_image name=new_page_template_landing_s_text_image active=True website=null inherit={"id": 955, "name": "new_page_template_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level pt56 pb56" remove="pt80 pb80" separator=" "/>
    </xpath>
    <xpath expr="//h2|//h3" position="replace">
        <h2 class="h3-fs">Our Approach</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p>We believe that every fitness journey is unique. Our approach begins with understanding your fitness aspirations, your current lifestyle, and any challenges you face.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_s_text_image</attribute></xpath></data>

- kind=other id=998 key=website.new_page_template_landing_s_three_columns name=new_page_template_landing_s_three_columns active=True website=null inherit={"id": 996, "name": "new_page_template_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_landing_s_three_columns</attribute></xpath></data>

- kind=other id=1089 key=website.new_page_template_landing_s_website_form name=Snippet 's_website_form' for new page 'landing' templates active=True website=null inherit={"id": 1026, "name": "new_page_template_s_website_form"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1219 key=website.new_page_template_pricing_0_s_call_to_action name=Snippet 's_call_to_action' for new page 'pricing' template '0' active=True website=null inherit={"id": 1118, "name": "Snippet 's_call_to_action' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1214 key=website.new_page_template_pricing_0_s_comparisons name=Snippet 's_comparisons' for new page 'pricing' template '0' active=True website=null inherit={"id": 1109, "name": "Snippet 's_comparisons' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1218 key=website.new_page_template_pricing_0_s_faq_collapse name=Snippet 's_faq_collapse' for new page 'pricing' template '0' active=True website=null inherit={"id": 1113, "name": "Snippet 's_faq_collapse' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1216 key=website.new_page_template_pricing_0_s_showcase name=Snippet 's_showcase' for new page 'pricing' template '0' active=True website=null inherit={"id": 1111, "name": "Snippet 's_showcase' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1215 key=website.new_page_template_pricing_0_s_text_block_2nd name=Snippet 's_text_block_2nd' for new page 'pricing' template '0' active=True website=null inherit={"id": 913, "name": "new_page_template_pricing_s_text_block_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1213 key=website.new_page_template_pricing_0_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'pricing' template '0' active=True website=null inherit={"id": 923, "name": "new_page_template_pricing_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1217 key=website.new_page_template_pricing_0_s_text_block_h2 name=Snippet 's_text_block_h2' for new page 'pricing' template '0' active=True website=null inherit={"id": 941, "name": "new_page_template_pricing_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1222 key=website.new_page_template_pricing_1_s_call_to_action name=Snippet 's_call_to_action' for new page 'pricing' template '1' active=True website=null inherit={"id": 1118, "name": "Snippet 's_call_to_action' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1221 key=website.new_page_template_pricing_1_s_comparisons name=Snippet 's_comparisons' for new page 'pricing' template '1' active=True website=null inherit={"id": 1109, "name": "Snippet 's_comparisons' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1220 key=website.new_page_template_pricing_1_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'pricing' template '1' active=True website=null inherit={"id": 923, "name": "new_page_template_pricing_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1225 key=website.new_page_template_pricing_2_s_call_to_action name=Snippet 's_call_to_action' for new page 'pricing' template '2' active=True website=null inherit={"id": 1118, "name": "Snippet 's_call_to_action' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1227 key=website.new_page_template_pricing_2_s_color_blocks_2 name=Snippet 's_color_blocks_2' for new page 'pricing' template '2' active=True website=null inherit={"id": 1121, "name": "Snippet 's_color_blocks_2' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1224 key=website.new_page_template_pricing_2_s_comparisons name=Snippet 's_comparisons' for new page 'pricing' template '2' active=True website=null inherit={"id": 1109, "name": "Snippet 's_comparisons' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1223 key=website.new_page_template_pricing_2_s_cover name=Snippet 's_cover' for new page 'pricing' template '2' active=True website=null inherit={"id": 1119, "name": "Snippet 's_cover' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1226 key=website.new_page_template_pricing_2_s_features_grid name=Snippet 's_features_grid' for new page 'pricing' template '2' active=True website=null inherit={"id": 1110, "name": "Snippet 's_features_grid' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1230 key=website.new_page_template_pricing_3_s_call_to_action_menu name=Snippet 's_call_to_action_menu' for new page 'pricing' template '3' active=True website=null inherit={"id": 1108, "name": "Snippet 's_call_to_action_menu' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1228 key=website.new_page_template_pricing_3_s_carousel name=Snippet 's_carousel' for new page 'pricing' template '3' active=True website=null inherit={"id": 1116, "name": "Snippet 's_carousel' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1229 key=website.new_page_template_pricing_3_s_product_catalog name=Snippet 's_product_catalog' for new page 'pricing' template '3' active=True website=null inherit={"id": 1120, "name": "Snippet 's_product_catalog' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1235 key=website.new_page_template_pricing_4_s_call_to_action name=Snippet 's_call_to_action' for new page 'pricing' template '4' active=True website=null inherit={"id": 1118, "name": "Snippet 's_call_to_action' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1232 key=website.new_page_template_pricing_4_s_image_text name=Snippet 's_image_text' for new page 'pricing' template '4' active=True website=null inherit={"id": 1112, "name": "Snippet 's_image_text' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1234 key=website.new_page_template_pricing_4_s_image_text_2nd name=Snippet 's_image_text_2nd' for new page 'pricing' template '4' active=True website=null inherit={"id": 953, "name": "new_page_template_pricing_s_image_text_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1231 key=website.new_page_template_pricing_4_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'pricing' template '4' active=True website=null inherit={"id": 923, "name": "new_page_template_pricing_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1233 key=website.new_page_template_pricing_4_s_text_image name=Snippet 's_text_image' for new page 'pricing' template '4' active=True website=null inherit={"id": 1117, "name": "Snippet 's_text_image' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1239 key=website.new_page_template_pricing_5_s_call_to_action name=Snippet 's_call_to_action' for new page 'pricing' template '5' active=True website=null inherit={"id": 1118, "name": "Snippet 's_call_to_action' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1237 key=website.new_page_template_pricing_5_s_product_catalog name=Snippet 's_product_catalog' for new page 'pricing' template '5' active=True website=null inherit={"id": 1120, "name": "Snippet 's_product_catalog' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1236 key=website.new_page_template_pricing_5_s_text_block name=Snippet 's_text_block' for new page 'pricing' template '5' active=True website=null inherit={"id": 1115, "name": "Snippet 's_text_block' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=924 key=website.new_page_template_pricing_5_s_text_block_h1 name=new_page_template_pricing_5_s_text_block_h1 active=True website=null inherit={"id": 923, "name": "new_page_template_pricing_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace" mode="inner">Our Menus</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_pricing_5_s_text_block_h1</attribute></xpath></data>

- kind=other id=1238 key=website.new_page_template_pricing_5_s_three_columns_menu name=Snippet 's_three_columns_menu' for new page 'pricing' template '5' active=True website=null inherit={"id": 1114, "name": "Snippet 's_three_columns_menu' for new page 'pricing' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1118 key=website.new_page_template_pricing_s_call_to_action name=Snippet 's_call_to_action' for new page 'pricing' templates active=True website=null inherit={"id": 1011, "name": "new_page_template_s_call_to_action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1108 key=website.new_page_template_pricing_s_call_to_action_menu name=Snippet 's_call_to_action_menu' for new page 'pricing' templates active=True website=null inherit={"id": 1062, "name": "Snippet 's_call_to_action_menu' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1116 key=website.new_page_template_pricing_s_carousel name=Snippet 's_carousel' for new page 'pricing' templates active=True website=null inherit={"id": 995, "name": "new_page_template_s_carousel"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1121 key=website.new_page_template_pricing_s_color_blocks_2 name=Snippet 's_color_blocks_2' for new page 'pricing' templates active=True website=null inherit={"id": 1007, "name": "new_page_template_s_color_blocks_2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1109 key=website.new_page_template_pricing_s_comparisons name=Snippet 's_comparisons' for new page 'pricing' templates active=True website=null inherit={"id": 1063, "name": "Snippet 's_comparisons' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1119 key=website.new_page_template_pricing_s_cover name=Snippet 's_cover' for new page 'pricing' templates active=True website=null inherit={"id": 983, "name": "new_page_template_s_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1113 key=website.new_page_template_pricing_s_faq_collapse name=Snippet 's_faq_collapse' for new page 'pricing' templates active=True website=null inherit={"id": 1053, "name": "Snippet 's_faq_collapse' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1110 key=website.new_page_template_pricing_s_features_grid name=Snippet 's_features_grid' for new page 'pricing' templates active=True website=null inherit={"id": 1051, "name": "Snippet 's_features_grid' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1112 key=website.new_page_template_pricing_s_image_text name=Snippet 's_image_text' for new page 'pricing' templates active=True website=null inherit={"id": 943, "name": "new_page_template_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=953 key=website.new_page_template_pricing_s_image_text_2nd name=new_page_template_pricing_s_image_text_2nd active=True website=null inherit={"id": 950, "name": "new_page_template_s_image_text_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level pt48 pb56" remove="pt80 pb80" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_pricing_s_image_text_2nd</attribute></xpath></data>

- kind=other id=1120 key=website.new_page_template_pricing_s_product_catalog name=Snippet 's_product_catalog' for new page 'pricing' templates active=True website=null inherit={"id": 1061, "name": "Snippet 's_product_catalog' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1111 key=website.new_page_template_pricing_s_showcase name=Snippet 's_showcase' for new page 'pricing' templates active=True website=null inherit={"id": 1009, "name": "new_page_template_s_showcase"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1115 key=website.new_page_template_pricing_s_text_block name=Snippet 's_text_block' for new page 'pricing' templates active=True website=null inherit={"id": 1054, "name": "Snippet 's_text_block' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=913 key=website.new_page_template_pricing_s_text_block_2nd name=new_page_template_pricing_s_text_block_2nd active=True website=null inherit={"id": 908, "name": "new_page_template_s_text_block_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//p" position="replace">
        <p>Our software plans are designed to cater to a variety of needs, ensuring that you find the perfect fit for your requirements. From individual users to businesses of all sizes, we offer pricing options that provide exceptional value without compromising on features or performance.</p>
        <p>Experience the power of our software without breaking the bank – choose a plan that suits you best and start unlocking its full potential today.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_pricing_s_text_block_2nd</attribute></xpath></data>

- kind=other id=923 key=website.new_page_template_pricing_s_text_block_h1 name=new_page_template_pricing_s_text_block_h1 active=True website=null inherit={"id": 915, "name": "new_page_template_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace" mode="inner">Pricing Plans</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_pricing_s_text_block_h1</attribute></xpath></data>

- kind=other id=941 key=website.new_page_template_pricing_s_text_block_h2 name=new_page_template_pricing_s_text_block_h2 active=True website=null inherit={"id": 928, "name": "new_page_template_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="attributes">
        <attribute name="style">text-align: left;</attribute>
    </xpath>
    <xpath expr="//h2" position="replace" mode="inner">Questions?</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_pricing_s_text_block_h2</attribute></xpath></data>

- kind=other id=1117 key=website.new_page_template_pricing_s_text_image name=Snippet 's_text_image' for new page 'pricing' templates active=True website=null inherit={"id": 955, "name": "new_page_template_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1114 key=website.new_page_template_pricing_s_three_columns_menu name=Snippet 's_three_columns_menu' for new page 'pricing' templates active=True website=null inherit={"id": 1058, "name": "Snippet 's_three_columns_menu' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=989 key=website.new_page_template_s_banner name=new_page_template_s_banner active=True website=null inherit={"id": 740, "name": "Banner"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_banner</attribute></xpath></data>

- kind=other id=1011 key=website.new_page_template_s_call_to_action name=new_page_template_s_call_to_action active=True website=null inherit={"id": 784, "name": "Call to Action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_call_to_action</attribute></xpath></data>

- kind=other id=1055 key=website.new_page_template_s_call_to_action_about name=Snippet 's_call_to_action_about' for new page templates active=True website=null inherit={"id": 1015, "name": "s_call_to_action_about"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1059 key=website.new_page_template_s_call_to_action_digital name=Snippet 's_call_to_action_digital' for new page templates active=True website=null inherit={"id": 1016, "name": "s_call_to_action_digital"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1062 key=website.new_page_template_s_call_to_action_menu name=Snippet 's_call_to_action_menu' for new page templates active=True website=null inherit={"id": 1017, "name": "s_call_to_action_menu"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=995 key=website.new_page_template_s_carousel name=new_page_template_s_carousel active=True website=null inherit={"id": 751, "name": "Carousel"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1|//h2" position="replace">
        <h2>Happy Hour</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead"> Every Friday From 6PM to 7PM !</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_carousel</attribute></xpath></data>

- kind=other id=1007 key=website.new_page_template_s_color_blocks_2 name=new_page_template_s_color_blocks_2 active=True website=null inherit={"id": 853, "name": "Big Boxes"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_color_blocks_2</attribute></xpath></data>

- kind=other id=978 key=website.new_page_template_s_company_team name=new_page_template_s_company_team active=True website=null inherit={"id": 777, "name": "Team"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_company_team</attribute></xpath></data>

- kind=other id=1063 key=website.new_page_template_s_comparisons name=Snippet 's_comparisons' for new page templates active=True website=null inherit={"id": 775, "name": "Comparisons"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=983 key=website.new_page_template_s_cover name=new_page_template_s_cover active=True website=null inherit={"id": 731, "name": "Cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_cover</attribute></xpath></data>

- kind=other id=1053 key=website.new_page_template_s_faq_collapse name=Snippet 's_faq_collapse' for new page templates active=True website=null inherit={"id": 790, "name": "FAQ"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=971 key=website.new_page_template_s_features name=new_page_template_s_features active=True website=null inherit={"id": 744, "name": "Features"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_features</attribute></xpath></data>

- kind=other id=1051 key=website.new_page_template_s_features_grid name=Snippet 's_features_grid' for new page templates active=True website=null inherit={"id": 791, "name": "Features Grid"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1022 key=website.new_page_template_s_image_gallery name=new_page_template_s_image_gallery active=True website=null inherit={"id": 765, "name": "Image Gallery"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_image_gallery</attribute></xpath></data>

- kind=other id=943 key=website.new_page_template_s_image_text name=new_page_template_s_image_text active=True website=null inherit={"id": 736, "name": "Image - Text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_image_text</attribute></xpath></data>

- kind=other id=950 key=website.new_page_template_s_image_text_2nd name=new_page_template_s_image_text_2nd active=True website=null inherit={"id": 949, "name": "s_image_text_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_image_text_2nd</attribute></xpath></data>

- kind=other id=1024 key=website.new_page_template_s_images_wall name=new_page_template_s_images_wall active=True website=null inherit={"id": 766, "name": "Images Wall"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_images_wall</attribute></xpath></data>

- kind=other id=1027 key=website.new_page_template_s_map name=new_page_template_s_map active=True website=null inherit={"id": 872, "name": "Map"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_half_screen_height" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_map</attribute></xpath></data>

- kind=other id=1065 key=website.new_page_template_s_masonry_block_default_template name=Snippet 's_masonry_block_default_template' for new page templates active=True website=null inherit={"id": 809, "name": "Masonry"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1020 key=website.new_page_template_s_media_list name=new_page_template_s_media_list active=True website=null inherit={"id": 816, "name": "Media List"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_media_list</attribute></xpath></data>

- kind=other id=974 key=website.new_page_template_s_numbers name=new_page_template_s_numbers active=True website=null inherit={"id": 803, "name": "Numbers"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_numbers</attribute></xpath></data>

- kind=other id=1018 key=website.new_page_template_s_parallax name=new_page_template_s_parallax active=True website=null inherit={"id": 798, "name": "Parallax"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_parallax</attribute></xpath></data>

- kind=other id=961 key=website.new_page_template_s_picture name=new_page_template_s_picture active=True website=null inherit={"id": 748, "name": "Title - Image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_picture</attribute></xpath></data>

- kind=other id=1064 key=website.new_page_template_s_picture_only name=Snippet 's_picture_only' for new page templates active=True website=null inherit={"id": 965, "name": "s_picture_only"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1061 key=website.new_page_template_s_product_catalog name=Snippet 's_product_catalog' for new page templates active=True website=null inherit={"id": 773, "name": "Pricelist"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=980 key=website.new_page_template_s_quotes_carousel name=new_page_template_s_quotes_carousel active=True website=null inherit={"id": 799, "name": "Quotes"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level o_cc o_cc1" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_quotes_carousel</attribute></xpath></data>

- kind=other id=982 key=website.new_page_template_s_references name=new_page_template_s_references active=True website=null inherit={"id": 785, "name": "References"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_references</attribute></xpath></data>

- kind=other id=1009 key=website.new_page_template_s_showcase name=new_page_template_s_showcase active=True website=null inherit={"id": 817, "name": "Showcase"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_showcase</attribute></xpath></data>

- kind=other id=1057 key=website.new_page_template_s_table_of_content name=Snippet 's_table_of_content' for new page templates active=True website=null inherit={"id": 795, "name": "Table of Content"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1054 key=website.new_page_template_s_text_block name=Snippet 's_text_block' for new page templates active=True website=null inherit={"id": 743, "name": "Text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=908 key=website.new_page_template_s_text_block_2nd name=new_page_template_s_text_block_2nd active=True website=null inherit={"id": 907, "name": "s_text_block_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_text_block_2nd</attribute></xpath></data>

- kind=other id=915 key=website.new_page_template_s_text_block_h1 name=new_page_template_s_text_block_h1 active=True website=null inherit={"id": 914, "name": "s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_text_block_h1</attribute></xpath></data>

- kind=other id=928 key=website.new_page_template_s_text_block_h2 name=new_page_template_s_text_block_h2 active=True website=null inherit={"id": 927, "name": "s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_text_block_h2</attribute></xpath></data>

- kind=other id=1056 key=website.new_page_template_s_text_block_h2_contact name=Snippet 's_text_block_h2_contact' for new page templates active=True website=null inherit={"id": 942, "name": "s_text_block_h2_contact"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=966 key=website.new_page_template_s_text_cover name=new_page_template_s_text_cover active=True website=null inherit={"id": 732, "name": "Text Cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_text_cover</attribute></xpath></data>

- kind=other id=955 key=website.new_page_template_s_text_image name=new_page_template_s_text_image active=True website=null inherit={"id": 735, "name": "Text - Image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_text_image</attribute></xpath></data>

- kind=other id=996 key=website.new_page_template_s_three_columns name=new_page_template_s_three_columns active=True website=null inherit={"id": 746, "name": "Columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_three_columns</attribute></xpath></data>

- kind=other id=1052 key=website.new_page_template_s_three_columns_2nd name=Snippet 's_three_columns_2nd' for new page templates active=True website=null inherit={"id": 1005, "name": "s_three_columns_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1058 key=website.new_page_template_s_three_columns_menu name=Snippet 's_three_columns_menu' for new page templates active=True website=null inherit={"id": 1006, "name": "s_three_columns_menu"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1060 key=website.new_page_template_s_timeline name=Snippet 's_timeline' for new page templates active=True website=null inherit={"id": 821, "name": "Timeline"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1026 key=website.new_page_template_s_website_form name=new_page_template_s_website_form active=True website=null inherit={"id": 878, "name": "Form"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level" separator=" "/>
    </xpath>
    <xpath expr="//form" position="attributes">
        <attribute name="data-success-mode">redirect</attribute>
        <attribute name="data-success-page">/contactus-thank-you</attribute>
        <attribute name="data-model_name">mail.mail</attribute>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_s_website_form</attribute></xpath></data>

- kind=other id=1261 key=website.new_page_template_sections_about_full name=New page template: 'full' in 'about' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_about_full_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_about_full_s_image_text"/>
    <t t-snippet-call="website.new_page_template_about_full_s_text_image"/>
    <t t-snippet-call="website.new_page_template_about_full_s_numbers"/>
    <t t-snippet-call="website.new_page_template_about_full_s_picture"/>
    <t t-snippet-call="website.new_page_template_about_full_s_quotes_carousel"/>
    <t t-snippet-call="website.new_page_template_about_full_s_references"/>
</div>

- kind=other id=1262 key=website.new_page_template_sections_about_full_1 name=New page template: 'full_1' in 'about' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_about_full_1_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_about_full_1_s_three_columns"/>
    <t t-snippet-call="website.new_page_template_about_full_1_s_text_block_h2"/>
    <t t-snippet-call="website.new_page_template_about_full_1_s_company_team"/>
    <t t-snippet-call="website.new_page_template_about_full_1_s_references"/>
    <t t-snippet-call="website.new_page_template_about_full_1_s_quotes_carousel"/>
    <t t-snippet-call="website.new_page_template_about_full_1_s_call_to_action"/>
</div>

- kind=other id=1265 key=website.new_page_template_sections_about_map name=New page template: 'map' in 'about' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_about_map_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_about_map_s_text_block"/>
    <t t-snippet-call="website.new_page_template_about_map_s_numbers"/>
    <t t-snippet-call="website.new_page_template_about_map_s_text_image"/>
    <t t-snippet-call="website.new_page_template_about_map_s_text_block_h2"/>
    <t t-snippet-call="website.new_page_template_about_map_s_text_block_2nd"/>
    <t t-snippet-call="website.new_page_template_about_map_s_map"/>
    <t t-snippet-call="website.new_page_template_about_map_s_images_wall"/>
</div>

- kind=other id=1263 key=website.new_page_template_sections_about_mini name=New page template: 'mini' in 'about' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_about_mini_s_cover"/>
    <t t-snippet-call="website.new_page_template_about_mini_s_text_block_h2"/>
    <t t-snippet-call="website.new_page_template_about_mini_s_text_block_2nd"/>
    <t t-snippet-call="website.new_page_template_about_mini_s_picture_only"/>
    <t t-snippet-call="website.new_page_template_about_mini_s_text_block_h2_contact"/>
    <t t-snippet-call="website.new_page_template_about_mini_s_website_form"/>
</div>

- kind=other id=1264 key=website.new_page_template_sections_about_personal name=New page template: 'personal' in 'about' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_about_personal_s_text_cover"/>
    <t t-snippet-call="website.new_page_template_about_personal_s_image_text"/>
    <t t-snippet-call="website.new_page_template_about_personal_s_text_block_h2"/>
    <t t-snippet-call="website.new_page_template_about_personal_s_numbers"/>
    <t t-snippet-call="website.new_page_template_about_personal_s_features"/>
    <t t-snippet-call="website.new_page_template_about_personal_s_call_to_action_about"/>
</div>

- kind=other id=1266 key=website.new_page_template_sections_about_timeline name=New page template: 'timeline' in 'about' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_about_timeline_s_banner"/>
    <t t-snippet-call="website.new_page_template_about_timeline_s_text_block_h2"/>
    <t t-snippet-call="website.new_page_template_about_timeline_s_text_block"/>
    <t t-snippet-call="website.new_page_template_about_timeline_s_timeline"/>
    <t t-snippet-call="website.new_page_template_about_timeline_s_call_to_action_about"/>
</div>

- kind=other id=1255 key=website.new_page_template_sections_basic_1 name=New page template: '1' in 'basic' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_basic_1_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_basic_1_s_text_block"/>
    <t t-snippet-call="website.new_page_template_basic_1_s_image_text"/>
    <t t-snippet-call="website.new_page_template_basic_1_s_text_image"/>
</div>

- kind=other id=1256 key=website.new_page_template_sections_basic_2 name=New page template: '2' in 'basic' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_basic_2_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_basic_2_s_picture"/>
    <t t-snippet-call="website.new_page_template_basic_2_s_text_block"/>
</div>

- kind=other id=1257 key=website.new_page_template_sections_basic_3 name=New page template: '3' in 'basic' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_basic_3_s_parallax"/>
    <t t-snippet-call="website.new_page_template_basic_3_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_basic_3_s_text_block"/>
    <t t-snippet-call="website.new_page_template_basic_3_s_three_columns"/>
</div>

- kind=other id=1258 key=website.new_page_template_sections_basic_4 name=New page template: '4' in 'basic' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_basic_4_s_text_cover"/>
</div>

- kind=other id=1259 key=website.new_page_template_sections_basic_5 name=New page template: '5' in 'basic' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_basic_5_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_basic_5_s_text_block"/>
    <t t-snippet-call="website.new_page_template_basic_5_s_features"/>
    <t t-snippet-call="website.new_page_template_basic_5_s_quotes_carousel"/>
</div>

- kind=other id=1260 key=website.new_page_template_sections_basic_6 name=New page template: '6' in 'basic' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_basic_6_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_basic_6_s_table_of_content"/>
</div>

- kind=other id=1273 key=website.new_page_template_sections_gallery_0 name=New page template: '0' in 'gallery' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_gallery_0_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_gallery_0_s_images_wall"/>
</div>

- kind=other id=1274 key=website.new_page_template_sections_gallery_1 name=New page template: '1' in 'gallery' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_gallery_1_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_gallery_1_s_image_text"/>
    <t t-snippet-call="website.new_page_template_gallery_1_s_text_image"/>
    <t t-snippet-call="website.new_page_template_gallery_1_s_image_text_2nd"/>
</div>

- kind=other id=1275 key=website.new_page_template_sections_gallery_2 name=New page template: '2' in 'gallery' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_gallery_2_s_banner"/>
    <t t-snippet-call="website.new_page_template_gallery_2_s_text_block_2nd"/>
    <t t-snippet-call="website.new_page_template_gallery_2_s_image_gallery"/>
    <t t-snippet-call="website.new_page_template_gallery_2_s_picture_only"/>
</div>

- kind=other id=1276 key=website.new_page_template_sections_gallery_3 name=New page template: '3' in 'gallery' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_gallery_3_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_gallery_3_s_text_block"/>
    <t t-snippet-call="website.new_page_template_gallery_3_s_three_columns"/>
    <t t-snippet-call="website.new_page_template_gallery_3_s_three_columns_2nd"/>
</div>

- kind=other id=1277 key=website.new_page_template_sections_gallery_4 name=New page template: '4' in 'gallery' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_gallery_4_s_cover"/>
    <t t-snippet-call="website.new_page_template_gallery_4_s_media_list"/>
</div>

- kind=other id=1267 key=website.new_page_template_sections_landing_0 name=New page template: '0' in 'landing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_landing_0_s_cover"/>
</div>

- kind=other id=1268 key=website.new_page_template_sections_landing_1 name=New page template: '1' in 'landing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_landing_1_s_banner"/>
    <t t-snippet-call="website.new_page_template_landing_1_s_features"/>
    <t t-snippet-call="website.new_page_template_landing_1_s_masonry_block_default_template"/>
    <t t-snippet-call="website.new_page_template_landing_1_s_call_to_action_digital"/>
    <t t-snippet-call="website.new_page_template_landing_1_s_references"/>
    <t t-snippet-call="website.new_page_template_landing_1_s_quotes_carousel"/>
</div>

- kind=other id=1269 key=website.new_page_template_sections_landing_2 name=New page template: '2' in 'landing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_landing_2_s_cover"/>
    <t t-snippet-call="website.new_page_template_landing_2_s_text_image"/>
    <t t-snippet-call="website.new_page_template_landing_2_s_text_block_h2"/>
    <t t-snippet-call="website.new_page_template_landing_2_s_three_columns"/>
    <t t-snippet-call="website.new_page_template_landing_2_s_call_to_action"/>
</div>

- kind=other id=1270 key=website.new_page_template_sections_landing_3 name=New page template: '3' in 'landing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_landing_3_s_text_cover"/>
    <t t-snippet-call="website.new_page_template_landing_3_s_text_block_h2"/>
    <t t-snippet-call="website.new_page_template_landing_3_s_three_columns"/>
    <t t-snippet-call="website.new_page_template_landing_3_s_showcase"/>
    <t t-snippet-call="website.new_page_template_landing_3_s_color_blocks_2"/>
    <t t-snippet-call="website.new_page_template_landing_3_s_quotes_carousel"/>
    <t t-snippet-call="website.new_page_template_landing_3_s_call_to_action"/>
</div>

- kind=other id=1271 key=website.new_page_template_sections_landing_4 name=New page template: '4' in 'landing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_landing_4_s_cover"/>
    <t t-snippet-call="website.new_page_template_landing_4_s_text_block_h2"/>
    <t t-snippet-call="website.new_page_template_landing_4_s_text_block"/>
    <t t-snippet-call="website.new_page_template_landing_4_s_text_block_h2_contact"/>
    <t t-snippet-call="website.new_page_template_landing_4_s_website_form"/>
</div>

- kind=other id=1272 key=website.new_page_template_sections_landing_5 name=New page template: '5' in 'landing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_landing_5_s_banner"/>
</div>

- kind=other id=1282 key=website.new_page_template_sections_pricing_0 name=New page template: '0' in 'pricing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_pricing_0_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_pricing_0_s_comparisons"/>
    <t t-snippet-call="website.new_page_template_pricing_0_s_text_block_2nd"/>
    <t t-snippet-call="website.new_page_template_pricing_0_s_showcase"/>
    <t t-snippet-call="website.new_page_template_pricing_0_s_text_block_h2"/>
    <t t-snippet-call="website.new_page_template_pricing_0_s_faq_collapse"/>
    <t t-snippet-call="website.new_page_template_pricing_0_s_call_to_action"/>
</div>

- kind=other id=1283 key=website.new_page_template_sections_pricing_1 name=New page template: '1' in 'pricing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_pricing_1_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_pricing_1_s_comparisons"/>
    <t t-snippet-call="website.new_page_template_pricing_1_s_call_to_action"/>
</div>

- kind=other id=1284 key=website.new_page_template_sections_pricing_2 name=New page template: '2' in 'pricing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_pricing_2_s_cover"/>
    <t t-snippet-call="website.new_page_template_pricing_2_s_comparisons"/>
    <t t-snippet-call="website.new_page_template_pricing_2_s_call_to_action"/>
    <t t-snippet-call="website.new_page_template_pricing_2_s_features_grid"/>
    <t t-snippet-call="website.new_page_template_pricing_2_s_color_blocks_2"/>
</div>

- kind=other id=1285 key=website.new_page_template_sections_pricing_3 name=New page template: '3' in 'pricing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_pricing_3_s_carousel"/>
    <t t-snippet-call="website.new_page_template_pricing_3_s_product_catalog"/>
    <t t-snippet-call="website.new_page_template_pricing_3_s_call_to_action_menu"/>
</div>

- kind=other id=1286 key=website.new_page_template_sections_pricing_4 name=New page template: '4' in 'pricing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_pricing_4_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_pricing_4_s_image_text"/>
    <t t-snippet-call="website.new_page_template_pricing_4_s_text_image"/>
    <t t-snippet-call="website.new_page_template_pricing_4_s_image_text_2nd"/>
    <t t-snippet-call="website.new_page_template_pricing_4_s_call_to_action"/>
</div>

- kind=other id=1287 key=website.new_page_template_sections_pricing_5 name=New page template: '5' in 'pricing' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_pricing_5_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_pricing_5_s_text_block"/>
    <t t-snippet-call="website.new_page_template_pricing_5_s_product_catalog"/>
    <t t-snippet-call="website.new_page_template_pricing_5_s_three_columns_menu"/>
    <t t-snippet-call="website.new_page_template_pricing_5_s_call_to_action"/>
</div>

- kind=other id=1278 key=website.new_page_template_sections_services_0 name=New page template: '0' in 'services' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_services_0_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_services_0_s_text_block_2nd"/>
    <t t-snippet-call="website.new_page_template_services_0_s_three_columns"/>
    <t t-snippet-call="website.new_page_template_services_0_s_text_block_h2_contact"/>
    <t t-snippet-call="website.new_page_template_services_0_s_website_form"/>
</div>

- kind=other id=1279 key=website.new_page_template_sections_services_1 name=New page template: '1' in 'services' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_services_1_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_services_1_s_features_grid"/>
    <t t-snippet-call="website.new_page_template_services_1_s_text_block_h2"/>
    <t t-snippet-call="website.new_page_template_services_1_s_faq_collapse"/>
    <t t-snippet-call="website.new_page_template_services_1_s_call_to_action"/>
</div>

- kind=other id=1280 key=website.new_page_template_sections_services_2 name=New page template: '2' in 'services' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_services_2_s_text_cover"/>
    <t t-snippet-call="website.new_page_template_services_2_s_image_text"/>
    <t t-snippet-call="website.new_page_template_services_2_s_text_image"/>
    <t t-snippet-call="website.new_page_template_services_2_s_image_text_2nd"/>
    <t t-snippet-call="website.new_page_template_services_2_s_call_to_action_digital"/>
</div>

- kind=other id=1281 key=website.new_page_template_sections_services_3 name=New page template: '3' in 'services' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_services_3_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_services_3_s_parallax"/>
    <t t-snippet-call="website.new_page_template_services_3_s_table_of_content"/>
    <t t-snippet-call="website.new_page_template_services_3_s_call_to_action"/>
</div>

- kind=other id=1288 key=website.new_page_template_sections_team_0 name=New page template: '0' in 'team' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_team_0_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_team_0_s_three_columns"/>
</div>

- kind=other id=1289 key=website.new_page_template_sections_team_1 name=New page template: '1' in 'team' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_team_1_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_team_1_s_image_text"/>
    <t t-snippet-call="website.new_page_template_team_1_s_text_image"/>
    <t t-snippet-call="website.new_page_template_team_1_s_image_text_2nd"/>
</div>

- kind=other id=1290 key=website.new_page_template_sections_team_2 name=New page template: '2' in 'team' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_team_2_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_team_2_s_company_team"/>
</div>

- kind=other id=1291 key=website.new_page_template_sections_team_3 name=New page template: '3' in 'team' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_team_3_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_team_3_s_media_list"/>
</div>

- kind=other id=1292 key=website.new_page_template_sections_team_4 name=New page template: '4' in 'team' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_team_4_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_team_4_s_text_block"/>
    <t t-snippet-call="website.new_page_template_team_4_s_images_wall"/>
</div>

- kind=other id=1293 key=website.new_page_template_sections_team_5 name=New page template: '5' in 'team' active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <div id="wrap">
    <t t-snippet-call="website.new_page_template_team_5_s_text_block_h1"/>
    <t t-snippet-call="website.new_page_template_team_5_s_text_block"/>
    <t t-snippet-call="website.new_page_template_team_5_s_image_gallery"/>
    <t t-snippet-call="website.new_page_template_team_5_s_picture"/>
</div>

- kind=other id=1197 key=website.new_page_template_services_0_s_text_block_2nd name=Snippet 's_text_block_2nd' for new page 'services' template '0' active=True website=null inherit={"id": 912, "name": "new_page_template_services_s_text_block_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1196 key=website.new_page_template_services_0_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'services' template '0' active=True website=null inherit={"id": 921, "name": "new_page_template_services_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1198 key=website.new_page_template_services_0_s_text_block_h2_contact name=Snippet 's_text_block_h2_contact' for new page 'services' template '0' active=True website=null inherit={"id": 1107, "name": "Snippet 's_text_block_h2_contact' for new page 'services' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1002 key=website.new_page_template_services_0_s_three_columns name=new_page_template_services_0_s_three_columns active=True website=null inherit={"id": 1001, "name": "new_page_template_services_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2|//h3|//h4|//h5" position="replace">
        <h2 class="card-title h5-fs">Wellness Coaching</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[2]" position="replace">
        <h2 class="card-title h5-fs">Strength Training: </h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[3]" position="replace">
        <h2 class="card-title h5-fs">Weight Loss Transformation</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="card-text">Our Coaching combines personalized fitness plans with mindfulness practices, ensuring you achieve harmony in your body and peace in your mind.</p>
    </xpath>
    <xpath expr="(//p)[2]" position="replace">
        <p class="card-text">This coaching program offers specialized strength-focused workouts, nutrition guidance, and expert coaching. Elevate your fitness level and achieve feats you never thought possible.</p>
    </xpath>
    <xpath expr="(//p)[3]" position="replace">
        <p class="card-text">With personalized fitness plans, tailored nutrition guidance, and consistent support, you'll shed unwanted pounds while building healthy habits that last.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_0_s_three_columns</attribute></xpath></data>

- kind=other id=1199 key=website.new_page_template_services_0_s_website_form name=Snippet 's_website_form' for new page 'services' template '0' active=True website=null inherit={"id": 1105, "name": "Snippet 's_website_form' for new page 'services' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1204 key=website.new_page_template_services_1_s_call_to_action name=Snippet 's_call_to_action' for new page 'services' template '1' active=True website=null inherit={"id": 1106, "name": "Snippet 's_call_to_action' for new page 'services' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1203 key=website.new_page_template_services_1_s_faq_collapse name=Snippet 's_faq_collapse' for new page 'services' template '1' active=True website=null inherit={"id": 1102, "name": "Snippet 's_faq_collapse' for new page 'services' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1201 key=website.new_page_template_services_1_s_features_grid name=Snippet 's_features_grid' for new page 'services' template '1' active=True website=null inherit={"id": 1101, "name": "Snippet 's_features_grid' for new page 'services' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1200 key=website.new_page_template_services_1_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'services' template '1' active=True website=null inherit={"id": 921, "name": "new_page_template_services_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1202 key=website.new_page_template_services_1_s_text_block_h2 name=Snippet 's_text_block_h2' for new page 'services' template '1' active=True website=null inherit={"id": 940, "name": "new_page_template_services_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1209 key=website.new_page_template_services_2_s_call_to_action_digital name=Snippet 's_call_to_action_digital' for new page 'services' template '2' active=True website=null inherit={"id": 1103, "name": "Snippet 's_call_to_action_digital' for new page 'services' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1206 key=website.new_page_template_services_2_s_image_text name=Snippet 's_image_text' for new page 'services' template '2' active=True website=null inherit={"id": 947, "name": "new_page_template_services_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1208 key=website.new_page_template_services_2_s_image_text_2nd name=Snippet 's_image_text_2nd' for new page 'services' template '2' active=True website=null inherit={"id": 952, "name": "new_page_template_services_s_image_text_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1205 key=website.new_page_template_services_2_s_text_cover name=Snippet 's_text_cover' for new page 'services' template '2' active=True website=null inherit={"id": 970, "name": "new_page_template_services_s_text_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1207 key=website.new_page_template_services_2_s_text_image name=Snippet 's_text_image' for new page 'services' template '2' active=True website=null inherit={"id": 959, "name": "new_page_template_services_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1212 key=website.new_page_template_services_3_s_call_to_action name=Snippet 's_call_to_action' for new page 'services' template '3' active=True website=null inherit={"id": 1106, "name": "Snippet 's_call_to_action' for new page 'services' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1210 key=website.new_page_template_services_3_s_parallax name=Snippet 's_parallax' for new page 'services' template '3' active=True website=null inherit={"id": 1019, "name": "new_page_template_services_s_parallax"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1211 key=website.new_page_template_services_3_s_table_of_content name=Snippet 's_table_of_content' for new page 'services' template '3' active=True website=null inherit={"id": 1104, "name": "Snippet 's_table_of_content' for new page 'services' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=922 key=website.new_page_template_services_3_s_text_block_h1 name=new_page_template_services_3_s_text_block_h1 active=True website=null inherit={"id": 921, "name": "new_page_template_services_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pb40" remove="pb0" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_3_s_text_block_h1</attribute></xpath></data>

- kind=other id=1106 key=website.new_page_template_services_s_call_to_action name=Snippet 's_call_to_action' for new page 'services' templates active=True website=null inherit={"id": 1011, "name": "new_page_template_s_call_to_action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1103 key=website.new_page_template_services_s_call_to_action_digital name=Snippet 's_call_to_action_digital' for new page 'services' templates active=True website=null inherit={"id": 1059, "name": "Snippet 's_call_to_action_digital' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1102 key=website.new_page_template_services_s_faq_collapse name=Snippet 's_faq_collapse' for new page 'services' templates active=True website=null inherit={"id": 1053, "name": "Snippet 's_faq_collapse' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1101 key=website.new_page_template_services_s_features_grid name=Snippet 's_features_grid' for new page 'services' templates active=True website=null inherit={"id": 1051, "name": "Snippet 's_features_grid' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=947 key=website.new_page_template_services_s_image_text name=new_page_template_services_s_image_text active=True website=null inherit={"id": 943, "name": "new_page_template_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="replace">
        <h2 class="h3-fs">Strategic Marketing Solutions</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p>Discover our comprehensive marketing service designed to amplify your brand's reach and impact.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_s_image_text</attribute></xpath></data>

- kind=other id=952 key=website.new_page_template_services_s_image_text_2nd name=new_page_template_services_s_image_text_2nd active=True website=null inherit={"id": 950, "name": "new_page_template_s_image_text_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="replace">
        <h2 class="h3-fs">Digital Consulting Expertise</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p>Our seasoned consultants provide tailored guidance, leveraging their deep industry knowledge to analyze your current strategies, identify opportunities, and formulate data-driven recommendations.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_s_image_text_2nd</attribute></xpath></data>

- kind=other id=1019 key=website.new_page_template_services_s_parallax name=new_page_template_services_s_parallax active=True website=null inherit={"id": 1018, "name": "new_page_template_s_parallax"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pb168 pt256" remove="o_half_screen_height" separator=" "/>
    </xpath>
    <xpath expr="//span[hasclass('s_parallax_bg')]" position="attributes">
        <attribute name="style" add="background-position: 0% 44.4099%;" remove="background-position: 50% 75%;" separator=";"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_s_parallax</attribute></xpath></data>

- kind=other id=1104 key=website.new_page_template_services_s_table_of_content name=Snippet 's_table_of_content' for new page 'services' templates active=True website=null inherit={"id": 1057, "name": "Snippet 's_table_of_content' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=912 key=website.new_page_template_services_s_text_block_2nd name=new_page_template_services_s_text_block_2nd active=True website=null inherit={"id": 908, "name": "new_page_template_s_text_block_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//p" position="replace">
        <p>Welcome to our comprehensive range of Tailored Fitness Coaching Services, with personalized workouts, customized nutrition plans, and unwavering support, we're committed to helping you achieve lasting results that align with your aspirations.</p>
        <p>It's time to elevate your fitness journey with coaching that's as unique as you are. Choose your path, embrace the guidance, and transform your life.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_s_text_block_2nd</attribute></xpath></data>

- kind=other id=921 key=website.new_page_template_services_s_text_block_h1 name=new_page_template_services_s_text_block_h1 active=True website=null inherit={"id": 915, "name": "new_page_template_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace" mode="inner">Our Services</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_s_text_block_h1</attribute></xpath></data>

- kind=other id=940 key=website.new_page_template_services_s_text_block_h2 name=new_page_template_services_s_text_block_h2 active=True website=null inherit={"id": 928, "name": "new_page_template_s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="attributes">
        <attribute name="style">text-align: left;</attribute>
    </xpath>
    <xpath expr="//h2" position="replace" mode="inner">Questions?</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_s_text_block_h2</attribute></xpath></data>

- kind=other id=1107 key=website.new_page_template_services_s_text_block_h2_contact name=Snippet 's_text_block_h2_contact' for new page 'services' templates active=True website=null inherit={"id": 1056, "name": "Snippet 's_text_block_h2_contact' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=970 key=website.new_page_template_services_s_text_cover name=new_page_template_services_s_text_cover active=True website=null inherit={"id": 966, "name": "new_page_template_s_text_cover"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h1" position="replace">
        <h1>Crafting Your Digital Success Story</h1>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead">Experience a digital transformation like never before with our range of innovative solutions, designed to illuminate your brand's potential.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_s_text_cover</attribute></xpath></data>

- kind=other id=959 key=website.new_page_template_services_s_text_image name=new_page_template_services_s_text_image active=True website=null inherit={"id": 955, "name": "new_page_template_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level pt56 pb56" remove="pt80 pb80" separator=" "/>
    </xpath>
    <xpath expr="//h2|//h3" position="replace">
        <h2 class="h3-fs">Transform Your Brand</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p>From revitalizing your visual identity to realigning your messaging for the digital landscape, we'll guide you through a strategic process that ensures your brand remains relevant and resonates with your audience.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_s_text_image</attribute></xpath></data>

- kind=other id=1001 key=website.new_page_template_services_s_three_columns name=new_page_template_services_s_three_columns active=True website=null inherit={"id": 996, "name": "new_page_template_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_services_s_three_columns</attribute></xpath></data>

- kind=other id=1105 key=website.new_page_template_services_s_website_form name=Snippet 's_website_form' for new page 'services' templates active=True website=null inherit={"id": 1026, "name": "new_page_template_s_website_form"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1240 key=website.new_page_template_team_0_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'team' template '0' active=True website=null inherit={"id": 925, "name": "new_page_template_team_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1004 key=website.new_page_template_team_0_s_three_columns name=new_page_template_team_0_s_three_columns active=True website=null inherit={"id": 1003, "name": "new_page_template_team_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2|//h3|//h4|//h5" position="replace">
        <h2 class="card-title h5-fs">Tony Fred, CEO</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[2]" position="replace">
        <h2 class="card-title h5-fs">Mich Stark, COO</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[3]" position="replace">
        <h2 class="card-title h5-fs">Aline Turner, CTO</h2>
    </xpath>
    <xpath expr="//div[hasclass('card')]//p|//div[hasclass('card-wrapper')]//p" position="replace">
        <p class="card-text">Founder and chief visionary, Tony is the driving force behind the company. He loves to keep his hands full by participating in the development of the software, marketing, and customer experience strategies.</p>
    </xpath>
    <xpath expr="(//div[hasclass('card')])[2]//p|(//div[hasclass('card-wrapper')])[2]//p" position="replace">
        <p class="card-text">Mich loves taking on challenges. With his multi-year experience as Commercial Director in the software industry, Mich has helped the company to get where it is today. Mich is among the best minds.</p>
    </xpath>
    <xpath expr="(//div[hasclass('card')])[3]//p|(//div[hasclass('card-wrapper')])[3]//p" position="replace">
        <p class="card-text">Aline is one of the iconic people in life who can say they love what they do. She mentors 100+ in-house developers and looks after the community of thousands of developers.</p>
    </xpath>
    <xpath expr="//img" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_1" class="o_card_img card-img-top"/>
    </xpath>
    <xpath expr="(//img)[2]" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_2" class="o_card_img card-img-top"/>
    </xpath>
    <xpath expr="(//img)[3]" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_3" class="o_card_img card-img-top"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_0_s_three_columns</attribute></xpath></data>

- kind=other id=1242 key=website.new_page_template_team_1_s_image_text name=Snippet 's_image_text' for new page 'team' template '1' active=True website=null inherit={"id": 948, "name": "new_page_template_team_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1244 key=website.new_page_template_team_1_s_image_text_2nd name=Snippet 's_image_text_2nd' for new page 'team' template '1' active=True website=null inherit={"id": 954, "name": "new_page_template_team_s_image_text_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1241 key=website.new_page_template_team_1_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'team' template '1' active=True website=null inherit={"id": 925, "name": "new_page_template_team_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1243 key=website.new_page_template_team_1_s_text_image name=Snippet 's_text_image' for new page 'team' template '1' active=True website=null inherit={"id": 960, "name": "new_page_template_team_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1245 key=website.new_page_template_team_2_s_company_team name=Snippet 's_company_team' for new page 'team' template '2' active=True website=null inherit={"id": 1123, "name": "Snippet 's_company_team' for new page 'team' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=926 key=website.new_page_template_team_2_s_text_block_h1 name=new_page_template_team_2_s_text_block_h1 active=True website=null inherit={"id": 925, "name": "new_page_template_team_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pb0" remove="pb40" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_2_s_text_block_h1</attribute></xpath></data>

- kind=other id=1247 key=website.new_page_template_team_3_s_media_list name=Snippet 's_media_list' for new page 'team' template '3' active=True website=null inherit={"id": 1021, "name": "new_page_template_team_s_media_list"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1246 key=website.new_page_template_team_3_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'team' template '3' active=True website=null inherit={"id": 925, "name": "new_page_template_team_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1250 key=website.new_page_template_team_4_s_images_wall name=Snippet 's_images_wall' for new page 'team' template '4' active=True website=null inherit={"id": 1025, "name": "new_page_template_team_s_images_wall"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1249 key=website.new_page_template_team_4_s_text_block name=Snippet 's_text_block' for new page 'team' template '4' active=True website=null inherit={"id": 1122, "name": "Snippet 's_text_block' for new page 'team' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1248 key=website.new_page_template_team_4_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'team' template '4' active=True website=null inherit={"id": 925, "name": "new_page_template_team_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1253 key=website.new_page_template_team_5_s_image_gallery name=Snippet 's_image_gallery' for new page 'team' template '5' active=True website=null inherit={"id": 1023, "name": "new_page_template_team_s_image_gallery"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1254 key=website.new_page_template_team_5_s_picture name=Snippet 's_picture' for new page 'team' template '5' active=True website=null inherit={"id": 964, "name": "new_page_template_team_s_picture"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1252 key=website.new_page_template_team_5_s_text_block name=Snippet 's_text_block' for new page 'team' template '5' active=True website=null inherit={"id": 1122, "name": "Snippet 's_text_block' for new page 'team' templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1251 key=website.new_page_template_team_5_s_text_block_h1 name=Snippet 's_text_block_h1' for new page 'team' template '5' active=True website=null inherit={"id": 925, "name": "new_page_template_team_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1123 key=website.new_page_template_team_s_company_team name=Snippet 's_company_team' for new page 'team' templates active=True website=null inherit={"id": 978, "name": "new_page_template_s_company_team"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=1023 key=website.new_page_template_team_s_image_gallery name=new_page_template_team_s_image_gallery active=True website=null inherit={"id": 1022, "name": "new_page_template_s_image_gallery"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//img" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_1" class="img img-fluid d-block h-100" data-name="Image" data-index="0"/>
    </xpath>
    <xpath expr="(//img)[2]" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_2" class="img img-fluid d-block h-100" data-name="Image" data-index="1"/>
    </xpath>
    <xpath expr="(//img)[3]" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_3" class="img img-fluid d-block h-100" data-name="Image" data-index="2"/>
    </xpath>
    <xpath expr="//div[hasclass('carousel-indicators')]" position="replace">
        <div class="carousel-indicators">
            <button data-bs-target="#slideshow_sample" data-bs-slide-to="0" style="background-image: url(/web/image/website.s_company_team_image_1)" class="active" aria-label="Carousel indicator"/>
            <button data-bs-target="#slideshow_sample" data-bs-slide-to="1" style="background-image: url(/web/image/website.s_company_team_image_2)" aria-label="Carousel indicator"/>
            <button data-bs-target="#slideshow_sample" data-bs-slide-to="2" style="background-image: url(/web/image/website.s_company_team_image_3)" aria-label="Carousel indicator"/>
        </div>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_s_image_gallery</attribute></xpath></data>

- kind=other id=948 key=website.new_page_template_team_s_image_text name=new_page_template_team_s_image_text active=True website=null inherit={"id": 943, "name": "new_page_template_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="replace">
        <h2 class="h3-fs">Tony Fred, CEO</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p>Founder, Tony is the driving force behind the company. He loves to keep his hands full by participating in the development of the software, marketing, and customer experience.</p>
    </xpath>
    <xpath expr="//img" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_1" class="img img-fluid mx-auto w-100"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_s_image_text</attribute></xpath></data>

- kind=other id=954 key=website.new_page_template_team_s_image_text_2nd name=new_page_template_team_s_image_text_2nd active=True website=null inherit={"id": 950, "name": "new_page_template_s_image_text_2nd"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h2" position="replace">
        <h2 class="h3-fs">Aline Turner, CTO</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p>Aline is one of the iconic people in life who can say they love what they do. She mentors 100+ in-house developers and looks after the community of thousands of developers.</p>
    </xpath>
    <xpath expr="//img" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_3" class="img img-fluid mx-auto w-100"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_s_image_text_2nd</attribute></xpath></data>

- kind=other id=1025 key=website.new_page_template_team_s_images_wall name=new_page_template_team_s_images_wall active=True website=null inherit={"id": 1024, "name": "new_page_template_s_images_wall"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//img" position="replace">
        <img alt="" src="/website/static/src/img/snippets_demo/s_mega_menu_images_subtitles_default_image_1.webp" class="img img-fluid d-block"/>
    </xpath>
    <xpath expr="(//img)[2]" position="replace">
        <img alt="" src="/website/static/src/img/snippets_demo/s_mega_menu_images_subtitles_default_image_5.webp" class="img img-fluid d-block"/>
    </xpath>
    <xpath expr="(//img)[3]" position="replace">
        <img alt="" src="/website/static/src/img/snippets_demo/s_mega_menu_images_subtitles_default_image_2.webp" class="img img-fluid d-block"/>
    </xpath>
    <xpath expr="(//img)[4]" position="replace">
        <img alt="" src="/website/static/src/img/snippets_demo/s_mega_menu_images_subtitles_default_image_4.webp" class="img img-fluid d-block"/>
    </xpath>
    <xpath expr="(//img)[5]" position="replace">
        <img alt="" src="/website/static/src/img/snippets_demo/s_mega_menu_images_subtitles_default_image_6.webp" class="img img-fluid d-block"/>
    </xpath>
    <xpath expr="(//img)[6]" position="replace">
        <img alt="" src="/website/static/src/img/snippets_demo/s_mega_menu_images_subtitles_default_image_3.jpg" class="img img-fluid d-block"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_s_images_wall</attribute></xpath></data>

- kind=other id=1021 key=website.new_page_template_team_s_media_list name=new_page_template_team_s_media_list active=True website=null inherit={"id": 1020, "name": "new_page_template_s_media_list"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//h3|//h4|//h5" position="replace">
        <h3 class="card-title">Tony Fred, CEO</h3>
    </xpath>
    <xpath expr="(//h3|//h4|//h5)[last()]" position="replace">
        <h3 class="card-title">Aline Turner, CTO</h3>
    </xpath>
    <xpath expr="(//h3|//h4|//h5)[2]" position="replace">
        <h3 class="card-title">Mich Stark, COO</h3>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="card-text">Founder, Tony is the driving force behind the company. He loves to keep his hands full by participating in the development of the software, marketing, and UX strategies.</p>
    </xpath>
    <xpath expr="(//p)[last()]" position="replace">
        <p class="card-text">Aline is one of the iconic people in life who can say they love what they do. She mentors 100+ in-house developers and looks after the community of thousands of developers.</p>
    </xpath>
    <xpath expr="(//p)[2]" position="replace">
        <p class="card-text">Mich loves taking on challenges. With his multi-year experience as Commercial Director in the software industry, Mich has helped the company to get where it is today. Mich is among the best minds.</p>
    </xpath>
    <xpath expr="//img" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_1" class="s_media_list_img h-100 w-100"/>
    </xpath>
    <xpath expr="(//img)[last()]" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_3" class="s_media_list_img h-100 w-100"/>
    </xpath>
    <xpath expr="(//img)[2]" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_2" class="s_media_list_img h-100 w-100"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_s_media_list</attribute></xpath></data>

- kind=other id=964 key=website.new_page_template_team_s_picture name=new_page_template_team_s_picture active=True website=null inherit={"id": 961, "name": "new_page_template_s_picture"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level" separator=" "/>
    </xpath>
    <xpath expr="//img" position="replace">
        <img alt="" src="/web/image/website.library_image_team" class="figure-img rounded"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_s_picture</attribute></xpath></data>

- kind=other id=1122 key=website.new_page_template_team_s_text_block name=Snippet 's_text_block' for new page 'team' templates active=True website=null inherit={"id": 1054, "name": "Snippet 's_text_block' for new page templates"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t/>

- kind=other id=925 key=website.new_page_template_team_s_text_block_h1 name=new_page_template_team_s_text_block_h1 active=True website=null inherit={"id": 915, "name": "new_page_template_s_text_block_h1"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pb40" remove="pb0" separator=" "/>
    </xpath>
    <xpath expr="//h1" position="replace" mode="inner">Our Team</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_s_text_block_h1</attribute></xpath></data>

- kind=other id=960 key=website.new_page_template_team_s_text_image name=new_page_template_team_s_text_image active=True website=null inherit={"id": 955, "name": "new_page_template_s_text_image"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="o_colored_level pt56 pb56" remove="pt80 pb80" separator=" "/>
    </xpath>
    <xpath expr="//h2|//h3" position="replace">
        <h2 class="h3-fs">Mich Stark, COO</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p>Mich loves taking on challenges. With his multi-year experience as Commercial Director in the software industry, Mich has helped the company to get where it is today.</p>
    </xpath>
    <xpath expr="//img" position="replace">
        <img alt="" src="/web/image/website.s_company_team_image_2" class="img img-fluid mx-auto w-100"/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_s_text_image</attribute></xpath></data>

- kind=other id=1003 key=website.new_page_template_team_s_three_columns name=new_page_template_team_s_three_columns active=True website=null inherit={"id": 996, "name": "new_page_template_s_three_columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data><xpath expr="." position="attributes"><attribute name="t-name">website.new_page_template_team_s_three_columns</attribute></xpath></data>

- kind=other id=715 key=website.one_hybrid name=Single any Search Results active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=1 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Single any Search Results" t-name="website.one_hybrid">
    <a t-att-href="result.get('website_url')" class="dropdown-item p-2 text-wrap">
        <div class="d-flex align-items-center flex-wrap o_search_result_item">
            <img t-if="result.get('image_url')" t-att-src="result.get('image_url')" role="presentation" alt="" class="flex-shrink-0 o_image_64_contain"/>
            <i t-else="" t-att-class="'o_image_64_contain text-center pt16 fa %s' % result.get('_fa')" style="font-size: 34px;"/>
            <div class="o_search_result_item_detail px-3">
                <t t-set="description" t-value="result.get('description')"/>
                <t t-set="extra_link" t-value="result.get('extra_link_url') and result.get('extra_link')"/>
                <t t-set="extra_link_html" t-value="not result.get('extra_link_url') and result.get('extra_link')"/>
                <div t-att-class="'h6 fw-bold %s' % ('' if description else 'mb-0')" t-out="result['name']"/>
                <p t-if="description" class="mb-0" t-out="description"/>
                <button t-if="extra_link" class="extra_link btn btn-link btn-sm" t-out="extra_link" t-attf-onclick="location.href='#{result.get('extra_link_url')}';return false;"/>
                <t t-if="extra_link_html" t-out="extra_link_html"/>
                <div t-if="result.get('tags')" t-out="result.get('tags')" class="my-2"/>
            </div>
            <div class="flex-shrink-0 ms-auto">
                <t t-if="result.get('detail_strike')">
                    <span class="text-muted text-nowrap" style="text-decoration: line-through;">
                        <t t-out="result.get('detail_strike')"/>
                    </span>
                    <br/>
                </t>
                <b t-if="result.get('detail')" class="text-nowrap">
                    <t t-out="result.get('detail')"/>
                </b>
                <t t-if="result.get('detail_extra')">
                    <br/>
                    <span class="text-nowrap" t-out="result.get('detail_extra')"/>
                </t>
            </div>
        </div>
    </a>
</t>

- kind=other id=580 key=website.our_services name=Services active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Services" t-name="website.our_services">
        <t t-call="website.layout">
            <div id="wrap">
                <div class="oe_structure">
                    <section class="s_title parallax s_parallax_is_fixed bg-black-50 pt24 pb24" data-vcss="001" data-snippet="s_title" data-scroll-background-ratio="1">
                        <span class="s_parallax_bg_wrap">
                            <span class="s_parallax_bg oe_img_bg" style="background-image: url('/web/image/website.s_parallax_default_image'); background-position: 50% 0;"/>
                        </span>
                        <div class="o_we_bg_filter bg-black-50"/>
                        <div class="container">
                            <h1>Services</h1>
                        </div>
                    </section>
                </div>
                <div class="oe_structure"/>
            </div>
        </t>
    </t>

- kind=other id=702 key=website.page_404 name=Page Not Found active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Page Not Found" t-name="website.page_404">
    <t t-call="http_routing.404"/>
</t>

- kind=other id=692 key=website.pager name=Pager active=True website=null inherit={"id": 522, "name": "Pager"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Pager">
</data>

- kind=other id=581 key=website.pricing name=Pricing active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Pricing" t-name="website.pricing">
        <t t-call="website.layout">
            <div id="wrap">
                <div class="oe_structure">
                    <section class="s_title parallax s_parallax_is_fixed bg-black-50 pt24 pb24" data-vcss="001" data-snippet="s_title" data-scroll-background-ratio="1">
                        <span class="s_parallax_bg_wrap">
                            <span class="s_parallax_bg oe_img_bg" style="background-image: url('/web/image/website.s_parallax_default_image'); background-position: 50% 0;"/>
                        </span>
                        <div class="o_we_bg_filter bg-black-50"/>
                        <div class="container">
                            <h1>Pricing</h1>
                        </div>
                    </section>
                </div>
                <div class="oe_structure"/>
            </div>
        </t>
    </t>

- kind=other id=582 key=website.privacy_policy name=Privacy Policy active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Privacy Policy" t-name="website.privacy_policy">
        <t t-call="website.layout">
            <div id="wrap">
                <div class="oe_structure">
                    <section class="s_title parallax s_parallax_is_fixed bg-black-50 pt24 pb24" data-vcss="001" data-snippet="s_title" data-scroll-background-ratio="1">
                        <span class="s_parallax_bg_wrap">
                            <span class="s_parallax_bg oe_img_bg" style="background-image: url('/web/image/website.s_parallax_default_image'); background-position: 50% 0;"/>
                        </span>
                        <div class="o_we_bg_filter bg-black-50"/>
                        <div class="container">
                            <h1>Privacy Policy</h1>
                        </div>
                    </section>
                </div>
                <div class="oe_structure"/>
            </div>
        </t>
    </t>

- kind=other id=704 key=website.protected_403 name=Page Protected active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Page Protected" t-name="website.protected_403">
    <t t-call="website.login_layout">
        <div class="container">
            <div class="row">
                <form class="offset-md-3 col-md-6" method="POST">
                    <div class="alert alert-info mt32" t-if="not request.params.get('visibility_password')">
                        <div class="h5 text-center">
                            <i class="fa fa-lock fa-2x"/><br/>
                            <span class="mt-1">A password is required to access this page.</span>
                        </div>
                    </div>
                    <div class="alert alert-warning mt32" t-else="">
                        <div class="h5 text-center">
                            <i class="fa fa-lock fa-2x"/><br/>
                            <span class="mt-1">Wrong password</span>
                        </div>
                    </div>
                    <div class="mb-3">
                        <div class="input-group">
                            <input type="hidden" name="url" t-att-value="path"/>
                            <input type="hidden" name="csrf_token" t-att-value="request.csrf_token()"/>
                            <input type="password" id="password" class="form-control" required="required" name="visibility_password"/>
                          <button class="btn border border-start-0 o_show_password" type="button">
                            <i class="fa fa-eye"/>
                          </button>
                        </div>
                    </div>
                    <button type="submit" class="h4 btn btn-primary">Access to this page</button>
                </form>
            </div>
        </div>
    </t>
</t>

- kind=other id=691 key=website.publish_management name=publish_management active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.publish_management">
    <div groups="website.group_website_restricted_editor" t-ignore="true" class="float-end css_editable_mode_hidden" t-att-style="style or None">
        <div t-attf-class="btn-group #{btn_class} js_publish_management #{object.website_published and 'css_published' or 'css_unpublished'}" t-att-data-id="object.id" t-att-data-object="object._name" t-att-data-description="env['ir.model']._get(object._name).display_name">
            <button class="btn btn-danger js_publish_btn">Unpublished</button>
            <button class="btn btn-success js_publish_btn">Published</button>
            <button type="button" t-attf-class="btn btn-light dropdown-toggle dropdown-toggle-split" t-att-id="'dopprod-%s' % object.id" data-bs-toggle="dropdown"/>
            <div class="dropdown-menu" role="menu" t-att-aria-labelledby="'dopprod-%s' % object.id">
                <t t-out="0"/>
                <a role="menuitem" t-attf-href="/odoo/action-#{action}/#{object.id}?menu_id=#{menu or object.env['ir.model.data']._xmlid_to_res_id('website.menu_website_configuration')}" title="Edit in backend" class="dropdown-item" t-if="publish_edit">Edit</a>
            </div>
        </div>
    </div>
</t>

- kind=other id=705 key=website.qweb_500 name=qweb_500 active=True website=null inherit={"id": 279, "name": "500"}
  signals: hrefs_total=0 forms_total=1 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! -->
    <!-- This template should not use any variable except those provided by website.ir_http._handle_exception  -->
    <!--    no request.crsf_token, no theme style, no assets, ... cursor can be broken during rendering !      -->
    <!--    see test_05_reset_specific_view_controller_broken_request                                          -->
    <!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! -->
    <xpath expr="//script[last()]" position="before">
        <script type="text/javascript" src="/web/static/lib/bootstrap/js/dist/util/component-functions.js"/>
        <script type="text/javascript" src="/web/static/lib/bootstrap/js/dist/util/backdrop.js"/>
        <script type="text/javascript" src="/web/static/lib/bootstrap/js/dist/util/focustrap.js"/>
        <script type="text/javascript" src="/web/static/lib/bootstrap/js/dist/util/scrollbar.js"/>
        <script type="text/javascript" src="/web/static/lib/bootstrap/js/dist/modal.js"/>
    </xpath>
    <xpath expr="//style" position="after">
        <t t-if="view">
            <script>
                $(document).ready(function() {
                    var button = $('.reset_templates_button');
                    button.click(function() {
                        $('#reset_templates_mode').val($(this).data('mode'));
                        var dialog = $('#reset_template_confirmation').modal('show');
                        var input = dialog.find('input[type="text"]').val('').focus();
                        var dialog_form = dialog.find('form');
                        dialog_form.submit(function() {
                            if (input.val() == dialog.find('.confirm_word').text()) {
                                dialog.modal('hide');
                                button.prop('disabled', true).text('Working...');
                                const id = document.querySelector('input[id="reset_templates_view_id"]').value;
                                const redirect = document.querySelector('input[name="redirect"]').value;
                                const mode = document.querySelector('input[id="reset_templates_mode"]').value;
                                fetch('/website/reset_template', {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    'body': JSON.stringify({'params': {'view_id': id, 'mode': mode}})
                                }).then(() =&gt; window.location = redirect);
                            } else {
                                input.val('').focus();
                            }
                            return false;
                        });
                        return false;
                    });
                });
            </script>
        </t>
    </xpath>
    <xpath expr="//div[@id='wrapwrap']" position="before">
        <div t-if="view" role="dialog" id="reset_template_confirmation" class="modal" tabindex="-1" t-ignore="true">
            <div class="modal-dialog">
                <form role="form">
                    <div class="modal-content">
                        <header class="modal-header">
                            <h4 class="modal-title">Reset templates</h4>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"/>
                        </header>
                        <main class="modal-body">
                            <div class="row mb0">
                                <label for="page-name" class="col-md-12 col-form-label">
                                    <p>The selected templates will be reset to their factory settings.</p>
                                </label>
                            </div>
                            <div class="row mb0">
                                <label for="page-name" class="col-md-9 col-form-label">
                                    <p>Type '<i class="confirm_word">yes</i>' in the box below if you want to confirm.</p>
                                </label>
                                <div class="col-md-3 mt16">
                                    <input type="text" id="page-name" class="form-control" required="required" placeholder="yes"/>
                                </div>
                            </div>
                        </main>
                        <footer class="modal-footer">
                            <button type="button" class="btn" data-bs-dismiss="modal" aria-label="Cancel">Cancel</button>
                            <input type="submit" value="Confirm" class="btn btn-primary"/>
                        </footer>
                    </div>
                </form>
            </div>
        </div>
    </xpath>
    <xpath expr="//div[@id='error_message']" position="after">
        <div class="container" t-if="view and editable">
            <div class="alert alert-danger" role="alert">
                <h4>Template fallback</h4>
                <p>An error occurred while rendering the template <code t-out="qweb_exception.template"/>.</p>
                <p>If this error is caused by a change of yours in the templates, you have the possibility to reset the template to its <strong>factory settings</strong>.</p>
                <form action="#" method="post" id="reset_templates_form">
                    <ul>
                        <li>
                            <label>
                                <t t-out="view.name"/>
                            </label>
                        </li>
                    </ul>
                    <input type="hidden" name="redirect" t-att-value="request.httprequest.path"/>
                    <input type="hidden" id="rese…

- kind=other id=690 key=website.record_cover name=record_cover active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.record_cover">
    <t t-set="_cp" t-value="_cp or json.loads(_record.cover_properties)"/>
    <t t-set="_name" t-value="_name or _record._name"/>
    <t t-set="_id" t-value="_id or _record.id"/>
    <t t-set="_bg" t-value="_bg or _record._get_background(height=_resize_height, width=_resize_width)"/>
    <t t-set="default_cover_name">Cover</t>
    <div t-att-data-name="display_opt_name or default_cover_name" t-att-style="_cp.get('background_color_style')" t-att-data-use_size="use_size" t-att-data-use_filters="use_filters" t-att-data-use_text_align="use_text_align" t-att-data-res-model="_name" t-att-data-res-id="_id" t-attf-class="o_record_cover_container d-flex flex-column h-100 o_colored_level o_cc #{_cp.get('background_color_class')} #{use_size and _cp.get('resize_class')} #{use_text_align and _cp.get('text_align_class')} #{additionnal_classes}">
        <div t-attf-class="o_record_cover_component o_record_cover_image #{snippet_autofocus and 'o_we_snippet_autofocus'}" t-attf-style="background-image: #{_bg};"/>
        <div t-if="use_filters" t-attf-class="o_record_cover_component o_record_cover_filter oe_black" t-attf-style="opacity: #{_cp.get('opacity', 0.0)};"/>
        <t t-out="0"/>
    </div>
</t>

- kind=other id=706 key=website.robots name=robots active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.robots">
<t t-translation="off">
User-agent: *
<t t-foreach="allowed_routes" t-as="allowed_route">
Allow: <t t-out="allowed_route"/>
</t>
<t t-if="website.domain and not website._is_indexable_url(url_root)">
Disallow: /
Sitemap: <t t-out="website.domain"/>/sitemap.xml
</t>
<t t-else="">
Sitemap: <t t-out="url_root"/>sitemap.xml
<t id="robots_module_rules"/>

##############
#   custom   #
##############

<t t-out="request.website.sudo().robots_txt"/>
</t>
</t>
</t>

- kind=other id=825 key=website.s_accordion name=Accordion active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Accordion" t-name="website.s_accordion">
<t t-set="uniq" t-value="datetime.datetime.now().microsecond"/>
    <div t-attf-class="s_accordion" data-name="Accordion">
        <div id="myCollapse" t-attf-class="{{extra_classes}} accordion">
            <div class="accordion-item position-relative z-1" data-name="Accordion Item">
                <button type="button" t-attf-id="accordion-button{{uniq}}_1" class="accordion-header accordion-button justify-content-between gap-2 bg-transparent h6-fs fw-bold text-decoration-none text-reset transition-none" t-attf-data-bs-target="#myCollapseTab{{uniq}}_1" t-attf-aria-controls="myCollapseTab{{uniq}}_1" data-bs-toggle="collapse" aria-expanded="true"><span class="flex-grow-1">What services does your company offer ?</span></button>
                <div t-attf-id="myCollapseTab{{uniq}}_1" class="accordion-collapse collapse show" data-bs-parent="#myCollapse" role="region" t-attf-aria-labelledby="accordion-button{{uniq}}_1">
                    <div class="accordion-body">
                        <p>Our company specializes in consulting, product development, and customer support. We tailor our services to fit the unique needs of businesses across various sectors, helping them grow and succeed in a competitive market.</p>
                    </div>
                </div>
            </div>
            <div class="accordion-item position-relative z-1" data-name="Accordion Item">
                <button type="button" t-attf-id="accordion-button{{uniq}}_2" class="accordion-header accordion-button collapsed justify-content-between gap-2 bg-transparent h6-fs fw-bold text-decoration-none text-reset transition-none" t-attf-data-bs-target="#myCollapseTab{{uniq}}_2" t-attf-aria-controls="myCollapseTab{{uniq}}_2" data-bs-toggle="collapse" aria-expanded="false"><span class="flex-grow-1">How can I contact customer support ?</span></button>
                <div t-attf-id="myCollapseTab{{uniq}}_2" class="accordion-collapse collapse" data-bs-parent="#myCollapse" role="region" t-attf-aria-labelledby="accordion-button{{uniq}}_2">
                    <div class="accordion-body">
                        <p>You can reach our customer support team by emailing info@yourcompany.example.com, calling +1 555-555-5556, or using the live chat on our website. Our dedicated team is available 24/7 to assist with any inquiries or issues.</p>
                        <p>We’re committed to providing prompt and effective solutions to ensure your satisfaction.</p>
                    </div>
                </div>
            </div>
            <div class="accordion-item position-relative z-1" data-name="Accordion Item">
                <button type="button" t-attf-id="accordion-button{{uniq}}_3" class="accordion-header accordion-button collapsed justify-content-between gap-2 bg-transparent h6-fs fw-bold text-decoration-none text-reset transition-none" t-attf-data-bs-target="#myCollapseTab{{uniq}}_3" t-attf-aria-controls="myCollapseTab{{uniq}}_3" data-bs-toggle="collapse" aria-expanded="false"><span class="flex-grow-1">What is your return policy ?</span></button>
                <div t-attf-id="myCollapseTab{{uniq}}_3" class="accordion-collapse collapse" data-bs-parent="#myCollapse" role="region" t-attf-aria-labelledby="accordion-button{{uniq}}_3">
                    <div class="accordion-body">
                        <p>We offer a 30-day return policy for all products. Items must be in their original condition, unused, and include the receipt or proof of purchase. Refunds are processed within 5-7 business days of receiving the returned item.</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</t>

- kind=other id=829 key=website.s_accordion_image name=Accordion Image active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Accordion Image" t-name="website.s_accordion_image">
    <section class="s_accordion_image pt56 pb56 o_cc o_cc2">
        <div class="container">
            <div class="row align-items-start">
                <div class="col-lg-6 pt16">
                    <h2 class="h3-fs">Top questions answered</h2>
                    <p class="lead">In this section, you can address common questions efficiently.</p>
                    <p><br/></p>
                    <t t-snippet-call="website.s_accordion" extra_classes.f="accordion-flush"/>
                </div>
                <div class="col-lg-5 offset-lg-1 pt16">
                    <img src="/web/image/website.s_accordion_image_default_image" class="img img-fluid mx-auto rounded" style="width: 100% !important;" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=832 key=website.s_adventure name=Adventure active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Adventure" t-name="website.s_adventure">
    <section class="s_adventure pt184 pb200 oe_img_bg o_bg_img_center" style="background-image: url('/web/image/website.s_adventure_default_image');" data-oe-shape-data="{'shape': 'html_builder/Connections/04'}">
        <div class="o_we_bg_filter bg-white-50"/>
        <div class="o_we_shape o_html_builder_Connections_04"/>
        <div class="container s_allow_columns">
            <h1 class="display-1" style="text-align: center;">
                <span class="display-4-fs">Embark on your</span>
                <br/>Next Adventure
            </h1>
            <p><br/></p>
            <p style="text-align: center;">
                <a t-att-href="cta_btn_href" class="btn btn-lg btn-primary o_translate_inline">Start Now</a>
            </p>
        </div>
    </section>
</t>

- kind=other id=754 key=website.s_alert name=Alert active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Alert" t-name="website.s_alert">
    <div class="s_alert s_alert_md alert alert-info w-100 clearfix" role="alert" data-vcss="001">
        <i class="fa fa-lg fa-info-circle fa-stack d-flex align-items-center justify-content-center me-3 p-2 rounded-1 s_alert_icon"/>
        <div class="s_alert_content">
            <p>Explain the benefits you offer. <br/>Don't write about products or services here, write about solutions.</p>
        </div>
    </div>
</t>

- kind=other id=728 key=website.s_announcement_scroll name=Announcement Scroll active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Announcement Scroll" t-name="website.s_announcement_scroll">
    <section class="s_announcement_scroll s_announcement_scroll_direction_left s_announcement_scroll_parallax s_announcement_scroll_hover_pause w-100 pt24 pb24" style="--marquee-animation-speed: 5s; --marquee-item-font-size: 80;" role="marquee">
        <div class="s_announcement_scroll_marquee_container d-flex s_announcement_scroll_heading_family">
            <div class="o_not_editable s_announcement_scroll_marquee_item lh-1">• Free Shipping • Secure payment • Easy Return</div>
        </div>
    </section>
</t>

- kind=other id=854 key=website.s_attributes_horizontal name=Horizontal Attributes active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Horizontal Attributes" t-name="website.s_attributes_horizontal">
    <section class="s_attributes_horizontal pt24 pb24">
        <div class="container">
            <div class="row">
                <div class="s_attributes_horizontal_col col-lg-3 pt24 pb24" data-name="Column">
                    <div class="row align-items-center h-100 mx-0 s_col_no_resize s_col_no_bgcolor">
                        <div class="col-2 col-lg-3 px-0">
                            <img src="/html_editor/shape/website/s_attributes_1.svg?c1=rgba(0,0,0,.25)&amp;c4=o-color-4&amp;c5=o-color-5" class="s_attributes_horizontal_img img img-fluid" alt="" style="width: 100% !important;"/>
                        </div>
                        <div class="col-10 col-lg-9 d-flex flex-column pe-0">
                            <h2 class="h6-fs">Easy returns</h2>
                            <small class="text-muted">Free 30-day returns with quick refunds or easy exchanges and no stress.</small>
                        </div>
                    </div>
                </div>
                <div class="s_attributes_horizontal_col col-lg-3 pt24 pb24" data-name="Column">
                    <div class="row align-items-center h-100 mx-0 s_col_no_resize s_col_no_bgcolor">
                        <div class="col-2 col-lg-3 px-0">
                            <img src="/html_editor/shape/website/s_attributes_2.svg?c1=rgba(0,0,0,.25)&amp;c2=rgba(0,0,0,.5)&amp;c4=o-color-4&amp;c5=o-color-5" class="s_attributes_horizontal_img img img-fluid" alt="" style="width: 100% !important;"/>
                        </div>
                        <div class="col-10 col-lg-9 d-flex flex-column pe-0">
                            <h2 class="h6-fs">Free shipping</h2>
                            <small class="text-muted">Enjoy fast, free shipping on all orders, no minimum, no hidden fees.</small>
                        </div>
                    </div>
                </div>
                <div class="s_attributes_horizontal_col col-lg-3 pt24 pb24" data-name="Column">
                    <div class="row align-items-center h-100 mx-0 s_col_no_resize s_col_no_bgcolor">
                        <div class="col-2 col-lg-3 px-0">
                            <img src="/html_editor/shape/website/s_attributes_3.svg?c1=rgba(0,0,0,.25)&amp;c4=o-color-4&amp;c5=o-color-5" class="s_attributes_horizontal_img img img-fluid" alt="" style="width: 100% !important;"/>
                        </div>
                        <div class="col-10 col-lg-9 d-flex flex-column pe-0">
                            <h2 class="h6-fs">Secure payment</h2>
                            <small class="text-muted">Your information is protected with encrypted checkout and trusted payment methods.</small>
                        </div>
                    </div>
                </div>
                <div class="s_attributes_horizontal_col col-lg-3 pt24 pb24" data-name="Column">
                    <div class="row align-items-center h-100 mx-0 s_col_no_resize s_col_no_bgcolor">
                        <div class="col-2 col-lg-3 px-0">
                            <img src="/html_editor/shape/website/s_attributes_4.svg?c1=rgba(0,0,0,.25)&amp;c2=rgba(0,0,0,.5)&amp;c4=o-color-4&amp;c5=o-color-5" class="s_attributes_horizontal_img img img-fluid" alt="" style="width: 100% !important;"/>
                        </div>
                        <div class="col-10 col-lg-9 d-flex flex-column pe-0">
                            <h2 class="h6-fs">Quality assured</h2>
                            <small class="text-muted">Every product is carefully tested to meet high standards of durability and performance.</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=855 key=website.s_attributes_vertical name=Vertical Attributes active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Vertical Attributes" t-name="website.s_attributes_vertical">
    <section class="s_attributes_vertical">
        <div class="container-fluid">
            <div class="row">
                <div class="col-lg-4 border pt48 pb48" data-name="Column">
                    <img src="/html_editor/shape/website/s_attributes_1.svg?c1=rgba(0,0,0,.25)&amp;c4=o-color-4&amp;c5=o-color-5" class="s_attributes_vertical_img img img-fluid mx-auto" alt="" style="width: 25% !important; padding: 20px;"/>
                    <div class="d-flex flex-column">
                        <h6 style="text-align: center;">
                            Easy returns with quick<br/>
                            and simple process
                        </h6>
                        <small class="text-muted" style="text-align: center;">
                            Free 30-day returns with quick refunds<br/>
                            or easy exchanges and no stress.
                        </small>
                    </div>
                </div>
                <div class="col-lg-4 border pt48 pb48" data-name="Column">
                    <img src="/html_editor/shape/website/s_attributes_3.svg?c1=rgba(0,0,0,.25)&amp;c4=o-color-4&amp;c5=o-color-5" class="s_attributes_vertical_img img img-fluid mx-auto" alt="" style="width: 25% !important; padding: 20px;"/>
                    <div class="d-flex flex-column">
                        <h6 style="text-align: center;">
                            Secure payment<br/>
                            with trusted methods
                        </h6>
                        <small class="text-muted" style="text-align: center;">
                            Your information is protected with encrypted<br/>
                            checkout and trusted payment methods.
                        </small>
                    </div>
                </div>
                <div class="col-lg-4 border pt48 pb48" data-name="Column">
                    <img src="/html_editor/shape/website/s_attributes_4.svg?c1=rgba(0,0,0,.25)&amp;c2=rgba(0,0,0,.5)&amp;c4=o-color-4&amp;c5=o-color-5" class="s_attributes_vertical_img img img-fluid mx-auto" alt="" style="width: 25% !important; padding: 20px;"/>
                    <div class="d-flex flex-column">
                        <h6 style="text-align: center;">
                            Quality assured<br/>
                            with every purchase
                        </h6>
                        <small class="text-muted" style="text-align: center;">
                            Every product is carefully tested to meet<br/>
                            high standards of durability and performance.
                        </small>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=891 key=website.s_avatars name=Avatars active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Avatars" t-name="website.s_avatars">
    <div class="s_avatars o_not_editable d-flex flex-row flex-wrap">
        <div class="s_avatars_wrapper d-flex">
            <img src="/web/image/website.s_company_team_image_1" class="s_avatars_avatar o_editable_media o_avatar img border rounded-circle" style="border-color: var(--body-bg) !important; --box-border-left-width: 3px; --box-border-bottom-width: 3px; --box-border-right-width: 3px; --box-border-top-width: 3px;" alt=""/>
            <img src="/web/image/website.s_company_team_image_2" class="s_avatars_avatar o_editable_media o_avatar img border rounded-circle" style="border-color: var(--body-bg) !important; --box-border-left-width: 3px; --box-border-bottom-width: 3px; --box-border-right-width: 3px; --box-border-top-width: 3px;" alt=""/>
            <img src="/web/image/website.s_company_team_image_3" class="s_avatars_avatar o_editable_media o_avatar img border rounded-circle" style="border-color: var(--body-bg) !important; --box-border-left-width: 3px; --box-border-bottom-width: 3px; --box-border-right-width: 3px; --box-border-top-width: 3px;" alt=""/>
            <div class="s_avatars_more s_avatars_avatar d-flex justify-content-center align-items-center text-bg-light border rounded-circle o-contenteditable-true" style="border-color: var(--body-bg) !important; --box-border-left-width: 3px; --box-border-bottom-width: 3px; --box-border-right-width: 3px; --box-border-top-width: 3px;">
                <p class="m-0">10+</p>
            </div>
        </div>
        <p class="s_avatars_label o_small-fs m-0 o-contenteditable-true">
            <strong>100+</strong><br/>
            Happy customers
        </p>
    </div>
</t>

- kind=other id=852 key=website.s_badge name=Badge active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Badge" t-name="website.s_badge">
    <span class="s_badge badge text-bg-secondary o_animable" data-name="Badge" data-vxml="001">
        <i class="fa fa-fw fa-folder o_not-animable"/>Category
    </span>
</t>

- kind=other id=740 key=website.s_banner name=Banner active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Banner" t-name="website.s_banner">
    <section class="s_banner pt96 pb96">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="10">
                <div class="o_grid_item g-height-10 g-col-lg-5 col-lg-5" data-name="Box" style="z-index: 1; grid-area: 1 / 1 / 11 / 6;">
                    <h1 class="display-3">Unleash your <strong>potential.</strong></h1>
                    <p class="lead"><br/>This is a simple hero unit, a simple jumbotron-style component for calling extra attention to featured content or information.<br/><br/></p>
                    <p>
                        <a t-att-href="cta_btn_href" class="btn btn-lg btn-primary o_translate_inline">Start Now <span class="fa fa-angle-right ms-2"/></a>
                    </p>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-4 g-height-10 col-lg-4 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 2; grid-area: 1 / 8 / 11 / 12;">
                    <img class="img img-fluid mx-auto rounded" src="/web/image/website.s_banner_default_image_2" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-2 g-height-5 col-lg-2 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 3; grid-area: 2 / 11 / 7 / 13;">
                    <img class="img img-fluid mx-auto rounded" src="/web/image/website.s_banner_default_image_3" alt=""/>
                </div>
                <div class="o_grid_item g-col-lg-5 g-height-4 col-lg-5" style="z-index: 4; grid-area: 6 / 6 / 10 / 11;">
                    <blockquote class="s_blockquote s_blockquote_with_line o_cc o_cc1 o_animable position-relative d-flex flex-column gap-4 w-100 mx-auto p-4 fst-normal shadow" data-vcss="001" data-snippet="s_blockquote" data-name="Blockquote">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right d-block mx-auto rounded bg-o-color-1" role="img"/>
                        </div>
                        <p class="s_blockquote_quote my-auto">"Write a quote here from one of your customers. Quotes are a great way to build confidence in your products."</p>
                        <div class="s_blockquote_infos d-flex gap-2 flex-row align-items-start justify-content-start w-100 text-start">
                            <img src="/web/image/website.s_blockquote_default_image" class="s_blockquote_avatar img rounded-circle" alt=""/>
                            <div class="s_blockquote_author">
                                <span class="o_small-fs">
                                    <strong>Paul Dawson</strong><br/>
                                    <span>CEO of MyCompany</span>
                                </span>
                            </div>
                        </div>
                    </blockquote>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=905 key=website.s_banner_categories name=Banner Categories active=True website=null inherit=null
  signals: hrefs_total=4 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Banner Categories" t-name="website.s_banner_categories">
    <section class="s_banner_categories oe_img_bg o_cc o_cc5 o_bg_img_center pb56" data-oe-shape-data="{'shape': 'html_builder/Connections/20', 'colors': {'c5': 'rgb(255, 255, 255)'}, 'showOnMobile': false}" style="background-position: 50% 75%; background-image: url('/web/image/website.s_banner_categories_default_image_1');">
        <div class="o_we_bg_filter bg-black-50"/>
        <div class="o_html_builder_Connections_20 o_we_shape" style="background-image: url('/html_editor/shape/html_builder/Connections/20.svg?c5=rgb%28255%2C255%2C255%29');"/>
        <div class="container">
            <div class="o_grid_mode row" data-row-count="13" style="gap: 16px;">
                <div data-name="Intro" class="o_grid_item o_colored_level g-height-6 g-col-lg-8 col-lg-8 justify-content-start" style="z-index: 1; --grid-item-padding-y: 72px; grid-area: 2 / 3 / 8 / 11;">
                    <h1 style="text-align: center;">Explore Our New Collection</h1>
                    <p class="lead" style="text-align: center;">
                        Each item in our collection is grouped by category to make your browsing experience effortless. Take a look and dive into the different worlds we’ve curated for you.
                        <br/>
                        <br/>
                    </p>
                    <p style="text-align: center;">
                        <a t-att-href="shop_btn_href" class="o_translate_inline btn btn-lg btn-secondary">
                            <t t-out="cta_btn_text">Buy Now</t>
                        </a>
                    </p>
                </div>
                <div class="o_grid_item o_colored_level o_cc o_cc5 o_bg_img_center oe_img_bg justify-content-end g-col-lg-4 g-height-6 col-lg-4 col-10 offset-1 offset-lg-0" style="grid-area: 8 / 1 / 14 / 5; z-index: 2;background-image: url('/web/image/website.shop_category_1_1x1'); --grid-item-padding-y: 32px; --grid-item-padding-x: 32px;">
                    <div class="o_we_bg_filter" style="background-image: linear-gradient(0deg, rgba(36, 36, 36, 0.52) 0%, rgba(255, 255, 255, 0) 50%);"/>
                    <h2 class="h3-fs">Sofas</h2>
                    <p>
                        <a href="#" class="o_translate_inline text-reset">Shop all →</a>
                    </p>
                </div>
                <div class="o_grid_item o_cc o_cc5 o_colored_level o_bg_img_center oe_img_bg justify-content-end g-height-6 g-col-lg-4 col-lg-4 col-10 offset-1 offset-lg-0" style="grid-area: 8 / 5 / 14 / 9; z-index: 3;background-image: url('/web/image/website.shop_category_2_1x1'); --grid-item-padding-y: 32px; --grid-item-padding-x: 32px;">
                    <div class="o_we_bg_filter" style="background-image: linear-gradient(0deg, rgba(36, 36, 36, 0.52) 0%, rgba(255, 255, 255, 0) 50%);"/>
                    <h2 class="h3-fs">Desks</h2>
                    <p>
                        <a href="#" class="o_translate_inline text-reset">Shop all →</a>
                    </p>
                </div>
                <div class="o_grid_item o_cc o_cc5 o_colored_level o_bg_img_center oe_img_bg justify-content-end g-height-6 g-col-lg-4 col-lg-4 offset-1 offset-lg-0 col-10" style="grid-area: 8 / 9 / 14 / 13; z-index: 4;background-image: url('/web/image/website.shop_category_3_1x1'); --grid-item-padding-y: 32px; --grid-item-padding-x: 32px;">
                    <div class="o_we_bg_filter" style="background-image: linear-gradient(0deg, rgba(36, 36, 36, 0.52) 0%, rgba(255, 255, 255, 0) 50%);"/>
                    <h2 class="h3-fs">Drawers</h2>
                    <p>
                        <a href="#" class="o_translate_inline text-reset">Shop all →</a>
                    </p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=903 key=website.s_banner_connected name=Banner Connected active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Banner Connected" t-name="website.s_banner_connected">
    <section class="s_banner_connected o_cc o_cc5 pt128 pb136 parallax" data-oe-shape-data="{'shape':'html_builder/Connections/13','colors':{'c5':'rgb(255, 255, 255)'},'showOnMobile':true}" data-scroll-background-ratio="0.75" data-parallax-type="zoomOut">
        <span class="s_parallax_bg_wrap">
            <span class="s_parallax_bg oe_img_bg" style="background-image: url('/web/image/website.s_banner_connected_default_image'); background-position: 50% 75%;"/>
        </span>
        <div class="o_we_bg_filter" style="background-image: radial-gradient(circle farthest-side at 25% 25%, rgba(222, 222, 222, 0) 0%, rgb(69, 69, 69) 100%);"/>
        <div class="o_we_shape o_html_builder_Connections_13 o_shape_show_mobile" style="background-image: url('/html_editor/shape/html_builder/Connections/13.svg?c5=rgb%28255%2C255%2C255%29');"/>
        <div class="container">
            <div class="row">
                <div class="o_colored_level col-lg-5 offset-lg-7 pb32 pt32">
                    <h1>The Ultimate Experience of Connecting</h1>
                    <p class="lead">Innovation transforms possibilities into reality.</p>
                    <p>
                        <a t-att-href="cta_btn_href" class="o_translate_inline btn btn-lg btn-secondary">Discover</a>
                    </p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=876 key=website.s_banner_product name=Collection Banner active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Collection Banner" t-name="website.s_banner_product">
    <section class="s_banner_product o_cc o_cc5 pt24 pb24 parallax" data-scroll-background-ratio="0.2" data-parallax-type="zoom_out">
        <span class="s_parallax_bg_wrap">
            <span class="s_parallax_bg oe_img_bg o_bg_img_center o_bg_img_origin_border_box" style="background-image: url('/web/image/website.shop_category_1_16x9'); top: -20px; bottom: -20px; transform: scale(1.097);"/>
        </span>
        <div class="o_we_bg_filter bg-black-15"/>
        <div class="container">
            <div class="row o_grid_mode" data-row-count="15">
                <div class="o_grid_item g-height-4 g-col-lg-7 col-lg-7" style="z-index: 1; grid-area: 12 / 1 / 16 / 8;">
                    <h2>Explore our new collection</h2>
                    <p>Simple forms. Natural textures. Timeless design. Explore our new furniture collection—crafted to bring calm and clarity to your space.</p>
                </div>
                <div class="o_grid_item g-height-4 g-col-lg-4 col-lg-4" style="z-index: 2; grid-area: 12 / 9 / 16 / 13; text-align: right;">
                    <a t-att-href="shop_btn_href" class="btn btn-lg btn-secondary">Buy Now</a>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=838 key=website.s_bento_banner name=Bento Banner active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Bento Banner" t-name="website.s_bento_banner">
    <section class="s_bento_banner pt32 pb32">
        <div class="container">
            <section data-name="Card" class="oe_unmovable oe_unremovable o_cc o_cc5 oe_img_bg o_bg_img_center s_col_no_resize d-flex rounded-4 py-5 py-lg-0" style="background-image: url('/web/image/website.shop_category_3_4x3'); box-shadow: rgba(0, 0, 0, 0.15) 0px 8px 16px 0px !important;">
                <div class="o_we_bg_filter bg-black-25"/>
                <div class="container-fluid">
                    <div class="oe_unremovable row mx-0 o_grid_mode" data-row-count="10">
                        <div class="o_grid_item g-height-9 g-col-lg-8 col-lg-8" style="z-index: 1; grid-area: 2 / 3 / 11 / 11;">
                            <h2 style="text-align: center;">Discover our latest collection</h2>
                            <p style="text-align: center;">
                                Simple forms. Natural textures. Timeless design. Explore our new furniture collection—crafted to bring calm and clarity to your space.
                                <br/><br/>
                            </p>
                            <p style="text-align: center;">
                                <a t-att-href="shop_btn_href" role="button" class="btn btn-lg btn-secondary o_translate_inline">
                                    Buy now
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </section>
</t>

- kind=other id=741 key=website.s_bento_block name=Bento Block active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Bento Block" t-name="website.s_bento_block">
    <section class="s_bento_block pt32 pb32 o_cc o_cc2">
        <div class="container">
            <section data-name="Card" class="s_bento_block_card oe_unmovable oe_unremovable s_col_no_resize o_cc o_cc5 d-flex rounded-4 px-3 py-4 p-lg-0 oe_img_bg o_bg_img_center" style="background-image: url('/web/image/website.shop_category_2_16x9'); background-position: 0% 50%; box-shadow: rgba(0, 0, 0, 0.15) 0px 8px 16px 0px !important;">
                <div class="o_we_bg_filter bg-black-25"/>
                <div class="container-fluid">
                    <div class="oe_unremovable row mx-0 o_grid_mode" data-row-count="10">
                        <div class="o_grid_item g-height-3 g-col-lg-8 col-lg-8" style="z-index: 1; --grid-item-padding-x: 48px; --grid-item-padding-y: 0px; grid-area: 8 / 1 / 11 / 9;">
                            <h2>Explore our new collection</h2>
                            <p>Simple forms. Natural textures. Timeless design. Crafted to bring calm and clarity to your space.</p>
                            <p><br/><br/><br/><br/></p>
                        </div>
                        <div class="o_grid_item g-height-3 g-col-lg-4 col-lg-4" style="z-index: 2; --grid-item-padding-x: 48px; --grid-item-padding-y: 0px; grid-area: 8 / 9 / 11 / 13; text-align: right;">
                            <a t-att-href="shop_btn_href" class="btn btn-lg btn-secondary o_animate o_anim_fade_in o_animated" style="--wanim-intensity: 30; animation-play-state: running;">
                                Buy Now
                            </a>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </section>
</t>

- kind=other id=750 key=website.s_bento_grid name=Bento Grid active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Bento Grid" t-name="website.s_bento_grid">
    <section class="s_bento_grid o_colored_level pt64 pb64">
        <div class="container">
            <div class="row o_grid_mode" style="gap: 32px;" data-row-count="19">
                <div class="o_grid_item o_grid_item_image oe_img_bg o_bg_img_center o_colored_level o_cc o_cc5 g-col-lg-6 g-height-6 col-lg-6 rounded" style="--grid-item-padding-x: 32px; --grid-item-padding-y: 32px; background-image: url('/web/image/website.s_bento_grid_default_image_2'); border-radius: 6.4px !important; grid-area: 1 / 1 / 7 / 7; z-index: 1;">
                    <div class="o_we_bg_filter bg-black-25"/>
                    <h2 class="h3-fs">Timeless Design</h2>
                    <p class="lead">
                        Elevate your living space with furniture that blends modern aesthetics and classic charm, crafted to bring both comfort and style to your home.
                        <br/><br/><br/><br/><br/><br/>
                    </p>
                </div>
                <div class="o_grid_item o_grid_item_image oe_img_bg o_bg_img_center o_colored_level o_cc o_cc5 g-col-lg-6 g-height-5 col-lg-6 rounded d-lg-block d-none o_snippet_mobile_invisible" style="--grid-item-padding-x: 32px; --grid-item-padding-y: 32px; background-image: url('/web/image/website.s_bento_grid_default_image_4'); border-radius: 6.4px !important; grid-area: 1 / 7 / 6 / 13; z-index: 2;">
                </div>
                <div class="o_grid_item o_colored_level o_cc o_cc5 g-col-lg-6 g-height-3 col-lg-6 rounded" style="--grid-item-padding-x: 32px; --grid-item-padding-y: 32px; border-radius: 6.4px !important; grid-area: 17 / 1 / 20 / 7; z-index: 3;">
                    <h2 class="h3-fs">30% Off Your First Purchase</h2>
                    <p class="lead">Shop today and unlock an exclusive discount!</p>
                    <p>
                        <a class="o_translate_inline btn btn-secondary" t-att-href="shop_btn_href">
                            Shop Now
                        </a>
                        <br/>
                    </p>
                </div>
                <div class="o_grid_item o_grid_item_image oe_img_bg o_bg_img_center o_colored_level o_cc o_cc5 g-col-lg-6 g-height-10 col-lg-6 rounded" style="--grid-item-padding-x: 32px; --grid-item-padding-y: 32px; background-image: url('/web/image/website.s_bento_grid_default_image_1'); border-radius: 6.4px !important; grid-area: 7 / 1 / 17 / 7; z-index: 4;">
                    <div class="o_we_bg_filter bg-black-25"/>
                    <h2 class="h3-fs">Sustainable Materials</h2>
                    <p class="lead">
                        Elevate your living space with furniture that blends modern aesthetics and classic charm, crafted to bring both comfort and style to your home.
                        <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
                    </p>
                </div>
                <div class="o_grid_item o_grid_item_image oe_img_bg o_bg_img_center o_colored_level o_cc o_cc5 g-col-lg-6 g-height-14 col-lg-6 rounded" style="--grid-item-padding-x: 32px; --grid-item-padding-y: 32px; background-image: url('/web/image/website.s_bento_grid_default_image_3'); border-radius: 6.4px !important; grid-area: 6 / 7 / 20 / 13; z-index: 5;">
                    <div class="o_we_bg_filter bg-black-25"/>
                    <blockquote class="s_blockquote o_animable position-relative d-flex flex-column gap-4 w-100 mx-auto p-1 fst-normal s_blockquote_default" data-vcss="001" data-snippet="s_blockquote" data-name="Blockquote">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right d-block mx-auto rounded bg-o-color-1" role="img"/>
                        </div>
                        <h2 class="h3-fs" style="text-align: center;">Expert's Review</h2>
                        <p class="s_blockquote_quote lead" style="text-align: center;">
                            <span class="h3-fs">
                                "This collection masterfully combines premium craftsmanship with timeless design, creating pieces that elevate any interior space."
                            </span>
                        </p>
                        <div class="s_blockquote_infos gap-2 w-100 flex-column align-items-center text-center d-flex">
                            <div class="s_blockquote_author">
                                <h3 class="h5-fs">
                                    <strong>Friedrich von Hohenberg</strong>
                                </h3>
                                <p>
                                    <span class="o_small-fs">
                                        Furniture Design Specialist
                                        <br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
                                    </span>
                                </p>
                            </div>
                        </div>
                    </blockquote>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=834 key=website.s_bento_grid_avatars name=Bento Avatars active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Bento Avatars" t-name="website.s_bento_grid_avatars">
    <section class="s_bento_grid_avatars pt64 pb64">
        <div class="container">
            <div class="row o_grid_mode" style="gap: 32px;" data-row-count="9">
                <div class="o_grid_item g-col-lg-4 g-height-9 col-lg-4 oe_img_bg o_bg_img_center rounded o_cc o_cc5 o_colored_level" style="grid-area: 1 / 1 / 10 / 5; z-index: 1; --grid-item-padding-x: 32px; --grid-item-padding-y: 32px; border-radius: 6.4px !important; background-image: url('/web/image/website.s_bento_grid_default_image_1'); background-position: 50% 80%;">
                    <div class="o_we_bg_filter bg-black-25"/>
                    <h2 class="h4-fs">Sustainable Materials</h2>
                    <p><br/></p>
                    <p>Made from ethically sourced wood and premium textiles, our furniture is as kind to the planet as it is to your living space.</p>
                </div>
                <div class="o_grid_item g-col-lg-4 g-height-6 col-lg-4 oe_img_bg o_bg_img_center rounded o_cc o_cc5 o_colored_level" style="grid-area: 1 / 5 / 7 / 9; z-index: 2; --grid-item-padding-x: 32px; --grid-item-padding-y: 32px; border-radius: 6.4px !important; background-image: url('/web/image/website.s_bento_grid_default_image_4');">
                    <div class="o_we_bg_filter bg-black-25"/>
                    <h2 class="h4-fs">Timeless Design</h2>
                    <p><br/></p>
                    <p>Elevate your living space with furniture that blends modern aesthetics and classic charm, crafted to bring both comfort and style to your home.</p>
                    <p><br/></p>
                    <t t-snippet-call="website.s_avatars" string="Avatars"/>
                </div>
                <div class="o_grid_item g-col-lg-4 g-height-3 col-lg-4 rounded o_cc o_cc5 o_colored_level" style="grid-area: 7 / 5 / 10 / 9; z-index: 3; --grid-item-padding-x: 32px; --grid-item-padding-y: 32px; border-radius: 6.4px !important;">
                    <h2 class="h4-fs">30% off wooden desks</h2>
                    <p>Enjoy 30% on all our wooden desks and elevate your workspace.</p>
                    <a href="#" title="" role="button" class="btn btn-secondary">
                        Start saving  <span class="fa fa-long-arrow-right" role="img"/>
                    </a>
                </div>
                <div class="o_grid_item g-col-lg-4 g-height-9 col-lg-4 rounded o_cc o_cc2 o_colored_level" style="grid-area: 1 / 9 / 10 / 13; z-index: 4; --grid-item-padding-x: 32px; --grid-item-padding-y: 32px; border-radius: 6.4px !important;">
                    <h2 style="text-align: center;" class="h4-fs"><br/><br/><br/>Expert’s review<br/></h2>
                    <blockquote class="s_blockquote s_blockquote_default o_cc o_cc2 o_animable position-relative d-flex flex-column gap-4 w-100 mx-auto p-1 fst-normal" data-vcss="001" data-snippet="s_blockquote" data-name="Blockquote">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right d-block mx-auto rounded bg-o-color-1" role="img"/>
                        </div>
                        <p class="s_blockquote_quote my-auto lead h5-fs" style="text-align: center;">
                            “Our furniture balances style, comfort, and sustainability.”<br/>
                        </p>
                        <div class="s_blockquote_infos d-flex gap-2 flex-column align-items-center w-100 text-center">
                            <img src="/web/image/website.s_blockquote_default_image" class="s_blockquote_avatar img rounded-circle" alt=""/>
                            <div class="s_blockquote_author">
                                <span class="o_small-fs">
                                    <strong>Paul Dawson</strong><br/>
                                    <span class="text-muted">Furniture Design Specialist</span>
                                </span>
                            </div>
                        </div>
                    </blockquote>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=841 key=website.s_big_number name=Big number active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Big number" t-name="website.s_big_number">
    <section class="s_big_number o_half_screen_height o_cc o_cc5 pt104 pb104" data-oe-shape-data="{'shape':'html_builder/Rainy/09_001','flip':[],'showOnMobile':false}">
        <div class="o_we_shape o_html_builder_Rainy_09_001"/>
        <div class="container">
            <div class="row s_nb_column_fixed">
                <h2 style="text-align: center;">
                    <span style="font-size: 10.75rem;">
                        <font class="text-gradient" style="background-image: linear-gradient(0deg, var(--o-color-4) 25%, var(--o-color-5) 90%);">
                            87%
                        </font>
                    </span>
                </h2>
                <p style="text-align: center;">
                    <span style="font-size: 2.25rem;"> customer satisfaction</span>
                </p>
            </div>
        </div>
    </section>
</t>

- kind=other id=851 key=website.s_blockquote name=Blockquote active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Blockquote" t-name="website.s_blockquote">
    <blockquote class="s_blockquote s_blockquote_with_line o_cc o_cc2 o_animable position-relative d-flex flex-column gap-4 w-100 mx-auto p-4 fst-normal" data-vcss="001">
        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
            <i class="s_blockquote_icon fa fa-quote-right d-block mx-auto rounded bg-o-color-1" role="img"/>
        </div>
        <p class="s_blockquote_quote my-auto">" Write a quote here from one of your customers. Quotes are a great way to build confidence in your products or services. "</p>
        <div class="s_blockquote_infos d-flex gap-2 flex-row align-items-start justify-content-start w-100 text-start">
            <img src="/web/image/website.s_blockquote_default_image" class="s_blockquote_avatar img rounded-circle" alt=""/>
            <div class="s_blockquote_author">
                <span class="o_small-fs">
                    <strong>Paul Dawson</strong><br/>
                    <span class="text-muted">CEO of MyCompany</span>
                </span>
            </div>
        </div>
    </blockquote>
</t>

- kind=other id=884 key=website.s_button name=Button active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Button" t-name="website.s_button">
    <a class="btn btn-primary o_snippet_drop_in_only" t-att-href="cta_btn_href">Button</a>
</t>

- kind=other id=784 key=website.s_call_to_action name=Call to Action active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Call to Action" t-name="website.s_call_to_action">
    <section class="s_call_to_action o_cc o_cc5 pt64 pb64">
        <div class="container">
            <div class="row">
                <div class="col-lg-9">
                    <h2 class="h3-fs">50,000+ companies run Odoo to grow their businesses.</h2>
                    <p class="lead">Join us and make your company a better place.</p>
                </div>
                <div class="col-lg-3">
                    <p style="text-align: right;">
                        <a t-att-href="cta_btn_href" class="btn btn-primary btn-lg o_translate_inline"><t t-out="cta_btn_text">Contact us</t></a>
                    </p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=1015 key=website.s_call_to_action_about name=s_call_to_action_about active=True website=null inherit={"id": 784, "name": "Call to Action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="data-snippet">s_call_to_action</attribute>
    </xpath>
    <xpath expr="//h2|//h3|//h4" position="replace">
        <h3>Ready to bring your digital vision to life?</h3>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead">Let's collaborate to create innovative solutions that stand out in the digital landscape. Reach out today and let's build something extraordinary together.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_call_to_action_about</attribute></xpath></data>

- kind=other id=1016 key=website.s_call_to_action_digital name=s_call_to_action_digital active=True website=null inherit={"id": 784, "name": "Call to Action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="data-snippet">s_call_to_action</attribute>
    </xpath>
    <xpath expr="//h2|//h3|//h4" position="replace">
        <h3>Ready to embark on a journey of digital transformation?</h3>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead">Let's turn your vision into reality. Contact us today to set your brand on the path to digital excellence with us.</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_call_to_action_digital</attribute></xpath></data>

- kind=other id=1017 key=website.s_call_to_action_menu name=s_call_to_action_menu active=True website=null inherit={"id": 784, "name": "Call to Action"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="data-snippet">s_call_to_action</attribute>
    </xpath>
    <xpath expr="//h2|//h3|//h4" position="replace">
        <h3>Book your table today</h3>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="lead">Join us for a remarkable dining experience that blends exquisite flavors with a warm ambiance. </p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_call_to_action_menu</attribute></xpath></data>

- kind=other id=756 key=website.s_card name=Card active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Card" t-name="website.s_card">
    <div class="s_card o_card_img_top card o_cc o_cc1" data-vxml="001">
        <figure class="o_card_img_wrapper ratio ratio-16x9 mb-0">
            <img class="o_card_img card-img-top" src="/web/image/website.s_card_default_image_1" alt=""/>
        </figure>
        <div class="card-body">
            <h3 class="card-title h5-fs">Card title</h3>
            <p class="card-text">A card is a flexible and extensible content container. It includes options for headers and footers, a wide variety of content, contextual background colors, and powerful display options.</p>
            <a t-att-href="cta_btn_href">Discover</a>
        </div>
    </div>
</t>

- kind=other id=886 key=website.s_card_offset name=Card Offset active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Card Offset" t-name="website.s_card_offset">
    <section class="s_card_offset o_cc o_cc1 pt64 pb64">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="9">
                <div class="o_grid_item o_grid_item_image g-height-8 g-col-lg-12 col-lg-12 o_colored_level" style="z-index: 1; grid-area: 2 / 1 / 10 / 13; --grid-item-padding-x: 0px; --grid-item-padding-y: 0px;">
                    <img src="/web/image/website.s_card_offset_default_image" class="img img-fluid mx-auto rounded" alt=""/>
                </div>
                <div class="o_grid_item g-height-7 g-col-lg-5 col-lg-5 offset-1 offset-lg-0 col-10 rounded o_colored_level o_cc o_cc1 shadow" style="z-index: 2; grid-area: 1 / 7 / 8 / 12; --grid-item-padding-y: 40px; --grid-item-padding-x: 32px; box-shadow: rgba(0, 0, 0, 0.15) 0px 0px 0px 10px !important;">
                    <h2 class="h3-fs">Why Our Product is the Future of Innovation</h2>
                    <p class="lead">Write one or two paragraphs describing your product or services. To be successful your content needs to be useful to your readers.</p>
                    <p class="lead">Start with the customer – find out what they want and give it to them.</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=757 key=website.s_cards_grid name=Cards Grid active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Cards Grid" t-name="website.s_cards_grid">
    <section class="s_cards_grid o_colored_level o_cc o_cc2 pt64 pb64" data-vxml="001">
        <div class="container">
            <h2 class="h3-fs">Features that set us apart</h2>
            <div class="row">
                <div data-name="Card" class="col-lg-6 d-flex flex-column">
                    <div class="s_card o_card_img_horizontal o_cc o_cc1 card flex-lg-row h-100" data-vxml="001" data-snippet="s_card" data-name="Card" style="--card-img-size-h: 25%;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img rounded-start object-fit-cover" src="/web/image/website.s_key_images_default_image_1" alt=""/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Quality and Excellence</h3>
                            <p class="card-text">We provide personalized solutions to meet your unique needs. Our team works with you to ensure optimal results from start to finish.</p>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-6 d-flex flex-column">
                    <div class="s_card o_card_img_horizontal o_cc o_cc1 card flex-lg-row h-100" data-vxml="001" data-snippet="s_card" data-name="Card" style="--card-img-size-h: 25%;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img rounded-start object-fit-cover" src="/web/image/website.s_key_images_default_image_2" alt=""/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Expertise and Knowledge</h3>
                            <p class="card-text">Customer satisfaction is our priority. Our support team is always ready to assist, ensuring you have a smooth and successful experience.</p>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-6 d-flex flex-column">
                    <div class="s_card o_card_img_horizontal o_cc o_cc1 card flex-lg-row h-100" data-vxml="001" data-snippet="s_card" data-name="Card" style="--card-img-size-h: 25%;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img rounded-start object-fit-cover" src="/web/image/website.s_key_images_default_image_3" alt=""/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Eco-Friendly Solutions</h3>
                            <p class="card-text">We offer cutting-edge products and services to tackle modern challenges. Leveraging the latest technology, we help you achieve your goals.</p>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-6 d-flex flex-column">
                    <div class="s_card o_card_img_horizontal o_cc o_cc1 card flex-lg-row h-100" data-vxml="001" data-snippet="s_card" data-name="Card" style="--card-img-size-h: 25%;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img rounded-start object-fit-cover" src="/web/image/website.s_key_images_default_image_4" alt=""/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Tailored Solutions</h3>
                            <p class="card-text">With extensive experience and deep industry knowledge, we provide insights and solutions that keep you ahead of the curve.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=758 key=website.s_cards_soft name=Cards Soft active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Cards Soft" t-name="website.s_cards_soft">
    <section class="s_cards_soft o_cc o_cc1 pt48 pb32" data-vxml="001">
        <div class="container">
            <h2 style="text-align: center;">Your Journey Begins Here</h2>
            <p class="lead" style="text-align: center;">We make every moment count with solutions designed just for you.</p>
            <div class="row">
                <div data-name="Card" class="col-lg-4 pt16 pb16">
                    <div class="s_card card o_cc o_cc2 h-100" data-vxml="001" data-snippet="s_card" data-name="Card" style="border-width: 0px !important;">
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Innovative Ideas</h3>
                            <p class="card-text">Our creativity is at the forefront of everything we do, delivering innovative solutions that make your project stand out while maintaining a balance between originality and functionality.</p>
                            <img class="img img-fluid rounded" src="/web/image/website.s_three_columns_default_image_1" alt=""/>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-4 pt16 pb16">
                    <div class="s_card card o_cc o_cc2 h-100" data-vxml="001" data-snippet="s_card" data-name="Card" style="border-width: 0px !important;">
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Comprehensive Support</h3>
                            <p class="card-text">From the initial stages to completion, we offer support every step of the way, ensuring you feel confident in your choices and that your project is a success.</p>
                            <img class="img img-fluid rounded" src="/web/image/website.s_three_columns_default_image_2" alt=""/>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-4 pt16 pb16">
                    <div class="s_card card o_cc o_cc2 h-100" data-vxml="001" data-snippet="s_card" data-name="Card" style="border-width: 0px !important;">
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Timeless Quality</h3>
                            <p class="card-text">Our services are built to last, ensuring that every solution we provide is of the highest quality, bringing lasting value to your investment and ultimate customer satisfaction.</p>
                            <img class="img img-fluid rounded" src="/web/image/website.s_three_columns_default_image_3" alt=""/>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=751 key=website.s_carousel name=Carousel active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Carousel" t-name="website.s_carousel">
    <section class="s_carousel_wrapper p-0" data-vxml="001" data-vcss="001">
        <t t-set="uniq" t-value="datetime.datetime.now().microsecond"/>
        <div t-attf-id="myCarousel{{uniq}}" class="s_carousel s_carousel_default carousel slide" data-bs-ride="true" data-bs-interval="10000">
            <!-- Content -->
            <div class="carousel-inner">
                <!-- #01 -->
                <div class="carousel-item active oe_img_bg o_bg_img_center o_cc o_cc5 pt152 pb152" style="background-image: url('/web/image/website.s_carousel_default_image_1');" data-name="Slide">
                    <div class="o_we_bg_filter bg-black-25"/>
                    <div class="container oe_unremovable">
                        <div class="row">
                            <div class="carousel-content col-lg-6">
                                <h2 class="display-3-fs">Slide Title</h2>
                                <p class="lead">Use this snippet to presents your content in a slideshow-like format. Don't write about products or services here, write about solutions.</p>
                                <p>
                                    <a href="/contactus" class="btn btn-primary o_translate_inline">Contact us</a>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- #02 -->
                <div class="carousel-item oe_img_bg o_bg_img_center pt96 pb96" style="background-image: url('/web/image/website.s_carousel_default_image_2');" data-name="Slide">
                    <div class="container oe_unremovable">
                        <div class="row">
                            <div class="carousel-content col-lg-8 offset-lg-2 text-center pt48 pb40">
                                <h2 class="display-3-fs">Clever Slogan</h2>
                                <div class="s_hr pt8 pb24" data-snippet="s_hr" data-name="Separator">
                                    <hr class="w-25 mx-auto"/>
                                </div>
                                <p class="lead">Storytelling is powerful.<br/> It draws readers in and engages them.</p>
                                <p><a href="/" class="btn btn-primary o_translate_inline">Start your journey</a></p>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- #03 -->
                <div class="carousel-item oe_img_bg o_bg_img_center pt128 pb128 o_cc o_cc5" style="background-image: url('/web/image/website.s_carousel_default_image_3');" data-name="Slide">
                    <div class="container oe_unremovable">
                        <div class="row">
                            <div class="carousel-content col-lg-6 offset-lg-6 pb24 pt24">
                                <h2 class="h3-fs">Edit this title</h2>
                                <p>Good writing is simple, but not simplistic.</p>
                                <p><br/></p>
                                <p class="lead">Good copy starts with understanding how your product or service helps your customers. Simple words communicate better than big words and pompous language.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Controls -->
            <button class="carousel-control-prev o_not_editable" contenteditable="false" t-attf-data-bs-target="#myCarousel{{uniq}}" data-bs-slide="prev" aria-label="Previous" title="Previous">
                <span class="carousel-control-prev-icon" aria-hidden="true"/>
                <span class="visually-hidden">Previous</span>
            </button>
            <button class="carousel-control-next o_not_editable" contenteditable="false" t-attf-data-bs-target="#myCarousel{{uniq}}" data-bs-slide="next" aria-label="Next" title="Next">
                <span class="carousel-control-next-icon" aria-hidden="true"/>
                <span class="visually-hidden">Next</span>
            </button>
            <!-- Indicators -->
            <div class="carousel-indicators o_not_editable">
                <button type="button" t-attf-data-bs-target="#myCarousel{{uniq}}" data-bs-slide-to="0" class="active" aria-label="Carousel indicator"/>
                <button type="button" t-attf-data-bs-target="#myCarousel{{uniq}}" data-bs-slide-to="1" aria-label="Carousel indicator"/>
                <button type="button" t-attf-data-bs-target="#myCarousel{{uniq}}" data-bs-slide-to="2" aria-label="Carousel indicator"/>
            </div>
        </div>
    </section>
</t>

- kind=other id=753 key=website.s_carousel_cards name=Carousel Cards active=True website=null inherit=null
  signals: hrefs_total=3 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Carousel Cards" t-name="website.s_carousel_cards">
    <section class="s_carousel_cards_wrapper pt64 pb64">
        <t t-set="uniq" t-value="datetime.datetime.now().microsecond"/>
        <div t-attf-id="myCarouselCards{{uniq}}" class="s_carousel_cards s_carousel_cards_with_img s_carousel_boxed container carousel carousel-fade slide" data-bs-interval="10000" data-bs-ride="true" data-option-name="CarouselCards" style="--card-img-size-h: 60%; --CardBody-extra-height: 0px;">
            <!-- Content -->
            <div class="carousel-inner rounded">
                <!-- #01 -->
                <div class="s_carousel_cards_item carousel-item active p-0" data-name="Slide">
                    <div class="s_card s_carousel_cards_card card o_colored_level o_cc o_cc4 o_card_img_horizontal flex-lg-row w-100 m-0 border-0 rounded-0" data-vxml="001" data-snippet="s_card">
                        <figure class="o_card_img_wrapper mb-0">
                            <img class="o_card_img h-100" src="/web/image/website.s_carousel_cards_default_image_1" alt=""/>
                        </figure>
                        <div class="card-body">
                            <h2 class="card-title h3-fs">Slide title</h2>
                            <p class="card-text">A card is a flexible and extensible content container. It includes colors and powerful display options.</p>
                            <a href="#" class="btn btn-secondary">Read More</a>
                        </div>
                    </div>
                </div>
                <!-- #02 -->
                <div class="s_carousel_cards_item carousel-item p-0" data-name="Slide">
                    <div class="s_card s_carousel_cards_card card o_colored_level o_cc o_cc5 o_card_img_horizontal flex-lg-row w-100 m-0 border-0 rounded-0" data-vxml="001" data-snippet="s_card">
                        <figure class="o_card_img_wrapper mb-0">
                            <img class="o_card_img h-100" src="/web/image/website.s_carousel_cards_default_image_2" alt=""/>
                        </figure>
                        <div class="card-body">
                            <h2 class="card-title h3-fs">Slide title</h2>
                            <p class="card-text">A card is a flexible and extensible content container. It includes colors and powerful display options.</p>
                            <a href="#" class="btn btn-secondary">Read More</a>
                        </div>
                    </div>
                </div>
                <!-- #03 -->
                <div class="s_carousel_cards_item carousel-item p-0" data-name="Slide">
                    <div class="s_card s_carousel_cards_card card o_colored_level o_cc o_cc4 o_card_img_horizontal flex-lg-row w-100 m-0 border-0 rounded-0" data-vxml="001" data-snippet="s_card">
                        <figure class="o_card_img_wrapper mb-0">
                            <img class="o_card_img h-100" src="/web/image/website.s_carousel_cards_default_image_3" alt=""/>
                        </figure>
                        <div class="card-body">
                            <h2 class="card-title h3-fs">Slide title</h2>
                            <p class="card-text">A card is a flexible and extensible content container. It includes colors and powerful display options.</p>
                            <a href="#" class="btn btn-secondary">Read More</a>
                        </div>
                    </div>
                </div>
            </div>
            <div class="o_horizontal_controllers position-absolute start-0 end-0 bottom-0 o_not_editable">
                <div class="o_horizontal_controllers_row d-flex gap-3 justify-content-between flex-nowrap">
                    <!-- Indicators -->
                    <div class="s_carousel_indicators_dots carousel-indicators align-items-center flex-shrink-1 w-auto mb-0">
                        <button type="button" t-attf-data-bs-target="#myCarouselCards{{uniq}}" data-bs-slide-to="0" class="active"/>
                        <button type="button" t-attf-data-bs-target="#myCarouselCards{{uniq}}" data-bs-slide-to="1"/>
                        <button type="button" t-attf-data-bs-target="#myCarouselCards{{uniq}}" data-bs-slide-to="2"/>
                    </div>
                    <!-- Controls -->
                    <div class="o_arrows_wrapper gap-2 align-items-center w-auto p-0">
                        <button class="carousel-control-prev bottom-0 o_not_editable" contenteditable="false" t-attf-data-bs-target="#myCarouselCards{{uniq}}" data-bs-slide="prev" aria-label="Previous" title="Previous">
                            <span class="carousel-control-prev-icon" aria-hidden="true"/>
                            <span class="visually-hidden">Previous</span>
                        </button>
                        <button class="carousel-control-next bottom-0 o_not_editable" contenteditable="false" t-attf-data-bs-target="#myCarouselCards{{uniq}}" data-bs-slide="next" role="img" aria-label="Next" title="Next">
                            <span class="carousel-control-next-icon" aria-hidden="true"/>
                            <span class="visually-hidden">Next</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=752 key=website.s_carousel_intro name=Carousel Intro active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Carousel Intro" t-name="website.s_carousel_intro">
    <section class="s_carousel_intro_wrapper p-0">
        <t t-set="uniq" t-value="datetime.datetime.now().microsecond"/>
        <div t-attf-id="myCarouselIntro{{uniq}}" class="s_carousel_intro s_carousel_default carousel slide carousel-dark" data-bs-ride="true" data-bs-interval="10000">
            <!-- Content -->
            <div class="carousel-inner">
                <!-- #01 -->
                <div class="s_carousel_intro_item carousel-item o_cc o_cc1 px-0 pt72 pb96 active" data-name="Slide">
                    <div class="container">
                        <div class="row o_grid_mode" data-row-count="8">
                            <div class="o_grid_item g-height-8 g-col-lg-5 col-lg-5" style="z-index: 1; grid-area: 1 / 1 / 9 / 6;" data-name="Block">
                                <h1 class="display-3-fs">Driving innovation together</h1>
                            </div>
                            <div class="o_grid_item g-height-3 g-col-lg-4 col-lg-4" style="z-index: 2; grid-area: 2 / 7 / 5 / 11; --grid-item-padding-y: 0px;" data-name="Block">
                                <p class="lead">Empowering teams to collaborate and innovate, creating impactful solutions that drive business growth and deliver lasting value.</p>
                            </div>
                            <div class="o_grid_item o_grid_item_image g-height-4 g-col-lg-6 col-lg-6" style="z-index: 3; grid-area: 5 / 7 / 9 / 13;" data-name="Block">
                                <img src="/web/image/website.s_carousel_intro_default_image_1" alt="" class="img img-fluid"/>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- #02 -->
                <div class="s_carousel_intro_item carousel-item o_cc o_cc1 px-0 pt72 pb96" data-name="Slide">
                    <div class="container">
                        <div class="row o_grid_mode" data-row-count="8">
                            <div class="o_grid_item g-height-5 g-col-lg-6 col-lg-6" style="z-index: 1; grid-area: 1 / 7 / 6 / 13;" data-name="Block">
                                <h2 class="display-3-fs">Innovating for business success</h2>
                            </div>
                            <div class="o_grid_item g-height-2 g-col-lg-4 col-lg-4" style="z-index: 2; grid-area: 7 / 7 / 9 / 11; --grid-item-padding-y: 20px;" data-name="Block">
                                <p class="lead">Creating solutions that drive growth and long-term value.</p>
                            </div>
                            <div class="o_grid_item o_grid_item_image g-height-7 g-col-lg-5 col-lg-5" style="z-index: 3; grid-area: 2 / 1 / 9 / 6;" data-name="Block">
                                <img src="/web/image/website.s_carousel_intro_default_image_2" alt="" class="img img-fluid"/>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- #03 -->
                <div class="s_carousel_intro_item carousel-item o_cc o_cc1 px-0 pt72 pb96" data-name="Slide">
                    <div class="container">
                        <div class="row o_grid_mode" data-row-count="8">
                            <div class="o_grid_item g-height-8 g-col-lg-5 col-lg-5" style="z-index: 1; grid-area: 1 / 1 / 9 / 6;" data-name="Box">
                                <h2 class="display-3-fs">Leading the future with innovation and strategy</h2>
                            </div>
                            <div class="o_grid_item g-height-4 g-col-lg-4 col-lg-4" style="z-index: 2; grid-area: 5 / 9 / 9 / 13;" data-name="Box">
                                <p class="lead">We combine strategic insights and innovative solutions to drive business success, ensuring sustainable growth and competitive advantage in a dynamic market.</p>
                            </div>
                            <div class="o_grid_item o_grid_item_image g-height-8 g-col-lg-3 col-lg-3" style="z-index: 3; grid-area: 1 / 6 / 9 / 9;" data-name="Box">
                                <img src="/web/image/website.s_carousel_intro_default_image_3" alt="" class="img img-fluid"/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="o_horizontal_controllers container position-absolute start-50 bottom-0 translate-middle-x w-100 mb-md-4 o_not_editable">
                <div class="o_horizontal_controllers_row row gap-3 gap-lg-5 justify-content-between flex-nowrap flex-row-reverse mx-0">
                    <!-- Controls -->
                    <div class="o_arrows_wrapper gap-2 w-auto p-0">
                        <button class="carousel-control-prev o_not_editable" contenteditable="false" t-attf-data-bs-target="#myCarouselIntro{{uniq}}" data-bs-slide="prev" aria-label="Previous" title="Previous">
                            <span class="carousel-control-prev-icon" aria-hidden="true"/>
                            <span class="visually-hidden">Previous</span>
                        </button>
                        <button class="carousel-control-next o_not_editable" contenteditable="false" t-attf-data-bs-target="#myCarouselIntro{{uniq}}" data-bs-slide="next" aria-label="Next" title="Next">
                            <span class="carousel-control-next-icon" aria-hidden="true"/>
                            <span class="visually-hidden">Next</span>
                        </button>
                    </div>
                    <!-- Indicators -->
                    <div class="s_carousel_indicators_numbers carousel-indicators align-items-center flex-shrink-1 w-auto">
                        <button type="button" t-attf-data-bs-target="#myCarouselIntro{{uniq}}" data-bs-slide-to="0" class="active" aria-label="Carousel indicator"/>
                        <button type="button" t-attf-da…

- kind=other id=797 key=website.s_chart name=Chart active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Chart" t-name="website.s_chart">
    <div class="s_chart" data-type="bar" data-legend-position="top" data-tooltip-display="true" data-stacked="false" data-border-width="2" data-data="{                 &quot;labels&quot;:[&quot;First&quot;,&quot;Second&quot;,&quot;Third&quot;,&quot;Fourth&quot;,&quot;Fifth&quot;],                 &quot;datasets&quot;:[                     {                         &quot;label&quot;:&quot;One&quot;,                         &quot;data&quot;:[&quot;12&quot;,&quot;24&quot;,&quot;18&quot;,&quot;17&quot;,&quot;10&quot;],                         &quot;backgroundColor&quot;:&quot;o-color-1&quot;,                         &quot;borderColor&quot;:&quot;o-color-1&quot;                     }                 ]             }">
        <h2>A Chart Title</h2>
        <canvas/>
    </div>
</t>

- kind=other id=763 key=website.s_closer_look name=Closer Look active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Closer Look" t-name="website.s_closer_look">
    <section class="s_closer_look pt96">
        <div class="container">
            <h1 class="display-3" style="text-align: center;">Take a closer look</h1>
            <p class="lead" style="text-align: center;">Write one or two paragraphs describing your product, services or a specific feature.<br/> To be successful your content needs to be useful to your readers.</p>
            <p style="text-align: center;">
                <a t-att-href="cta_btn_href" class="btn btn-primary mb-2 o_translate_inline">Start Now</a>
                <a t-att-href="cta_btn_href" class="btn btn-outline-primary mb-2 o_translate_inline"><t t-out="cta_btn_text">Contact us</t></a>
            </p>
            <p>
                <br/>
            </p>
            <img class="img-fluid mx-auto" data-shape="html_builder/devices/macbook_front" data-file-name="s_closer_look.webp" data-format-mimetype="image/webp" src="/html_editor/image_shape/website.s_closer_look_default_image/html_builder/devices/macbook_front.svg" alt=""/>
        </div>
    </section>
</t>

- kind=other id=853 key=website.s_color_blocks_2 name=Big Boxes active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Big Boxes" t-name="website.s_color_blocks_2">
    <section class="s_color_blocks_2">
        <div class="container-fluid">
            <div class="row">
                <div class="col-lg-6 o_cc o_cc4">
                    <h2 class="h3-fs">A color block</h2>
                    <p>Color blocks are a simple and effective way to <b>present and highlight your content</b>. Choose an image or a color for the background. You can even resize and duplicate the blocks to create your own layout. Add images or icons to customize the blocks.</p>
                    <a href="#" class="btn btn-primary">More Details</a>
                </div>
                <div class="col-lg-6 o_cc o_cc5">
                    <h2 class="h3-fs">Another color block</h2>
                    <p>Color blocks are a simple and effective way to <b>present and highlight your content</b>. Choose an image or a color for the background. You can even resize and duplicate the blocks to create your own layout. Add images or icons to customize the blocks.</p>
                    <a href="#" class="btn btn-primary">More Details</a>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=777 key=website.s_company_team name=Team active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Team" t-name="website.s_company_team">
    <section class="s_company_team pt48 pb48">
        <div class="container">
            <h2 class="h3-fs">Meet our team</h2>
            <p class="lead">Dedicated professionals driving our success</p>
            <div class="row">
                <div class="col-lg-6 pt32 pb32" data-name="Team Member">
                    <div class="row s_col_no_resize s_col_no_bgcolor">
                        <div class="col-lg-3 pb24 o_not_editable" contenteditable="false">
                            <img alt="" src="/web/image/website.s_company_team_image_1" class="img-fluid rounded-circle o_editable_media w-lg-100 mx-lg-auto"/>
                        </div>
                        <div class="col-lg-9">
                            <h3 class="h5-fs">Tony Fred</h3>
                            <p class="text-muted mb-3">Chief Executive Officer</p>
                            <p>
                                Founder and chief visionary, Tony is the driving force behind the company. He loves
                                to keep his hands full by participating in the development of the software,
                                marketing, and customer experience strategies.
                            </p>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6 pt32 pb32" data-name="Team Member">
                    <div class="row s_col_no_resize s_col_no_bgcolor">
                        <div class="col-lg-3 pb24 o_not_editable" contenteditable="false">
                            <img alt="" src="/web/image/website.s_company_team_image_2" class="img-fluid rounded-circle o_editable_media w-lg-100 mx-lg-auto"/>
                        </div>
                        <div class="col-lg-9">
                            <h3 class="h5-fs">Mich Stark</h3>
                            <p class="text-muted mb-3">Chief Commercial Officer</p>
                            <p>Mich loves taking on challenges. With his multi-year experience as Commercial Director in the software industry, Mich has helped the company to get where it is today. Mich is among the best minds.</p>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6 pt32 pb32" data-name="Team Member">
                    <div class="row s_col_no_resize s_col_no_bgcolor">
                        <div class="col-lg-3 pb24 o_not_editable" contenteditable="false">
                            <img alt="" src="/web/image/website.s_company_team_image_3" class="img-fluid rounded-circle o_editable_media w-lg-100 mx-lg-auto"/>
                        </div>
                        <div class="col-lg-9">
                            <h3 class="h5-fs">Aline Turner</h3>
                            <p class="text-muted mb-3">Chief Technical Officer</p>
                            <p>Aline is one of the iconic people in life who can say they love what they do. She mentors 100+ in-house developers and looks after the community of thousands of developers.</p>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6 pt32 pb32" data-name="Team Member">
                    <div class="row s_col_no_resize s_col_no_bgcolor">
                        <div class="col-lg-3 pb24 o_not_editable" contenteditable="false">
                            <img alt="" src="/web/image/website.s_company_team_image_4" class="img-fluid rounded-circle o_editable_media w-lg-100 mx-lg-auto"/>
                        </div>
                        <div class="col-lg-9">
                            <h3 class="h5-fs">Iris Joe</h3>
                            <p class="text-muted mb-3">Chief Financial Officer</p>
                            <p>Iris, with her international experience, helps us easily understand the numbers and improves them. She is determined to drive success and delivers her professional acumen to bring the company to the next level.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=778 key=website.s_company_team_basic name=Team Basic active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Team Basic" t-name="website.s_company_team_basic">
    <section class="s_company_team_basic o_cc o_cc1 pt96 pb64">
        <div class="container">
            <h2 class="h3-fs" style="text-align: center;">Discover our executive team</h2>
            <p><br/></p>
            <div class="row">
                <div class="col-lg-3 col-6 pb32" data-name="Team Member">
                    <p class="o_not_editable" contenteditable="false" style="text-align: center;">
                        <img alt="" class="o_editable_media img-fluid rounded-circle me-auto float-start" src="/web/image/website.s_company_team_image_1" style="width: 100% !important; padding: 20px"/>
                    </p>
                    <h3 class="h5-fs" style="text-align: center;">Tony Fred, CEO</h3>
                    <p class="o_small-fs text-muted" style="text-align: center;">Chief Executive Officer</p>
                </div>
                <div class="col-lg-3 col-6 pb32" data-name="Team Member">
                    <p class="o_not_editable" contenteditable="false" style="text-align: center;">
                        <img alt="" class="o_editable_media img-fluid rounded-circle me-auto float-start" src="/web/image/website.s_company_team_image_2" style="width: 100% !important; padding: 20px"/>
                    </p>
                    <h3 class="h5-fs" style="text-align: center;">Mich Stark, COO</h3>
                    <p class="o_small-fs text-muted" style="text-align: center;">Chief Operational Officer</p>
                </div>
                <div class="col-lg-3 col-6 pb32" data-name="Team Member">
                    <p class="o_not_editable" contenteditable="false" style="text-align: center;">
                        <img alt="" class="o_editable_media img-fluid rounded-circle me-auto float-start" src="/web/image/website.s_company_team_image_3" style="width: 100% !important; padding: 20px"/>
                    </p>
                    <h3 class="h5-fs" style="text-align: center;">Aline Turner, CTO</h3>
                    <p class="o_small-fs text-muted" style="text-align: center;">Chief Technical Officer</p>
                </div>
                <div class="col-lg-3 col-6 pb32" data-name="Team Member">
                    <p class="o_not_editable" contenteditable="false" style="text-align: center;">
                        <img alt="" class="o_editable_media img-fluid rounded-circle me-auto float-start" src="/web/image/website.s_company_team_image_4" style="width: 100% !important; padding: 20px"/>
                    </p>
                    <h3 class="h5-fs" style="text-align: center;">Iris Joe, CFO</h3>
                    <p class="o_small-fs text-muted" style="text-align: center;">Chief Financial Officer</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=783 key=website.s_company_team_card name=Card Team active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Card Team" t-name="website.s_company_team_card">
    <section class="s_company_team_card o_colored_level o_cc o_cc2 pt48 pb48">
        <div class="container">
            <h2 style="text-align: center;">Our Team</h2>
            <div class="row">
                <div data-name="Team Member" class="col-6 col-lg-3">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-name="Card" data-snippet="s_card" data-vxml="001" style="border-width: 0px !important;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top rounded-circle" src="/web/image/website.s_company_team_image_1" style="padding: 24px;"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;">Tony Fred</h3>
                            <p class="card-text" style="text-align: center;">Chief Executive Officer <br/><br/></p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="col-6 col-lg-3">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-name="Card" data-snippet="s_card" data-vxml="001" style="border-width: 0px !important;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top rounded-circle" src="/web/image/website.s_company_team_image_2" style="padding: 24px;"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;">Iris Joe</h3>
                            <p class="card-text" style="text-align: center;">Chief Financial Manager <br/><br/></p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="col-6 col-lg-3">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-name="Card" data-snippet="s_card" data-vxml="001" style="border-width: 0px !important;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top rounded-circle" src="/web/image/website.s_company_team_image_3" style="padding: 24px;"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;">Mich Stark</h3>
                            <p class="card-text" style="text-align: center;">Chief Operational Officer <br/><br/></p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="col-6 col-lg-3">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-name="Card" data-snippet="s_card" data-vxml="001" style="border-width: 0px !important;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top rounded-circle" src="/web/image/website.s_company_team_image_4" style="padding: 24px;"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;">Aline Turner</h3>
                            <p class="card-text" style="text-align: center;">Chief Technical Officer <br/><br/></p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=780 key=website.s_company_team_detail name=Team Detail active=True website=null inherit=null
  signals: hrefs_total=18 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Team Detail" t-name="website.s_company_team_detail">
    <section class="s_company_team_detail o_cc o_cc1 pt64 pb64">
        <div class="container">
            <h2 class="h3-fs">Meet our team</h2>
            <p class="lead">Dedicated professionals driving our success</p>
            <div class="row">
                <div class="col-lg-4 pt32 pb32" data-name="Team Member">
                    <div class="o_not_editable" contenteditable="false">
                        <img class="o_editable_media img img-fluid rounded-circle" src="/web/image/website.s_company_team_image_1" alt="" style="width: 25% !important;"/>
                    </div>
                    <h3 class="h5-fs"><br/>James Mitchell</h3>
                    <p class="text-muted">Chief Technical Officer</p>
                    <p>James leads the tech strategy and innovation efforts at the company.</p>
                    <div class="s_social_media o_not_editable text-start no_icon_color" data-snippet="s_social_media" data-name="Social Media">
                        <h5 class="s_social_media_title d-none">Social Media</h5>
                        <a href="/website/social/github" class="s_social_media_github" target="_blank" aria-label="GitHub">
                            <i class="fa fa-github o_editable_media fa-stack"/>
                        </a>
                        <a href="/website/social/linkedin" class="s_social_media_linkedin" target="_blank" aria-label="LinkedIn">
                            <i class="fa fa-linkedin o_editable_media fa-stack"/>
                        </a>
                        <a href="/website/social/instagram" class="s_social_media_instagram" target="_blank" aria-label="Instagram">
                            <i class="fa fa-instagram o_editable_media fa-stack"/>
                        </a>
                    </div>
                </div>
                <div class="col-lg-4 pt32 pb32" data-name="Team Member">
                    <div class="o_not_editable" contenteditable="false">
                        <img class="o_editable_media img img-fluid rounded-circle" src="/web/image/website.s_company_team_image_6" alt="" style="width: 25% !important;"/>
                    </div>
                    <h3 class="h5-fs"><br/>Sophia Benett</h3>
                    <p class="text-muted">Financial Analyst</p>
                    <p>Sophia evaluates financial data and provides strategic insights.</p>
                    <div class="s_social_media o_not_editable text-start no_icon_color" data-snippet="s_social_media" data-name="Social Media">
                        <h4 class="s_social_media_title d-none h5-fs">Social Media</h4>
                        <a href="/website/social/github" class="s_social_media_github" target="_blank" aria-label="GitHub">
                            <i class="fa fa-github o_editable_media fa-stack"/>
                        </a>
                        <a href="/website/social/linkedin" class="s_social_media_linkedin" target="_blank" aria-label="LinkedIn">
                            <i class="fa fa-linkedin o_editable_media fa-stack"/>
                        </a>
                        <a href="/website/social/instagram" class="s_social_media_instagram" target="_blank" aria-label="Instagram">
                            <i class="fa fa-instagram o_editable_media fa-stack"/>
                        </a>
                    </div>
                </div>
                <div class="col-lg-4 pt32 pb32" data-name="Team Member">
                    <div class="o_not_editable" contenteditable="false">
                        <img class="o_editable_media img img-fluid rounded-circle" src="/web/image/website.s_company_team_image_3" alt="" style="width: 25% !important;"/>
                    </div>
                    <h3 class="h5-fs"><br/>Olivia Reed</h3>
                    <p class="text-muted">Product Manager</p>
                    <p>Olivia oversees product development from concept to launch.</p>
                    <div class="s_social_media o_not_editable text-start no_icon_color" data-snippet="s_social_media" data-name="Social Media">
                        <h4 class="s_social_media_title d-none h5-fs">Social Media</h4>
                        <a href="/website/social/github" class="s_social_media_github" target="_blank" aria-label="GitHub">
                            <i class="fa fa-github o_editable_media fa-stack"/>
                        </a>
                        <a href="/website/social/linkedin" class="s_social_media_linkedin" target="_blank" aria-label="LinkedIn">
                            <i class="fa fa-linkedin o_editable_media fa-stack"/>
                        </a>
                        <a href="/website/social/instagram" class="s_social_media_instagram" target="_blank" aria-label="Instagram">
                            <i class="fa fa-instagram o_editable_media fa-stack"/>
                        </a>
                    </div>
                </div>
                <div class="col-lg-4 pt32 pb32" data-name="Team Member">
                    <div class="o_not_editable" contenteditable="false">
                        <img class="o_editable_media img img-fluid rounded-circle" src="/web/image/website.s_company_team_image_4" alt="" style="width: 25% !important;"/>
                    </div>
                    <h3 class="h5-fs"><br/>Emily Carter</h3>
                    <p class="text-muted">Human Resources Manager</p>
                    <p>Emily manages talent acquisition and workplace culture.</p>
                    <div class="s_social_media o_not_editable text-start no_icon_color" data-snippet="s_social_media" data-name="Social Media">
                        <h4 class="s_social_media_title d-none h5-fs">Social Media</h4>
                        <a href="/website/social/github" class="s_social_media_github" target="_blank" aria-label="GitHub">
                            <i class="fa fa-github o_editable_media fa-stack"/>
       …

- kind=other id=782 key=website.s_company_team_grid name=Company Team Grid active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Company Team Grid" t-name="website.s_company_team_grid">
    <section class="s_company_team_grid o_colored_level o_cc o_cc1 pt48 pb48">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="25">
                <div class="o_grid_item g-height-2 g-col-lg-12 col-lg-12" style="grid-area: 1 / 1 / 3 / 13; z-index: 1;">
                    <h2>Get to know us</h2>
                </div>
                <div data-name="Team Member" class="o_grid_item g-col-lg-4 g-height-11 col-lg-4" style="grid-area: 3 / 1 / 14 / 5; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px; z-index: 2;">
                    <div class="s_card o_card_img_top card o_cc o_cc2" data-vxml="001" data-snippet="s_card" data-name="Card" style="border-width: 0px !important;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top rounded pb-0" src="/web/image/website.s_company_team_image_1" style="padding: 16px;"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;">Tony Fred</h3>
                            <p class="card-text" style="text-align: center;">Chief Executive Officer</p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="o_grid_item g-col-lg-4 g-height-11 col-lg-4" style="grid-area: 4 / 5 / 15 / 9; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px; z-index: 3;">
                    <div class="s_card o_card_img_top card o_cc o_cc2" data-vxml="001" data-snippet="s_card" data-name="Card" style="border-width: 0px !important;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top rounded pb-0" src="/web/image/website.s_company_team_image_2" style="padding: 16px;"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;">Mich Stark</h3>
                            <p class="card-text" style="text-align: center;">Chief Technical Manager</p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="o_grid_item g-col-lg-4 g-height-11 col-lg-4" style="grid-area: 3 / 9 / 14 / 13; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px; z-index: 4;">
                    <div class="s_card o_card_img_top card o_cc o_cc2" data-vxml="001" data-snippet="s_card" data-name="card" style="border-width: 0px !important;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top rounded pb-0" src="/web/image/website.s_company_team_image_3" style="padding: 16px;"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;">Aline Turner</h3>
                            <p class="card-text" style="text-align: center;">Chief Financial Officer</p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="o_grid_item g-col-lg-4 g-height-11 col-lg-4" style="grid-area: 14 / 1 / 25 / 5; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px; z-index: 5;">
                    <div class="s_card o_card_img_top card o_cc o_cc2" data-vxml="001" data-snippet="s_card" data-name="card" style="border-width: 0px !important;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top rounded pb-0" src="/web/image/website.s_company_team_image_4" style="padding: 16px;"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;">Iris Joe</h3>
                            <p class="card-text" style="text-align: center;">Chief Operational Officer</p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="o_grid_item g-col-lg-4 g-height-11 col-lg-4" style="grid-area: 15 / 5 / 26 / 9; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px; z-index: 6;">
                    <div class="s_card o_card_img_top card o_cc o_cc2" data-vxml="001" data-snippet="s_card" data-name="card" style="border-width: 0px !important;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top rounded pb-0" src="/web/image/website.s_company_team_image_5" style="padding: 16px;"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;">Pete Bluestork</h3>
                            <p class="card-text" style="text-align: center;">Chief Communication Officer</p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="o_grid_item g-col-lg-4 g-height-11 col-lg-4" style="grid-area: 14 / 9 / 25 / 13; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px; z-index: 7;">
                    <div class="s_card o_card_img_top card o_cc o_cc2" data-vxml="001" data-snippet="s_card" data-name="card" style="border-width: 0px !important;">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top rounded pb-0" src="/web/image/website.s_company_team_image_6" style="padding: 16px;"/>
                        </figure>
                        <div class="card-body">
                            <h3…

- kind=other id=779 key=website.s_company_team_shapes name=Team Shapes active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Team Shapes" t-name="website.s_company_team_shapes">
    <section class="s_company_team_shapes o_cc o_cc2 pt48 pb48">
        <div class="o_container_small">
            <h2 style="text-align: center;">Our talented crew</h2>
            <p><br/></p>
            <div class="row">
                <div class="col-6 col-lg-4 pb24">
                    <p><img src="/html_editor/image_shape/website.s_company_team_image_1/html_builder/geometric_round/geo_round_square.svg" class="img img-fluid" alt="" data-shape="html_builder/geometric_round/geo_round_square" data-format-mimetype="image/jpeg" data-file-name="s_company_team_image_1.svg" data-shape-colors=";;;;" style="width: 100% !important;"/></p>
                    <h3 class="h5-fs" style="text-align: center;">Tony Fred</h3>
                </div>
                <div class="col-6 col-lg-4 pb24">
                    <p><img src="/web/image/website.s_company_team_image_2" class="img-fluid rounded" alt="" style="width: 100% !important;"/></p>
                    <h3 class="h5-fs" style="text-align: center;">Mich Stark</h3>
                </div>
                <div class="col-6 col-lg-4 pb24">
                    <p><img src="/html_editor/image_shape/website.s_company_team_image_3/html_builder/geometric/geo_sonar.svg" class="img img-fluid" alt="" data-shape="html_builder/geometric/geo_sonar" data-format-mimetype="image/jpeg" data-file-name="s_company_team_image_3.svg" data-shape-colors=";;;;" style="width: 100% !important;"/></p>
                    <h3 class="h5-fs" style="text-align: center;">Aline Turner</h3>
                </div>
                <div class="col-6 col-lg-4 pb24">
                    <p><img src="/web/image/website.s_company_team_image_4" class="img-fluid rounded" alt="" style="width: 100% !important;"/></p>
                    <h3 class="h5-fs" style="text-align: center;">Iris Joe</h3>
                </div>
                <div class="col-6 col-lg-4 pb24">
                    <p><img src="/html_editor/image_shape/website.s_company_team_image_5/html_builder/geometric/geo_door.svg" class="img img-fluid" alt="" data-shape="html_builder/geometric/geo_door" data-format-mimetype="image/jpeg" data-file-name="s_company_team_image_5.svg" data-shape-colors=";;;;" style="width: 100% !important;"/></p>
                    <h3 class="h5-fs" style="text-align: center;">Pete Bluestork</h3>
                </div>
                <div class="col-6 col-lg-4 pb24">
                    <p><img src="/html_editor/image_shape/website.s_company_team_image_6/html_builder/geometric_round/geo_round_circle.svg" class="img img-fluid" alt="" data-shape="html_builder/geometric_round/geo_round_circle" data-format-mimetype="image/jpeg" data-file-name="s_company_team_image_6.svg" data-shape-colors=";;;;" style="width: 100% !important;"/></p>
                    <h3 class="h5-fs" style="text-align: center;">Sophia Langston</h3>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=781 key=website.s_company_team_spotlight name=Team Spotlight active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Team Spotlight" t-name="website.s_company_team_spotlight">
    <section class="s_company_team_spotlight o_colored_level o_cc o_cc1 pt48 pb48">
        <div class="container">
            <h2 style="text-align: center;">Team spotlight</h2>
            <p><br/></p>
            <div class="row">
                <div data-name="Team Member" class="col-6 col-lg-3">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top" src="/web/image/website.s_company_team_image_1"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Tony Fred</h3>
                            <p class="card-text">Chief Executive Officer</p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="col-6 col-lg-3">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top" src="/web/image/website.s_company_team_image_2"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Mich Stark</h3>
                            <p class="card-text">Chief Technical Manager</p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="col-6 col-lg-3">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top" src="/web/image/website.s_company_team_image_3"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Aline Turner</h3>
                            <p class="card-text">Chief Financial Officer</p>
                        </div>
                    </div>
                </div>
                <div data-name="Team Member" class="col-6 col-lg-3">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                            <img class="o_card_img card-img-top" src="/web/image/website.s_company_team_image_4"/>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Iris Joe</h3>
                            <p class="card-text">Chief Operational Officer</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=775 key=website.s_comparisons name=Comparisons active=True website=null inherit=null
  signals: hrefs_total=3 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Comparisons" t-name="website.s_comparisons">
    <section class="s_comparisons pt48 pb48" data-vxml="001" data-vcss="001">
        <div class="container">
            <div class="mb-4">
                <h2 class="h3-fs">Competitive pricing</h2>
                <p class="lead">Listing your product pricing helps potential customers quickly determine if it fits their budget and needs.</p>
            </div>
            <div class="row gap-4 gap-lg-0">
                <div class="col-lg-4" data-name="Plan">
                    <div class="s_card card o_cc o_cc1 h-100 my-0" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Beginner</h3>
                            <div class="my-2">
                                <strong class="h2-fs">$ 15.00</strong>
                                <small class="text-muted">/ month</small>
                            </div>
                            <p class="card-text small">Ideal for newcomers. Essential features to kickstart sales and marketing. Perfect for small teams.</p>
                            <a href="/contactus" class="btn btn-outline-primary w-100 mb-3">Start Now</a>
                            <ul class="list-group list-group-flush text-start">
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-check text-success" role="img"/>  Sales &amp; marketing for 2</li>
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-check text-success" role="img"/>  Account management</li>
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-times text-danger" role="img"/>  No customization</li>
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-times text-danger" role="img"/>  No support</li>
                            </ul>
                        </div>
                        <div class="card-footer text-center">
                            <small class="text-center">Instant setup, satisfied or reimbursed.</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4" data-name="Plan">
                    <div class="s_card card o_cc o_cc1 h-100 my-0" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Professional</h3>
                            <div class="my-2">
                                <strong class="h2-fs">$ 25.00</strong>
                                <small class="text-muted">/ month</small>
                            </div>
                            <p class="card-text small">Comprehensive tools for growing businesses. Optimize your processes and productivity across your team.</p>
                            <a href="/contactus" class="btn btn-primary w-100 mb-3">Start Now</a>
                            <ul class="list-group list-group-flush text-start">
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-check text-success" role="img"/>  Complete CRM for any team</li>
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-check text-success" role="img"/>  Access all modules</li>
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-check text-success" role="img"/>  Limited customization</li>
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-check text-success" role="img"/>  Email support</li>
                            </ul>
                        </div>
                        <div class="card-footer text-center">
                            <small class="text-center">Instant setup, satisfied or reimbursed.</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4" data-name="Plan">
                    <div class="s_card card o_cc o_cc1 h-100 my-0" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <div class="card-body">
                            <h3 class="card-title h5-fs">Expert</h3>
                            <div class="my-2">
                                <strong class="h2-fs">$ 45.00</strong>
                                <small class="text-muted">/ month</small>
                            </div>
                            <p class="card-text small">Advanced solution for enterprises. Cutting-edge features and top-tier support for maximum performance.</p>
                            <a href="/contactus" class="btn btn-outline-primary w-100 mb-3">Contact Us</a>
                            <ul class="list-group list-group-flush text-start">
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-check text-success" role="img"/>  Unlimited CRM support</li>
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-check text-success" role="img"/>  All modules &amp; features</li>
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-check text-success" role="img"/>  Unlimited customization</li>
                                <li class="list-group-item px-0 bg-transparent text-reset"><i class="fa fa-check text-success" role="img"/>  24/7 toll-free support</li>
                            </ul>
                        </div>
                        <div class="card-footer text-center">
                            <small class="text-center">Instant setup, satisfied or reimbursed.</small>
                        </div>
                    </div>
                …

- kind=other id=776 key=website.s_comparisons_horizontal name=Comparisons Horizontal active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Comparisons Horizontal" t-name="website.s_comparisons_horizontal">
    <section class="s_comparisons_horizontal o_colored_level pt64 pb48">
        <div class="container">
            <h2 class="h3-fs">Our Pricing</h2>
            <p class="lead">Discover what is the best pricing for you.</p>
            <div class="row">
                <div class="col-12 col-lg-6 pb16 pt16" data-name="Card">
                    <div class="s_card card o_cc o_cc1 h-100 my-0" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <div class="card-body">
                            <div class="row">
                                <div class="col-12 col-lg-6">
                                    <h3 class="card-title h5-fs">Professional</h3>
                                    <div class="my-2">
                                        <strong class="h2-fs">$ 65.00</strong>
                                        <small class="text-muted">/ month</small>
                                    </div>
                                    <p class="card-text small">Comprehensive tools for growing businesses. Optimize your processes and productivity across your team.</p>
                                    <a href="/contactus" class="btn btn-secondary mb-2">Start Now</a>
                                </div>
                                <div class="col-12 col-lg-6">
                                    <ul class="list-group list-group-flush text-start">
                                        <li class="list-group-item px-0 bg-transparent text-reset"><span class="fa fa-check-circle-o"/>  Complete CRM for any team</li>
                                        <li class="list-group-item px-0 bg-transparent text-reset"><span class="fa fa-check-circle-o"/>  Access all modules</li>
                                        <li class="list-group-item px-0 bg-transparent text-reset"><span class="fa fa-check-circle-o"/>  Limited Customization</li>
                                        <li class="list-group-item px-0 bg-transparent text-reset"><span class="fa fa-check-circle-o"/>  Email support</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div class="card-footer" style="text-align: center;">
                            <small>Instant setup, satisfied or reimbursed.</small>
                        </div>
                    </div>
                </div>
                <div class="col-12 col-lg-6 pb16 pt16" data-name="Card">
                    <div class="s_card card o_cc o_cc1 h-100 my-0" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <div class="card-body">
                            <div class="row">
                                <div class="col-12 col-lg-6">
                                    <h3 class="card-title h5-fs">Expert</h3>
                                    <div class="my-2">
                                        <strong class="h2-fs">$ 125.00</strong>
                                        <small class="text-muted">/ month</small>
                                    </div>
                                    <p class="card-text small">Advanced solution for enterprises. Cutting-edge features and top-tier support for maximum performance.</p>
                                    <a href="/contactus" class="btn btn-primary mb-2">Start Now</a>
                                </div>
                                <div class="col-12 col-lg-6">
                                    <ul class="list-group list-group-flush text-start">
                                        <li class="list-group-item px-0 bg-transparent text-reset"><span class="fa fa-check-circle-o"/>  PaaS Access</li>
                                        <li class="list-group-item px-0 bg-transparent text-reset"><span class="fa fa-check-circle-o"/>  Unlimited CRM support</li>
                                        <li class="list-group-item px-0 bg-transparent text-reset"><span class="fa fa-check-circle-o"/>  All modules &amp; features</li>
                                        <li class="list-group-item px-0 bg-transparent text-reset"><span class="fa fa-check-circle-o"/>  Unlimited customization</li>
                                        <li class="list-group-item px-0 bg-transparent text-reset"><span class="fa fa-check-circle-o"/>  24/7 Support</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div class="card-footer" style="text-align: center;">
                            <small>Instant setup, satisfied or reimbursed.</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=804 key=website.s_contact_info name=Contact Info active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Contact Info" t-name="website.s_contact_info">
    <section class="s_contact_info pt48 pb64 o_cc o_cc1">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="11">
                <div class="o_grid_item g-col-lg-6 g-height-5 col-lg-6 col-10 offset-1 order-lg-0" style="order: 2;--grid-item-padding-x: 0px; --grid-item-padding-y: 24px; grid-area: 1 / 1 / 6 / 7; z-index: 1;" data-name="Title block">
                    <h2>Contact Us</h2>
                    <p class="lead">We'd love to hear from you! If you have any questions, feedback, or need assistance, please feel free to reach out to us using the contact details provided. Our team is here to help and will respond as soon as possible. Thank you for getting in touch!</p>
                </div>
                <div class="o_grid_item g-col-lg-6 g-height-2 col-lg-6 col-10 offset-1 order-lg-0" style="order: 3; --grid-item-padding-x: 0px; --grid-item-padding-y: 16px; grid-area: 6 / 1 / 8 / 7; z-index: 2;" data-name="Info block">
                    <h3 class="h5-fs">
                        <i class="fa fa-fw fa-envelope-o" role="presentation"/>
                        Email
                    </h3>
                    <p>
                               <a class="o_translate_inline" href="mail-to:info@yourcompany.example.com" title="Send an email">info@yourcompany.example.com</a>
                    </p>
                </div>
                <div class="o_grid_item g-col-lg-6 g-height-2 col-lg-6 col-10 offset-1 order-lg-0" style="order: 4; --grid-item-padding-x: 0px; --grid-item-padding-y: 16px; grid-area: 8 / 1 / 10 / 7; z-index: 3;" data-name="Info block">
                    <h3 class="h5-fs">
                        <i class="fa fa-fw fa-phone" role="presentation"/>
                        Phone
                    </h3>
                    <p>
                               <a class="o_translate_inline" href="tel:+1555-555-5556" title="Call Customer Service">+1555-555-5556</a>
                    </p>
                </div>
                <div class="o_grid_item g-col-lg-6 g-height-2 col-lg-6 col-10 offset-1 order-lg-0" style="order: 5; --grid-item-padding-x: 0px; --grid-item-padding-y: 16px; grid-area: 10 / 1 / 12 / 7; z-index: 4;" data-name="Info block">
                    <h3 class="h5-fs">
                        <i class="fa fa-fw fa-building-o" role="presentation"/>
                        Office
                    </h3>
                    <p>       3575 Fake Buena Vista Avenue</p>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-6 g-height-6 col-lg-6 col-10 offset-1 order-lg-0" style="order: 1; --grid-item-padding-x: 0px; --grid-item-padding-y: 0px; grid-area: 6 / 7 / 12 / 13; z-index: 5;" data-name="Image block">
                    <img class="img img-fluid rounded" src="/web/image/website.s_cover_default_image" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=767 key=website.s_countdown name=Countdown active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Countdown" t-name="website.s_countdown">
    <section class="s_countdown pt48 pb48" data-display="dhms" data-end-action="nothing" data-size="175" t-att-data-end-time="60 * round(datetime.datetime.now().timestamp() / 60) + 228300" data-layout="circle" data-layout-background="none" data-progress-bar-style="surrounded" data-progress-bar-weight="thin" data-text-color="o-color-1" data-layout-background-color="400" data-progress-bar-color="o-color-1">
        <div class="container">
            <div class="s_countdown_canvas_wrapper text-center d-flex justify-content-center">
                <div class="s_countdown_canvas_flex" style="width: 25%; max-width: 175px;">
                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="175" height="175" class="w-100" viewBox="0 0 175 175"><defs/><g><text fill="var(--o-color-1)" stroke="none" font-family="Arial" font-size="43.75px" font-style="normal" font-weight="normal" text-decoration="normal" x="87.5" y="87.5" text-anchor="middle" dominant-baseline="central">2</text><text fill="var(--o-color-1)" stroke="none" font-family="Arial" font-size="14.583333333333334px" font-style="normal" font-weight="normal" text-decoration="normal" x="87.5" y="116.66666666666667" text-anchor="middle" dominant-baseline="central">Days</text><path fill="none" stroke="var(--o-color-1)" paint-order="fill stroke markers" d=" M 166.25 87.5 A 78.75 78.75 0 1 1 166.24996062500327 87.42125001312495" stroke-miterlimit="10" stroke-width="5" stroke-opacity="0.2" stroke-dasharray=""/><path fill="none" stroke="var(--o-color-1)" paint-order="fill stroke markers" d=" M 87.5 8.75 A 78.75 78.75 0 0 1 146.0226550063448 34.80596474923991" stroke-miterlimit="10" stroke-width="5" stroke-dasharray=""/></g></svg>
                </div>
                <div class="s_countdown_canvas_flex" style="width: 25%; max-width: 175px;">
                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="175" height="175" class="w-100" viewBox="0 0 175 175"><defs/><g><text fill="var(--o-color-1)" stroke="none" font-family="Arial" font-size="43.75px" font-style="normal" font-weight="normal" text-decoration="normal" x="87.5" y="87.5" text-anchor="middle" dominant-baseline="central">16</text><text fill="var(--o-color-1)" stroke="none" font-family="Arial" font-size="14.583333333333334px" font-style="normal" font-weight="normal" text-decoration="normal" x="87.5" y="116.66666666666667" text-anchor="middle" dominant-baseline="central">Hours</text><path fill="none" stroke="var(--o-color-1)" paint-order="fill stroke markers" d=" M 166.25 87.5 A 78.75 78.75 0 1 1 166.24996062500327 87.42125001312495" stroke-miterlimit="10" stroke-width="5" stroke-opacity="0.2" stroke-dasharray=""/><path fill="none" stroke="var(--o-color-1)" paint-order="fill stroke markers" d=" M 87.5 8.75 A 78.75 78.75 0 1 1 19.30049945197547 126.87500000000003" stroke-miterlimit="10" stroke-width="5" stroke-dasharray=""/></g></svg>
                </div>
                <div class="s_countdown_canvas_flex" style="width: 25%; max-width: 175px;">
                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="175" height="175" class="w-100" viewBox="0 0 175 175"><defs/><g><text fill="var(--o-color-1)" stroke="none" font-family="Arial" font-size="43.75px" font-style="normal" font-weight="normal" text-decoration="normal" x="87.5" y="87.5" text-anchor="middle" dominant-baseline="central">30</text><text fill="var(--o-color-1)" stroke="none" font-family="Arial" font-size="14.583333333333334px" font-style="normal" font-weight="normal" text-decoration="normal" x="87.5" y="116.66666666666667" text-anchor="middle" dominant-baseline="central">Minutes</text><path fill="none" stroke="var(--o-color-1)" paint-order="fill stroke markers" d=" M 166.25 87.5 A 78.75 78.75 0 1 1 166.24996062500327 87.42125001312495" stroke-miterlimit="10" stroke-width="5" stroke-opacity="0.2" stroke-dasharray=""/><path fill="none" stroke="var(--o-color-1)" paint-order="fill stroke markers" d=" M 87.5 8.75 A 78.75 78.75 0 0 1 87.5 166.25" stroke-miterlimit="10" stroke-width="5" stroke-dasharray=""/></g></svg>
                </div>
                <div class="s_countdown_canvas_flex" style="width: 25%; max-width: 175px;">
                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="175" height="175" class="w-100" viewBox="0 0 175 175"><defs/><g><text fill="var(--o-color-1)" stroke="none" font-family="Arial" font-size="43.75px" font-style="normal" font-weight="normal" text-decoration="normal" x="87.5" y="87.5" text-anchor="middle" dominant-baseline="central">45</text><text fill="var(--o-color-1)" stroke="none" font-family="Arial" font-size="14.583333333333334px" font-style="normal" font-weight="normal" text-decoration="normal" x="87.5" y="116.66666666666667" text-anchor="middle" dominant-baseline="central">Seconds</text><path fill="none" stroke="var(--o-color-1)" paint-order="fill stroke markers" d=" M 166.25 87.5 A 78.75 78.75 0 1 1 166.24996062500327 87.42125001312495" stroke-miterlimit="10" stroke-width="5" stroke-opacity="0.2" stroke-dasharray=""/><path fill="none" stroke="var(--o-color-1)" paint-order="fill stroke markers" d=" M 87.5 8.75 A 78.75 78.75 0 1 1 8.75 87.50000000000001" stroke-miterlimit="10" stroke-width="5" stroke-dasharray=""/></g></svg>
                </div>
            </div>
            <div class="s_countdown_inline d-flex flex-column align-items-start o_countdown_default">
                <div class="s_countdown_inline_wrapper d-none">
                    <t t-call="website.s_countdown_inline_default_template"/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=772 key=website.s_countdown_inline_big_numbers_template name=s_countdown_inline_big_numbers_template active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_countdown_inline_big_numbers_template">
    <t t-set="metrics" t-value="[days, hours, minutes, seconds]"/>
    <div class="o_template_big_numbers">
        <div class="o_not_editable oe_unremovable d-inline-flex gap-1" contenteditable="false">
            <t t-foreach="metrics" t-as="metric">
                <span class="o_count_item d-flex gap-1">
                    <span class="d-flex flex-column align-items-center">
                        <span class="o_count_item_nbs o_colored_text fs-3 fw-bold"/>
                        <span class="o_count_item_label small"/>
                    </span>
                </span>
                <span t-if="metric_last == false" class="o_count_separator fs-3 fw-bold">:</span>
            </t>
        </div>
    </div>
</t>

- kind=other id=768 key=website.s_countdown_inline_default_template name=s_countdown_inline_default_template active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_countdown_inline_default_template">
    <t t-set="metrics" t-value="[days, hours, minutes, seconds]"/>
    <div class="o_template_default o_count_inline_text o_colored_item alert mb-0">
        <p>
            <i class="fa fa-clock-o"/> Sale ends in
            <span class="o_not_editable oe_unremovable" contenteditable="false">
                <t t-foreach="metrics" t-as="metric">
                    <span class="o_count_item">
                        <span class="o_count_item_nbs d-inline-flex fw-bold"/>
                        <span class="o_count_item_label fw-bold">
                            <span class="o_skeletton rounded bg-200 ps-5"/>
                        </span>
                    </span>
                </t>
            </span>
        </p>
    </div>
</t>

- kind=other id=769 key=website.s_countdown_inline_dominoes_template name=s_countdown_inline_dominoes_template active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_countdown_inline_dominoes_template">
    <t t-set="metrics" t-value="[days, hours, minutes, seconds]"/>
    <div class="o_template_dominoes">
        <div class="o_not_editable oe_unremovable d-flex gap-1" contenteditable="false">
            <t t-foreach="metrics" t-as="metric">
                <span class="o_count_item d-flex gap-1">
                    <span class="d-flex flex-column align-items-center">
                        <span class="o_count_item_nbs d-inline-flex">
                            <span class="o_count_item_nb o_colored_item position-relative rounded py-1 px-2 fs-4 fw-bold"/>
                            <span class="o_count_item_nb o_colored_item position-relative rounded py-1 px-2 fs-4 fw-bold"/>
                        </span>
                        <span class="o_count_item_label small"/>
                    </span>
                </span>
                <span t-if="metric_last == false" class="o_count_separator mt-1 fs-4">:</span>
            </t>
        </div>
    </div>
</t>

- kind=other id=771 key=website.s_countdown_inline_text_template name=s_countdown_inline_text_template active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_countdown_inline_text_template">
    <t t-set="metrics" t-value="[days, hours, minutes, seconds]"/>
    <div class="o_template_text o_count_inline_text">
        <p>
            <i class="fa fa-clock-o"/> Sale ends in
            <span class="o_not_editable oe_unremovable" contenteditable="false">
                <t t-foreach="metrics" t-as="metric">
                    <span class="o_count_item o_colored_text">
                        <span class="o_count_item_nbs d-inline-flex fw-bold"/>
                        <span class="o_count_item_label fw-bold"/>
                    </span>
                </t>
            </span>
        </p>
    </div>
</t>

- kind=other id=770 key=website.s_countdown_inline_wrapped_numbers_template name=s_countdown_inline_wrapped_numbers_template active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_countdown_inline_wrapped_numbers_template">
    <t t-set="metrics" t-value="[days, hours, minutes, seconds]"/>
    <div class="o_template_wrapped_numbers">
        <div class="o_not_editable oe_unremovable d-inline-flex gap-1" contenteditable="false">
            <t t-foreach="metrics" t-as="metric">
                <span class="o_count_item d-flex gap-1">
                    <span class="d-flex flex-column align-items-center">
                        <span class="o_count_item_nbs o_colored_item d-flex justify-content-center align-items-center rounded p-2"/>
                        <span class="o_count_item_label small"/>
                    </span>
                </span>
                <span t-if="metric_last == false" class="o_count_separator align-items-center">:</span>
            </t>
        </div>
    </div>
</t>

- kind=other id=731 key=website.s_cover name=Cover active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Cover" t-name="website.s_cover">
    <section class="s_cover parallax s_parallax_is_fixed o_cc o_cc5 pt232 pb232" data-scroll-background-ratio="1">
        <span class="s_parallax_bg_wrap">
            <span class="s_parallax_bg oe_img_bg" style="background-image: url('/web/image/website.s_cover_default_image'); background-position: 50% 75%;"/>
        </span>
        <div class="o_we_bg_filter bg-black-50"/>
        <div class="container s_allow_columns">
            <h1 class="display-3" style="text-align: center;">Your journey starts here</h1>
            <p class="lead" style="text-align: center;">Write one or two paragraphs describing your product, services or a specific feature.<br/> To be successful your content needs to be useful to your readers.</p>
            <p style="text-align: center;">
                <a t-att-href="cta_btn_href" class="btn btn-secondary mb-2 o_translate_inline"><t t-out="cta_btn_text">Discover more</t></a>
                <t t-set="contact_us_label">Contact us</t>
                <a href="/contactus" class="btn btn-outline-secondary mb-2 o_translate_inline"><t t-out="contact_us_label"/></a>
            </p>
        </div>
    </section>
</t>

- kind=other id=890 key=website.s_cta_badge name=CTA Badge active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="CTA Badge" t-name="website.s_cta_badge">
    <span class="s_cta_badge d-inline-block my-3 border rounded py-2 px-3 o_cc o_cc1 o_animable" data-name="CTA Badge" style="border-radius: 32px !important;">
        <i class="fa fa-fw fa-info-circle o_not-animable" role="img"/> What's new ? <a href="#">Explore <i class="fa fa-long-arrow-right" role="img"/></a>
    </span>
</t>

- kind=other id=806 key=website.s_cta_box name=Box Call to Action active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Box Call to Action" t-name="website.s_cta_box">
    <section class="s_cta_box pt80 pb80">
        <div class="container">
            <div class="s_card o_card_img_horizontal flex-lg-row-reverse card o_cc o_cc4" data-snippet="s_card" data-vxml="001" data-name="Card" style="--card-spacer-x: 64px; --card-spacer-y: 64px; border-width: 0px !important;">
                <figure class="o_card_img_wrapper ratio ratio-1x1 mb-0">
                    <img class="o_card_img rounded-end" src="/web/image/website.s_cta_box_default_image" alt=""/>
                </figure>
                <div class="card-body">
                    <h2 class="card-title">50,000+ companies run Odoo<br/>to grow their businesses.</h2>
                    <p class="card-text">Join us and make your company a better place.<br/><br/></p>
                    <a t-att-href="cta_btn_href" class="btn btn-lg btn-secondary">Contact Us</a>
                </div>
             </div>
        </div>
    </section>
</t>

- kind=other id=897 key=website.s_cta_card name=Card Call to Action active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Card Call to Action" t-name="website.s_cta_card">
    <section class="s_cta_card o_cc o_cc2 pt64 pb64" data-oe-shape-data="{'shape':'html_builder/Blobs/03','showOnMobile': true}">
        <div class="o_we_shape o_html_builder_Blobs_03 o_shape_show_mobile"/>
        <div class="container">
            <div class="row align-items-center">
                <div class="col-lg-8">
                    <h2>50,000+ companies run Odoo <br class="d-none d-lg-inline"/>to grow their businesses.</h2>
                    <p class="lead">Join us and make your company a better place.</p>
                </div>
                <div class="col-lg-4">
                    <div class="s_card card o_cc o_cc1 mx-auto shadow" data-snippet="s_card" data-name="Card" data-vxml="001" style="border-width: 0px !important; max-width: 50%">
                        <div class="card-body p-4">
                            <h3 class="card-title h5-fs">What you will get</h3>
                            <br/>
                            <p><i class="fa fa-check text-o-color-1" role="img"/>  Wonderful experience</p>
                            <p><i class="fa fa-check text-o-color-1" role="img"/>  Quick support</p>
                            <p><i class="fa fa-check text-o-color-1" role="img"/>  Complete access</p>
                            <a t-att-href="cta_btn_href" class="btn btn-primary w-100"><t t-out="cta_btn_text">Contact us</t></a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=899 key=website.s_cta_mobile name=CTA Mobile active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="CTA Mobile" t-name="website.s_cta_mobile">
    <section class="s_cta_mobile pt80 pb80">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="8">
                <div class="o_grid_item g-height-6 g-col-lg-12 col-lg-12 o_cc o_cc2 rounded" style="grid-area: 3 / 1 / 9 / 13; z-index: 1; --grid-item-padding-y: 80px; --grid-item-padding-x: 64px;">
                    <h2 class="h3-fs">50,000+ companies trust Odoo.</h2>
                    <p class="lead">Join us and make your company a better place.<br/><br/></p>
                    <a href="https://www.apple.com/app-store/"><img src="/web/image/website.app_store_image" class="img img-fluid" alt="App Store"/></a>
                    <a href="https://play.google.com/store/"><img src="/web/image/website.google_play_image" class="img img-fluid" alt="Google Play"/></a>
                </div>
                <div class="o_grid_item o_grid_item_image o_snippet_mobile_invisible g-height-8 g-col-lg-4 col-lg-4 d-none d-lg-block" style="grid-area: 1 / 8 / 9 / 12; z-index: 2; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img src="html_editor/image_shape/website.s_cta_mockups_default_image_1/html_builder/devices/galaxy_front_portrait_half.svg" class="img img-fluid" data-shape="html_builder/devices/galaxy_front_portrait_half" data-shape-colors=";;;;#111827" data-format-mimetype="image/webp" data-file-name="s_cta_mockups_1.webp" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=871 key=website.s_cta_mockups name=Call to Action Mockups active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Call to Action Mockups" t-name="website.s_cta_mockups">
    <section class="s_cta_mockups o_cc o_cc2 pt64 pb64">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="9">
                <div class="o_grid_item o_grid_item_image g-height-9 g-col-lg-7 col-lg-7" style="grid-area: 1 / 6 / 10 / 13; z-index: 1;">
                    <img src="html_editor/image_shape/website.s_cta_mockups_default_image/html_builder/devices/macbook_front.svg" class="img img-fluid" data-shape="html_builder/devices/macbook_front" data-format-mimetype="image/webp" data-file-name="s_cta_mockups.webp" alt=""/>
                </div>
                <div class="o_grid_item g-height-6 g-col-lg-4 col-lg-4" style="grid-area: 3 / 1 / 9 / 5; z-index: 2;">
                    <h2 class="h3-fs">50,000+ companies trust Odoo.</h2>
                    <p class="lead">Join us and make your company a better place.</p>
                    <a t-att-href="cta_btn_href" class="btn btn-primary btn-lg"><t t-out="cta_btn_text">Contact us</t></a>
                </div>
                <div class="o_grid_item o_grid_item_image o_snippet_mobile_invisible g-height-8 g-col-lg-2 col-lg-2 d-none d-lg-block" style="grid-area: 2 / 6 / 10 / 8; z-index: 3;">
                    <img src="html_editor/image_shape/website.s_cta_mockups_default_image_1/html_builder/devices/iphone_front_portrait.svg" class="img img-fluid" data-shape="html_builder/devices/iphone_front_portrait" data-format-mimetype="image/webp" data-file-name="s_cta_mockups_1.webp" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=837 key=website.s_discovery name=Discovery active=True website=null inherit=null
  signals: hrefs_total=3 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Discovery" t-name="website.s_discovery">
    <section class="s_discovery pt136 pb136">
        <div class="container" style="text-align: center;">
            <span class="s_cta_badge o_cc o_cc1 d-inline-block my-3 border rounded py-2 px-3 o_animable" data-snippet="s_cta_badge" data-name="CTA Badge" style="border-radius: 32px !important;">
                <i class="fa fa-fw fa-info-circle o_not-animable" role="img"/> What's new ? <a href="#">Explore <i class="fa fa-long-arrow-right" role="img"/></a>
            </span>
            <h1 class="display-2" style="text-align: center;">Discover our solutions</h1>
            <p class="lead" style="text-align: center;">Write one or two paragraphs describing your product, services or a specific feature.<br/> To be successful your content needs to be useful to your readers.<br/><br/></p>
            <p style="text-align: center;">
                <a t-att-href="cta_btn_href" class="btn btn-primary mb-2 o_translate_inline"><t t-out="cta_btn_text">Our store</t></a>
                <a t-att-href="cta_btn_href" class="btn btn-secondary mb-2 o_translate_inline"><t t-out="cta_btn_text">Contact us</t></a>
            </p>
        </div>
    </section>
</t>

- kind=other id=874 key=website.s_dynamic_snippet name=Dynamic Snippet active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Dynamic Snippet" t-name="website.s_dynamic_snippet">
        <t t-call="website.s_dynamic_snippet_template" snippet_name.f="s_dynamic_snippet"/>
    </t>

- kind=other id=875 key=website.s_dynamic_snippet_carousel name=Dynamic Carousel active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Dynamic Carousel" t-name="website.s_dynamic_snippet_carousel">
        <t t-call="website.s_dynamic_snippet_template" snippet_name.f="s_dynamic_snippet_carousel">
                <t t-set="snippet_title" t-valuef="Our latest content"/>
                <t t-set="snippet_description" t-valuef="Check out what's new in our company !"/>
            </t>
    </t>

- kind=other id=873 key=website.s_dynamic_snippet_template name=website.s_dynamic_snippet_template active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_dynamic_snippet_template">
        <t t-set="snippet_title_default">Our latest content</t>
        <t t-set="snippet_description_default">Check out what's new in our company !</t>
        <t t-set="snippet_button_text_default">See All <i class="fa fa-long-arrow-right ms-2" role="img"/></t>
        <section t-att-data-snippet="snippet_name" t-attf-class="#{snippet_name} #{snippet_classes} s_dynamic o_dynamic_snippet_empty pt64 pb64" t-att-data-custom-template-data="custom_template_data or '{}'" t-att-data-number-of-records="is_single_record and '1' or ''">
            <div t-attf-class="s_dynamic_snippet_container {{container_classes or 'container'}}">
                <div class="row s_nb_column_fixed">
                    <!-- Dynamic snippet loading effect -->
                    <section class="s_dynamic_snippet_holder d-none px-4 placeholder-glow">
                        <div class="row">
                            <span class="placeholder col-3 rounded"/>
                            <span class="placeholder col-2 offset-7 rounded"/>
                            <span class="placeholder mt-3 col-6 rounded"/>
                        </div>
                        <div class="row mt-4">
                            <span class="placeholder col-12 rounded" style="height: 250px;"/>
                        </div>
                    </section>
                    <section t-attf-class="{{is_single_record and 'd-none' or 'd-flex'}} {{snippet_heading_extra_classes or 'justify-content-between flex-column flex-md-row'}} s_dynamic_snippet_title oe_unremovable oe_unmovable mb-lg-0 pb-3 pb-md-0 s_col_no_resize">
                        <div t-att-class="snippet_heading_inner_extra_classes">
                            <h2 class="h3" t-out="snippet_title or snippet_title_default"/>
                            <p class="lead" t-out="snippet_description or snippet_description_default"/>
                        </div>
                        <div t-if="main_page_url">
                            <a t-att-class="snippet_button_classes" t-att-href="main_page_url" t-out="snippet_button_text or snippet_button_text_default"/>
                        </div>
                    </section>
                    <section t-attf-class="s_dynamic_snippet_content oe_unremovable oe_unmovable o_not_editable col s_col_no_resize #{content_classes}">
                        <div class="css_non_editable_mode_hidden">
                            <div class="missing_option_warning alert alert-info fade show d-none d-print-none rounded-0">
                                Your Dynamic Snippet will be displayed here... This message is displayed because you did not provide enough options to retrieve its content.<br/>
                            </div>
                        </div>
                        <div class="dynamic_snippet_template">
                            <t t-out="0"/>
                        </div>
                    </section>
                </div>
            </div>
        </section>
    </t>

- kind=other id=904 key=website.s_ecomm_categories_showcase name=Categories Grid active=True website=null inherit=null
  signals: hrefs_total=4 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Categories Grid" t-name="website.s_ecomm_categories_showcase">
    <section class="s_ecomm_categories_showcase first-large-layout o_cc o_cc1 pt48 pb48">
        <div class="container">
            <div class="s_ecomm_categories_showcase_wrapper d-flex gap-4">
                <div class="s_ecomm_categories_showcase_block o_cc o_cc5 oe_img_bg rounded-2" data-name="Block" style="background-image: url('/web/image/website.s_ecomm_categories_showcase_1'); background-position: 15% 50%;">
                    <div class="o_we_bg_filter bg-black-25"/>
                    <div class="s_ecomm_categories_showcase_row d-flex">
                        <div class="s_ecomm_categories_showcase_content d-flex flex-column justify-content-end text-start">
                            <h2 class="h3-fs">Sofas</h2>
                            <p>
                                <a href="#" role="button" class="btn btn-secondary o_translate_inline">View All</a>
                            </p>
                        </div>
                    </div>
                </div>
                <div class="s_ecomm_categories_showcase_block o_cc o_cc5 oe_img_bg rounded-2" data-name="Block" style="background-image: url('/web/image/website.s_ecomm_categories_showcase_2'); background-position: 15% 50%;">
                    <div class="o_we_bg_filter bg-black-25"/>
                    <div class="s_ecomm_categories_showcase_row d-flex">
                        <div class="s_ecomm_categories_showcase_content d-flex flex-column justify-content-end text-start">
                            <h2 class="h3-fs">Desks</h2>
                            <p>
                                <a href="#" role="button" class="btn btn-secondary o_translate_inline">View All</a>
                            </p>
                        </div>
                    </div>
                </div>
                <div class="s_ecomm_categories_showcase_block o_cc o_cc5 oe_img_bg rounded-2" data-name="Block" style="background-image: url('/web/image/website.s_ecomm_categories_showcase_3'); background-position: 15% 50%;">
                    <div class="o_we_bg_filter bg-black-25"/>
                    <div class="s_ecomm_categories_showcase_row d-flex">
                        <div class="s_ecomm_categories_showcase_content d-flex flex-column justify-content-end text-start">
                            <h2 class="h3-fs">Drawers</h2>
                            <p>
                                <a href="#" role="button" class="btn btn-secondary o_translate_inline">View All</a>
                            </p>
                        </div>
                    </div>
                </div>
                <div class="s_ecomm_categories_showcase_block o_cc o_cc5 oe_img_bg rounded-2" data-name="Block" style="background-image: url('/web/image/website.s_ecomm_categories_showcase_4'); background-position: 15% 50%;">
                    <div class="o_we_bg_filter bg-black-25"/>
                    <div class="s_ecomm_categories_showcase_row d-flex">
                        <div class="s_ecomm_categories_showcase_content d-flex flex-column justify-content-end text-start">
                            <h2 class="h3-fs">Lamps</h2>
                            <p>
                                <a href="#" role="button" class="btn btn-secondary o_translate_inline">View All</a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=877 key=website.s_embed_code name=Embed Code active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Embed Code" t-name="website.s_embed_code">
    <t t-set="embed_code">
        <!-- Keep the next line as a one-liner, this is to nicely show the
        code in the ace editor when the user is replacing it. The `&#10;`
        acts as line returns. -->
        <div class="alert alert-info mb-0">
    Click on <b>"Edit"</b> in the right panel to replace this with your own HTML code
</div>
    </t>
    <section class="s_embed_code text-center pt16 pb16">
        <template class="s_embed_code_saved">
            <t t-out="embed_code"/>
        </template>
        <div class="s_embed_code_embedded container o_not_editable">
            <t t-out="embed_code"/>
        </div>
    </section>
</t>

- kind=other id=845 key=website.s_empowerment name=Empowerment active=True website=null inherit=null
  signals: hrefs_total=3 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Empowerment" t-name="website.s_empowerment">
    <section class="s_empowerment pt24 pb24">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="12">
                <div class="o_grid_item g-height-12 g-col-lg-7 col-lg-7" style="grid-area: 1 / 1 / 13 / 8; --grid-item-padding-x: 24px;">
                    <span class="s_cta_badge d-inline-block my-3 border rounded py-2 px-3 o_cc o_cc1 o_animable" data-snippet="s_cta_badge" data-name="CTA Badge" style="border-radius: 32px !important;">
                        <i class="fa fa-fw fa-info-circle o_not-animable" role="img"/> What's new ? <a href="#">Explore <i class="fa fa-long-arrow-right" role="img"/></a>
                    </span>
                    <h1 class="display-4">Empowering Your Success<br/>with Every Solution.</h1>
                    <p class="lead"><br/>Delivering tailored, innovative tools to help you overcome challenges and<br/> achieve your goals, ensuring your journey is fully supported.<br/><br/></p>
                    <p>
                        <a href="#" class="btn btn-primary mb-2 o_translate_inline">Get started</a>
                        <a href="#" class="btn btn-secondary mb-2 o_translate_inline">Learn more</a>
                    </p>
                </div>
                <div class="o_grid_item o_grid_item_image g-height-12 g-col-lg-5 col-lg-5 o_snippet_mobile_invisible d-none d-lg-block" style="grid-area: 1 / 8 / 13 / 13; --grid-item-padding-x: 24px; --grid-item-padding-y: 0px;">
                    <img class="img img-fluid mx-auto rounded" style="width: 100% !important;" src="/web/image/website.s_empowerment_default_image" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=764 key=website.s_facebook_page name=Facebook active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Facebook" t-name="website.s_facebook_page">
    <section class="o_facebook_page d-flex justify-content-center pb64 pt64" data-tabs="timeline,events,messages" data-hide_cover="false" data-small_header="false" data-height="500" data-width="500">
            <iframe class="mw-100 o_facebook_page_preview" src="https://www.facebook.com/plugins/page.php?height=500&amp;hide_cover=false&amp;href=https%3A%2F%2Fwww.facebook.com%2FOdoo&amp;show_facepile=false&amp;small_header=false&amp;tabs=timeline%2Cevents%2Cmessages&amp;width=500" style="width: 500px; height: 500px; border: medium none; overflow: hidden;" aria-label="Facebook"/>
    </section>
</t>

- kind=other id=790 key=website.s_faq_collapse name=FAQ active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="FAQ" t-name="website.s_faq_collapse">
    <section class="s_faq_collapse pt32 pb32" data-vcss="001">
        <div class="container">
            <div class="row align-items-start s_nb_column_fixed">
                <div class="col-lg-4 pt16">
                    <h2 class="h3-fs">Frequently asked questions</h2>
                    <p class="lead">Here are some common questions about our company.</p>
                </div>
                <div class="col-lg-7 offset-lg-1 s_col_no_bgcolor" data-name="Accordion Box">
                    <t t-call="website.s_accordion" extra_classes.f="accordion-flush"/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=818 key=website.s_faq_horizontal name=Topics List active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Topics List" t-name="website.s_faq_horizontal">
    <section class="s_faq_horizontal">
        <div class="container">
            <div class="row">
                <div data-name="Heading" class="col-lg-6 offset-lg-3 pt48 pb48">
                    <h2 style="text-align:center;">Topic Walkthrough</h2>
                    <p style="text-align:center;">Learn how to quickly set up and start using our services with our step-by-step onboarding process.</p>
                </div>
            </div>
            <div class="row s_col_no_resize">
                <div data-name="Topic" class="s_faq_horizontal_entry col-12 mb-2 pt16 pb32">
                    <article class="row">
                        <hgroup class="col-lg-4" role="heading" aria-level="3">
                            <div class="s_faq_horizontal_entry_title position-lg-sticky pb-lg-3 transition-base overflow-auto" style="top: 16px">
                                <h3 class="h5-fs">Getting Started</h3>
                                <p class="o_small-fs text-muted">Getting started with our product is a breeze, thanks to our well-structured and comprehensive onboarding process.</p>
                            </div>
                        </hgroup>
                        <span class="col-lg-7 offset-lg-1 d-block">
                            <p>We understand that the initial setup can be daunting, especially if you are new to our platform, so we have designed a step-by-step guide to walk you through every stage, ensuring that you can hit the ground running.<br/></p>
                            <img src="/web/image/website.s_faq_horizontal_default_image_1" class="img img-fluid rounded" style="width: 100% !important" alt=""/>
                            <p><br/>The first step in the onboarding process is <b>account creation</b>. This involves signing up on our platform using your email address or social media accounts. Once you’ve created an account, you will receive a confirmation email with a link to activate your account. Upon activation, you’ll be prompted to complete your profile, which includes setting up your preferences, adding any necessary payment information, and selecting the initial features or modules you wish to use.</p>
                            <p>Next, you will be introduced to our <b>setup wizard</b>, which is designed to guide you through the basic configuration of the platform. The wizard will help you configure essential settings such as language, time zone, and notifications.</p>
                            <p><a class="o_translate_inline" href="#">Read More <i class="fa fa-angle-right" role="img"/></a></p>
                        </span>
                    </article>
                </div>
                <div data-name="Topic" class="s_faq_horizontal_entry col-12 mb-2 pt16 pb32">
                    <article class="row">
                        <hgroup class="col-lg-4" role="heading" aria-level="3">
                            <div class="s_faq_horizontal_entry_title position-lg-sticky pb-lg-3 transition-base overflow-auto" style="top: 16px">
                                <h3 class="h5-fs">Updates and Improvements</h3>
                                <p class="o_small-fs text-muted">We are committed to continuous improvement, regularly releasing updates and new features based on user feedback and technological advancements.</p>
                            </div>
                        </hgroup>
                        <span class="col-lg-7 offset-lg-1 d-block">
                            <p>Our development team works tirelessly to enhance the platform's performance, security, and functionality, ensuring it remains at the cutting edge of innovation.</p>
                            <p>Each update is thoroughly tested to guarantee compatibility and reliability, and we provide detailed release notes to keep you informed of new features and improvements. </p>
                            <div data-snippet="s_chart" data-name="Chart" class="s_chart o_draggable" data-type="line" data-legend-position="top" data-tooltip-display="true" data-stacked="false" data-border-width="1" data-data="{&quot;labels&quot;:[&quot;v15&quot;,&quot;v16&quot;,&quot;v17&quot;,&quot;v18&quot;],&quot;datasets&quot;:[{&quot;label&quot;:&quot;Improvements&quot;,&quot;data&quot;:[&quot;12&quot;,&quot;24&quot;,&quot;48&quot;,&quot;200&quot;],&quot;backgroundColor&quot;:&quot;o-color-1&quot;,&quot;borderColor&quot;:&quot;o-color-1&quot;}]}" data-max-value="250" data-ticks-min="NaN" data-ticks-max="250">
                                <canvas height="0"/>
                            </div>
                            <!-- Graph's preview: removed automatically on drop  -->
                            <img src="/website/static/src/img/snippets_previews/s_faq_horizontal_2_preview.webp" class="s_dialog_preview w-100" alt=""/>
                            <!-- ==============================================  -->
                            <p><br/>Users can participate in beta testing programs, providing feedback on upcoming releases and influencing the future direction of the platform. By staying current with updates, you can take advantage of the latest tools and features, ensuring your business remains competitive and efficient.</p>
                        </span>
                    </article>
                </div>
                <div data-name="Topic" class="s_faq_horizontal_entry col-12 mb-2 pt16 pb32">
                    <article class="row">
                        <hgroup class="col-lg-4" role="heading" aria-level="3">
                            <div class="s_faq_horizontal_entry_title position-lg-sticky pb-lg-3 transition-base overflow-auto" style="top: 16px">
                                <h3 class="h5-fs">Support and Resources</h3>
                                <p class="o_small-fs text-muted">We are committed to providing exceptional support and resources to help you succeed with our platform.</p>
            …

- kind=other id=789 key=website.s_faq_list name=FAQ List active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="FAQ List" t-name="website.s_faq_list">
    <section class="s_faq_list pt56 pb64">
        <div class="container">
            <h2 class="h3-fs">Need help?</h2>
            <p class="lead">In this section, you can address common questions efficiently.</p>
            <p><br/></p>
            <div class="row">
                <div class="col-lg-4 pt16 pb16">
                    <h3 class="h6-fs"><strong>What sets us apart?</strong></h3>
                    <p>We deliver personalized solutions, ensuring that every customer receives top-tier service tailored to their needs.</p>
                </div>
                <div class="col-lg-4 pt16 pb16">
                    <h3 class="h6-fs"><strong>Is the website user-friendly?</strong></h3>
                    <p>Our website is designed for easy navigation, allowing you to find the information you need quickly and efficiently.</p>
                </div>
                <div class="col-lg-4 pt16 pb16">
                    <h3 class="h6-fs"><strong>Can you trust our partners?</strong></h3>
                    <p>We collaborate with trusted, high-quality partners to bring you reliable and top-notch products and services.</p>
                </div>
                <div class="col-lg-4 pt16 pb16">
                    <h3 class="h6-fs"><strong>What support do we offer?</strong></h3>
                    <p>We provide 24/7 support through various channels, including live chat, email, and phone, to assist with any queries.</p>
                </div>
                <div class="col-lg-4 pt16 pb16">
                    <h3 class="h6-fs"><strong>How is your data secured?</strong></h3>
                    <p>Your data is protected by advanced encryption and security protocols, keeping your personal information safe.</p>
                </div>
                <div class="col-lg-4 pt16 pb16">
                    <h3 class="h6-fs"><strong>Are links to other websites approved?</strong></h3>
                    <p>Although this Website may be linked to other websites, we are not, directly or indirectly, implying any approval.</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=744 key=website.s_features name=Features active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Features" t-name="website.s_features">
    <section class="s_features pt64 pb64">
        <div class="container">
            <h2 class="h3-fs">Everything you need</h2>
            <p class="lead">List and describe the key features of your solution or service.</p>
            <div class="row">
                <div class="col-lg-4">
                    <div class="s_hr pt-4 pb32">
                        <hr class="w-100 mx-auto"/>
                    </div>
                    <i class="s_features_icon fa fa-paper-plane-o mb-3 rounded bg-o-color-3" role="img"/>
                    <div class="overflow-hidden">
                        <h3 class="h5-fs">Reliability</h3>
                        <p>Consistent performance and uptime ensure efficient, reliable service with minimal interruptions and quick response times.</p>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="s_hr pt-4 pb32">
                        <hr class="w-100 mx-auto"/>
                    </div>
                    <i class="s_features_icon fa fa-credit-card mb-3 rounded bg-o-color-3" role="img"/>
                    <div class="overflow-hidden">
                        <h3 class="h5-fs">Performance</h3>
                        <p>Speed and efficiency ensure tasks are completed quickly and resources are used optimally, enhancing productivity and satisfaction.</p>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="s_hr pt-4 pb32">
                        <hr class="w-100 mx-auto"/>
                    </div>
                    <i class="s_features_icon fa fa-flag-o mb-3 rounded bg-o-color-3" role="img"/>
                    <div class="overflow-hidden">
                        <h3 class="h5-fs">Scalability</h3>
                        <p>Growth capability is a system's ability to scale and adapt, meeting increasing demands and evolving needs for long-term success.</p>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=791 key=website.s_features_grid name=Features Grid active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Features Grid" t-name="website.s_features_grid">
    <section class="s_features_grid pt64 pb64" data-vcss="001">
        <div class="container">
            <div class="row">
                <div class="col-lg-6 s_col_no_bgcolor pb24">
                    <div class="row">
                        <div class="col-lg-12" data-name="Box">
                            <h2 class="h3-fs">Core Features</h2>
                            <p class="lead h5-fs">Essential tools for your success.</p>
                            <div class="s_hr pt32 pb-2">
                                <hr class="w-100 mx-auto"/>
                            </div>
                        </div>
                        <div class="col-lg-12 py-3" data-name="Box">
                            <i class="fa fa-flag-o rounded bg-o-color-3 s_features_grid_icon float-start flex-shrink-0" role="img"/>
                            <div class="s_features_grid_content mb-0 d-flex flex-column">
                                <h3 class="h5-fs">Change Icons</h3>
                                <p>Double click an icon to replace it with one of your choice.</p>
                            </div>
                        </div>
                        <div class="col-lg-12 py-3" data-name="Box">
                            <i class="fa fa-files-o rounded bg-o-color-3 s_features_grid_icon float-start flex-shrink-0" role="img"/>
                            <div class="s_features_grid_content d-flex flex-column">
                                <h3 class="h5-fs">Duplicate</h3>
                                <p>Duplicate blocks and columns to add more features.</p>
                            </div>
                        </div>
                        <div class="col-lg-12 py-3" data-name="Box">
                            <i class="fa fa-trash-o rounded bg-o-color-3 s_features_grid_icon float-start flex-shrink-0" role="img"/>
                            <div class="s_features_grid_content d-flex flex-column">
                                <h3 class="h5-fs">Delete Blocks</h3>
                                <p>Select and delete blocks to remove features.</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6 s_col_no_bgcolor pb24">
                    <div class="row">
                        <div class="col-lg-12" data-name="Box">
                            <h2 class="h3-fs">Foundation Package</h2>
                            <p class="lead h5-fs">Everything you need to get started.</p>
                            <div class="s_hr pt32 pb-2">
                                <hr class="w-100 mx-auto"/>
                            </div>
                        </div>
                        <div class="col-lg-12 py-3" data-name="Box">
                            <i class="fa fa-magic rounded bg-o-color-3 s_features_grid_icon float-start flex-shrink-0" role="img"/>
                            <div class="s_features_grid_content d-flex flex-column">
                                <h3 class="h5-fs">Great Value</h3>
                                <p>Turn every feature into a benefit for your reader.</p>
                            </div>
                        </div>
                        <div class="col-lg-12 py-3" data-name="Box">
                            <i class="fa fa-eyedropper rounded bg-o-color-3 s_features_grid_icon float-start flex-shrink-0" role="img"/>
                            <div class="s_features_grid_content d-flex flex-column">
                                <h3 class="h5-fs">Edit Styles</h3>
                                <p>You can edit colors and backgrounds to highlight features.</p>
                            </div>
                        </div>
                        <div class="col-lg-12 py-3" data-name="Box">
                            <i class="fa fa-picture-o rounded bg-o-color-3 s_features_grid_icon float-start flex-shrink-0" role="img"/>
                            <div class="s_features_grid_content d-flex flex-column">
                                <h3 class="h5-fs">Sample Icons</h3>
                                <p>All these icons are completely free for commercial use.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=745 key=website.s_features_wall name=Features Wall active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Features Wall" t-name="website.s_features_wall">
    <section class="s_features_wall pt56 pb56" data-oe-shape-data="{'shape':'html_builder/Grids/02','colors':{'c5':'rgba(0,0,0,0.25)'},'flip':['x'],'showOnMobile':false,'shapeAnimationSpeed':'0'}">
        <div class="o_we_shape o_html_builder_Grids_02" style="background-image: url('/html_editor/shape/html_builder/Grids/02.svg?c5=rgba(0,0,0,0.25)&amp;flip=x'); background-position: 0 50%;"/>
        <div class="container">
            <div class="row o_grid_mode" data-row-count="21">
                <div class="o_grid_item g-height-21 g-col-lg-5 col-lg-5" style="z-index: 1; grid-area: 1 / 1 / 22 / 6; --grid-item-padding-y: 0px; --grid-item-padding-x: 16px;">
                    <h2 class="display-3-fs">Unveil Our Exclusive Collections</h2>
                    <p class="lead">Write one or two paragraphs describing your product or services. To be successful your content needs to be useful to your readers.</p>
                </div>
                <div class="o_grid_item o_grid_item_image g-height-6 g-col-lg-3 col-lg-3" style="z-index: 2; grid-area: 1 / 7 / 7 / 10; --grid-item-padding-y: 0px; --grid-item-padding-x: 16px;">
                    <img class="img img-fluid" src="/web/image/website.library_image_16" alt=""/>
                </div>
                <div class="o_grid_item g-height-4 g-col-lg-3 col-lg-3 s_col_no_bgcolor" style="z-index: 3; grid-area: 7 / 7 / 11 / 10; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <h3 class="h5-fs">Expertise and Knowledge</h3>
                    <p>We offer cutting-edge products and services to tackle modern challenges. Leveraging the latest technology, we help you achieve your goals.</p>
                </div>
                <div class="o_grid_item o_grid_item_image g-height-6 g-col-lg-3 col-lg-3" style="z-index: 4; grid-area: 12 / 7 / 18 / 10; --grid-item-padding-y: 0px; --grid-item-padding-x: 16px;">
                    <img class="img img-fluid" src="/web/image/website.library_image_03" alt=""/>
                </div>
                <div class="o_grid_item g-height-4 g-col-lg-3 col-lg-3 s_col_no_bgcolor" style="z-index: 5; grid-area: 18 / 7 / 22 / 10; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <h3 class="h5-fs">Tailored Solutions</h3>
                    <p>Customer satisfaction is our priority. Our support team is always ready to assist, ensuring you have a smooth and successful experience.</p>
                </div>
                <div class="o_grid_item o_grid_item_image g-height-6 g-col-lg-3 col-lg-3" style="z-index: 6; grid-area: 6 / 10 / 12 / 13; --grid-item-padding-y: 0px; --grid-item-padding-x: 16px;">
                    <img class="img img-fluid" src="/web/image/website.library_image_13" alt=""/>
                </div>
                <div class="o_grid_item g-height-4 g-col-lg-3 col-lg-3 s_col_no_bgcolor" style="z-index: 7; grid-area: 12 / 10 / 16 / 13; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <h3 class="h5-fs">Quality and Excellence</h3>
                    <p>With extensive experience and deep industry knowledge, we provide insights and solutions that keep you ahead of the curve.</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=792 key=website.s_features_wave name=Features Wave active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Features Wave" t-name="website.s_features_wave">
    <section class="s_features_wave o_cc o_cc5 pt64 pb88" data-oe-shape-data="{'shape':'html_builder/Wavy/11_001','colors':{'c5':'o-color-1'}, 'showOnMobile':true}">
        <div class="o_we_shape o_html_builder_Wavy_11_001 o_shape_show_mobile" style="background-image: url('/html_editor/shape/html_builder/Wavy/11_001.svg?c5=o-color-1');"/>
        <div class="container">
            <h2 class="h3-fs" style="text-align: center;">Everything you need</h2>
            <p class="lead" style="text-align: center;">List and describe the key features of your solution or service.</p>
            <p><br/></p>
            <div class="row">
                <div class="col-lg-4 pt24 pb24">
                    <i class="fa fa-thumbs-o-up d-block mx-auto border rounded fa-2x" style="background-color: rgba(0, 0, 0, 0);" role="presentation"/>
                    <br/>
                    <h4 style="text-align: center;">Reliability</h4>
                    <p style="text-align: center;">Consistent performance and uptime ensure efficient, reliable service with minimal interruptions and quick response times.</p>
                </div>
                <div class="col-lg-4 pt24 pb24">
                    <i class="fa fa-star-o d-block mx-auto border rounded fa-2x" style="background-color: rgba(0, 0, 0, 0);" role="presentation"/>
                    <br/>
                    <h4 style="text-align: center;">Performance</h4>
                    <p style="text-align: center;">Speed and efficiency ensure tasks are completed quickly and resources are used optimally, enhancing productivity and satisfaction.</p>
                </div>
                <div class="col-lg-4 pt24 pb24">
                    <i class="fa fa-flag-o d-block mx-auto border rounded fa-2x" style="background-color: rgba(0, 0, 0, 0);" role="presentation"/>
                    <br/>
                    <h4 style="text-align: center;">Scalability</h4>
                    <p style="text-align: center;">Growth capability is a system's ability to scale and adapt, meeting increasing demands and evolving needs for long-term success.</p>
                </div>
                <div class="col-lg-4 pt24 pb24">
                    <i class="fa fa-edit d-block mx-auto border rounded fa-2x" style="background-color: rgba(0, 0, 0, 0);" role="presentation"/>
                    <br/>
                    <h4 style="text-align: center;">Customizable Settings</h4>
                    <p style="text-align: center;">Tailor the platform to your needs, offering flexibility and control over your user experience.</p>
                </div>
                <div class="col-lg-4 pt24 pb24">
                    <i class="fa fa-user-o d-block mx-auto border rounded fa-2x" style="background-color: rgba(0, 0, 0, 0);" role="presentation"/>
                    <br/>
                    <h4 style="text-align: center;">User-Friendly Interface</h4>
                    <p style="text-align: center;">The intuitive design ensures smooth navigation, enhancing user experience without needing technical expertise.</p>
                </div>
                <div class="col-lg-4 pt24 pb24">
                    <i class="fa fa-smile-o d-block mx-auto border rounded fa-2x" style="background-color: rgba(0, 0, 0, 0);" role="presentation"/>
                    <br/>
                    <h4 style="text-align: center;">24/7 Customer Support</h4>
                    <p style="text-align: center;">Round-the-clock assistance is available, ensuring issues are resolved quickly, keeping your operations running smoothly.</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=819 key=website.s_floating_blocks name=Floating Cards active=True website=null inherit=null
  signals: hrefs_total=3 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Floating Cards" t-name="website.s_floating_blocks">
    <section class="s_floating_blocks pt32 pb32 o_cc o_cc2">
        <div class="container">
            <div class="d-flex flex-column gap-5">
                <div class="s_floating_blocks_wrapper s_floating_blocks_wrapper_shadow d-contents rounded-4">

                    <section data-name="Card" class="s_floating_blocks_block s_col_no_resize position-sticky py-5 py-lg-0 d-flex o_cc o_cc5 oe_img_bg o_bg_img_center o_background_video" data-bg-video-src="https://player.vimeo.com/video/329369394?autoplay=1&amp;muted=1&amp;autopause=0&amp;controls=0&amp;loop=1" style="background-image: url('/web/image/website.s_floating_blocks_3')">
                        <div class="o_we_bg_filter bg-black-25"/>
                        <div class="container-fluid align-self-end align-self-lg-center">
                            <div class="s_floating_blocks_block_grid oe_unremovable row mx-0 o_grid_mode" data-row-count="8">
                                <div class="o_grid_item g-height-4 g-col-lg-8 col-lg-8 order-lg-0" style="z-index: 1; grid-area: 1 / 1 / 5 / 9;">
                                    <p class="lead">Introducing</p>
                                    <h2 class="display-4-fs">Your New <br class="d-none d-lg-inline"/>
                                        Workspace
                                    </h2>
                                </div>

                                <div class="o_grid_item g-height-2 g-col-lg-4 col-lg-4" style="z-index: 2; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px; grid-area: 7 / 1 / 9 / 5;">
                                    <a t-att-href="shop_btn_href" title="" role="button" class="btn btn-lg btn-secondary">Shop Desks</a>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section data-name="Card" class="s_floating_blocks_block s_col_no_resize position-sticky parallax py-5 py-lg-0 d-flex o_cc o_cc5" data-scroll-background-ratio="-2">
                        <span class="s_parallax_bg_wrap">
                            <span class="s_parallax_bg oe_img_bg o_bg_img_center" style="background-image: url('/web/image/website.s_floating_blocks_1'); background-position: top center"/>
                        </span>
                        <div class="o_we_bg_filter bg-black-25"/>
                        <div class="container-fluid align-self-start align-self-lg-center">
                            <div class="s_floating_blocks_block_grid oe_unremovable row mx-0 o_grid_mode" data-row-count="8">
                                <div class="o_grid_item g-height-4 g-col-lg-8 col-lg-8 order-lg-0" style="z-index: 1; grid-area: 1 / 1 / 5 / 9;">
                                    <p class="lead">Sofas made to last.</p>
                                    <h2 class="display-4-fs">Jump Into <br class="d-none d-lg-inline"/>
                                        Comfort!
                                    </h2>
                                </div>
                                <div class="o_grid_item g-height-2 g-col-lg-4 col-lg-4" style="z-index: 2; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px; grid-area: 7 / 1 / 9 / 5;">
                                    <a t-att-href="shop_btn_href" title="" role="button" class="btn btn-lg btn-secondary">Shop Sofas</a>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section data-name="Card" class="s_floating_blocks_block s_col_no_resize position-sticky parallax py-5 py-lg-0 d-flex o_cc o_cc5" data-scroll-background-ratio="-2">
                        <span class="s_parallax_bg_wrap">
                            <span class="s_parallax_bg oe_img_bg" style="background-image: url('/web/image/website.s_floating_blocks_2'); background-position: 50% 50%;"/>
                        </span>
                        <div class="container-fluid align-self-start align-self-lg-center">
                            <div class="s_floating_blocks_block_grid oe_unremovable row mx-0 o_grid_mode" data-row-count="8">
                                <div class="o_grid_item g-height-4 g-col-lg-8 col-lg-8 order-lg-0" style="z-index: 1; grid-area: 1 / 1 / 5 / 9;">
                                    <h2 class="display-4-fs">Get things sorted</h2>
                                    <p>Looking for a quick and easy way to organize repeat orders?<br/>
                                        It's just one of the ways we support our members.
                                    </p>
                                </div>
                                <div class="o_grid_item g-height-2 g-col-lg-4 col-lg-4" style="z-index: 2; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px; grid-area: 7 / 1 / 9 / 5;">
                                    <a href="#" title="" role="button" class="btn btn-lg btn-secondary">Contact Us</a>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=902 key=website.s_form_aside name=Form Aside active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Form Aside" t-name="website.s_form_aside">
    <section class="s_form_aside pt64 pb64">
        <div class="container">
            <div class="row">
                <div class="col-12 col-lg-6 order-lg-0" style="order: 1;">
                    <h2>Contact us</h2>
                    <p class="lead">Chat with us through or fill in this form to get information about anything related to Odoo apps, services, our company.</p>
                    <t t-snippet-call="website.s_website_form" string="Form"/>
                </div>
                <div class="col-12 col-lg-5 offset-lg-1 pt0 pb32 order-lg-0" style="order: 0;">
                    <img src="/web/image/website.s_form_aside_default_image" class="img img-fluid rounded" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=729 key=website.s_framed_intro name=Framed Intro active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Framed Intro" t-name="website.s_framed_intro">
    <section class="s_framed_intro pt56 pb56">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="14">
                <div class="o_grid_item g-col-lg-6 g-height-10 col-lg-6" style="grid-area: 1 / 1 / 11 / 7; z-index: 1; order:2;">
                    <h1 class="display-4">Experience<br/>the World's Best<br/><strong>Quality Services</strong></h1>
                </div>
                <div class="o_grid_item g-col-lg-6 g-height-4 col-lg-6 align-content-end" style="grid-area: 11 / 1 / 15 / 7; z-index: 2; order:3;">
                    <p class="lead">This is a simple hero unit, a simple jumbotron-style component for calling extra attention to featured content or information.</p>
                    <p style="text-align: left;">
                        <a t-att-href="cta_btn_href" class="btn btn-lg btn-primary o_translate_inline">Discover</a>
                    </p>
                </div>
                <div class="o_grid_item g-col-lg-5 g-height-14 col-lg-5 o_grid_item_image o_cc o_cc2 order-lg-0" style="grid-area: 1 / 8 / 15 / 13; z-index: 3; --grid-item-padding-y: 32px; --grid-item-padding-x: 32px; order:1;">
                    <img class="img img-fluid" style="width: 100% !important" src="/web/image/website.s_framed_intro_default_image" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=885 key=website.s_freegrid name=Free grid active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Free grid" t-name="website.s_freegrid">
    <section class="s_freegrid o_cc o_cc1 pt64 pb64">
        <div class="container-fluid">
            <div class="row o_grid_mode" data-row-count="16">
                <div class="o_grid_item o_grid_item_image g-col-lg-1 g-height-8 col-lg-1 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 1; grid-area: 2 / 1 / 10 / 2; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img class="img img-fluid mx-auto" src="/web/image/website.library_image_03" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-3 g-height-5 col-lg-3 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 2; grid-area: 1 / 2 / 6 / 5; --grid-item-padding-y: 8px; --grid-item-padding-x: 16px;">
                    <img class="img img-fluid mx-auto" src="/web/image/website.library_image_13" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-3 g-height-5 col-lg-3 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 3; grid-area: 6 / 2 / 11 / 5; --grid-item-padding-y: 8px; --grid-item-padding-x: 16px;">
                    <img class="img img-fluid mx-auto" src="/web/image/website.library_image_10" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-3 g-height-8 col-lg-3 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 4; grid-area: 2 / 5 / 10 / 8; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img class="img img-fluid mx-auto" src="/web/image/website.library_image_05" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-3 g-height-10 col-lg-3" style="z-index: 5; grid-area: 1 / 8 / 11 / 11; --grid-item-padding-y: 8px; --grid-item-padding-x: 16px;">
                    <img class="img img-fluid mx-auto" src="/web/image/website.library_image_14" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-2 g-height-8 col-lg-2 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 6; grid-area: 2 / 11 / 10 / 13; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img class="img img-fluid mx-auto" src="/web/image/website.library_image_16" alt=""/>
                </div>
                <div class="o_grid_item g-height-5 g-col-lg-7 col-lg-7" style="z-index: 7; grid-area: 12 / 2 / 17 / 9; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <h2 style="text-align: left;">A deep dive into what makes our products innovative</h2>
                    <p class="lead" style="text-align: left;">Write one or two paragraphs describing your product or services. To be successful your content needs to be useful to your readers. Start with the customer – find out what they want and give it to them.</p>
                </div>
                <div class="o_grid_item g-height-2 g-col-lg-3 col-lg-3" style="z-index: 8; grid-area: 12 / 9 / 14 / 12; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <p style="text-align: right;">
                        <a href="#" class="btn btn-primary btn-lg o_translate_inline">Learn more</a>
                    </p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=870 key=website.s_google_map name=Google Map active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Google Map" t-name="website.s_google_map">
    <section class="s_google_map pt256 pb256 o_not_editable" data-map-type="ROADMAP" data-map-color="" data-map-zoom="12" data-map-gps="(50.854975,4.3753899)" data-pin-style="flat" data-vxml="001">
        <div class="map_container"/>
    </section>
</t>

- kind=other id=762 key=website.s_hr name=Separator active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Separator" t-name="website.s_hr">
    <div class="s_hr pt32 pb32">
        <hr class="w-100 mx-auto"/>
    </div>
</t>

- kind=other id=888 key=website.s_icon name=Icon active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Icon" t-name="website.s_icon">
    <div class="s_icon">
        <span class="fa fa-heart"/>
    </div>
</t>

- kind=other id=887 key=website.s_image name=Image active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Image" t-name="website.s_image">
    <div class="s_image rounded border d-inline-flex justify-content-center align-items-center bg-100 opacity-50 w-100 ratio ratio-16x9" style="max-width: 50vw">
        <svg xmlns="http://www.w3.org/2000/svg" width="12em" height="7em" viewBox="0 0 120 120" fill="none">
            <rect width="120" height="120"/>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M33.2503 38.4816C33.2603 37.0472 34.4199 35.8864 35.8543 35.875H83.1463C84.5848 35.875 85.7503 37.0431 85.7503 38.4816V80.5184C85.7403 81.9528 84.5807 83.1136 83.1463 83.125H35.8543C34.4158 83.1236 33.2503 81.957 33.2503 80.5184V38.4816ZM80.5006 41.1251H38.5006V77.8751L62.8921 53.4783C63.9172 52.4536 65.5788 52.4536 66.6039 53.4783L80.5006 67.4013V41.1251ZM43.75 51.6249C43.75 54.5244 46.1005 56.8749 49 56.8749C51.8995 56.8749 54.25 54.5244 54.25 51.6249C54.25 48.7254 51.8995 46.3749 49 46.3749C46.1005 46.3749 43.75 48.7254 43.75 51.6249Z" opacity="0.4" fill="currentColor"/>
        </svg>
    </div>
</t>

- kind=other id=898 key=website.s_image_frame name=Image Frame active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Image Frame" t-name="website.s_image_frame">
    <section class="s_image_frame o_colored_level o_cc o_cc1 pt64 pb64">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="11">
                <div class="o_grid_item o_grid_item_image g-height-11 g-col-lg-12 col-lg-12 order-lg-0 rounded overflow-hidden" style="grid-area: 1 / 1 / 12 / 13; --grid-item-padding-x: 0px; --grid-item-padding-y: 0px; border-radius: 6.4px !important; order: 1;">
                    <img src="/web/image/website.s_image_frame_default_image" class="img img-fluid mx-auto" style="padding: 16px;" alt=""/>
                </div>
                <div class="o_grid_item g-height-4 g-col-lg-5 col-10 offset-1 col-lg-5 offset-lg-0 order-lg-0 rounded o_cc o_cc1" style="z-index: 1; grid-area: 7 / 7 / 11 / 12; --grid-item-padding-x: 32px; order: 0;">
                    <h2 class="h3-fs">Product highlight</h2>
                    <p class="lead">Choose a vibrant image and write an inspiring paragraph about it. It does not have to be long, but it should reinforce your image.</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=765 key=website.s_image_gallery name=Image Gallery active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Image Gallery" t-name="website.s_image_gallery">
    <section class="s_image_gallery o_slideshow pt24 pb24 s_image_gallery_controllers_outside s_image_gallery_controllers_outside_arrows_right s_image_gallery_indicators_dots s_image_gallery_arrows_default o_image_popup" data-vcss="002" data-columns="3">
        <div class="o_container_small overflow-hidden">
            <div id="slideshow_sample" class="carousel carousel-dark slide" data-bs-ride="carousel" data-bs-interval="0">
                <div class="carousel-inner">
                    <div class="carousel-item active">
                        <img class="img img-fluid d-block mh-100 mw-100 mx-auto rounded object-fit-cover" src="/web/image/website.library_image_08" data-name="Image" data-index="0" alt=""/>
                    </div>
                    <div class="carousel-item">
                        <img class="img img-fluid d-block mh-100 mw-100 mx-auto rounded object-fit-cover" src="/web/image/website.library_image_03" data-name="Image" data-index="1" alt=""/>
                    </div>
                    <div class="carousel-item">
                        <img class="img img-fluid d-block mh-100 mw-100 mx-auto rounded object-fit-cover" src="/web/image/website.library_image_02" data-name="Image" data-index="2" alt=""/>
                    </div>
                </div>
                <div class="o_carousel_controllers">
                    <button class="carousel-control-prev o_not_editable" contenteditable="false" t-attf-data-bs-target="#slideshow_sample" data-bs-slide="prev" aria-label="Previous" title="Previous">
                        <span class="carousel-control-prev-icon" aria-hidden="true"/>
                        <span class="visually-hidden">Previous</span>
                    </button>
                    <div class="carousel-indicators">
                        <button type="button" data-bs-target="#slideshow_sample" data-bs-slide-to="0" style="background-image: url(/web/image/website.library_image_08)" class="active" aria-label="Carousel indicator"/>
                        <button type="button" style="background-image: url(/web/image/website.library_image_03)" data-bs-target="#slideshow_sample" data-bs-slide-to="1" aria-label="Carousel indicator"/>
                        <button type="button" style="background-image: url(/web/image/website.library_image_02)" data-bs-target="#slideshow_sample" data-bs-slide-to="2" aria-label="Carousel indicator"/>
                    </div>
                    <button class="carousel-control-next o_not_editable" contenteditable="false" t-attf-data-bs-target="#slideshow_sample" data-bs-slide="next" aria-label="Next" title="Next">
                        <span class="carousel-control-next-icon" aria-hidden="true"/>
                        <span class="visually-hidden">Next</span>
                    </button>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=893 key=website.s_image_hexagonal name=Image Hexagonal active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Image Hexagonal" t-name="website.s_image_hexagonal">
    <section class="s_image_hexagonal">
        <div class="container-fluid">
            <div class="row o_grid_mode" data-row-count="14">
                <div class="o_grid_item o_grid_item_image g-col-lg-4 g-height-9 col-lg-4" style="grid-area: 3 / 2 / 12 / 6; z-index: 1;">
                    <img src="/html_editor/image_shape/website.s_image_hexagonal_default_image_1/html_builder/geometric/geo_hexagon.svg" class="img img-fluid" data-shape="html_builder/geometric/geo_hexagon" data-file-name="s_image_text.webp" data-format-mimetype="image/webp" alt=""/>
                </div>
                <div class="o_grid_item g-col-lg-4 g-height-10 col-lg-4" style="grid-area: 3 / 5 / 13 / 9; z-index: 2;">
                    <h2 class="display-4-fs">Empowering<br/>Innovative<br/>Solutions</h2>
                    <p>Write one or two paragraphs describing your product or services. To be successful your content needs to be useful to your readers.</p>
                    <p>Start with the customer – find out what they want and give it to them.</p>
                    <p>
                        <a t-att-href="cta_btn_href" class="btn btn-primary btn-lg o_translate_inline">Contact Us</a>
                    </p>
                </div>
                <div class="o_grid_item o_grid_item_image o_snippet_mobile_invisible g-col-lg-4 g-height-14 col-lg-4 d-none d-lg-block" style="grid-area: 1 / 9 / 15 / 13; z-index: 3; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img src="/web/image/website.s_image_hexagonal_default_image" class="img img-fluid" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=749 key=website.s_image_punchy name=Image Punchy active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Image Punchy" t-name="website.s_image_punchy">
    <section class="s_image_punchy o_cc o_cc2 pt64 pb64">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="13">
                <div class="o_grid_item o_grid_item_image g-height-11 g-col-lg-12 col-lg-12" style="grid-area: 1 / 1 / 12 / 13; z-index: 1">
                    <img src="/web/image/website.s_image_punchy_default_image" class="figure-img img-fluid rounded" alt=""/>
                </div>
                <div class="o_grid_item g-height-5 g-col-lg-7 col-lg-7" style="grid-area: 9 / 6 / 14 / 13; z-index: 2;">
                    <h2 class="display-1-fs" style="text-align: right;">A PUNCHY HEADLINE</h2>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=736 key=website.s_image_text name=Image - Text active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Image - Text" t-name="website.s_image_text">
    <section class="s_text_image pt80 pb80">
        <div class="container">
            <div class="row align-items-center">
                <div class="col-lg-6 pt16 pb16">
                    <img src="/web/image/website.s_image_text_default_image" class="img img-fluid mx-auto rounded" alt=""/>
                </div>
                <div class="col-lg-5 offset-lg-1 pt16 pb16">
                    <h2 class="h3-fs">Discover New <strong>Opportunities</strong></h2>
                    <p>Write one or two paragraphs describing your product or services. To be successful your content needs to be useful to your readers.</p>
                    <p>Start with the customer – find out what they want and give it to them.</p>
                    <p><a href="#" class="btn btn-secondary o_translate_inline">Learn more</a></p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=949 key=website.s_image_text_2nd name=s_image_text_2nd active=True website=null inherit={"id": 943, "name": "new_page_template_s_image_text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="data-snippet">s_image_text</attribute>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_image_text_2nd</attribute></xpath></data>

- kind=other id=733 key=website.s_image_text_box name=Image Text Box active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Image Text Box" t-name="website.s_image_text_box">
    <section class="s_image_text_box o_colored_level pt80 pb80" data-oe-shape-data="{'shape': 'html_builder/Connections/08'}">
        <div class="o_we_shape o_html_builder_Connections_08"/>
        <div class="container">
            <div class="row o_grid_mode" data-row-count="10" style="column-gap: 24px;">
                <div class="o_grid_item o_grid_item_image g-col-lg-6 g-height-10 col-lg-6" style="grid-area: 1 / 1 / 11 / 7; z-index: 1; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px; order:2;">
                    <img src="/web/image/website.s_text_cover_default_image" class="img img-fluid rounded order-lg-0" alt=""/>
                </div>
                <div class="o_grid_item o_cc o_cc2 g-col-lg-6 g-height-10 col-lg-6 rounded order-lg-0" style="grid-area: 1 / 7 / 11 / 13; z-index: 2; --grid-item-padding-y: 140px; --grid-item-padding-x: 48px; order:1;">
                    <h2 class="h3-fs">Learn about our offerings</h2>
                    <p>Write one or two paragraphs describing your product or services. To be successful your content needs to be useful to your readers.</p>
                    <p>Start with the customer – find out what they want and give it to them.</p>
                    <p class="mb-0"><a href="#" class="btn btn-primary o_translate_inline">Learn more</a></p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=739 key=website.s_image_text_overlap name=Image - Text Overlap active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Image - Text Overlap" t-name="website.s_image_text_overlap">
    <section class="s_image_text_overlap pt64 pb64">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="9">
                <div class="o_grid_item o_grid_item_image order-lg-0 g-col-lg-7 g-height-9 col-lg-7" style="grid-area: 1 / 1 / 10 / 8; --grid-item-padding-y: 0; z-index: 1; order: 2;">
                    <img src="/web/image/website.s_picture_default_image" class="img img-fluid mx-auto rounded" alt=""/>
                </div>
                <div class="o_grid_item order-lg-0 g-col-lg-6 g-height-7 col-lg-6 o_cc o_cc5 rounded" style="grid-area: 2 / 7 / 9 / 13; --grid-item-padding-y: 56px; --grid-item-padding-x: 40px; z-index: 2; order: 1;">
                    <h2 class="h3-fs">Services we offer</h2>
                    <p>Write one or two paragraphs describing your product or services. To be successful your content needs to be useful to your readers.</p>
                    <p>Start with the customer – find out what they want and give it to them.</p>
                    <p><a href="#" class="btn btn-secondary o_translate_inline">Learn more</a></p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=833 key=website.s_image_title name=Image Title active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Image Title" t-name="website.s_image_title">
    <section class="s_image_title o_cc o_cc5 oe_img_bg pt32 pb32" style="background-image: url('/web/image/website.s_image_title_default_image'); background-position: 50% 70%;">
        <div class="o_we_bg_filter bg-black-50"/>
        <div class="container">
            <div class="row o_grid_mode" data-row-count="9">
                <div class="o_grid_item g-height-9 g-col-lg-8 col-lg-8" style="--grid-item-padding-y: 32px; grid-area: 1 / 1 / 10 / 9; z-index: 1;">
                    <h1 class="display-3">A Deep Dive into Innovation and Excellence</h1>
                </div>
                <div class="o_grid_item g-height-3 g-col-lg-7 col-lg-7" style="--grid-item-padding-y: 24px; grid-area: 7 / 6 / 10 / 13; z-index: 2;">
                    <p class="lead" style="text-align: end;">Transform your environment with our new design collection, where elegance meets functionality. Elevate your space with pieces that blend style and comfort seamlessly.</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=796 key=website.s_images_constellation name=Images Constellation active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Images Constellation" t-name="website.s_images_constellation">
    <section class="s_images_constellation o_cc o_cc5 pt48 pb48">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="23">
                <div class="o_grid_item o_grid_item_image g-col-lg-3 g-height-4 col-lg-3 d-none d-lg-block o_snippet_mobile_invisible" style="z-index: 1; grid-area: 3 / 6 / 7 / 9; --grid-item-padding-x: 0px; --grid-item-padding-y: 0px;">
                    <img class="img img-fluid mx-auto rounded" src="/web/image/website.s_carousel_default_image_2" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-4 g-height-6 col-12 col-lg-4" style="z-index: 2; grid-area: 7 / 1 / 13 / 5; --grid-item-padding-x: 16px; --grid-item-padding-y: 0px;">
                    <img class="img img-fluid mx-auto rounded" src="/web/image/website.s_picture_default_image" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-4 g-height-6 col-lg-4 d-none d-lg-block o_snippet_mobile_invisible" style="z-index: 3; grid-area: 7 / 9 / 13 / 13; --grid-item-padding-x: 0px; --grid-item-padding-y: 24px;">
                    <img class="img img-fluid mx-auto rounded" alt="" data-shape="html_builder/geometric/geo_sonar" data-file-name="s_images_constellation_default_image.jpg" data-format-mimetype="image/jpeg" src="/html_editor/image_shape/website.s_images_constellation_default_image/html_builder/geometric/geo_sonar.svg"/>
                </div>
                <div class="o_grid_item g-height-4 g-col-lg-6 col-12 col-lg-6" style="z-index: 6; grid-area: 12 / 5 / 16 / 11; --grid-item-padding-x: 16px; --grid-item-padding-y: 16px;">
                    <h2 style="text-align: right;">A constellation of amazing solutions tailored for your needs</h2>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-4 g-height-7 col-lg-4 d-none d-lg-block o_snippet_mobile_invisible" style="z-index: 4; grid-area: 15 / 2 / 22 / 6; --grid-item-padding-x: 0px; --grid-item-padding-y: 0px;">
                    <img class="img img-fluid mx-auto rounded" alt="" data-shape="html_builder/composite/composite_double_pill" data-file-name="s_images_constellation_default_image_1.webp" data-format-mimetype="image/webp" src="/html_editor/image_shape/website.s_images_constellation_default_image_1/html_builder/composite/composite_double_pill.svg"/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-5 g-height-9 col-lg-5 d-none d-lg-block o_snippet_mobile_invisible" style="z-index: 5; grid-area: 15 / 8 / 24 / 13; --grid-item-padding-x: 0px; --grid-item-padding-y: 0px;">
                    <img class="img img-fluid mx-auto rounded" src="/web/image/website.s_images_constellation_default_image_2" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=843 key=website.s_images_mosaic name=Images Mosaic active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Images Mosaic" t-name="website.s_images_mosaic">
    <section class="s_images_mosaic pt72 pb72 o_cc o_cc5">
        <div class="container">
            <div class="row px-3">
                <div class="col-lg-4">
                    <h2 class="display-4-fs">Unveiling our newest solutions</h2>
                    <p class="lead">Discover our latest solutions for your business.</p>
                </div>
                <div class="col-6 col-lg-4 p-0">
                    <img src="/html_editor/image_shape/website.s_images_mosaic_default_image_1/html_builder/geometric/geo_diamond.svg" class="img img-fluid" alt="" data-shape="html_builder/geometric/geo_diamond" data-format-mimetype="image/jpeg" data-file-name="s_images_mosaic_default_image_1.svg" data-shape-colors=";;;;" style="width: 100% !important;"/>
                </div>
                <div class="col-6 col-lg-4 p-0">
                    <img src="/html_editor/image_shape/website.s_images_mosaic_default_image_2/html_builder/geometric/geo_sonar.svg" class="img img-fluid" alt="" data-shape="html_builder/geometric/geo_sonar" data-format-mimetype="image/jpeg" data-file-name="s_images_mosaic_default_image_2.svg" data-shape-colors=";;;;" style="width: 100% !important;"/>
                </div>
                <div class="col-6 col-lg-4 p-0">
                    <img src="/html_editor/image_shape/website.s_images_mosaic_default_image_3/html_builder/geometric_round/geo_round_circle.svg" class="img img-fluid" alt="" data-shape="html_builder/geometric_round/geo_round_circle" data-format-mimetype="image/jpeg" data-file-name="s_images_mosaic_default_image_3.svg" data-shape-colors=";;;;" style="width: 100% !important;"/>
                </div>
                <div class="col-6 col-lg-4 p-0">
                    <img src="/html_editor/image_shape/website.s_images_mosaic_default_image_4/html_builder/geometric/geo_tear.svg" class="img img-fluid" alt="" data-shape="html_builder/geometric/geo_tear" data-format-mimetype="image/jpeg" data-file-name="s_images_mosaic_default_image_4.svg" data-shape-colors=";;;;" style="width: 100% !important;"/>
                </div>
                <div class="col-6 col-lg-4 p-0">
                    <img src="/html_editor/image_shape/website.s_images_mosaic_default_image_5/html_builder/geometric/geo_door.svg" class="img img-fluid" alt="" data-shape="html_builder/geometric/geo_door" data-format-mimetype="image/jpeg" data-file-name="s_images_mosaic_default_image_5.svg" data-shape-colors=";;;;" style="width: 100% !important;"/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=766 key=website.s_images_wall name=Images Wall active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Images Wall" t-name="website.s_images_wall">
    <section class="s_image_gallery o_spc-small o_masonry pt24 pb24 o_image_popup" data-vcss="002" data-columns="3" style="overflow: hidden;">
        <div class="container">
            <div class="row s_nb_column_fixed">
                <div class="o_masonry_col o_snippet_not_selectable col-lg-4">
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_03" data-index="0" data-name="Image" alt=""/>
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_10" data-index="3" data-name="Image" alt=""/>
                </div>
                <div class="o_masonry_col o_snippet_not_selectable col-lg-4">
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_13" data-index="1" data-name="Image" alt=""/>
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_05" data-index="4" data-name="Image" alt=""/>
                </div>
                <div class="o_masonry_col o_snippet_not_selectable col-lg-4">
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_14" data-index="2" data-name="Image" alt=""/>
                    <img class="img img-fluid d-block rounded" src="/web/image/website.library_image_16" data-index="5" data-name="Image" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=883 key=website.s_inline_text name=Text active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Text" t-name="website.s_inline_text">
    <p class="o_snippet_drop_in_only">Text</p>
</t>

- kind=other id=738 key=website.s_instagram_page name=Instagram Page active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Instagram Page" t-name="website.s_instagram_page">
    <section class="s_instagram_page" data-instagram-page="odoo.official" data-instagram-page-is-default="true">
        <div class="o_container_small o_instagram_container o_not_editable">
            <!-- The iframe will be added here by the public widget. -->
        </div>
    </section>
</t>

- kind=other id=840 key=website.s_intro_pill name=Intro Pill active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Intro Pill" t-name="website.s_intro_pill">
    <section class="s_intro_pill pt40 pb40">
        <div class="container-fluid">
            <div class="row o_grid_mode" data-row-count="11">
                <div class="o_grid_item oe_img_bg o_grid_item_image g-col-lg-5 g-height-9 col-lg-5 order-lg-0" style="order: 2; z-index: 1; grid-area: 1 / 1 / 10 / 6; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img class="img-fluid mx-auto" data-shape="html_builder/geometric_round/geo_round_pill" data-file-name="s_intro_pill_default_image.jpg" data-format-mimetype="image/jpeg" src="/html_editor/image_shape/website.s_intro_pill_default_image/html_builder/geometric_round/geo_round_pill.svg" alt=""/>
                </div>
                <div class="o_grid_item g-height-11 g-col-lg-4 col-lg-4 order-lg-0" data-name="Box" style="order: 1; z-index: 3; grid-area: 1 / 5 / 12 / 9; --grid-item-padding-y: 120px;">
                    <h1 class="display-3" style="text-align: center;">Discover our<br/>services</h1>
                    <p>
                        <br/>
                    </p>
                    <p style="text-align: center;">
                        <a t-att-href="cta_btn_href" class="btn btn-lg btn-primary o_translate_inline">Get Started</a>
                    </p>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-5 g-height-10 d-none d-lg-block col-lg-5 order-lg-0" style="order: 3; z-index: 2; grid-area: 2 / 8 / 12 / 13; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img class="img-fluid mx-auto" data-shape="html_builder/geometric_round/geo_round_pill" data-file-name="s_intro_pill_default_image_2.webp" data-format-mimetype="image/webp" src="/html_editor/image_shape/website.s_intro_pill_default_image_2/html_builder/geometric_round/geo_round_pill.svg" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=747 key=website.s_key_benefits name=Key benefits active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Key benefits" t-name="website.s_key_benefits">
    <section class="s_key_benefits pt48 pb48" data-oe-shape-data="{'shape': 'html_builder/Connections/14'}">
        <div class="o_we_shape o_html_builder_Connections_14"/>
        <div class="container">
            <p class="lead">
                ✽  What We Offer
            </p>
            <h2 class="display-3-fs">Discover our<br/>main three benefits</h2>
            <div class="row">
                <div class="col-lg-4 pt48 pb24">
                    <span class="display-3-fs text-o-color-1">1</span>
                    <div class="s_hr pt8 pb24" data-snippet="s_hr" data-name="Separator">
                        <hr class="w-100 mx-auto"/>
                    </div>
                    <h3 class="h4-fs">Fair pricing</h3>
                    <p>We provide transparent pricing that offers great value, ensuring you always get the best deal without hidden costs.</p>
                </div>
                <div class="col-lg-4 pt48 pb24">
                    <span class="display-3-fs text-o-color-1">2</span>
                    <div class="s_hr pt8 pb24" data-snippet="s_hr" data-name="Separator">
                        <hr class="w-100 mx-auto"/>
                    </div>
                    <h3 class="h4-fs">24/7 Support</h3>
                    <p>Our support team is available 24/7 to assist with any inquiries or issues, ensuring you get help whenever you need it.</p>
                </div>
                <div class="col-lg-4 pt48 pb24">
                    <span class="display-3-fs text-o-color-1">3</span>
                    <div class="s_hr pt8 pb24" data-snippet="s_hr" data-name="Separator">
                        <hr class="w-100 mx-auto"/>
                    </div>
                    <h3 class="h4-fs">Tax free</h3>
                    <p>Benefit from tax-free shopping, simplifying your purchase and enhancing your savings without any extra costs.</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=835 key=website.s_key_images name=Key Images active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Key Images" t-name="website.s_key_images">
    <section class="s_key_images pt72 pb72">
        <div class="container">
            <h2>What we propose to our customers</h2>
            <p class="lead">Dive deeper into our company’s abilities.</p>
            <p><br/></p>
            <div class="row">
                <div class="col-6 col-lg-3">
                    <p class="h1-fs">01</p>
                    <p><img src="/web/image/website.s_key_images_default_image_1" class="img img-fluid rounded" alt="" style="width: 100% !important;"/></p>
                    <p>This is a small title related to the current image</p>
                </div>
                <div class="col-6 col-lg-3">
                    <p class="h1-fs">02</p>
                    <p><img src="/web/image/website.s_key_images_default_image_2" class="img img-fluid rounded" alt="" style="width: 100% !important;"/></p>
                    <p>This is a small title related to the current image</p>
                </div>
                <div class="col-6 col-lg-3">
                    <p class="h1-fs">03</p>
                    <p><img src="/web/image/website.s_key_images_default_image_3" class="img img-fluid rounded" alt="" style="width: 100% !important;"/></p>
                    <p>This is a small title related to the current image</p>
                </div>
                <div class="col-6 col-lg-3">
                    <p class="h1-fs">04</p>
                    <p><img src="/web/image/website.s_key_images_default_image_4" class="img img-fluid rounded" alt="" style="width: 100% !important;"/></p>
                    <p>This is a small title related to the current image</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=836 key=website.s_kickoff name=Kickoff active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Kickoff" t-name="website.s_kickoff">
    <section class="s_kickoff o_cc o_cc5 parallax s_parallax_is_fixed pt232 pb88" data-scroll-background-ratio="1" data-oe-shape-data="{'shape': 'html_builder/Connections/06', 'colors': {'c5': 'o-color-4'}, 'flip': [], 'showOnMobile': false}">
        <span class="s_parallax_bg_wrap">
            <span class="s_parallax_bg oe_img_bg" style="background-image: url('/web/image/website.s_kickoff_default_image');"/>
        </span>
        <div class="o_we_bg_filter bg-black-50"/>
        <div class="o_we_shape o_html_builder_Connections_06" style="background-image: url('/html_editor/shape/html_builder/Connections/06.svg?c5=o-color-4');"/>
        <div class="container s_allow_columns">
            <p class="lead">Your Journey Starts Here,</p>
            <h1 class="display-1">Let's kick<br/>things off !</h1>
        </div>
    </section>
</t>

- kind=other id=872 key=website.s_map name=Map active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Map" t-name="website.s_map">
    <section class="s_map pb56 pt56 rounded-3 o_not_editable" data-map-type="m" data-map-zoom="12" t-att-data-map-address="' '.join(filter(None, (user_id.company_id.street, user_id.company_id.city, user_id.company_id.state_id.display_name, user_id.company_id.country_id.display_name)))" data-vxml="001">
        <div class="map_container">
            <div class="css_non_editable_mode_hidden">
                <div class="missing_option_warning alert alert-info rounded-0 fade show d-none d-print-none">
                    An address must be specified for a map to be embedded
                </div>
            </div>
            <iframe t-if="not test_mode_enabled" class="s_map_embedded o_not_editable" src="https://maps.google.com/maps?q=250%20Executive%20Park%20Blvd%2C%20Suite%203400%20San%20Francisco%20California%20(US)%20United%20States&amp;t=m&amp;z=12&amp;ie=UTF8&amp;iwloc=&amp;output=embed" width="100%" height="100%" frameborder="0" scrolling="no" marginheight="0" marginwidth="0" aria-label="Map"/>
            <div class="s_map_color_filter"/>
        </div>
    </section>
</t>

- kind=other id=808 key=website.s_masonry_block name=Masonry active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Masonry" t-name="website.s_masonry_block">
    <section class="s_masonry_block pt48 pb48" data-vcss="001" data-vxml="001">
        <t t-set="container_class" t-value="container_class if container_class else 'container'"/>
        <div t-attf-class="#{container_class}">
            <t t-out="0"/>
        </div>
    </section>
</t>

- kind=other id=814 key=website.s_masonry_block_alternation_image_text_template name=Masonry active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Masonry" t-name="website.s_masonry_block_alternation_image_text_template">
    <t t-snippet-call="website.s_masonry_block">
        <t t-set="container_class" t-valuef="container-fluid"/>
        <div class="row o_grid_mode" data-row-count="10">
            <div class="o_grid_item o_grid_item_image g-height-10 g-col-lg-3 col-lg-3 text-center" data-name="Block" style="grid-area: 1 / 1 / 11 / 4; z-index: 1;">
                <img src="/web/image/website.s_masonry_block_default_image_1" class="img img-fluid mx-auto" alt=""/>
            </div>
            <div class="o_grid_item o_cc o_cc2 g-height-10 g-col-lg-3 col-lg-3 justify-content-center text-center" data-name="Block" style="grid-area: 1 / 4 / 11 / 7; z-index: 2; position: relative;" data-oe-shape-data="{'shape':'html_builder/Rainy/06','flip':[],'showOnMobile':false,'shapeAnimationSpeed':'0'}">
                <div class="o_we_shape o_html_builder_Rainy_06"/>
                <h2>Innovation Hub</h2>
                <p>Where ideas come to life</p>
            </div>
            <div class="o_grid_item o_grid_item_image g-height-10 g-col-lg-3 col-lg-3 text-center" data-name="Block" style="grid-area: 1 / 7 / 11 / 10; z-index: 3;">
                <img src="/web/image/website.s_masonry_block_default_image_2" class="img img-fluid mx-auto" alt=""/>
            </div>
            <div class="o_grid_item o_cc o_cc2 g-height-10 g-col-lg-3 col-lg-3 justify-content-center text-center" data-name="Block" style="grid-area: 1 / 10 / 11 / 13; z-index: 4; position: relative;" data-oe-shape-data="{'shape':'html_builder/Floats/01','flip':[],'showOnMobile':false,'shapeAnimationSpeed':'0','animated':'true'}">
                <div class="o_we_shape o_html_builder_Floats_01 o_we_animated"/>
                <h2>Key Milestone</h2>
                <p>Reaching new heights together</p>
            </div>
        </div>
    </t>
</t>

- kind=other id=813 key=website.s_masonry_block_alternation_text_image_template name=Masonry active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Masonry" t-name="website.s_masonry_block_alternation_text_image_template">
    <t t-snippet-call="website.s_masonry_block">
        <div class="row o_grid_mode" data-row-count="4" style="gap: 16px;">
            <div class="o_grid_item o_cc o_cc2 g-height-4 g-col-lg-3 col-lg-3 justify-content-start rounded" data-name="Block" style="z-index: 1; grid-area: 1 / 1 / 5 / 4; --grid-item-padding-y: 20px; --grid-item-padding-x: 20px;">
                <h2 class="h4-fs">Incredible <br class="d-none d-lg-inline"/>Features</h2>
                <p> </p>
            </div>
            <div class="o_grid_item o_grid_item_image g-height-4 g-col-lg-3 col-lg-3 rounded" data-name="Block" style="z-index: 2; grid-area: 1 / 4 / 5 / 7;">
                <img src="/web/image/website.s_masonry_block_default_image_1" class="img img-fluid mx-auto" alt=""/>
            </div>
            <div class="o_grid_item o_cc o_cc2 g-height-4 g-col-lg-3 col-lg-3 justify-content-start rounded" data-name="Block" style="z-index: 3; grid-area: 1 / 7 / 5 / 10; --grid-item-padding-y: 20px; --grid-item-padding-x: 20px;">
                <h2 class="h4-fs">Advanced <br class="d-none d-lg-inline"/>Capabilities</h2>
                <p> </p>
            </div>
            <div class="o_grid_item o_grid_item_image g-height-4 g-col-lg-3 col-lg-3 rounded" data-name="Block" style="z-index: 4; grid-area: 1 / 10 / 5 / 13;">
                <img src="/web/image/website.s_masonry_block_default_image_2" class="img img-fluid mx-auto" alt=""/>
            </div>
        </div>
    </t>
</t>

- kind=other id=809 key=website.s_masonry_block_default_template name=Masonry active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Masonry" t-name="website.s_masonry_block_default_template">
    <t t-snippet-call="website.s_masonry_block">
        <div class="row o_grid_mode" data-row-count="8" style="gap: 16px;">
            <div class="o_grid_item o_grid_item_image g-height-8 g-col-lg-5 col-lg-5 text-center order-lg-0 rounded-4" data-name="Block" style="order: 0; z-index: 1; grid-area: 1 / 1 / 9 / 6;">
                <img src="/web/image/website.s_masonry_block_default_image_1" class="img img-fluid mx-auto" alt=""/>
            </div>
            <div class="o_grid_item o_cc o_cc2 g-height-4 g-col-lg-3 col-lg-3 justify-content-end order-lg-0 rounded-4" data-name="Block" style="order: 2; --grid-item-padding-y: 20px; --grid-item-padding-x: 20px; z-index: 2; grid-area: 1 / 6 / 5 / 9;">
                <h2 class="h3-fs">Key <br class="d-none d-lg-inline"/>Milestone</h2>
                <p>Reaching new heights</p>
            </div>
            <div class="o_grid_item o_cc o_cc3 g-height-4 g-col-lg-4 col-lg-4 justify-content-end order-lg-0 rounded-4" data-name="Block" style="order: 1; --grid-item-padding-y: 20px; --grid-item-padding-x: 20px; z-index: 3; grid-area: 1 / 9 / 5 / 13; background-image: linear-gradient(135deg, var(--o-color-4) -400%, var(--o-color-2) 100%);">
                <h2 class="h3-fs">Greater <br class="d-none d-lg-inline"/>Impact</h2>
                <p>Making a difference every day</p>
            </div>
            <div class="o_grid_item o_cc o_cc4 g-height-4 g-col-lg-4 col-lg-4 justify-content-end order-lg-0 rounded-4" data-name="Block" style="order: 3; --grid-item-padding-y: 20px; --grid-item-padding-x: 20px; z-index: 4; grid-area: 5 / 6 / 9 / 10; background-image: linear-gradient(135deg, var(--o-color-4) -400%, var(--o-color-1) 100%);">
                <h2 class="h3-fs">Innovation <br class="d-none d-lg-inline"/>Hub</h2>
                <p>Where ideas come to life</p>
            </div>
            <div class="o_grid_item o_cc o_cc2 g-height-4 g-col-lg-3 col-lg-3 justify-content-end order-lg-0 rounded-4" data-name="Block" style="order: 4; --grid-item-padding-y: 20px; --grid-item-padding-x: 20px; z-index: 5; grid-area: 5 / 10 / 9 / 13;">
                <h2 class="h3-fs">Community <br class="d-none d-lg-inline"/>Focus</h2>
                <p>Building connections</p>
            </div>
        </div>
    </t>
</t>

- kind=other id=811 key=website.s_masonry_block_images_template name=Masonry active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Masonry" t-name="website.s_masonry_block_images_template">
    <t t-snippet-call="website.s_masonry_block">
        <div class="row o_grid_mode" data-row-count="8" style="gap: 16px;">
            <div class="o_grid_item o_cc o_cc5 g-height-8 g-col-lg-6 col-lg-6 justify-content-start shadow rounded-3 oe_img_bg o_bg_img_center" data-name="Block" style="z-index: 1; grid-area: 1 / 1 / 9 / 7; background-image: url(/web/image/website.s_masonry_block_default_image_2); --grid-item-padding-y: 30px; --grid-item-padding-x: 30px;">
                <div class="o_we_bg_filter bg-black-50"/>
                <h2 class="display-4-fs">Key <br class="d-none d-lg-inline"/>Milestone</h2>
                <p class="lead">Reaching new heights together</p>
            </div>
            <div class="o_grid_item o_cc o_cc5 g-height-8 g-col-lg-6 col-lg-6 justify-content-start shadow rounded-3 oe_img_bg o_bg_img_center" data-name="Block" style="z-index: 2; grid-area: 1 / 7 / 9 / 13; background-image: url(/web/image/website.s_masonry_block_default_image_1); --grid-item-padding-y: 30px; --grid-item-padding-x: 30px;">
                <div class="o_we_bg_filter bg-black-50"/>
                <h2 class="display-4-fs">Innovation <br class="d-none d-lg-inline"/>Hub</h2>
                <p class="lead">Where ideas come to life</p>
            </div>
        </div>
    </t>
</t>

- kind=other id=812 key=website.s_masonry_block_mosaic_template name=Masonry active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Masonry" t-name="website.s_masonry_block_mosaic_template">
    <t t-snippet-call="website.s_masonry_block">
        <div class="row o_grid_mode" data-row-count="10" style="gap: 16px;">
            <div class="o_grid_item o_cc o_cc3 g-height-3 g-col-lg-3 col-lg-3 justify-content-start order-lg-0 rounded-3" data-name="Block" style="order: 1; z-index: 1; --grid-item-padding-y: 20px; --grid-item-padding-x: 20px; grid-area: 1 / 1 / 4 / 4; linear-gradient(135deg, var(--o-color-4) -400%, var(--o-color-2) 100%);">
                <h2 class="h3-fs">Innovation</h2>
                <p>How ideas come to life</p>
            </div>
            <div class="o_grid_item o_cc o_cc2 g-height-3 g-col-lg-3 col-lg-3 justify-content-start order-lg-0 rounded-3" data-name="Block" style="order: 2; z-index: 2; --grid-item-padding-y: 20px; --grid-item-padding-x: 20px; grid-area: 1 / 4 / 4 / 7;">
                <h2 class="h3-fs">Focus</h2>
                <p>Building connections</p>
            </div>
            <div class="o_grid_item o_grid_item_image g-height-7 g-col-lg-6 col-lg-6 rounded-3 text-center order-lg-0" data-name="Block" style="order: 0; z-index: 3; grid-area: 1 / 7 / 8 / 13;">
                <img src="/web/image/website.s_masonry_block_default_image_2" class="img img-fluid mx-auto" alt=""/>
            </div>
            <div class="o_grid_item o_grid_item_image g-height-7 g-col-lg-6 col-lg-6 rounded-3 text-center order-lg-0" data-name="Block" style="order: 3; z-index: 4; grid-area: 4 / 1 / 11 / 7;">
                <img src="/web/image/website.s_masonry_block_default_image_1" class="img img-fluid mx-auto" alt=""/>
            </div>
            <div class="o_grid_item o_cc o_cc2 g-height-3 g-col-lg-3 col-lg-3 justify-content-center text-center order-lg-0 rounded-3" data-name="Block" style="order: 4; z-index: 5; --grid-item-padding-y: 20px; --grid-item-padding-x: 20px; grid-area: 8 / 7 / 11 / 10;">
                <h2 class="display-1-fs">22%</h2>
                <p>Reaching new heights</p>
            </div>
            <div class="o_grid_item o_cc o_cc4 g-height-3 g-col-lg-3 col-lg-3 justify-content-center text-center order-lg-0 rounded-3" data-name="Block" style="order: 5; z-index: 6; --grid-item-padding-y: 20px; --grid-item-padding-x: 20px; grid-area: 8 / 10 / 11 / 13; linear-gradient(135deg, var(--o-color-4) -400%, var(--o-color-1) 100%);">
                <h2 class="display-1-fs">+12</h2>
                <p>Mark the difference</p>
            </div>
        </div>
    </t>
</t>

- kind=other id=810 key=website.s_masonry_block_reversed_template name=Masonry active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Masonry" t-name="website.s_masonry_block_reversed_template">
    <t t-snippet-call="website.s_masonry_block">
        <t t-set="container_class" t-valuef="container-fluid"/>
        <div class="row o_grid_mode" data-row-count="10">
            <div class="o_grid_item o_cc o_cc3 g-height-5 g-col-lg-3 col-lg-3 justify-content-center text-center" data-name="Block" style="grid-area: 1 / 1 / 6 / 4; z-index: 1; background-image: linear-gradient(135deg, var(--o-color-4) -400%, var(--o-color-2) 100%);">
                <h2 class="h3-fs">Greater <br class="d-none d-lg-inline"/>Impact</h2>
                <p>Making a difference every day</p>
            </div>
            <div class="o_grid_item o_cc o_cc2 g-height-5 g-col-lg-3 col-lg-3 justify-content-center text-center" data-name="Block" style="grid-area: 1 / 4 / 6 / 7; z-index: 2;">
                <h2 class="h3-fs">Key <br class="d-none d-lg-inline"/>Milestone</h2>
                <p>Reaching new heights together</p>
            </div>
            <div class="o_grid_item o_cc o_cc2 g-height-5 g-col-lg-3 col-lg-3 justify-content-center text-center" data-name="Block" style="grid-area: 6 / 1 / 11 / 4; z-index: 3;">
                <h2 class="h3-fs">Innovation <br class="d-none d-lg-inline"/>Hub</h2>
                <p>Where ideas come to life</p>
            </div>
            <div class="o_grid_item o_cc o_cc4 g-height-5 g-col-lg-3 col-lg-3 justify-content-center text-center" data-name="Block" style="grid-area: 6 / 4 / 11 / 7; z-index: 4; background-image: linear-gradient(135deg, var(--o-color-4) -400%, var(--o-color-1) 100%);">
                <h2 class="h3-fs">Community <br class="d-none d-lg-inline"/>Focus</h2>
                <p>Building connections</p>
            </div>
            <div class="o_grid_item o_grid_item_image g-height-10 g-col-lg-6 col-lg-6 text-center" data-name="Block" style="grid-area: 1 / 7 / 11 / 13; z-index: 5;">
                <img src="/web/image/website.s_masonry_block_default_image_1" class="img img-fluid mx-auto" alt=""/>
            </div>
        </div>
    </t>
</t>

- kind=other id=816 key=website.s_media_list name=Media List active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Media List" t-name="website.s_media_list">
    <section class="s_media_list pt32 pb32 o_colored_level o_cc o_cc2" data-vcss="001">
        <div class="container">
            <div class="row s_nb_column_fixed s_col_no_bgcolor">
                <div class="col-lg-12 s_media_list_item pt16 pb16" data-name="Media item">
                    <div class="row s_col_no_resize s_col_no_bgcolor g-0 align-items-center o_colored_level o_cc o_cc1">
                        <div class="col-lg-4 align-self-stretch s_media_list_img_wrapper">
                            <img src="/web/image/website.s_media_list_default_image_1" class="s_media_list_img h-100 w-100" alt=""/>
                        </div>
                        <div class="col-lg-8 s_media_list_body">
                            <h3>Media heading</h3>
                            <p>Use this snippet to build various types of components that feature a left- or right-aligned image alongside textual content. Duplicate the element to create a list that fits your needs.</p>
                            <a href="#">Discover more <i class="fa fa-long-arrow-right align-middle ms-1"/></a>
                        </div>
                    </div>
                </div>
                <div class="col-lg-12 s_media_list_item pt16 pb16" data-name="Media item">
                    <div class="row s_col_no_resize s_col_no_bgcolor g-0 align-items-center o_colored_level o_cc o_cc1">
                        <div class="col-lg-4 align-self-stretch s_media_list_img_wrapper">
                            <img src="/web/image/website.s_media_list_default_image_2" class="s_media_list_img h-100 w-100" alt=""/>
                        </div>
                        <div class="col-lg-8 s_media_list_body">
                            <h3>Event heading</h3>
                            <p>Speakers from all over the world will join our experts to give inspiring talks on various topics. Stay on top of the latest business management trends &amp; technologies</p>
                        </div>
                    </div>
                </div>
                <div class="col-lg-12 s_media_list_item pt16 pb16" data-name="Media item">
                    <div class="row s_col_no_resize s_col_no_bgcolor g-0 align-items-center o_colored_level o_cc o_cc1">
                        <div class="col-lg-4 align-self-stretch s_media_list_img_wrapper">
                            <img src="/web/image/website.s_media_list_default_image_3" class="s_media_list_img h-100 w-100" alt=""/>
                        </div>
                        <div class="col-lg-8 s_media_list_body">
                            <h3>Post heading</h3>
                            <p>Use this component for creating a list of featured elements to which you want to bring attention.</p>
                            <a href="#">Continue reading <i class="fa fa-long-arrow-right align-middle ms-1"/></a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=866 key=website.s_mega_menu_big_icons_subtitles name=Menu - Big icons & subtitles active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Menu - Big icons &amp; subtitles" t-name="website.s_mega_menu_big_icons_subtitles">
    <section class="s_mega_menu_big_icons_subtitles pt24 pb24 o_colored_level o_cc o_cc1" data-oe-shape-data="{'shape':'html_builder/Grids/07','colors':{'c5':'o-color-3'},'flip':[]}">
        <div class="o_we_shape o_html_builder_Grids_07" style="background-image: url('/html_editor/shape/html_builder/Grids/07.svg?c5=o-color-3');"/>
        <div class="container">
            <div class="row">
                <div class="col-12 col-lg-4">
                    <nav class="nav flex-column w-100">
                        <t t-call="website.s_mega_menu_big_icons_subtitles_item" _icon_classes.f="fa-user bg-o-color-1" _title.translate="About us" _text.translate="Discover our culture and our values"/>
                        <t t-call="website.s_mega_menu_big_icons_subtitles_item" _icon_classes.f="fa-newspaper-o bg-o-color-2" _title.translate="Blog" _text.translate="Latests news and case studies"/>
                        <t t-call="website.s_mega_menu_big_icons_subtitles_item" _icon_classes.f="fa-calendar bg-o-color-3" _title.translate="Events" _text.translate="Our seminars and trainings for you"/>
                    </nav>
                </div>
                <div class="col-12 col-lg-4">
                    <nav class="nav flex-column w-100">
                        <t t-call="website.s_mega_menu_big_icons_subtitles_item" _icon_classes.f="fa-star bg-o-color-5" _title.translate="Customers" _text.translate="They trust us since years"/>
                        <t t-call="website.s_mega_menu_big_icons_subtitles_item" _icon_classes.f="fa-handshake-o bg-o-color-3" _title.translate="Services" _text.translate="Find the perfect solution for you"/>
                        <t t-call="website.s_mega_menu_big_icons_subtitles_item" _icon_classes.f="fa-paint-brush bg-o-color-2" _title.translate="Portfolio" _text.translate="Discover our realisations"/>
                    </nav>
                </div>
                <div class="col-12 col-lg-4">
                    <nav class="nav flex-column w-100">
                        <t t-call="website.s_mega_menu_big_icons_subtitles_item" _icon_classes.f="fa-question-circle bg-o-color-1" _title.translate="F.A.Q." _text.translate="All informations you need"/>
                        <t t-call="website.s_mega_menu_big_icons_subtitles_item" _icon_classes.f="fa-shopping-basket bg-o-color-5" _title.translate="Points of sale" _text.translate="Find a store near you"/>
                        <t t-call="website.s_mega_menu_big_icons_subtitles_item" _icon_classes.f="fa-legal bg-o-color-3" _title.translate="Legal Notice" _text.translate="Discover our legal notice"/>
                    </nav>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=867 key=website.s_mega_menu_big_icons_subtitles_item name=s_mega_menu_big_icons_subtitles_item active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_mega_menu_big_icons_subtitles_item">
    <a href="#" class="nav-link px-2 my-2 rounded text-wrap" data-name="Menu Item">
        <div class="d-flex align-items-center">
            <i t-attf-class="fa rounded rounded-circle me-3 #{_icon_classes}"/>
            <div class="flex-grow-1">
                <h4 class="mt-0 mb-0" t-out="_title"/>
                <span class="small"><t t-out="_text"/></span>
            </div>
        </div>
    </a>
</t>

- kind=other id=868 key=website.s_mega_menu_cards name=Menu - Cards active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Menu - Cards" t-name="website.s_mega_menu_cards">
    <section class="s_mega_menu_cards pt16 pb16 o_colored_level o_cc o_cc1">
        <div class="container">
            <nav class="row">
                <t t-call="website.s_mega_menu_cards_item" _img_src.f="/web/image/website.s_mega_menu_cards_default_image_1" _title.translate="Our team" _text.translate="Created in 2021, the company is young and dynamic. Discover the composition of the team and their skills."/>
                <t t-call="website.s_mega_menu_cards_item" _img_src.f="/web/image/website.s_mega_menu_cards_default_image_2" _title.translate="Departments" _text.translate="Do you need specific information? Our specialists will help you with pleasure."/>
                <t t-call="website.s_mega_menu_cards_item" _img_src.f="/web/image/website.s_mega_menu_cards_default_image_3" _title.translate="Products" _text.translate="We offer tailor-made products according to your needs and your budget."/>
                <t t-call="website.s_mega_menu_cards_item" _img_src.f="/web/image/website.s_mega_menu_cards_default_image_4" _title.translate="Customers" _text.translate="Find out how we were able helping them and set in place solutions adapted to their needs."/>

                <div class="w-100 d-none d-lg-block"/>

                <t t-call="website.s_mega_menu_cards_item" _img_src.f="/web/image/website.s_mega_menu_cards_default_image_5" _title.translate="Events" _text.translate="From seminars to team building activities, we offer a wide choice of events to organize."/>
                <t t-call="website.s_mega_menu_cards_item" _img_src.f="/web/image/website.s_mega_menu_cards_default_image_6" _title.translate="Blog" _text.translate="Stay informed of our latest news and discover what will happen in the next weeks."/>
                <t t-call="website.s_mega_menu_cards_item" _img_src.f="/web/image/website.s_mega_menu_cards_default_image_7" _title.translate="Deliveries" _text.translate="Find all information about our deliveries, express deliveries and all you need to know to return a product."/>
                <t t-call="website.s_mega_menu_cards_item" _img_src.f="/web/image/website.s_mega_menu_cards_default_image_8" _title.translate="Points of sale" _text.translate="Need to pick up your order at one of our stores? Discover the nearest to you."/>
            </nav>
        </div>
    </section>
</t>

- kind=other id=869 key=website.s_mega_menu_cards_item name=s_mega_menu_cards_item active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_mega_menu_cards_item">
    <div class="col-12 col-lg-3" data-name="Menu Item">
        <a href="#" class="nav-link rounded text-wrap text-center p-3">
            <img t-att-src="_img_src" class="mb-3 rounded shadow img-fluid" alt=""/>
            <h4 t-out="_title"/>
            <span class="mb-0 small"><t t-out="_text"/></span>
        </a>
    </div>
</t>

- kind=other id=862 key=website.s_mega_menu_images_subtitles name=Menu - images & subtitles active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Menu - images &amp; subtitles" t-name="website.s_mega_menu_images_subtitles">
    <section class="s_mega_menu_images_subtitles pt16 pb16 o_colored_level o_cc o_cc1">
        <div class="container">
            <div class="row">
                <div class="col-12 col-lg-4 py-2">
                    <nav class="nav flex-column w-100">
                        <t t-call="website.s_mega_menu_images_subtitles_item" _img_src.f="/web/image/website.s_mega_menu_images_subtitles_default_image_1" _title.translate="About us" _text.translate="Discover our culture and our values"/>
                        <t t-call="website.s_mega_menu_images_subtitles_item" _img_src.f="/web/image/website.s_mega_menu_images_subtitles_default_image_2" _title.translate="Customers" _text.translate="They trust us since years"/>
                        <t t-call="website.s_mega_menu_images_subtitles_item" _img_src.f="/web/image/website.s_mega_menu_images_subtitles_default_image_3" _title.translate="Services" _text.translate="Find the perfect solution for you"/>
                    </nav>
                </div>
                <div class="col-12 col-lg-4 py-2">
                    <nav class="nav flex-column w-100">
                        <t t-call="website.s_mega_menu_images_subtitles_item" _img_src.f="/web/image/website.s_mega_menu_images_subtitles_default_image_4" _title.translate="Blog" _text.translate="Latests news and case studies"/>
                        <t t-call="website.s_mega_menu_images_subtitles_item" _img_src.f="/web/image/website.s_mega_menu_images_subtitles_default_image_5" _title.translate="Events" _text.translate="Our seminars and trainings for you"/>
                        <t t-call="website.s_mega_menu_images_subtitles_item" _img_src.f="/web/image/website.s_mega_menu_images_subtitles_default_image_6" _title.translate="Help center" _text.translate="Contact us for any issue or question"/>
                    </nav>
                </div>
                <div class="col-12 col-lg-4 py-2">
                    <img src="/web/image/website.s_mega_menu_images_subtitles_default_image_7" class="mb-3 rounded shadow img-fluid" alt=""/>
                    <h4>The team</h4>
                    <p class="text-muted small">
                        Created in 2021, the company is young and dynamic. Discover the composition of the team and their skills.
                    </p>
                    <a href="#" class="btn btn-primary">Discover our team</a>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=863 key=website.s_mega_menu_images_subtitles_item name=s_mega_menu_images_subtitles_item active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_mega_menu_images_subtitles_item">
    <a href="#" class="nav-link px-2 rounded text-wrap" data-name="Menu Item">
        <div class="d-flex">
            <img t-att-src="_img_src" class="me-3 rounded shadow" alt=""/>
            <div class="flex-grow-1">
                <h4 class="mt-0 mb-0" t-out="_title"/>
                <span class="small"><t t-out="_text"/></span>
            </div>
        </div>
    </a>
</t>

- kind=other id=861 key=website.s_mega_menu_little_icons name=Menu - Little icons active=True website=null inherit=null
  signals: hrefs_total=10 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Menu - Little icons" t-name="website.s_mega_menu_little_icons">
    <section class="s_mega_menu_little_icons overflow-hidden o_colored_level o_cc o_cc2">
        <div class="container">
            <div class="row">
                <div class="col-12 col-lg-3 py-2 d-flex align-items-center">
                    <nav class="nav flex-column">
                        <a href="#" class="nav-link px-2 rounded text-wrap" data-name="Menu Item">
                            <i class="s_mega_menu_little_icons_icon fa fa-eye fa-fw me-2"/>
                            <b>About us</b>
                        </a>
                        <a href="#" class="nav-link px-2 text-wrap" data-name="Menu Item">
                            <i class="s_mega_menu_little_icons_icon fa fa-group fa-fw me-2"/>
                            <b>Partners</b>
                        </a>
                        <a href="#" class="nav-link px-2 text-wrap" data-name="Menu Item">
                            <i class="s_mega_menu_little_icons_icon fa fa-star-o fa-fw me-2"/>
                            <b>Customers</b>
                        </a>
                    </nav>
                </div>
                <div class="col-12 col-lg-3 py-2 d-flex align-items-center">
                    <nav class="nav flex-column">
                        <a href="#" class="nav-link px-2 rounded text-wrap" data-name="Menu Item">
                            <i class="s_mega_menu_little_icons_icon fa fa-tags fa-fw me-2"/>
                            <b>Products</b>
                        </a>
                        <a href="#" class="nav-link px-2 rounded text-wrap" data-name="Menu Item">
                            <i class="s_mega_menu_little_icons_icon fa fa-handshake-o fa-fw me-2"/>
                            <b>Services</b>
                        </a>
                        <a href="#" class="nav-link px-2 rounded text-wrap" data-name="Menu Item">
                            <i class="s_mega_menu_little_icons_icon fa fa-headphones fa-fw me-2"/>
                            <b>Help center</b>
                        </a>
                    </nav>
                </div>
                <div class="col-12 col-lg-3 py-2 d-flex align-items-center">
                    <nav class="nav flex-column">
                        <a href="#" class="nav-link px-2 rounded text-wrap" data-name="Menu Item">
                            <i class="s_mega_menu_little_icons_icon fa fa-newspaper-o fa-fw me-2"/>
                            <b>Our blog</b>
                        </a>
                        <a href="#" class="nav-link px-2 rounded text-wrap" data-name="Menu Item">
                            <i class="s_mega_menu_little_icons_icon fa fa-calendar fa-fw me-2"/>
                            <b>Events</b>
                        </a>
                        <a href="#" class="nav-link px-2 rounded text-wrap" data-name="Menu Item">
                            <i class="s_mega_menu_little_icons_icon fa fa-map-o fa-fw me-2"/>
                            <b>Guides</b>
                        </a>
                    </nav>
                </div>
                <div class="col-lg-3 p-4">
                    <h4>The team</h4>
                    <p class="text-muted small">
                        Created in 2021, the company is young and dynamic. Discover the composition of the team and their skills.
                    </p>
                    <a href="#" class="btn btn-primary">Discover our team</a>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=858 key=website.s_mega_menu_menu_image_menu name=Menu - Image - Menu active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Menu - Image - Menu" t-name="website.s_mega_menu_menu_image_menu">
    <section class="s_mega_menu_menu_image_menu py-4 o_colored_level o_cc o_cc1">
        <div class="container">
            <div class="row align-items-center">
                <div class="col-12 col-lg-4 py-2 text-center">
                    <h4>Left Menu</h4>
                    <nav class="nav flex-column">
                        <t t-foreach="3" t-as="i">
                            <t t-set="text">Menu Item %s</t>
                            <t t-set="text" t-value="text % (i + 1)"/>
                            <a href="#" class="nav-link" data-name="Menu Item" t-out="text"/>
                        </t>
                    </nav>
                </div>
                <div class="col-12 col-lg-4 py-2 text-center">
                    <img class="img-fluid" src="/web/image/website.s_mega_menu_menu_image_menu_default_image" alt="Mega menu default image"/>
                </div>
                <div class="col-12 col-lg-4 py-2 text-center">
                    <h4>Right Menu</h4>
                    <nav class="nav flex-column">
                        <t t-foreach="3" t-as="i">
                            <t t-set="text">Menu Item %s</t>
                            <t t-set="text" t-value="text % (i + 1)"/>
                            <a href="#" class="nav-link" data-name="Menu Item" t-out="text"/>
                        </t>
                    </nav>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=864 key=website.s_mega_menu_menus_logos name=Menus & logos active=True website=null inherit=null
  signals: hrefs_total=19 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Menus &amp; logos" t-name="website.s_mega_menu_menus_logos">
    <section class="s_mega_menu_menus_logos overflow-hidden o_colored_level o_cc o_cc1">
        <div class="container">
            <div class="row">
                <div class="col-12 col-lg-8">
                    <div class="row py-3 align-items-center h-100">
                        <div class="col-12 col-lg-4 py-2">
                            <h4>Women</h4>
                            <nav class="nav flex-column">
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Jacket</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Dresses</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Tops</a>
                            </nav>
                        </div>
                        <div class="col-12 col-lg-4 py-2">
                            <h4>Men</h4>
                            <nav class="nav flex-column">
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Hoodies</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Blazers</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Jeans</a>
                            </nav>
                        </div>
                        <div class="col-12 col-lg-4 py-2">
                            <h4>Children</h4>
                            <nav class="nav flex-column">
                                <a href="#" class="nav-link px-0" data-name="Menu Item">T-shirts</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Pants</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Shoes</a>
                            </nav>
                        </div>
                        <div class="w-100 d-none d-lg-block"/>
                        <div class="col-12 col-lg-4 py-2">
                            <h4>New collection</h4>
                            <nav class="nav flex-column">
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Women</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Men</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Children</a>
                            </nav>
                        </div>
                        <div class="col-12 col-lg-4 py-2">
                            <h4>Accessories</h4>
                            <nav class="nav flex-column">
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Bags</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Watches</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Glasses</a>
                            </nav>
                        </div>
                        <div class="col-12 col-lg-4 py-2">
                            <h4>Promotions</h4>
                            <nav class="nav flex-column">
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Women</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Men</a>
                                <a href="#" class="nav-link px-0" data-name="Menu Item">Children</a>
                            </nav>
                        </div>
                    </div>
                </div>
                <div class="col-12 col-lg-4 py-4 d-flex align-items-center justify-content-center">
                    <a href="#" class="nav-link text-center px-0" data-name="Menu Item">
                        <img src="/web/image/website.s_mega_menu_menus_logos_default_image" class="mb-3 rounded shadow img-fluid" alt=""/>
                        <h4>Spring collection has arrived!</h4>
                    </a>
                </div>
            </div>
        </div>
        <div class="s_mega_menu_menus_logos_wrapper s_mega_menu_gray_area border-top">
            <div class="container">
                <div class="row py-3">
                    <div class="col-4 col-lg-2"><img src="/web/image/website.s_mega_menu_menus_logos_default_logo_1" class="img-fluid" alt=""/></div>
                    <div class="col-4 col-lg-2"><img src="/web/image/website.s_mega_menu_menus_logos_default_logo_2" class="img-fluid" alt=""/></div>
                    <div class="col-4 col-lg-2"><img src="/web/image/website.s_mega_menu_menus_logos_default_logo_3" class="img-fluid" alt=""/></div>
                    <div class="col-4 col-lg-2"><img src="/web/image/website.s_mega_menu_menus_logos_default_logo_4" class="img-fluid" alt=""/></div>
                    <div class="col-4 col-lg-2"><img src="/web/image/website.s_mega_menu_menus_logos_default_logo_5" class="img-fluid" alt=""/></div>
                    <div class="col-4 col-lg-2"><img src="/web/image/website.s_mega_menu_menus_logos_default_logo_6" class="img-fluid" alt=""/></div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=857 key=website.s_mega_menu_multi_menus name=Multi-Menus active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Multi-Menus" t-name="website.s_mega_menu_multi_menus">
    <section class="s_mega_menu_multi_menus py-4 o_colored_level o_cc o_cc1">
        <div class="container">
            <div class="row">
                <t t-set="menu1_title">First Menu</t>
                <t t-set="menu2_title">Second Menu</t>
                <t t-set="menu3_title">Third Menu</t>
                <t t-set="menu4_title">Last Menu</t>
                <t t-foreach="[menu1_title, menu2_title, menu3_title, menu4_title]" t-as="menu_title">
                    <div class="col-12 col-lg-3 py-2 text-center">
                        <h4 t-out="menu_title"/>
                        <nav class="nav flex-column">
                            <t t-foreach="3" t-as="i">
                                <t t-set="text">Menu Item %s</t>
                                <t t-set="text" t-value="text % (i + 1)"/>
                                <a href="#" class="nav-link" data-name="Menu Item" t-out="text"/>
                            </t>
                        </nav>
                    </div>
                </t>
            </div>
        </div>
    </section>
</t>

- kind=other id=865 key=website.s_mega_menu_odoo_menu name=Odoo Menu active=True website=null inherit=null
  signals: hrefs_total=26 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Odoo Menu" t-name="website.s_mega_menu_odoo_menu">
    <section class="s_mega_menu_odoo_menu pt16 o_colored_level o_cc o_cc1">
        <div class="container">
            <div class="row">
                <div class="col-12 col-lg-3 pt16 pb24">
                    <h4 class="h5 fw-bold mt-0">Computers &amp; Devices</h4>
                    <div class="s_hr pt4 pb16">
                        <hr class="w-100 mx-auto" style="border-top-width: 2px; border-top-color: var(--primary);"/>
                    </div>
                    <nav class="nav flex-column">
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Laptops</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Desktop computers</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Components</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Tablets</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Smartphones</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">iPhone</a>
                    </nav>
                </div>
                <div class="col-12 col-lg-3 pt16 pb24">
                    <h4 class="h5 fw-bold mt-0">Monitors</h4>
                    <div class="s_hr pt4 pb16">
                        <hr class="w-100 mx-auto" style="border-top-width: 2px; border-top-color: var(--secondary);"/>
                    </div>
                    <nav class="nav flex-column">
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Televisions</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Office screens</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Projectors</a>
                    </nav>
                </div>
                <div class="col-12 col-lg-3 pt16 pb24">
                    <h4 class="h5 fw-bold mt-0">Electronics</h4>
                    <div class="s_hr pt4 pb16">
                        <hr class="w-100 mx-auto" style="border-top-width: 2px; border-top-color: var(--primary);"/>
                    </div>
                    <nav class="nav flex-column">
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Camera</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">GPS &amp; navigation</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Accessories</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Home audio</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Office audio</a>
                    </nav>
                </div>
                <div class="col-12 col-lg-3 pt16 pb24">
                    <h4 class="h5 fw-bold mt-0">Promotions</h4>
                    <div class="s_hr pt4 pb16">
                        <hr class="w-100 mx-auto" style="border-top-width: 2px; border-top-color: var(--secondary);"/>
                    </div>
                    <nav class="nav flex-column">
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Computers</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Electronics</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Monitors</a>
                        <a href="#" class="nav-link px-0" data-name="Menu Item">Networks</a>
                    </nav>
                </div>
            </div>
        </div>
        <div class="container-fluid border-top s_mega_menu_odoo_menu_footer">
            <div class="row">
                <div class="s_mega_menu_gray_area col-12 pt8 pb8">
                    <div class="s_social_media text-center o_not_editable" data-snippet="s_social_media" data-name="Social Media" contenteditable="false">
                        <h5 class="s_social_media_title d-none" contenteditable="true">Follow us</h5>
                        <a href="/website/social/facebook" class="s_social_media_facebook me-3 ms-3" target="_blank" aria-label="Facebook">
                            <i class="fa fa-2x fa-facebook m-1 o_editable_media"/>
                        </a>
                        <a href="/website/social/twitter" class="s_social_media_twitter me-3 ms-3" target="_blank" aria-label="X">
                            <i class="fa fa-2x fa-twitter m-1 o_editable_media"/>
                        </a>
                        <a href="/website/social/linkedin" class="s_social_media_linkedin me-3 ms-3" target="_blank" aria-label="LinkedIn">
                            <i class="fa fa-2x fa-linkedin m-1 o_editable_media"/>
                        </a>
                        <a href="/website/social/github" class="s_social_media_github me-3 ms-3" target="_blank" aria-label="GitHub">
                            <i class="fa fa-2x fa-github m-1 o_editable_media"/>
                        </a>
                        <a href="/website/social/youtube" class="s_social_media_youtube me-3 ms-3" target="_blank" aria-label="YouTube">
                            <i class="fa fa-2x fa-youtube-play m-1 o_editable_media"/>
                        </a>
                        <a href="/website/social/instagram" class="s_social_media_instagram me-3 ms-3" target="_blank" aria-label="Instagram">
                            <i class="fa fa-2x fa-instagram m-1 o_editable_media"/>
                        </a>
                        <a href="/website/social/tiktok" class="s_social_media_tiktok me-3 ms-3" target="_blank" aria-label="TikTok">
                            <i class="fa fa-2x fa-tiktok m-1 o_editable_media"/>
                        </a>
                        <a href="/website/social/discord" class="s_social_media_discord me-3 ms-3" target="_blank" aria-label="Discord">
                            <i class="fa fa-2x fa-discord m-1 o_editable_m…

- kind=other id=859 key=website.s_mega_menu_thumbnails name=Menu - Thumbnails active=True website=null inherit=null
  signals: hrefs_total=2 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Menu - Thumbnails" t-name="website.s_mega_menu_thumbnails">
    <section class="s_mega_menu_thumbnails pt24 o_colored_level o_cc o_cc1">
        <div class="container">
            <div class="row justify-content-center">
                <div class="col-12 col-lg-8 pt32 px-0">
                    <div class="container">
                        <div class="row">
                            <t t-call="website.s_mega_menu_thumbnails_item" _img_src.f="/web/image/website.s_mega_menu_thumbnails_default_image_1" _text.translate="Laptops"/>
                            <t t-call="website.s_mega_menu_thumbnails_item" _img_src.f="/web/image/website.s_mega_menu_thumbnails_default_image_2" _text.translate="Mouse"/>
                            <t t-call="website.s_mega_menu_thumbnails_item" _img_src.f="/web/image/website.s_mega_menu_thumbnails_default_image_3" _text.translate="Keyboards"/>
                            <t t-call="website.s_mega_menu_thumbnails_item" _img_src.f="/web/image/website.s_mega_menu_thumbnails_default_image_4" _text.translate="Printers"/>
                            <t t-call="website.s_mega_menu_thumbnails_item" _img_src.f="/web/image/website.s_mega_menu_thumbnails_default_image_5" _text.translate="Storage"/>

                            <div class="w-100 d-none d-lg-block"/>

                            <t t-call="website.s_mega_menu_thumbnails_item" _img_src.f="/web/image/website.s_mega_menu_thumbnails_default_image_6" _text.translate="Tablets"/>
                            <t t-call="website.s_mega_menu_thumbnails_item" _img_src.f="/web/image/website.s_mega_menu_thumbnails_default_image_7" _text.translate="Phones"/>
                            <t t-call="website.s_mega_menu_thumbnails_item" _img_src.f="/web/image/website.s_mega_menu_thumbnails_default_image_8" _text.translate="Screens"/>
                            <t t-call="website.s_mega_menu_thumbnails_item" _img_src.f="/web/image/website.s_mega_menu_thumbnails_default_image_9" _text.translate="Gaming"/>
                            <t t-call="website.s_mega_menu_thumbnails_item" _img_src.f="/web/image/website.s_mega_menu_thumbnails_default_image_10" _text.translate="Sound"/>
                        </div>
                    </div>
                </div>
                <div class="col-12 col-lg-3 text-center py-2">
                    <a href="#" class="nav-link p-0" data-name="Menu Item">
                        <img class="img-fluid rounded shadow" src="/web/image/website.s_mega_menu_thumbnails_default_image_11" alt=""/>
                        <span class="d-block p-2 small">
                            <b>Discover our new products</b>
                        </span>
                    </a>
                </div>
            </div>
        </div>
        <div class="s_mega_menu_thumbnails_footer s_mega_menu_gray_area px-0">
            <div class="container row mx-auto px-0 w-100 align-items-center">
                <div class="col-12 col-lg-3 d-flex justify-content-center align-items-center py-2">
                    <p class="text-muted align-middle m-0">
                        <i class="s_mega_menu_thumbnails_icon fa fa-cube me-2"/> Free returns
                    </p>
                </div>
                <div class="col-12 col-lg-3 d-flex justify-content-center align-items-center py-2">
                    <p class="text-muted align-middle m-0">
                        <i class="s_mega_menu_thumbnails_icon fa fa-shopping-basket me-2"/> Pickup in store
                    </p>
                </div>
                <div class="col-12 col-lg-3 d-flex justify-content-center align-items-center py-2">
                    <p class="text-muted align-middle m-0">
                        <i class="s_mega_menu_thumbnails_icon fa fa-truck me-2"/> Express delivery
                    </p>
                </div>
                <div class="col-12 col-lg-3 py-2">
                    <a href="#" class="btn btn-secondary d-block">
                        <i class="s_mega_menu_thumbnails_icon fa fa-comments me-2"/> Contact us
                    </a>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=860 key=website.s_mega_menu_thumbnails_item name=s_mega_menu_thumbnails_item active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_mega_menu_thumbnails_item">
    <div class="col-6 col-lg-2 text-center py-2">
        <a href="#" class="nav-link p-0" data-name="Menu Item">
            <img class="img-fluid rounded shadow" t-att-src="_img_src" alt=""/>
            <br/>
            <span class="d-block p-2 small">
                <b>
                    <t t-out="_text"/>
                </b>
            </span>
        </a>
    </div>
</t>

- kind=other id=737 key=website.s_mockup_image name=Mockup Image active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Mockup Image" t-name="website.s_mockup_image">
    <section class="s_mockup_image o_cc o_cc1 pt72 pb72" data-oe-shape-data="{'shape':'html_builder/Wavy/11_001', 'showOnMobile':true}">
        <div class="o_we_shape o_html_builder_Wavy_11_001 o_shape_show_mobile"/>
        <div class="container">
            <div class="row align-items-center">
                <div class="col-lg-4 pt16 pb16">
                    <h2>The Innovation Behind Our Product</h2>
                    <p>Write one or two paragraphs describing your product or services. To be successful your content needs to be useful to your readers.</p>
                    <p>Start with the customer – find out what they want and give it to them.</p>
                    <p><a href="#" class="btn btn-primary o_translate_inline">Learn more</a></p>
                </div>
                <div class="col-lg-8 pt16 pb16">
                    <img src="/html_editor/image_shape/website.s_mockup_image_default_image/html_builder/devices/macbook_front.svg" class="img-fluid ms-auto" data-shape="html_builder/devices/macbook_front" data-shape-colors=";;#F3F2F2;;" data-file-name="s_text_image.webp" data-format-mimetype="image/webp" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=755 key=website.s_motto name=Motto active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Motto" t-name="website.s_motto">
    <section class="s_motto pt160 pb160 o_cc o_cc1" data-oe-shape-data="{'shape':'html_builder/Floats/07', 'showOnMobile':false, 'animated': true}">
        <div class="o_we_shape o_html_builder_Floats_07 o_we_animated"/>
        <div class="container">
            <div class="row">
                <div class="col-lg-8">
                    <h1 class="display-4">Design is the intermediary between <strong>information</strong> and <strong>understanding</strong></h1>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=803 key=website.s_numbers name=Numbers active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Numbers" t-name="website.s_numbers">
    <section class="s_numbers o_cc o_cc1 pt80 pb80">
        <div class="container">
            <div class="row s_nb_column_fixed">
                <div class="col-lg-5">
                    <h2 class="mb-3 h4-fs">Key Metrics of<br/>Company's Achievements</h2>
                    <p class="lead">Analyzing the numbers behind our success: <br class="d-none d-xxl-inline"/>an in-depth look at the key metrics driving our company's achievements</p>
                </div>
                <div class="col-lg-2 offset-lg-1">
                    <p style="text-align: center;">
                        <span class="s_number display-1-fs">12k</span><br/>
                        <span class="h5-fs">Useful options</span>
                    </p>
                </div>
                <div class="col-lg-2">
                    <p style="text-align: center;">
                        <span class="s_number display-1-fs">45%</span><br/>
                        <span class="h5-fs">More leads</span>
                    </p>
                </div>
                <div class="col-lg-2">
                    <p style="text-align: center;">
                        <span class="s_number display-1-fs">8+</span><br/>
                        <span class="h5-fs">Amazing pages</span>
                    </p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=805 key=website.s_numbers_boxed name=Numbers boxed active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Numbers boxed" t-name="website.s_numbers_boxed">
    <section class="s_numbers_boxed pt80 pb80 o_colored_level o_cc o_cc5">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="8" style="column-gap: 40px;">
                <div class="o_grid_item g-height-2 g-col-lg-12 col-12 col-lg-12" style="grid-area: 1 / 1 / 3 / 13; z-index: 1; text-align: center;">
                    <h2 style="text-align: center;">Insights, stats, and metrics</h2>
                    <p style="text-align: center;">This section allows to highlight key statistics.</p>
                </div>
                <div class="o_grid_item g-height-5 g-col-lg-4 col-12 col-lg-4 border rounded order-lg-0" style="grid-area: 4 / 1 / 9 / 5; --grid-item-padding-y: 64px; text-align: center; border-radius: 9.6px !important; z-index: 2; order: 1;">
                    <h3 class="display-3-fs"><font style="background-image: linear-gradient(135deg, var(--o-color-4) 15%, var(--o-color-5) 100%);" class="text-gradient">30+</font></h3>
                    <p><strong>Useful options</strong></p>
                </div>
                <div class="o_grid_item g-height-5 g-col-lg-4 col-6 col-lg-4 border rounded" style="grid-area: 4 / 5 / 9 / 9; --grid-item-padding-y: 64px; text-align: center; border-radius: 9.6px !important; z-index: 3;">
                    <h3 class="display-3-fs"><font style="background-image: linear-gradient(45deg, var(--o-color-4) 15%, var(--o-color-5) 100%);" class="text-gradient">45%</font></h3>
                    <p><strong>More leads</strong></p>
                </div>
                <div class="o_grid_item g-height-5 g-col-lg-4 col-6 col-lg-4 border rounded" style="grid-area: 4 / 9 / 9 / 13; --grid-item-padding-y: 64px; text-align: center; border-radius: 9.6px !important; z-index: 4;">
                    <h3 class="display-3-fs"><font style="background-image: linear-gradient(45deg, var(--o-color-4) 15%, var(--o-color-5) 100%);" class="text-gradient">8+</font></h3>
                    <p><strong>Amazing pages</strong></p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=828 key=website.s_numbers_charts name=Numbers Charts active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Numbers Charts" t-name="website.s_numbers_charts">
    <section class="s_numbers_charts pt48 pb48">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="12">
                <div class="o_grid_item g-col-lg-6 g-height-5 col-lg-6" style="grid-area: 1 / 1 / 6 / 7; z-index: 1">
                    <h2 class="h3-fs">Key Metrics of Company's<br/>Achievements</h2>
                    <p class="lead">Our key metrics, from revenue growth to customer retention and market expansion, highlight our strategic prowess and commitment to sustainable business success.</p>
                </div>
                <div class="o_grid_item g-col-lg-5 g-height-3 col-lg-5" style="grid-area: 6 / 1 / 9 / 6; z-index: 3">
                    <p class="h2-fs">$ 32M</p>
                    <p>Clients saved $32 million with our services.</p>
                    <div class="s_progress_bar s_progress_bar_label_hidden" data-display="inline" data-vcss="001" data-snippet="s_progress_bar">
                        <div class="s_progress_bar_wrapper d-flex gap-2">
                            <div class="progress" role="progressbar" aria-label="Progress bar" aria-valuenow="80" aria-valuemin="0" aria-valuemax="100">
                                <div class="progress-bar overflow-visible bg-o-color-5" style="width: 80%; min-width: 3%">
                                    <span class="s_progress_bar_text small d-none">80%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="o_grid_item g-col-lg-5 g-height-3 col-lg-5" style="grid-area: 10 / 1 / 13 / 6; z-index: 2;">
                    <p class="h2-fs">+25.000</p>
                    <p>We proudly serves over 25,000 clients.</p>
                    <div class="s_progress_bar s_progress_bar_label_hidden" data-display="inline" data-vcss="001" data-snippet="s_progress_bar">
                        <div class="s_progress_bar_wrapper d-flex gap-2">
                            <div class="progress" role="progressbar" aria-label="Progress bar" aria-valuenow="25" aria-valuemin="0" aria-valuemax="100">
                                <div class="progress-bar overflow-visible bg-o-color-5" style="width: 25%; min-width: 3%">
                                    <span class="s_progress_bar_text small d-none">25%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="o_grid_item o_cc o_cc2 g-col-lg-5 g-height-12 col-lg-5 rounded" style="grid-area: 1 / 8 / 13 / 13; --grid-item-padding-y: 64px; --grid-item-padding-x: 40px; z-index: 4;">
                    <div class="s_chart" data-type="doughnut" data-legend-position="none" data-tooltip-display="false" data-stacked="false" data-border-width="2" data-data="{&quot;labels&quot;:[&quot;First&quot;,&quot;Second&quot;],&quot;datasets&quot;:[{&quot;label&quot;:&quot;One&quot;,&quot;data&quot;:[&quot;25&quot;,&quot;75&quot;],&quot;backgroundColor&quot;:[&quot;o-color-3&quot;,&quot;o-color-5&quot;],&quot;borderColor&quot;:[&quot;&quot;,&quot;&quot;]}]}" data-snippet="s_chart" data-name="Chart">
                        <p><br/></p>
                        <canvas style="box-sizing: border-box;" width="456" height="228"/>
                    </div>
                    <!-- Placeholder chart, to be displayed in the preview modal -->
                    <svg xmlns="http://www.w3.org/2000/svg" class="s_dialog_preview d-block mt-3 mx-auto" width="450" height="230" viewBox="0 0 100 110">
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="transparent" stroke-width="25"/>
                        <circle cx="50" cy="55" r="40" fill="transparent" stroke="var(--o-color-5)" stroke-width="25" stroke-dasharray="251.2" stroke-dashoffset="62.8"/>
                    </svg>
                    <!-- End of placeholder -->
                    <p><br/></p>
                    <p class="display-1-fs" style="text-align: center;">75%</p>
                    <p class="o_small-fs text-600" style="text-align: center;">75% of clients have been using the service for over a decade consistently.</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=807 key=website.s_numbers_framed name=Numbers framed active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Numbers framed" t-name="website.s_numbers_framed">
    <section class="s_numbers_framed o_colored_level pt80 pb80" data-oe-shape-data="{'shape':'html_builder/Blobs/05_001','flip':[], 'showOnMobile':true}">
        <div class="o_we_shape o_shape_show_mobile o_html_builder_Blobs_05_001"/>
        <div class="o_container_small">
            <h2 style="text-align: center;">Insights, stats, and metrics</h2>
            <p class="lead" style="text-align: center;">This section allows to highlight key statistics.</p>
            <div class="row">
                <div class="col-12 col-lg-4 o_cc o_cc2 pt48 pb48">
                    <h3 class="display-1" style="text-align: center;">12k</h3>
                    <p class="fw-bold" style="text-align: center;">Useful options</p>
                </div>
                <div class="col-12 col-lg-4 o_cc o_cc2 pt48 pb48">
                    <h3 class="display-1" style="text-align: center;">45%</h3>
                    <p class="fw-bold" style="text-align: center;">More leads</p>
                </div>
                <div class="col-12 col-lg-4 o_cc o_cc2 pt48 pb48">
                    <h3 class="display-1" style="text-align: center;">8+</h3>
                    <p class="fw-bold" style="text-align: center;">Amazing pages</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=800 key=website.s_numbers_grid name=Numbers Grid active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Numbers Grid" t-name="website.s_numbers_grid">
    <section class="s_numbers_grid o_cc o_cc2 pt56 pb56">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="6" style="gap: 8px;">
                <div class="o_grid_item g-col-lg-3 g-height-3 col-lg-3 col-6 o_cc o_cc1 border rounded" data-name="Number Cell" style="grid-area: 1 / 1 / 4 / 4; z-index: 1; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <p>
                        Revenue Growth<br/>
                        <span class="h1-fs">54%</span>
                    </p>
                </div>
                <div class="o_grid_item g-col-lg-3 g-height-3 col-lg-3 col-6 o_cc o_cc1 border rounded" data-name="Number Cell" style="grid-area: 1 / 4 / 4 / 7;; z-index: 2; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <p>
                        Projects deployed<br/>
                        <span class="h1-fs">+225</span>
                    </p>
                </div>
                <div class="o_grid_item g-col-lg-3 g-height-3 col-lg-3 col-6 o_cc o_cc1 border rounded" data-name="Number Cell" style="grid-area: 1 / 7 / 4 / 10; z-index: 3; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <p>
                        Expected revenue<br/>
                        <span class="h1-fs">$50M</span>
                    </p>
                </div>
                <div class="o_grid_item g-col-lg-3 g-height-3 col-lg-3 col-6 o_cc o_cc1 border rounded" data-name="Number Cell" style="grid-area: 1 / 10 / 4 / 13; z-index: 4; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <p>
                        Online Members<br/>
                        <span class="h1-fs">235,403</span>
                    </p>
                </div>
                <div class="o_grid_item g-col-lg-3 g-height-3 col-lg-3 col-6 o_cc o_cc1 border rounded" data-name="Number Cell" style="grid-area: 4 / 1 / 7 / 4; z-index: 5; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <p>
                        Customer Retention<br/>
                        <span class="h1-fs">85%</span>
                    </p>
                </div>
                <div class="o_grid_item g-col-lg-3 g-height-3 col-lg-3 col-6 o_cc o_cc1 border rounded" data-name="Number Cell" style="grid-area: 4 / 4 / 7 / 7; z-index: 6; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <p>
                        Inventory turnover<br/>
                        <span class="h1-fs">4x</span>
                    </p>
                </div>
                <div class="o_grid_item g-col-lg-3 g-height-3 col-lg-3 col-6 o_cc o_cc1 border rounded" data-name="Number Cell" style="grid-area: 4 / 7 / 7 / 10; z-index: 7; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <p>
                        Website visitors<br/>
                        <span class="h1-fs">100,000</span>
                    </p>
                </div>
                <div class="o_grid_item g-col-lg-3 g-height-3 col-lg-3 col-6 o_cc o_cc1 border rounded" data-name="Number Cell" style="grid-area: 4 / 10 / 7 / 13; z-index: 8; --grid-item-padding-y: 16px; --grid-item-padding-x: 16px;">
                    <p>
                        Transactions<br/>
                        <span class="h1-fs">45,958</span>
                    </p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=895 key=website.s_numbers_list name=Numbers list active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Numbers list" t-name="website.s_numbers_list">
    <section class="s_numbers_list o_cc o_cc1 pt80 pb80">
        <div class="container">
            <div class="row s_nb_column_fixed">
                <div class="col-lg-5 pb32">
                    <h2 class="h3-fs">Key Metrics of Company's Achievements</h2>
                    <p><br/>From revenue growth to customer retention and market expansion, our key metrics of company achievements underscore our strategic prowess and dedication to driving sustainable business success.</p>
                </div>
                <div class="col-12 col-lg-3 offset-lg-1">
                    <p>
                        <span class="h2-fs">15%</span><br/>
                        Revenue Growth
                    </p>
                    <div class="s_hr pt16 pb40" data-snippet="s_hr" data-name="Separator">
                        <hr class="w-100 mx-auto"/>
                    </div>
                    <p>
                        <span class="h2-fs">$50M</span><br/>
                        Expected revenue
                    </p>
                    <div class="s_hr pt16 pb40" data-snippet="s_hr" data-name="Separator">
                        <hr class="w-100 mx-auto"/>
                    </div>
                    <p>
                        <span class="h2-fs">85%</span><br/>
                        User Retention
                    </p>
                    <div class="s_hr pt16 pb40" data-snippet="s_hr" data-name="Separator">
                        <hr class="w-100 mx-auto"/>
                    </div>
                </div>
                <div class="col-12 col-lg-3">
                    <p>
                        <span class="h2-fs">100,000</span><br/>
                        Website visitors
                    </p>
                    <div class="s_hr pt16 pb40" data-snippet="s_hr" data-name="Separator">
                        <hr class="w-100 mx-auto"/>
                    </div>
                    <p>
                        <span class="h2-fs">20+</span><br/>
                        Projects deployed
                    </p>
                    <div class="s_hr pt16 pb40" data-snippet="s_hr" data-name="Separator">
                        <hr class="w-100 mx-auto"/>
                    </div>
                    <p>
                        <span class="h2-fs">4x</span><br/>
                        Inventory turnover
                    </p>
                    <div class="s_hr pt16 pb40" data-snippet="s_hr" data-name="Separator">
                        <hr class="w-100 mx-auto"/>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=827 key=website.s_numbers_showcase name=Numbers Showcase active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Numbers Showcase" t-name="website.s_numbers_showcase">
    <section class="s_numbers_showcase pt80 pb80 o_colored_level">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="8" style="gap: 24px;">
                <div class="o_grid_item g-height-8 g-col-lg-4 col-lg-4" style="--grid-item-padding-y: 16px; --grid-item-padding-x: 16px; grid-area: 1 / 1 / 9 / 5; z-index: 1;">
                    <h2>Explore our<br/> key statistics</h2>
                    <p><br/></p>
                    <p class="lead">Analyzing the numbers behind our success: an in-depth look at the key metrics driving our company's achievements.</p>
                    <p><a href="#" class="btn btn-primary o_translate_inline" role="button">More details</a></p>
                </div>
                <div class="o_grid_item g-height-4 g-col-lg-4 col-lg-4 o_cc o_cc3" style="--grid-item-padding-y: 32px; --grid-item-padding-x: 32px; grid-area: 1 / 5 / 5 / 9; z-index: 2;">
                    <h3 class="display-3-fs">12k</h3>
                    <p><br/></p>
                    <h4>Useful options</h4>
                    <p>Explore a vast array of practical and beneficial choices.</p>
                </div>
                <div class="o_grid_item g-height-4 g-col-lg-4 col-lg-4 o_cc o_cc5" style="--grid-item-padding-y: 32px; --grid-item-padding-x: 32px; grid-area: 1 / 9 / 5 / 13; z-index: 3;">
                    <h3 class="display-3-fs">45%</h3>
                    <p><br/></p>
                    <h4>More leads</h4>
                    <p>Boost your pipeline with an increase in potential leads.</p>
                </div>
                <div class="o_grid_item g-height-4 g-col-lg-8 col-lg-8 o_cc o_cc4" style="--grid-item-padding-y: 32px; --grid-item-padding-x: 32px; grid-area: 5 / 5 / 9 / 13; z-index: 4;">
                    <h3 class="display-3-fs">8+</h3>
                    <p><br/></p>
                    <h4>Amazing pages</h4>
                    <p>Discover outstanding and highly engaging web pages.</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=820 key=website.s_opening_hours name=Opening Hours active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Opening Hours" t-name="website.s_opening_hours">
    <section class="s_opening_hours parallax pt256" data-scroll-background-ratio="1.5">
        <span class="s_parallax_bg_wrap">
            <span class="s_parallax_bg oe_img_bg o_bg_img_center" style="background-image: url('/web/image/website.s_opening_hours_default_image'); background-position: 50% 75%;"/>
        </span>
        <div class="container-fluid">
            <div class="row o_grid_mode" data-row-count="7">
                <!-- This next div is intended to correct a visual issue, specifically a vertical line anomaly next to the hours, that appears only in the modal preview.-->
                <div class="s_dialog_preview o_grid_item o_cc o_cc1 g-col-lg-10 g-height-7 col-lg-10" style="z-index: 2; grid-area: 1 / 2 / 8 / 12; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;"/>
                <div class="o_grid_item o_cc o_cc1 g-col-lg-6 g-height-7 col-lg-6" style="grid-area: 1 / 2 / 8 / 8; z-index: 3; --grid-item-padding-y: 32px; --grid-item-padding-x: 40px;">
                    <h2 class="display-4-fs">Let’s get in touch</h2>
                    <p class="lead"><u>info@yourcompany.example.com</u></p>
                </div>
                <div class="o_grid_item o_cc o_cc1 g-col-lg-2 g-height-7 col-lg-2 col-6" style="grid-area: 1 / 8 / 8 / 10; z-index: 4; --grid-item-padding-y: 32px; --grid-item-padding-x: 40px;">
                    <p class="o_small-fs"><u>Monday</u><br/>8.00am-6.00pm</p>
                    <p class="o_small-fs"><u>Tuesday</u><br/>8.00am-6.00pm</p>
                    <p class="o_small-fs"><u>Wednesday</u><br/>8.00am-12.00am</p>
                    <p class="o_small-fs"><u>Thursday</u><br/>8.00am-6.00pm</p>
                </div>
                <div class="o_grid_item o_cc o_cc1 g-col-lg-2 g-height-7 col-lg-2 col-6" style="grid-area: 1 / 10 / 8 / 12; z-index:5; --grid-item-padding-y: 32px; --grid-item-padding-x: 40px;">
                    <p class="o_small-fs"><u>Friday</u><br/>8.00am-6.00pm</p>
                    <p class="o_small-fs"><u>Saturday</u><br/>8.00am-6.00pm</p>
                    <p class="o_small-fs"><u>Sunday</u><br/>Closed</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=798 key=website.s_parallax name=Parallax active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Parallax" t-name="website.s_parallax">
    <section class="s_parallax parallax s_parallax_is_fixed bg-black-50 o_half_screen_height" data-scroll-background-ratio="1">
        <span class="s_parallax_bg_wrap">
            <span class="s_parallax_bg oe_img_bg" style="background-image: url('/web/image/website.s_parallax_default_image'); background-position: 50% 75%;"/>
        </span>
        <div class="o_we_bg_filter bg-black-50"/>
        <div class="oe_structure oe_empty"/>
    </section>
</t>

- kind=other id=748 key=website.s_picture name=Title - Image active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Title - Image" t-name="website.s_picture">
    <section class="s_picture pt64 pb64">
        <div class="o_container_small">
            <h2 style="text-align: center;">Step Up Your Game</h2>
            <p style="text-align: center;">Experience unparalleled comfort, cutting-edge design, and performance-enhancing<br/>technology with this latest innovation, crafted to elevate every athlete's journey.</p>
            <div class="row">
                <div class="col-lg-12 pt24" style="text-align: center;">
                    <figure class="figure w-100">
                        <img src="/web/image/website.s_picture_default_image" class="figure-img img-fluid rounded" alt=""/>
                        <figcaption class="figure-caption text-muted mt-2">Where innovation meets performance</figcaption>
                    </figure>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=965 key=website.s_picture_only name=s_picture_only active=True website=null inherit={"id": 961, "name": "new_page_template_s_picture"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="data-snippet">s_picture</attribute>
        <attribute name="class" add="o_colored_level" separator=" "/>
    </xpath>
    <xpath expr="//h1|//h2" position="replace"/>
    <xpath expr="//p" position="replace"/>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_picture_only</attribute></xpath></data>

- kind=other id=788 key=website.s_popup name=Popup active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Popup" t-name="website.s_popup">
    <!--
    Note: those popups are saved with the d-none class but this is not part of
    their XML definition here as that would hurt the drag and drop feature.
    -->
    <div class="s_popup o_snippet_invisible" data-vcss="001">
        <div class="modal fade s_popup_middle" style="background-color: var(--black-50) !important;" data-show-after="5000" data-display="afterDelay" data-consents-duration="7" data-bs-focus="false" data-bs-backdrop="false" tabindex="-1" role="dialog" aria-label="Popup">
            <div class="modal-dialog d-flex">
                <div class="modal-content oe_structure">
                    <div class="s_popup_close js_close_popup o_we_no_overlay o_not_editable" aria-label="Close">×</div>
                    <section class="s_banner oe_img_bg o_bg_img_center pt96 pb96" data-snippet="s_banner" style="background-image: url('/web/image/website.s_popup_default_image');">
                        <div class="container">
                            <div class="row s_nb_column_fixed">
                                <div class="col-lg-10 offset-lg-1 text-center o_cc o_cc1 jumbotron pt48 pb48">
                                    <h2 class="display-3-fs">Win $20</h2>
                                    <p class="lead">Check out now and get $20 off your first order.</p>
                                    <a href="#" class="btn btn-primary">New customer</a>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    </div>
</t>

- kind=other id=830 key=website.s_pricelist_boxed name=Pricelist Boxed active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Pricelist Boxed" t-name="website.s_pricelist_boxed">
    <section class="s_pricelist_boxed pt72 pb72 o_colored_level parallax s_parallax_is_fixed" data-scroll-background-ratio="1">
        <span class="s_parallax_bg_wrap">
            <span class="s_parallax_bg oe_img_bg o_bg_img_center" style="background-image: url('/web/image/website.s_pricelist_boxed_default_background');"/>
        </span>
        <div class="container">
            <div class="row">
                <div class="offset-lg-2 col-lg-8 rounded px-3 px-md-5 pt48 pb48 o_cc o_cc1" data-name="Menu">
                    <div class="row">
                        <div class="col-lg-12" data-name="Menu Heading">
                            <h2 style="text-align:center;">Our Menu</h2>
                            <p class="lead" style="text-align:center;">Savor our fresh, local cuisine with a modern twist.<br/>Deliciously crafted for every taste!</p>
                        </div>
                        <div class="s_pricelist_boxed_section col-lg-12 pt48" data-name="Menu Section">
                            <h3>✽  Pizzas</h3>
                            <ul class="list-unstyled m-0">
                                <t t-call="website.s_pricelist_boxed_item">
                                    <t t-set="name">Margherita</t>
                                    <t t-set="price">$12.00</t>
                                    <t t-set="description">Classic pizza with fresh mozzarella, San Marzano tomatoes, and basil leaves, drizzled with extra virgin olive oil.</t>
                                </t>
                                <t t-call="website.s_pricelist_boxed_item">
                                    <t t-set="name">Quattro Stagioni</t>
                                    <t t-set="price">$14.50</t>
                                    <t t-set="description">A delicious mix of four toppings: mushrooms, artichokes, ham, and olives, all on a bed of mozzarella and tomato sauce.</t>
                                </t>
                                <t t-call="website.s_pricelist_boxed_item">
                                    <t t-set="name">Diavola</t>
                                    <t t-set="price">$13.50</t>
                                    <t t-set="description">Spicy pepperoni paired with fiery chili flakes, mozzarella, and tomato sauce for a flavorful kick.</t>
                                </t>
                            </ul>
                        </div>
                        <div class="s_pricelist_boxed_section col-lg-12 pt48" data-name="Menu Section">
                            <h3>✽  Pastas</h3>
                            <ul class="list-unstyled m-0">
                                <t t-call="website.s_pricelist_boxed_item">
                                    <t t-set="name">Spaghetti Carbonara</t>
                                    <t t-set="price">$15.00</t>
                                    <t t-set="description">Traditional Roman dish with creamy egg, crispy pancetta, and Pecorino Romano, topped with black pepper.</t>
                                </t>
                                <t t-call="website.s_pricelist_boxed_item">
                                    <t t-set="name">Penne all'Arrabbiata</t>
                                    <t t-set="price">$13.00</t>
                                    <t t-set="description">Penne pasta tossed in a spicy tomato and garlic sauce with a hint of chili peppers, finished with fresh parsley.</t>
                                </t>
                                <t t-call="website.s_pricelist_boxed_item">
                                    <t t-set="name">Lasagna al Forno</t>
                                    <t t-set="price">$16.00</t>
                                    <t t-set="description">Layers of pasta, rich meat ragu, béchamel sauce, and melted mozzarella, baked to perfection.</t>
                                </t>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=831 key=website.s_pricelist_boxed_item name=s_pricelist_boxed_item active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_pricelist_boxed_item">
    <li class="s_pricelist_boxed_item mt-4" data-name="Menu Item">
        <p class="s_pricelist_boxed_item_title d-flex align-items-baseline fw-bold">
            <span class="d-flex flex-grow-1 align-items-center">
                <span t-out="name" class="s_pricelist_boxed_item_name"/>
                <span class="s_pricelist_boxed_item_line flex-grow-1 ms-2 border-top"/>
            </span>
            <span t-out="price" class="s_pricelist_boxed_item_price ms-auto ps-3"/>
        </p>
        <p t-if="description" t-out="description" class="s_pricelist_boxed_item_description d-block mt-2 pe-5 text-muted o_small-fs"/>
    </li>
</t>

- kind=other id=848 key=website.s_pricelist_cafe name=Pricelist Cafe active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Pricelist Cafe" t-name="website.s_pricelist_cafe">
    <section class="s_pricelist_cafe" data-oe-shape-data="{'shape':'html_builder/Bold/16','flip':[]}">
        <div class="o_we_shape o_html_builder_Bold_16"/>
        <div class="container">
            <div class="row">
                <div class="col-lg-5 pt64 o_cc o_cc5">
                    <h2 class="h3-fs">Discover our drinks</h2>
                    <p class="lead">Explore our curated selection of coffee, tea, and more. Delight in every sip!</p>
                </div>
            </div>
            <div class="row align-items-center">
                <div class="s_pricelist_cafe_col col-lg-4 py-5 o_cc o_cc5 s_col_no_resize">
                    <h3>Coffees</h3>
                    <ul class="list-unstyled my-3">
                        <t t-call="website.s_pricelist_cafe_item">
                            <t t-set="name">Coffee Latte</t>
                            <t t-set="price">$4.50</t>
                            <t t-set="description">Sleek, minimalist space offering meticulously brewed coffee and espresso drinks using freshly roasted beans.</t>
                        </t>
                        <t t-call="website.s_pricelist_cafe_item">
                            <t t-set="name">Cappuccino</t>
                            <t t-set="price">$4.25</t>
                            <t t-set="description">A vibrant spot known for its expertly crafted coffee, sourced directly from farmers and roasted to perfection.</t>
                        </t>
                        <t t-call="website.s_pricelist_cafe_item">
                            <t t-set="name">Espresso</t>
                            <t t-set="price">$4.10</t>
                            <t t-set="description">Artisanal espresso with a focus on direct trade and exceptional quality in a chic, comfortable setting.</t>
                        </t>
                    </ul>
                </div>
                <div class="s_pricelist_cafe_col col-lg-4 d-lg-block d-none o_snippet_mobile_invisible s_col_no_resize">
                    <img class="img img-fluid d-block mx-auto rounded-circle shadow" src="/web/image/website.s_pricelist_cafe_default_image" alt=""/>
                </div>
                <div class="s_pricelist_cafe_col col-lg-4 py-5 o_cc o_cc1 s_col_no_resize">
                    <h3>Teas</h3>
                    <ul class="list-unstyled my-3">
                        <t t-call="website.s_pricelist_cafe_item">
                            <t t-set="name">Earl Grey</t>
                            <t t-set="price">$3.50</t>
                            <t t-set="description">A classic black tea blend infused with the aromatic essence of bergamot, offering a fragrant, citrusy flavor.</t>
                        </t>
                        <t t-call="website.s_pricelist_cafe_item">
                            <t t-set="name">Jasmine Green Tea</t>
                            <t t-set="price">$3.00</t>
                            <t t-set="description">Delicate green tea scented with jasmine blossoms, providing a soothing and floral experience.</t>
                        </t>
                        <t t-call="website.s_pricelist_cafe_item">
                            <t t-set="name">Chamomile Tea</t>
                            <t t-set="price">$4.00</t>
                            <t t-set="description">Herbal tea made from dried chamomile flowers, known for its calming properties and gentle, apple-like flavor.</t>
                        </t>
                    </ul>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=849 key=website.s_pricelist_cafe_item name=s_pricelist_cafe_item active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_pricelist_cafe_item">
    <li class="s_pricelist_cafe_item mb-4" data-name="Product">
        <p class="s_pricelist_cafe_item_title d-flex align-items-baseline fw-bold">
            <span class="d-flex flex-grow-1 align-items-center">
                <span t-out="name" class="s_pricelist_cafe_item_name"/>
                <span class="s_pricelist_cafe_item_line flex-grow-1 ms-2 border-top"/>
            </span>
            <span t-out="price" class="s_pricelist_cafe_item_price ms-auto ps-3"/>
        </p>
        <p t-if="description" t-out="description" class="s_pricelist_cafe_item_description d-block mt-2 pe-5 text-muted o_small-fs"/>
    </li>
</t>

- kind=other id=824 key=website.s_process_steps name=Steps active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Steps" t-name="website.s_process_steps">
    <section class="s_process_steps pt72 pb72 s_process_steps_connector_line" data-vcss="002" data-vxml="002">
        <svg class="s_process_step_svg_defs position-absolute">
            <defs>
                <marker class="s_process_steps_arrow_head" markerWidth="15" markerHeight="10" refX="6" refY="6" orient="auto">
                    <path d="M 2,2 L10,6 L2,10 L6,6 L2,2" vector-effect="non-scaling-size"/>
                </marker>
            </defs>
        </svg>
        <div class="container">
            <h2 class="mb-4 text-center h3-fs">Our process in four easy steps</h2>
            <div class="row g-0">
                <div class="col-lg-3 s_process_step position-relative pt24 pb24">
                    <svg class="s_process_step_connector position-absolute z-index-1" viewBox="0 0 100 20" preserveAspectRatio="none">
                        <path d="M 0 10 L 100 10" vector-effect="non-scaling-stroke"/>
                    </svg>
                    <div class="s_process_step_number d-flex align-items-center justify-content-center mx-auto rounded-circle bg-primary-light" data-name="Step Number">
                        <h3 class="mb-0 text-primary text-center">1</h3>
                    </div>
                    <div class="s_process_step_content mt-3 px-3 text-center">
                        <h3 class="h4-fs">Add to cart</h3>
                        <p>Let your customers understand your process.</p>
                    </div>
                </div>
                <div class="col-lg-3 s_process_step position-relative pt24 pb24">
                    <svg class="s_process_step_connector position-absolute z-index-1" viewBox="0 0 100 20" preserveAspectRatio="none">
                        <path d="M 0 10 L 100 10" vector-effect="non-scaling-stroke"/>
                    </svg>
                    <div class="s_process_step_number d-flex align-items-center justify-content-center mx-auto rounded-circle bg-primary-light" data-name="Step Number">
                        <h3 class="mb-0 text-primary text-center">2</h3>
                    </div>
                    <div class="s_process_step_content mt-3 px-3 text-center">
                        <h3 class="h4-fs">Sign in</h3>
                        <p>Click on the number to adapt it to your purpose.</p>
                    </div>
                </div>
                <div class="col-lg-3 s_process_step position-relative pt24 pb24">
                    <svg class="s_process_step_connector position-absolute z-index-1" viewBox="0 0 100 20" preserveAspectRatio="none">
                        <path d="M 0 10 L 100 10" vector-effect="non-scaling-stroke"/>
                    </svg>
                    <div class="s_process_step_number d-flex align-items-center justify-content-center mx-auto rounded-circle bg-primary-light" data-name="Step Number">
                        <h3 class="mb-0 text-primary text-center">3</h3>
                    </div>
                    <div class="s_process_step_content mt-3 px-3 text-center">
                        <h3 class="h4-fs">Pay</h3>
                        <p>Duplicate blocks to add more steps.</p>
                    </div>
                </div>
                <div class="col-lg-3 s_process_step position-relative pt24 pb24">
                    <svg class="s_process_step_connector position-absolute z-index-1" viewBox="0 0 100 20" preserveAspectRatio="none">
                        <path d="M 0 10 L 100 10" vector-effect="non-scaling-stroke"/>
                    </svg>
                    <div class="s_process_step_number d-flex align-items-center justify-content-center mx-auto rounded-circle bg-primary-light" data-name="Step Number">
                        <h3 class="mb-0 text-primary text-center">4</h3>
                    </div>
                    <div class="s_process_step_content mt-3 px-3 text-center">
                        <h3 class="h4-fs">Get Delivered</h3>
                        <p>Select and delete blocks to remove some steps.</p>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=773 key=website.s_product_catalog name=Pricelist active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Pricelist" t-name="website.s_product_catalog">
    <section class="s_product_catalog oe_img_bg o_bg_img_center oe_custom_bg pt64 pb64" style="background-image: url('/web/image/website.s_product_catalog_default_image');" data-vcss="002">
        <div class="o_we_bg_filter bg-white-85"/>
        <div class="container">
            <h2 class="h3-fs" style="text-align: center;">Our Menu</h2>
            <p class="lead" style="text-align: center;">Handcrafted Delights: Everything Homemade, Just for You.</p>
            <p><br/></p>
            <div class="row">
                <div class="col-lg-6 pt16 pb16">
                    <h3 class="h4-fs">Pastries</h3>
                    <ul class="list-unstyled my-3">
                        <t t-call="website.s_product_catalog_dish">
                            <t t-set="name">Croissant</t>
                            <t t-set="price">$1.50</t>
                            <t t-set="description">A buttery, flaky pastry with a golden-brown crust, perfect for breakfast or a light snack.</t>
                        </t>
                        <t t-call="website.s_product_catalog_dish">
                            <t t-set="name">Cinnamon Roll</t>
                            <t t-set="price">$3.00</t>
                            <t t-set="description">Soft, sweet dough rolled with cinnamon and sugar, topped with a rich cream cheese frosting.</t>
                        </t>
                        <t t-call="website.s_product_catalog_dish">
                            <t t-set="name">Sourdough Bread</t>
                            <t t-set="price">$5.00</t>
                            <t t-set="description">A crusty loaf with a chewy interior, made with a naturally fermented sourdough starter for a tangy flavor.</t>
                        </t>
                    </ul>
                </div>
                <div class="col-lg-6 pt16 pb16">
                    <h3 class="h4-fs">Cakes</h3>
                    <ul class="list-unstyled my-3">
                        <t t-call="website.s_product_catalog_dish">
                            <t t-set="name">Classic Cheesecake</t>
                            <t t-set="price">$25.00</t>
                            <t t-set="description">A creamy, smooth cheesecake with a graham cracker crust, topped with a layer of fresh fruit or chocolate ganache.</t>
                        </t>
                        <t t-call="website.s_product_catalog_dish">
                            <t t-set="name">Red Velvet Cake</t>
                            <t t-set="price">$28.00</t>
                            <t t-set="description">A moist, red-hued cake with layers of cream cheese frosting, perfect for any special occasion.</t>
                        </t>
                        <t t-call="website.s_product_catalog_dish">
                            <t t-set="name">Carrot Cake</t>
                            <t t-set="price">$26.00</t>
                            <t t-set="description">A spiced cake loaded with grated carrots, nuts, and a hint of cinnamon, topped with a tangy cream cheese frosting.</t>
                        </t>
                    </ul>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=774 key=website.s_product_catalog_dish name=s_product_catalog_dish active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.s_product_catalog_dish">
    <li class="s_product_catalog_dish mb-4" data-name="Product">
        <p class="s_product_catalog_dish_title d-flex align-items-baseline fw-bold">
            <span class="d-flex flex-grow-1 align-items-center">
                <span t-out="name" class="s_product_catalog_dish_name"/>
                <span class="s_product_catalog_dish_dot_leaders flex-grow-1 ms-2 border-top"/>
            </span>
            <span t-out="price" class="s_product_catalog_dish_price ms-auto ps-3"/>
        </p>
        <p t-if="description" t-out="description" class="s_product_catalog_dish_description d-block mt-2 pe-5 text-muted"/>
    </li>
</t>

- kind=other id=856 key=website.s_product_list name=Items active=True website=null inherit=null
  signals: hrefs_total=12 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Items" t-name="website.s_product_list">
    <t t-set="url" t-value="url or '#'"/>
    <section class="s_product_list pt64 pb64" data-vcss="001">
        <div class="container">
            <h2 class="h3-fs">Our finest selection</h2>
            <div class="row">
                <div data-name="Card" class="col-lg-2 col-6">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-snippet="s_card" data-vxml="001" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-4x3 mb-0">
                            <a t-att-href="url" aria-label="Link to product">
                                <img src="/web/image/website.s_product_list_default_image_1" alt="" class="o_card_img card-img-top"/>
                            </a>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;"><a t-att-href="url">Elegant</a></h3>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-2 col-6">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-snippet="s_card" data-vxml="001" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-4x3 mb-0">
                            <a t-att-href="url" aria-label="Link to product">
                                <img src="/web/image/website.s_product_list_default_image_2" alt="" class="o_card_img card-img-top"/>
                            </a>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;"><a t-att-href="url">Simple</a></h3>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-2 col-6">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-snippet="s_card" data-vxml="001" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-4x3 mb-0">
                            <a t-att-href="url" aria-label="Link to product">
                                <img src="/web/image/website.s_product_list_default_image_3" alt="" class="o_card_img card-img-top"/>
                            </a>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;"><a t-att-href="url">Balanced</a></h3>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-2 col-6">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-snippet="s_card" data-vxml="001" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-4x3 mb-0">
                            <a t-att-href="url" aria-label="Link to product">
                                <img src="/web/image/website.s_product_list_default_image_4" alt="" class="o_card_img card-img-top"/>
                            </a>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;"><a t-att-href="url">Subtle</a></h3>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-2 col-6">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-snippet="s_card" data-vxml="001" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-4x3 mb-0">
                            <a t-att-href="url" aria-label="Link to product">
                                <img src="/web/image/website.s_product_list_default_image_5" alt="" class="o_card_img card-img-top"/>
                            </a>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;"><a t-att-href="url">Sleek</a></h3>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-2 col-6">
                    <div class="s_card o_card_img_top card o_cc o_cc1" data-snippet="s_card" data-vxml="001" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-4x3 mb-0">
                            <a t-att-href="url" aria-label="Link to product">
                                <img src="/web/image/website.s_product_list_default_image_6" alt="" class="o_card_img card-img-top"/>
                            </a>
                        </figure>
                        <div class="card-body">
                            <h3 class="card-title h5-fs" style="text-align: center;"><a t-att-href="url">Modern</a></h3>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=850 key=website.s_progress_bar name=Progress Bar active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Progress Bar" t-name="website.s_progress_bar">
    <div class="s_progress_bar s_progress_bar_label_inline mb-2" data-display="inline" data-vcss="001">
        <h4 class="h6-fs">We are almost done!</h4>
        <div class="s_progress_bar_wrapper d-flex gap-2">
            <div class="progress" role="progressbar" aria-label="Progress bar" aria-valuenow="80" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar overflow-visible" style="width: 80%; min-width: 3%">
                    <span class="s_progress_bar_text small">80%</span>
                </div>
            </div>
        </div>
    </div>
</t>

- kind=other id=896 key=website.s_quadrant name=Quadrant active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Quadrant" t-name="website.s_quadrant">
    <section class="s_quadrant">
        <div class="container-fluid">
            <div class="row o_grid_mode" data-row-count="14">
                <div class="o_grid_item o_grid_item_image g-col-lg-6 g-height-7 col-lg-6 d-lg-block d-none o_snippet_mobile_invisible order-lg-0" style="order: 1; z-index: 1; grid-area: 1 / 1 / 8 / 7; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img class="img img-fluid" src="/web/image/website.s_quadrant_default_image_1" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-6 g-height-7 col-lg-6 order-lg-0" style="order: 2; z-index: 2; grid-area: 1 / 7 / 8 / 13; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img class="img img-fluid" src="/web/image/website.s_quadrant_default_image_2" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-6 g-height-7 col-lg-6 order-lg-0" style="order: 4; z-index: 3; grid-area: 8 / 1 / 15 / 7; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img class="img img-fluid" src="/web/image/website.s_quadrant_default_image_3" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-6 g-height-7 col-lg-6 d-lg-block d-none o_snippet_mobile_invisible order-lg-0" style="order: 5; z-index: 4; grid-area: 8 / 7 / 15 / 13; --grid-item-padding-y: 0px; --grid-item-padding-x: 0px;">
                    <img class="img img-fluid" src="/web/image/website.s_quadrant_default_image_4" alt=""/>
                </div>
                <div class="o_grid_item g-col-lg-6 g-height-8 col-lg-6 o_cc o_cc1 rounded justify-content-center order-lg-0" style="order: 3; z-index: 5; grid-area: 4 / 4 / 12 / 10; --grid-item-padding-y: 32px; --grid-item-padding-x: 32px;">
                    <h2 style="text-align: center;">Understanding the Innovation</h2>
                    <p class="lead" style="text-align: center;">Explore how our cutting-edge solutions redefine industry standards. To achieve excellence, we focus on what truly matters to our customers. <br/><br/> Begin by identifying their needs and exceed their expectations.</p>
                    <p style="text-align: center;">
                        <a t-att-href="cta_btn_href" class="btn btn-primary btn-lg o_translate_inline"><t t-out="cta_btn_text">Discover</t></a>
                    </p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=799 key=website.s_quotes_carousel name=Quotes active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Quotes" t-name="website.s_quotes_carousel">
    <section class="s_quotes_carousel_wrapper" data-vxml="001" data-vcss="002">
        <t t-set="uniq" t-value="datetime.datetime.now().microsecond"/>
        <div t-attf-id="myQuoteCarousel{{uniq}}" class="s_quotes_carousel s_carousel_boxed carousel carousel-dark slide o_cc o_cc2" data-bs-ride="true" data-bs-interval="10000">
            <!-- Content -->
            <div class="carousel-inner">
                <!-- #01 -->
                <div class="carousel-item active oe_img_bg o_bg_img_center pt80 pb80" style="background-image: url('/web/image/website.s_quotes_carousel_demo_image_0'); background-position: 50% 50%;" data-name="Slide">
                    <blockquote data-name="Blockquote" data-snippet="s_blockquote" class="s_blockquote s_blockquote_with_icon o_cc o_cc1 o_animable position-relative d-flex flex-column gap-4 w-50 mx-auto p-5 fst-normal" data-vcss="001">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right d-block mx-auto rounded bg-o-color-1" role="img"/>
                        </div>
                        <p class="s_blockquote_quote my-auto h4-fs" style="text-align:center;">" Write a quote here from one of your customers. Quotes are a great way to build confidence in your products or services. "</p>
                        <div class="s_blockquote_infos d-flex gap-2 flex-column align-items-center w-100 text-center">
                            <img src="/web/image/website.s_quotes_carousel_demo_image_3" class="s_blockquote_avatar img rounded-circle" alt=""/>
                            <div class="s_blockquote_author">
                                <span class="o_small-fs">
                                    <strong>Jane DOE</strong><br/>
                                    <span class="text-muted">CEO of MyCompany</span>
                                </span>
                            </div>
                        </div>
                    </blockquote>
                </div>
                <!-- #02 -->
                <div class="carousel-item oe_img_bg o_bg_img_center pt80 pb80" style="background-image: url('/web/image/website.s_quotes_carousel_demo_image_1'); background-position: 50% 50%;" data-name="Slide">
                    <blockquote data-name="Blockquote" data-snippet="s_blockquote" class="s_blockquote s_blockquote_with_icon o_cc o_cc1 o_animable position-relative d-flex flex-column gap-4 w-50 mx-auto p-5 fst-normal" data-vcss="001">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right d-block mx-auto rounded bg-o-color-1" role="img"/>
                        </div>
                        <p class="s_blockquote_quote my-auto h4-fs" style="text-align:center;">" Write a quote here from one of your customers. Quotes are a great way to build confidence in your products or services. "</p>
                        <div class="s_blockquote_infos d-flex gap-2 flex-column align-items-center w-100 text-center">
                            <img src="/web/image/website.s_quotes_carousel_demo_image_4" class="s_blockquote_avatar img rounded-circle" alt=""/>
                            <div class="s_blockquote_author">
                                <span class="o_small-fs">
                                    <strong>John DOE</strong><br/>
                                    <span class="text-muted">CCO of MyCompany</span>
                                </span>
                            </div>
                        </div>
                    </blockquote>
                </div>
                <!-- #03 -->
                <div class="carousel-item oe_img_bg o_bg_img_center pt80 pb80" style="background-image: url('/web/image/website.s_quotes_carousel_demo_image_2'); background-position: 50% 50%;" data-name="Slide">
                    <blockquote data-name="Blockquote" data-snippet="s_blockquote" class="s_blockquote s_blockquote_with_icon o_cc o_cc1 o_animable position-relative d-flex flex-column gap-4 w-50 mx-auto p-5 fst-normal" data-vcss="001">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right d-block mx-auto rounded bg-o-color-1" role="img"/>
                        </div>
                        <p class="s_blockquote_quote my-auto h4-fs" style="text-align:center;">" Write a quote here from one of your customers. Quotes are a great way to build confidence in your products or services. "</p>
                        <div class="s_blockquote_infos d-flex gap-2 flex-column align-items-center w-100 text-center">
                            <img src="/web/image/website.s_quotes_carousel_demo_image_5" class="s_blockquote_avatar img rounded-circle" alt=""/>
                            <div class="s_blockquote_author">
                                <span class="o_small-fs">
                                    <strong>Iris DOE</strong><br/>
                                    <span class="text-muted">Manager of MyCompany</span>
                                </span>
                            </div>
                        </div>
                    </blockquote>
                </div>
            </div>
            <!-- Controls -->
            <button class="carousel-control-prev o_not_editable" contenteditable="false" t-attf-data-bs-target="#myQuoteCar…

- kind=other id=802 key=website.s_quotes_carousel_compact name=Quotes Compact active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Quotes Compact" t-name="website.s_quotes_carousel_compact">
    <section class="s_quotes_carousel_wrapper" data-vxml="001" data-vcss="002">
        <t t-set="uniq" t-value="datetime.datetime.now().microsecond"/>
        <div t-attf-id="myQuoteCarouselCompact{{uniq}}" class="s_quotes_carousel s_quotes_carousel_compact s_carousel_default carousel carousel-dark slide" data-bs-ride="true" data-bs-interval="10000" data-option-name="CarouselBottomControllers">
            <!-- Content -->
            <div class="carousel-inner">
                <!-- #01 -->
                <div class="o_cc o_cc2 carousel-item active pt40 pb80 px-md-0" data-name="Slide">
                    <div class="container">
                        <div class="row">
                            <blockquote data-name="Blockquote" data-snippet="s_blockquote" class="s_blockquote s_blockquote_default o_animable position-relative d-flex flex-column gap-4 w-100 me-auto my-4 p-1 fst-normal" data-vcss="001">
                                <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                                <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                                    <i class="s_blockquote_icon fa fa-quote-right fa-3x d-block mx-auto" role="img"/>
                                </div>
                                <p class="s_blockquote_quote my-auto h2-fs">" This company transformed our business. <br/>Their solutions are innovative and reliable. "</p>
                                <div class="s_blockquote_infos gap-2 flex-row align-items-start justify-content-start w-100 text-start">
                                    <img src="/web/image/website.s_quotes_carousel_demo_image_3" class="s_blockquote_avatar img rounded-circle" alt=""/>
                                    <div class="s_blockquote_author">
                                        <span class="o_small-fs">
                                            <strong>Jane DOE</strong><br/>
                                            <span class="text-muted">CEO of MyCompany</span>
                                        </span>
                                    </div>
                                </div>
                            </blockquote>
                        </div>
                    </div>
                </div>
                <!-- #02 -->
                <div class="o_cc o_cc2 carousel-item pt40 pb80 px-md-0" data-name="Slide">
                    <div class="container">
                        <div class="row">
                            <blockquote data-name="Blockquote" data-snippet="s_blockquote" class="s_blockquote s_blockquote_default o_animable position-relative d-flex flex-column gap-4 w-100 me-auto my-4 p-1 fst-normal" data-vcss="001">
                                <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                                <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                                    <i class="s_blockquote_icon fa fa-quote-right fa-3x d-block mx-auto" role="img"/>
                                </div>
                                <p class="s_blockquote_quote my-auto h2-fs">" A trusted partner for growth. <br/>Professional, efficient, and always ahead of the curve. "</p>
                                <div class="s_blockquote_infos gap-2 flex-row align-items-start justify-content-start w-100 text-start">
                                    <img src="/web/image/website.s_quotes_carousel_demo_image_4" class="s_blockquote_avatar img rounded-circle" alt=""/>
                                    <div class="s_blockquote_author">
                                        <span class="o_small-fs">
                                            <strong>John DOE</strong><br/>
                                            <span class="text-muted">CCO of MyCompany</span>
                                        </span>
                                    </div>
                                </div>
                            </blockquote>
                        </div>
                    </div>
                </div>
                <!-- #03 -->
                <div class="o_cc o_cc2 carousel-item pt40 pb80 px-md-0" data-name="Slide">
                    <div class="container">
                        <div class="row">
                            <blockquote data-name="Blockquote" data-snippet="s_blockquote" class="s_blockquote s_blockquote_default o_animable position-relative d-flex flex-column gap-4 w-100 me-auto my-4 p-1 fst-normal" data-vcss="001">
                                <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                                <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                                    <i class="s_blockquote_icon fa fa-quote-right fa-3x d-block mx-auto" role="img"/>
                                </div>
                                <p class="s_blockquote_quote my-auto h2-fs">" Outstanding service and results! <br/>They exceeded our expectations in every project. "</p>
                                <div class="s_blockquote_infos gap-2 flex-row align-items-start justify-content-start w-100 text-start">
                                    <img src="/web/image/website.s_quotes_carousel_demo_image_5" class="s_blockquote_avatar img rounded-circle" alt=""/>
                                    <div class="s_blockquote_author">
                                        <span class="o_small-fs">
                                            <strong>Iris DOE</strong><br/>
                                            <span class="text-muted">Manager of MyCompany</span>
                                        </span>
                                    </div>
      …

- kind=other id=801 key=website.s_quotes_carousel_minimal name=Quotes Minimal active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Quotes Minimal" t-name="website.s_quotes_carousel_minimal">
    <section class="s_quotes_carousel_wrapper" data-vxml="001" data-vcss="002">
        <t t-set="uniq" t-value="datetime.datetime.now().microsecond"/>
        <div t-attf-id="myQuoteCarouselMinimal{{uniq}}" class="s_quotes_carousel s_carousel_default carousel carousel-dark slide" data-bs-ride="true" data-bs-interval="10000">
            <!-- Content -->
            <div class="carousel-inner">
                <!-- #01 -->
                <div class="carousel-item active pt80 pb80" data-name="Slide">
                    <blockquote data-name="Blockquote" data-snippet="s_blockquote" class="s_blockquote s_blockquote_with_icon o_animable position-relative d-flex flex-column gap-4 w-75 mx-auto my-4 p-5 fst-normal" data-vcss="001">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right fa-3x d-block mx-auto" role="img"/>
                        </div>
                        <p class="s_blockquote_quote my-auto h3-fs" style="text-align:center;">" This company transformed our business. <br/>Their solutions are innovative and reliable. "</p>
                        <div class="s_blockquote_infos d-flex gap-2 flex-column align-items-center w-100 text-center">
                            <img src="/web/image/website.s_quotes_carousel_demo_image_3" class="s_blockquote_avatar img rounded-circle" alt=""/>
                            <div class="s_blockquote_author">
                                <span class="o_small-fs">
                                    <strong>Jane DOE</strong><br/>
                                    <span class="text-muted">CEO of MyCompany</span>
                                </span>
                            </div>
                        </div>
                    </blockquote>
                </div>
                <!-- #02 -->
                <div class="carousel-item pt80 pb80" data-name="Slide">
                    <blockquote data-name="Blockquote" data-snippet="s_blockquote" class="s_blockquote s_blockquote_with_icon o_animable position-relative d-flex flex-column gap-4 w-75 mx-auto my-4 p-5 fst-normal" data-vcss="001">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right fa-3x d-block mx-auto" role="img"/>
                        </div>
                        <p class="s_blockquote_quote my-auto h3-fs" style="text-align:center;">" A trusted partner for growth. <br/>Professional, efficient, and always ahead of the curve. "</p>
                        <div class="s_blockquote_infos d-flex gap-2 flex-column align-items-center w-100 text-center">
                            <img src="/web/image/website.s_quotes_carousel_demo_image_4" class="s_blockquote_avatar img rounded-circle" alt=""/>
                            <div class="s_blockquote_author">
                                <span class="o_small-fs">
                                    <strong>John DOE</strong><br/>
                                    <span class="text-muted">CCO of MyCompany</span>
                                </span>
                            </div>
                        </div>
                    </blockquote>
                </div>
                <!-- #03 -->
                <div class="carousel-item pt80 pb80" data-name="Slide">
                    <blockquote data-name="Blockquote" data-snippet="s_blockquote" class="s_blockquote s_blockquote_with_icon o_animable position-relative d-flex flex-column gap-4 w-75 mx-auto my-4 p-5 fst-normal" data-vcss="001">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right fa-3x d-block mx-auto" role="img"/>
                        </div>
                        <p class="s_blockquote_quote my-auto h3-fs" style="text-align:center;">" Outstanding service and results! <br/>They exceeded our expectations in every project. "</p>
                        <div class="s_blockquote_infos d-flex gap-2 flex-column align-items-center w-100 text-center">
                            <img src="/web/image/website.s_quotes_carousel_demo_image_5" class="s_blockquote_avatar img rounded-circle" alt=""/>
                            <div class="s_blockquote_author">
                                <span class="o_small-fs">
                                    <strong>Iris DOE</strong><br/>
                                    <span class="text-muted">Manager of MyCompany</span>
                                </span>
                            </div>
                        </div>
                    </blockquote>
                </div>
            </div>
            <!-- Controls -->
            <button class="carousel-control-prev o_not_editable" contenteditable="false" t-attf-data-bs-target="#myQuoteCarouselMinimal{{uniq}}" data-bs-slide="prev" aria-label="Previous" title="Previous">
                <span class="carousel-control-prev-icon" aria-hidden="true"/>
                    <span class="visually-hidden">Previous</span>
            </button>
            <button class="carousel-control-next o_not_editable" t-attf-data-bs-target="#myQuoteCarouselMinimal{{uniq}}" data-bs-slide="next" aria-label="Next" title="Next">
                <span class="carousel-control-next-icon" aria-hidden="true"/>
                <span class="visually-hidden">Next</span>
   …

- kind=other id=761 key=website.s_rating name=Rating active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Rating" t-name="website.s_rating">
    <div class="s_rating s_rating_no_title pt16 pb16" data-vcss="001" data-icon="fa-star" aria-label="3 out of 5 stars">
        <strong class="s_rating_title">Rating</strong>
        <div class="s_rating_icons o_not_editable">
            <span class="s_rating_active_icons" style="color: #f3cc00;">
                <i class="fa fa-star" role="presentation"/>
                <i class="fa fa-star" role="presentation"/>
                <i class="fa fa-star" role="presentation"/>
            </span>
            <span class="s_rating_inactive_icons" style="color: var(--border-color);">
                <i class="fa fa-star" role="presentation"/>
                <i class="fa fa-star" role="presentation"/>
            </span>
        </div>
    </div>
</t>

- kind=other id=785 key=website.s_references name=References active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="References" t-name="website.s_references">
    <section class="s_references o_cc o_cc1 pt80 pb80">
        <div class="container">
            <h2 style="text-align: center;">Partners and references</h2>
            <p class="lead" style="text-align: center;">Use this section to boost your company's credibility.</p>
            <p style="text-align: center;">
                <a class="o_translate_inline" href="#">See our case studies <i class="fa fa-long-arrow-right ms-2"/></a>
            </p>
            <p><br/></p>
            <div class="row">
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_demo_image_1" class="img img-fluid mx-auto" alt=""/>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_demo_image_2" class="img img-fluid mx-auto" alt=""/>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_demo_image_3" class="img img-fluid mx-auto" alt=""/>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_demo_image_4" class="img img-fluid mx-auto" alt=""/>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_demo_image_5" class="img img-fluid mx-auto" alt=""/>
                </div>
                <div class="col-6 col-lg-2 pt16 pb16">
                    <img src="/web/image/website.s_reference_default_image_6" class="img img-fluid mx-auto" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=787 key=website.s_references_grid name=References Grid active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="References Grid" t-name="website.s_references_grid">
    <section class="s_references_grid o_cc o_cc1 pt64 pb64">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="4">
                <div class="o_grid_item g-height-4 g-col-lg-5 col-lg-5" style="grid-area: 1 / 1 / 5 / 6; z-index: 1;">
                    <h2>Trusted references</h2>
                    <p class="lead">We are in good company.</p>
                    <a href="#" class="btn btn-primary">See our case studies</a>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-2 g-height-2 col-6 col-lg-2" style="grid-area: 1 / 7 / 3 / 9; z-index: 2;">
                    <img src="/web/image/website.s_reference_demo_image_1" class="img img-fluid" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-2 g-height-2 col-6 col-lg-2" style="grid-area: 1 / 9 / 3 / 11; z-index: 3;">
                    <img src="/web/image/website.s_reference_demo_image_2" class="img img-fluid" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-2 g-height-2 col-6 col-lg-2" style="grid-area: 1 / 11 / 3 / 13; z-index: 4;">
                    <img src="/web/image/website.s_reference_demo_image_3" class="img img-fluid" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-2 g-height-2 col-6 col-lg-2" style="grid-area: 3 / 7 / 5 / 9; z-index: 5;">
                    <img src="/web/image/website.s_reference_demo_image_4" class="img img-fluid" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-2 g-height-2 col-6 col-lg-2" style="grid-area: 3 / 9 / 5 / 11; z-index: 6;">
                    <img src="/web/image/website.s_reference_demo_image_5" class="img img-fluid" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-2 g-height-2 col-6 col-lg-2" style="grid-area: 3 / 11 / 5 / 13; z-index: 7;">
                    <img src="/web/image/website.s_reference_default_image_6" class="img img-fluid" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=786 key=website.s_references_social name=References Social active=True website=null inherit=null
  signals: hrefs_total=12 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="References Social" t-name="website.s_references_social">
    <section class="s_references_social o_cc o_cc1 pt64 pb64">
        <div class="container">
            <h2 style="text-align: center;">Our valued partners</h2>
            <p class="lead" style="text-align: center;">We are in good company.</p>
            <div class="row">
                <div class="col-lg-3 pt16 pb16">
                    <img class="img img-fluid mx-auto" src="/web/image/website.s_reference_demo_image_1" alt=""/>
                    <h3 class="h5-fs" style="text-align: center;"><br/>Amsterdam</h3>
                    <p style="text-align: center;">Fruitful collaboration since 2014</p>
                    <div class="s_social_media o_not_editable text-center no_icon_color" data-snippet="s_social_media" data-name="Social Media">
                        <h4 class="s_social_media_title d-none">Social Media</h4>
                        <a href="/website/social/facebook" class="s_social_media_facebook" target="_blank" aria-label="Facebook">
                            <i class="fa fa-facebook rounded shadow-sm o_editable_media"/>
                        </a>
                        <a href="/website/social/instagram" class="s_social_media_instagram" target="_blank" aria-label="Instagram">
                            <i class="fa fa-instagram rounded shadow-sm o_editable_media"/>
                        </a>
                        <a href="/website/social/twitter" class="s_social_media_twitter" target="_blank" aria-label="X">
                            <i class="fa fa-twitter rounded shadow-sm o_editable_media"/>
                        </a>
                    </div>
                </div>
                <div class="col-lg-3 pt16 pb16">
                    <img class="img img-fluid mx-auto" src="/web/image/website.s_reference_demo_image_2" alt=""/>
                    <h3 class="h5-fs" style="text-align: center;"><br/>Firenze</h3>
                    <p style="text-align: center;">Flourishing together since 2016</p>
                    <div class="s_social_media o_not_editable text-center no_icon_color" data-snippet="s_social_media" data-name="Social Media">
                        <h4 class="s_social_media_title d-none">Social Media</h4>
                        <a href="/website/social/facebook" class="s_social_media_facebook" target="_blank" aria-label="Facebook">
                            <i class="fa fa-facebook rounded shadow-sm o_editable_media"/>
                        </a>
                        <a href="/website/social/instagram" class="s_social_media_instagram" target="_blank" aria-label="Instagram">
                            <i class="fa fa-instagram rounded shadow-sm o_editable_media"/>
                        </a>
                        <a href="/website/social/twitter" class="s_social_media_twitter" target="_blank" aria-label="X">
                            <i class="fa fa-twitter rounded shadow-sm o_editable_media"/>
                        </a>
                    </div>
                </div>
                <div class="col-lg-3 pt16 pb16">
                    <img class="img img-fluid mx-auto" src="/web/image/website.s_reference_demo_image_3" alt=""/>
                    <h3 class="h5-fs" style="text-align: center;"><br/>Nairobi</h3>
                    <p style="text-align: center;">Successful collaboration since 2019</p>
                    <div class="s_social_media o_not_editable text-center no_icon_color" data-snippet="s_social_media" data-name="Social Media">
                        <h4 class="s_social_media_title d-none">Social Media</h4>
                        <a href="/website/social/facebook" class="s_social_media_facebook" target="_blank" aria-label="Facebook">
                            <i class="fa fa-facebook rounded shadow-sm o_editable_media"/>
                        </a>
                        <a href="/website/social/instagram" class="s_social_media_instagram" target="_blank" aria-label="Instagram">
                            <i class="fa fa-instagram rounded shadow-sm o_editable_media"/>
                        </a>
                        <a href="/website/social/twitter" class="s_social_media_twitter" target="_blank" aria-label="X">
                            <i class="fa fa-twitter rounded shadow-sm o_editable_media"/>
                        </a>
                    </div>
                </div>
                <div class="col-lg-3 pt16 pb16">
                    <img class="img img-fluid mx-auto" src="/web/image/website.s_reference_demo_image_4" alt=""/>
                    <h3 class="h5-fs" style="text-align: center;"><br/>Madrid</h3>
                    <p style="text-align: center;">Thriving partnership since 2021</p>
                    <div class="s_social_media o_not_editable text-center no_icon_color" data-snippet="s_social_media" data-name="Social Media">
                        <h4 class="s_social_media_title d-none">Social Media</h4>
                        <a href="/website/social/facebook" class="s_social_media_facebook" target="_blank" aria-label="Facebook">
                            <i class="fa fa-facebook rounded shadow-sm o_editable_media"/>
                        </a>
                        <a href="/website/social/instagram" class="s_social_media_instagram" target="_blank" aria-label="Instagram">
                            <i class="fa fa-instagram rounded shadow-sm o_editable_media"/>
                        </a>
                        <a href="/website/social/twitter" class="s_social_media_twitter" target="_blank" aria-label="X">
                            <i class="fa fa-twitter rounded shadow-sm o_editable_media"/>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=900 key=website.s_reviews_wall name=Reviews Wall active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Reviews Wall" t-name="website.s_reviews_wall">
    <section class="s_reviews_wall o_colored_level o_cc o_cc2 pt80 pb80">
        <div class="container">
            <h2>Customers testimonials</h2>
            <p class="lead">What our customers are saying about us.</p>
            <div class="row align-items-stretch">
                <div class="col-12 col-lg-4 pt16 pb16" data-name="Review">
                    <blockquote class="s_blockquote s_blockquote_default o_cc o_cc1 o_animable position-relative d-flex flex-column gap-4 w-100 h-100 mx-auto p-4 rounded fst-normal" data-vcss="001" data-snippet="s_blockquote" data-name="Review" style="border-radius: 6.4px !important;">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right d-block mx-auto rounded bg-o-color-1" role="img"/>
                        </div>
                        <div class="s_rating s_rating_no_title" data-snippet="s_rating" data-name="Rating" data-vcss="001" data-icon="fa-star" aria-label="4 out of 5 stars">
                            <strong class="s_rating_title">Rating</strong>
                            <div class="s_rating_icons o_not_editable">
                                <span class="s_rating_active_icons" style="color: #f3cc00;">
                                    <i class="fa fa-star" role="presentation"/>
                                    <i class="fa fa-star" role="presentation"/>
                                    <i class="fa fa-star" role="presentation"/>
                                    <i class="fa fa-star" role="presentation"/>
                                </span>
                                <span class="s_rating_inactive_icons" style="color: var(--border-color);">
                                    <i class="fa fa-star" role="presentation"/>
                                </span>
                            </div>
                        </div>
                        <p class="s_blockquote_quote mb-auto">"Engaging with this team was effortless from start to end. Their proficiency and meticulous approach greatly enhanced our project. I couldn’t be happier with the final product!"</p>
                        <div class="s_blockquote_infos d-flex gap-2 flex-row align-items-start justify-content-start w-100 text-start">
                            <img src="/web/image/website.s_company_team_image_1" class="s_blockquote_avatar img rounded-circle" alt=""/>
                            <div class="s_blockquote_author">
                                <strong>Sullivan Mitchell</strong><br/>
                                <span class="text-muted">Marketing Director</span>
                            </div>
                        </div>
                    </blockquote>
                </div>
                <div class="col-12 col-lg-4 pt16 pb16" data-name="Review">
                    <blockquote class="s_blockquote s_blockquote_default o_cc o_cc1 o_animable position-relative d-flex flex-column gap-4 w-100 h-100 mx-auto p-4 rounded fst-normal" data-vcss="001" data-snippet="s_blockquote" data-name="Review" style="border-radius: 6.4px !important;">
                        <div class="s_blockquote_line_elt position-absolute top-0 start-0 bottom-0 bg-o-color-1"/>
                        <div class="s_blockquote_wrap_icon position-absolute top-0 start-50 translate-middle w-100">
                            <i class="s_blockquote_icon fa fa-quote-right d-block mx-auto rounded bg-o-color-1" role="img"/>
                        </div>
                        <div class="s_rating s_rating_no_title" data-snippet="s_rating" data-name="Rating" data-vcss="001" data-icon="fa-star" aria-label="4 out of 5 stars">
                            <strong class="s_rating_title">Rating</strong>
                            <div class="s_rating_icons o_not_editable">
                                <span class="s_rating_active_icons" style="color: #f3cc00;">
                                    <i class="fa fa-star" role="presentation"/>
                                    <i class="fa fa-star" role="presentation"/>
                                    <i class="fa fa-star" role="presentation"/>
                                    <i class="fa fa-star" role="presentation"/>
                                </span>
                                <span class="s_rating_inactive_icons" style="color: var(--border-color);">
                                    <i class="fa fa-star" role="presentation"/>
                                </span>
                            </div>
                        </div>
                        <p class="s_blockquote_quote mb-auto">"Working with this team was smooth and efficient at every stage. Their skills and commitment to quality had a major impact on our project. I am thrilled with the final results!"</p>
                        <div class="s_blockquote_infos d-flex gap-2 flex-row align-items-start justify-content-start w-100 text-start">
                            <img src="/web/image/website.s_company_team_image_2" class="s_blockquote_avatar img rounded-circle" alt=""/>
                            <div class="s_blockquote_author">
                                <strong>James Carter</strong><br/>
                                <span class="text-muted">Chief Technical Officer</span>
                            </div>
                        </div>
                    </blockquote>
                </div>
                <div class="col-12 col-lg-4 pt16 pb16" data-name="Review">
                    <blockquote class="s_blockquote s_blockquote_default o_cc o_cc1 o_animable position-relative d-flex flex-column gap-4 w-100 h-100 mx-auto p-4 rounded fst-normal" data-vcss="001" data-snippet="s_blockquote" data-name="Review" styl…

- kind=other id=882 key=website.s_searchbar name=Search active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Search" t-name="website.s_searchbar">
    <section class="s_searchbar o_colored_level o_cc o_cc2 pt48 pb48">
        <div class="container">
            <div class="row">
                <div class="col-lg-8 offset-lg-2">
                    <h2>Search on our website</h2>
                    <p>You will get results from blog posts, products, etc</p>
                    <t t-snippet-call="website.s_searchbar_input" string="Search Input"/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=881 key=website.s_searchbar_input name=Search active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Search" t-name="website.s_searchbar_input">
    <t t-call="website.website_search_box_input" search_type.f="all" action.f="/website/search" limit.f="5" display_image.f="true" display_description.f="true" display_extra_link.f="true" display_detail.f="true" default_style="True"/>
</t>

- kind=other id=844 key=website.s_shape_image name=Shape image active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Shape image" t-name="website.s_shape_image">
    <section class="s_shape_image pt32 pb32">
        <div class="container">
            <div class="row align-items-center">
                <div class="col-lg-5 pt16 pb16">
                    <img class="img img-fluid" data-shape="html_builder/composite/composite_double_pill" data-file-name="s_shape_image_default_image.jpg" data-format-mimetype="image/jpeg" src="/html_editor/image_shape/website.s_shape_image_default_image/html_builder/composite/composite_double_pill.svg" alt=""/>
                </div>
                <div class="col-lg-6 offset-lg-1 pt16 pb16">
                    <h2 class="h3-fs">About our product line</h2>
                    <p><br/>Our product line offers a range of innovative solutions designed to meet your needs. Each product is crafted for quality and reliability.</p>
                    <p>Enhance your experience with our user-focused designs, ensuring you get the best value.<br/></p>
                    <p>
                        <a href="#" class="btn btn-primary o_translate_inline">Learn more</a>
                    </p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=759 key=website.s_share name=Share active=True website=null inherit=null
  signals: hrefs_total=6 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Share" t-name="website.s_share">
    <div t-attf-class="s_share text-start o_no_link_popover #{_classes}">
        <h4 t-if="not _no_title" class="s_share_title d-none">Share</h4>
        <a t-if="not _exclude_share_links or not 'facebook' in _exclude_share_links" href="https://www.facebook.com/sharer/sharer.php?u={url}" t-attf-class="s_share_facebook #{_link_classes}" target="_blank" aria-label="Facebook">
            <i t-attf-class="fa fa-facebook #{not _link_classes and 'rounded shadow-sm'} small_social_icon"/>
        </a>
        <a t-if="not _exclude_share_links or not 'twitter' in _exclude_share_links" href="https://twitter.com/intent/tweet?text={title}&amp;url={url}" t-attf-class="s_share_twitter #{_link_classes}" target="_blank" aria-label="X">
            <i t-attf-class="fa fa-twitter #{not _link_classes and 'rounded shadow-sm'} small_social_icon"/>
        </a>
        <a t-if="not _exclude_share_links or not 'linkedin' in _exclude_share_links" href="https://www.linkedin.com/sharing/share-offsite/?url={url}" t-attf-class="s_share_linkedin #{_link_classes}" target="_blank" aria-label="LinkedIn">
            <i t-attf-class="fa fa-linkedin #{not _link_classes and 'rounded shadow-sm'} small_social_icon"/>
        </a>
        <a t-if="not _exclude_share_links or not 'whatsapp' in _exclude_share_links" href="https://wa.me/?text={title}" t-attf-class="s_share_whatsapp #{_link_classes}" target="_blank" aria-label="WhatsApp">
            <i t-attf-class="fa fa-whatsapp #{not _link_classes and 'rounded shadow-sm'} small_social_icon"/>
        </a>
        <a t-if="not _exclude_share_links or not 'pinterest' in _exclude_share_links" href="https://pinterest.com/pin/create/button/?url={url}&amp;media={media}&amp;description={title}" t-attf-class="s_share_pinterest #{_link_classes}" target="_blank" aria-label="Pinterest">
            <i t-attf-class="fa fa-pinterest #{not _link_classes and 'rounded shadow-sm'} small_social_icon"/>
        </a>
        <a t-if="not _exclude_share_links or not 'email' in _exclude_share_links" href="mailto:?body={url}&amp;subject={title}" t-attf-class="s_share_email #{_link_classes}" aria-label="Email">
            <i t-attf-class="fa fa-envelope #{not _link_classes and 'rounded shadow-sm'} small_social_icon"/>
        </a>
    </div>
</t>

- kind=other id=817 key=website.s_showcase name=Showcase active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Showcase" t-name="website.s_showcase">
    <section class="s_showcase pt48 pb48" data-vcss="003">
        <div class="container">
            <div class="row">
                <div class="col-lg-6">
                    <div class="row">
                        <div class="col-12 pb32">
                            <h2 class="h3-fs">Features showcase</h2>
                            <p class="lead">A features section highlights your product’s key attributes, engaging visitors and boosting conversions.</p>
                        </div>
                        <div class="col-12 pt8 pb8" data-name="Feature">
                            <i class="s_showcase_icon fa fa-star-o me-auto rounded float-start bg-o-color-3" role="img"/>
                            <div class="d-flex flex-column">
                                <h3 class="s_showcase_title h5-fs">Highlights Key Attributes</h3>
                                <p>A feature section allows you to clearly showcase the main benefits and unique aspects of your product.</p>
                            </div>
                        </div>
                        <div class="col-12 pt8 pb8" data-name="Feature">
                            <i class="s_showcase_icon fa fa-user-o me-auto rounded float-start bg-o-color-3" role="img"/>
                            <div class="d-flex flex-column">
                                <h3 class="s_showcase_title h5-fs">Engages Visitors</h3>
                                <p>It captures your visitors' attention and helps them quickly understand the value of your product.</p>
                            </div>
                        </div>
                        <div class="col-12 pt8 pb8" data-name="Feature">
                            <i class="s_showcase_icon fa fa-heart-o me-auto rounded float-start bg-o-color-3" role="img"/>
                            <div class="d-flex flex-column">
                                <h3 class="s_showcase_title h5-fs">Boosts Conversions</h3>
                                <p>Organizing and presenting key information effectively increases the likelihood of turning your visitors into customers.</p>
                            </div>
                        </div>
                        <div class="col-12 pt8 pb8" style="text-align: right;">
                            <div class="s_hr pt0 pb16" data-snippet="s_hr">
                                <hr class="w-100 mx-auto"/>
                            </div>
                            <a href="#">Discover all the features</a>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6 o_snippet_mobile_invisible d-lg-block d-none">
                    <img src="/web/image/website.s_showcase_default_image" class="img img-fluid ms-auto rounded float-end" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=815 key=website.s_sidegrid name=Side Grid active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Side Grid" t-name="website.s_sidegrid">
    <section class="s_sidegrid pt56 pb56">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="13">
                <div class="o_grid_item g-col-lg-5 g-height-9 col-lg-5" style="z-index: 1; grid-area: 1 / 8 / 10 / 13; --grid-item-padding-x: 24px">
                    <h1 class="display-4">Experience<br/>the real<br/>innovation</h1>
                    <p class="lead"><br/>Every groundbreaking innovation, whether meticulously engineered or born from spontaneous creativity, contains stories waiting to be discovered.<br/><br/></p>
                </div>
                <div class="o_grid_item o_grid_item_image g-height-4 g-col-lg-4 col-lg-4" style="z-index: 2; grid-area: 1 / 1 / 5 / 5;">
                    <img class="img img-fluid rounded" src="/web/image/website.s_sidegrid_default_image_1" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image o_snippet_mobile_invisible g-height-9 g-col-lg-3 col-lg-3 d-lg-block d-none" style="z-index: 3; grid-area: 1 / 5 / 10 / 8;">
                    <img class="img img-fluid rounded" src="/web/image/website.s_sidegrid_default_image_2" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image o_snippet_mobile_invisible g-height-9 g-col-lg-4 col-lg-4 d-lg-block d-none" style="z-index: 4; grid-area: 5 / 1 / 14 / 5;">
                    <img class="img img-fluid rounded" src="/web/image/website.s_sidegrid_default_image_4" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image o_snippet_mobile_invisible g-height-4 g-col-lg-8 col-lg-8 d-lg-block d-none" style="z-index: 5; grid-area: 10 / 5 / 14 / 13;">
                    <img class="img img-fluid rounded" src="/web/image/website.s_sidegrid_default_image_3" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=742 key=website.s_snippet_group name=Snippet Group active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Snippet Group" t-name="website.s_snippet_group">
    <section class="s_snippet_group"/>
</t>

- kind=other id=760 key=website.s_social_media name=Social Media active=True website=null inherit=null
  signals: hrefs_total=8 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Social Media" t-name="website.s_social_media">
    <div class="s_social_media text-start o_not_editable" contenteditable="false">
        <h4 class="s_social_media_title d-none" contenteditable="true">Social Media</h4>
        <a href="/website/social/facebook" class="s_social_media_facebook" target="_blank" aria-label="Facebook">
            <i class="fa fa-facebook rounded shadow-sm o_editable_media small_social_icon"/>
        </a>
        <a href="/website/social/twitter" class="s_social_media_twitter" target="_blank" aria-label="X">
            <i class="fa fa-twitter rounded shadow-sm o_editable_media small_social_icon"/>
        </a>
        <a href="/website/social/linkedin" class="s_social_media_linkedin" target="_blank" aria-label="LinkedIn">
            <i class="fa fa-linkedin rounded shadow-sm o_editable_media small_social_icon"/>
        </a>
        <a href="/website/social/youtube" class="s_social_media_youtube" target="_blank" aria-label="YouTube">
            <i class="fa fa-youtube-play rounded shadow-sm o_editable_media small_social_icon"/>
        </a>
        <a href="/website/social/instagram" class="s_social_media_instagram" target="_blank" aria-label="Instagram">
            <i class="fa fa-instagram rounded shadow-sm o_editable_media small_social_icon"/>
        </a>
        <a href="/website/social/github" class="s_social_media_github" target="_blank" aria-label="GitHub">
            <i class="fa fa-github rounded shadow-sm o_editable_media small_social_icon"/>
        </a>
        <a href="/website/social/tiktok" class="s_social_media_tiktok" target="_blank" aria-label="TikTok">
            <i class="fa fa-tiktok rounded shadow-sm o_editable_media small_social_icon"/>
        </a>
        <a href="/website/social/discord" class="s_social_media_discord" target="_blank" aria-label="Discord">
            <i class="fa fa-discord rounded shadow-sm o_editable_media small_social_icon"/>
        </a>
    </div>
</t>

- kind=other id=846 key=website.s_split_intro name=Split Intro active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Split Intro" t-name="website.s_split_intro">
    <section class="s_split_intro o_cc o_cc1">
        <div class="container-fluid">
            <div class="row">
                <div class="col-lg-4 offset-lg-1 pt120 pb120 order-lg-0" style="order: 1;">
                    <h1 class="display-3">Revolutionize your business</h1>
                    <p class="lead"><br/>Step into the future with our innovative solutions tailored to meet the unique needs of your business. Don’t let outdated processes hold you back any longer.<br/><br/></p>
                    <p>
                        <a t-att-href="cta_btn_href" class="btn btn-lg btn-primary o_translate_inline">Discover more</a>
                    </p>
                </div>
                <div class="o_not_editable oe_img_bg o_bg_img_center col-lg-6 offset-lg-1 pt120 pb120 order-lg-0" style="background-image: url('/web/image/website.s_split_intro_default_image'); order: 0;"/>
            </div>
        </div>
    </section>
</t>

- kind=other id=839 key=website.s_striped name=Striped section active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Striped section" t-name="website.s_striped">
    <section class="s_striped o_cc o_cc5 pt80 pb96" style="position: relative;" data-oe-shape-data="{'shape':'html_builder/Connections/20','colors':{'c5': 'o-color-4'},'flip':[], 'showOnMobile':true}">
        <div class="o_we_shape o_html_builder_Connections_20 o_shape_show_mobile" style="background-image: url('/html_editor/shape/html_builder/Connections/20.svg?c5=o-color-4'); background-position: 50% 100%;"/>
        <div class="container">
            <h2 style="text-align: center;">The evolution of our company</h2>
            <p class="lead" style="text-align: center;">Learn about the key decisions that have shaped our identity.</p>
            <p><br/></p>
            <div class="row">
                <div class="col-lg-8 offset-lg-2 pt24 pb24">
                    <img class="img img-fluid" src="/web/image/website.s_text_cover_default_image" style="width: 100% !important;" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=894 key=website.s_striped_center_top name=Striped Center Top active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Striped Center Top" t-name="website.s_striped_center_top">
    <section class="s_striped_center_top o_cc o_cc5 pb56" data-oe-shape-data="{'shape':'html_builder/Connections/20','colors':{'c5': 'o-color-4'},'flip':[], 'showOnMobile':true}">
        <div class="o_we_shape o_html_builder_Connections_20 o_shape_show_mobile" style="background-image: url('/html_editor/shape/html_builder/Connections/20.svg?c5=o-color-4'); background-position: 50% 100%;"/>
        <div class="container">
            <div class="row">
                <div class="col-lg-8 offset-lg-2 pt56 pb56">
                    <h1 style="text-align: center;">Turning Vision into Reality</h1>
                    <p class="lead" style="text-align: center;">We deliver seamless, innovative solutions that not only meet your needs but exceed expectations, driving meaningful results and lasting success.</p>
                    <p><br/></p>
                    <p style="text-align: center;">
                        <a t-att-href="cta_btn_href" class="btn btn-primary btn-lg o_translate_inline"><t t-out="cta_btn_text">Get started</t></a>
                    </p>
                </div>
                <div class="col-lg-10 offset-lg-1 pb24" style="text-align: center;">
                    <figure class="figure w-100">
                        <img src="/web/image/website.s_picture_default_image" class="figure-img img-fluid rounded" style="width: 100% !important;" alt=""/>
                        <figcaption class="figure-caption text-600">Crafted with precision and care</figcaption>
                    </figure>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=734 key=website.s_striped_top name=Striped Top active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Striped Top" t-name="website.s_striped_top">
    <section class="s_striped_top o_cc o_cc5 pt56 pb96" data-oe-shape-data="{'shape':'html_builder/Connections/20','colors':{'c5': 'o-color-4'},'flip':[], 'showOnMobile':true}">
        <div class="o_we_shape o_html_builder_Connections_20 o_shape_show_mobile" style="background-image: url('/html_editor/shape/html_builder/Connections/20.svg?c5=o-color-4'); background-position: 50% 100%;"/>
        <div class="container">
            <div class="row">
                <div class="col-lg-6 pt24 pb24 order-lg-0" style="order: 2;">
                    <img class="img img-fluid" src="/web/image/website.s_striped_top_default_image" style="width: 100% !important;" alt=""/>
                </div>
                <div class="col-lg-6 pt24 pb24 order-lg-0" style="order: 1;">
                    <h1>Experience the Future of Innovation in Every Interaction</h1>
                    <p class="lead">Innovation transforms possibilities into reality.</p>
                    <a t-att-href="cta_btn_href" class="btn btn-primary"><t t-out="cta_btn_text">Discover</t></a>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=795 key=website.s_table_of_content name=Table of Content active=True website=null inherit=null
  signals: hrefs_total=6 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Table of Content" t-name="website.s_table_of_content">
    <section class="s_table_of_content pt24 pb24 o_cc o_cc1">
        <div class="container">
            <div class="row s_nb_column_fixed">
                <div class="col-lg-3 s_table_of_content_navbar_wrap s_table_of_content_navbar_sticky s_table_of_content_vertical_navbar d-print-none d-none d-lg-block o_not_editable o_cc o_cc1" data-name="Navbar">
                    <div class="s_table_of_content_navbar list-group o_no_link_popover" style="top: 76px; max-height: calc(100vh - 96px);">
                        <a href="#table_of_content_heading_1_1" class="table_of_content_link list-group-item list-group-item-action py-2 border-0 rounded-0 table_of_content_link_depth_0 active">Intuitive system</a>
                        <a href="#table_of_content_heading_1_2" class="table_of_content_link list-group-item list-group-item-action py-2 border-0 rounded-0 table_of_content_link_depth_1">What you see is what you get</a>
                        <a href="#table_of_content_heading_1_3" class="table_of_content_link list-group-item list-group-item-action py-2 border-0 rounded-0 table_of_content_link_depth_1">Customization tool</a>
                        <a href="#table_of_content_heading_1_4" class="table_of_content_link list-group-item list-group-item-action py-2 border-0 rounded-0 table_of_content_link_depth_0">Design features</a>
                        <a href="#table_of_content_heading_1_5" class="table_of_content_link list-group-item list-group-item-action py-2 border-0 rounded-0 table_of_content_link_depth_1">Building blocks system</a>
                        <a href="#table_of_content_heading_1_6" class="table_of_content_link list-group-item list-group-item-action py-2 border-0 rounded-0 table_of_content_link_depth_1">Bootstrap-Based Templates</a>
                    </div>
                </div>
                <div class="col-lg-9 s_table_of_content_main oe_structure oe_empty" data-name="Content">
                    <section class="s_text_block pt0 pb64" data-snippet="s_text_block" data-name="Section">
                        <div class="container s_allow_columns">
                            <h2 id="table_of_content_heading_1_1" class="h3-fs" data-anchor="true">Intuitive system</h2>
                            <div class="s_hr pt8 pb24" data-snippet="s_hr" data-name="Separator">
                                <hr class="w-100 mx-auto"/>
                            </div>
                            <p class="lead">
                                Our intuitive system ensures effortless navigation for users of all skill levels. Its clean interface and logical organization make tasks easy to complete. With tooltips and contextual help, users quickly become productive, enjoying a smooth and efficient experience.
                            </p>
                            <br/>
                            <br/>
                            <h3 class="h5-fs">What you see is what you get</h3>
                            <p>
                                Insert text styles like headers, bold, italic, lists, and fonts with a simple WYSIWYG editor. Flexible and easy to use, it lets you design and format documents in real time. No coding knowledge is needed, making content creation straightforward and enjoyable for everyone.
                            </p>
                            <br/>
                            <br/>
                            <h3 class="h5-fs">Customization tool</h3>
                            <p>
                                Click and change content directly from the front-end, avoiding complex backend processes. This tool allows quick updates to text, images, and elements right on the page, streamlining your workflow and maintaining control over your content.
                            </p>
                        </div>
                    </section>
                    <section class="s_text_block pt0 pb64" data-snippet="s_text_block" data-name="Section">
                        <div class="container s_allow_columns">
                            <h2 id="table_of_content_heading_1_2" class="h3-fs" data-anchor="true">Design features</h2>
                            <div class="s_hr pt8 pb24" data-snippet="s_hr" data-name="Separator">
                                <hr class="w-100 mx-auto"/>
                            </div>
                            <p class="lead">
                                Our design features offer a range of tools to create visually stunning websites. Utilize WYSIWYG editors, drag-and-drop building blocks, and Bootstrap-based templates for effortless customization. With professional themes and an intuitive system, you can design with ease and precision, ensuring a polished, responsive result.
                            </p>
                            <br/>
                            <br/>
                            <h3 class="h5-fs">Building blocks system</h3>
                            <p>
                                Create pages from scratch by dragging and dropping customizable building blocks. This system simplifies web design, making it accessible to all skill levels. Combine headers, images, and text sections to build cohesive layouts quickly and efficiently.
                            </p>
                            <br/>
                            <br/>
                            <h3 class="h5-fs">Bootstrap-Based Templates</h3>
                            <p>
                                Design Odoo templates easily with clean HTML and Bootstrap CSS. These templates offer a responsive, mobile-first design, making them simple to customize and perfect for any web project, from corporate sites to personal blogs.
                            </p>
                            <br/>
                            <br/>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    </section>
…

- kind=other id=793 key=website.s_tabs name=Tabs active=True website=null inherit=null
  signals: hrefs_total=3 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Tabs" t-name="website.s_tabs">
    <section class="s_tabs_common s_tabs pt48 pb48" data-vcss="003" data-vxml="002">
        <div class="o_container_small">
            <div class="s_tabs_main o_direction_horizontal">
                <div class="s_tabs_nav mb-3 overflow-y-hidden overflow-x-auto" data-name="Tab Header" role="navigation">
                    <ul class="nav nav-underline nav-justified flex-nowrap" role="tablist">
                        <li class="nav-item" role="presentation">
                            <a class="nav-link active text-break" id="nav_tabs_link_1" data-bs-toggle="tab" href="#nav_tabs_content_1" role="tab" aria-controls="nav_tabs_content_1" aria-selected="true">Home</a>
                        </li>
                        <li class="nav-item" role="presentation">
                            <a class="nav-link text-break" id="nav_tabs_link_2" data-bs-toggle="tab" href="#nav_tabs_content_2" role="tab" aria-controls="nav_tabs_content_2" aria-selected="false">Profile</a>
                        </li>
                        <li class="nav-item" role="presentation">
                            <a class="nav-link text-break" id="nav_tabs_link_3" data-bs-toggle="tab" href="#nav_tabs_content_3" role="tab" aria-controls="nav_tabs_content_3" aria-selected="false">Contact</a>
                        </li>
                    </ul>
                </div>
                <div class="s_tabs_content tab-content">
                    <div class="tab-pane fade show active" id="nav_tabs_content_1" role="tabpanel" aria-labelledby="nav_tabs_link_1">
                        <div class="oe_structure oe_empty">
                            <section class="s_text_block" data-snippet="s_text_block">
                                <div class="container s_allow_columns">
                                    <p>Write one or two paragraphs describing your product or services.</p>
                                </div>
                            </section>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="nav_tabs_content_2" role="tabpanel" aria-labelledby="nav_tabs_link_2">
                        <div class="oe_structure oe_empty">
                            <section class="s_text_block" data-snippet="s_text_block">
                                <div class="container s_allow_columns">
                                    <p>To be successful your content needs to be useful to your readers.</p>
                                </div>
                            </section>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="nav_tabs_content_3" role="tabpanel" aria-labelledby="nav_tabs_link_3">
                        <div class="oe_structure oe_empty">
                            <section class="s_text_block" data-snippet="s_text_block">
                                <div class="container s_allow_columns">
                                    <p>Start with the customer – find out what they want and give it to them.</p>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=794 key=website.s_tabs_images name=Tabs Images active=True website=null inherit=null
  signals: hrefs_total=5 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Tabs Images" t-name="website.s_tabs_images">
    <section class="s_tabs_common s_tabs_images pt48 pb48">
        <div class="container">
            <div class="s_tabs_main s_tabs_nav_vertical s_tabs_nav_with_descriptions s_col_no_resize s_col_no_bgcolor row">
                <div class="s_tabs_nav col-md-3 mb-3 overflow-y-hidden overflow-x-auto" data-name="Tab Header" role="navigation">
                    <ul class="nav nav-underline flex-nowrap flex-md-column" role="tablist" style="--nav-pills-link-active-bg: var(--nav-link-color);">
                        <li class="nav-item" role="presentation">
                            <a class="nav-link active text-break" id="nav_tabs_images_link_1" data-bs-toggle="tab" href="#nav_tabs_images_content_1" role="tab" aria-controls="nav_tabs_images_content_1" aria-selected="true">
                                First Slide
                                <small class="oe_unbreakable o_nav_tabs_description opacity-75">A slide description</small>
                            </a>
                        </li>
                        <li class="nav-item" role="presentation">
                            <a class="nav-link text-break" id="nav_tabs_images_link_2" data-bs-toggle="tab" href="#nav_tabs_images_content_2" role="tab" aria-controls="nav_tabs_images_content_2" aria-selected="false">
                                Second Slide
                                <small class="oe_unbreakable o_nav_tabs_description opacity-75">What is this slide about</small>
                            </a>
                        </li>
                        <li class="nav-item" role="presentation">
                            <a class="nav-link text-break" id="nav_tabs_images_link_3" data-bs-toggle="tab" href="#nav_tabs_images_content_3" role="tab" aria-controls="nav_tabs_images_content_3" aria-selected="false">
                                Third Slide
                                <small class="oe_unbreakable o_nav_tabs_description opacity-75">Add your touch to complete the image</small>
                            </a>
                        </li>
                        <li class="nav-item" role="presentation">
                            <a class="nav-link text-break" id="nav_tabs_images_link_4" data-bs-toggle="tab" href="#nav_tabs_images_content_4" role="tab" aria-controls="nav_tabs_images_content_4" aria-selected="false">
                                Fourth Slide
                                <small class="oe_unbreakable o_nav_tabs_description opacity-75">Describe the scene as you envision it</small>
                            </a>
                        </li>
                        <li class="nav-item" role="presentation">
                            <a class="nav-link text-break" id="nav_tabs_images_link_5" data-bs-toggle="tab" href="#nav_tabs_images_content_5" role="tab" aria-controls="nav_tabs_images_content_5" aria-selected="false">
                                Fifth Slide
                                <small class="oe_unbreakable o_nav_tabs_description opacity-75">Add a unique perspective or detail</small>
                            </a>
                        </li>
                    </ul>
                </div>
                <div class="s_tabs_content tab-content col-md-9">
                    <div class="tab-pane fade show active" id="nav_tabs_images_content_1" role="tabpanel" aria-labelledby="nav_tabs_images_link_1">
                        <div class="oe_structure oe_empty">
                            <section class="s_text_block" data-snippet="s_text_block" data-name="Tab">
                                <div class="container s_allow_columns">
                                    <img src="/web/image/website.s_tabs_images_default_image_1" class="img img-fluid rounded" alt="" style="width: 100% !important;"/>
                                </div>
                            </section>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="nav_tabs_images_content_2" role="tabpanel" aria-labelledby="nav_tabs_images_link_2">
                        <div class="oe_structure oe_empty">
                            <section class="s_text_block" data-snippet="s_text_block" data-name="Tab">
                                <div class="container s_allow_columns">
                                    <img src="/web/image/website.s_tabs_images_default_image_2" class="img img-fluid rounded" alt="" style="width: 100% !important;"/>
                                </div>
                            </section>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="nav_tabs_images_content_3" role="tabpanel" aria-labelledby="nav_tabs_images_link_3">
                        <div class="oe_structure oe_empty">
                            <section class="s_text_block" data-snippet="s_text_block" data-name="Tab">
                                <div class="container s_allow_columns">
                                    <img src="/web/image/website.s_tabs_images_default_image_3" class="img img-fluid rounded" alt="" style="width: 100% !important;"/>
                                </div>
                            </section>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="nav_tabs_images_content_4" role="tabpanel" aria-labelledby="nav_tabs_images_link_4">
                        <div class="oe_structure oe_empty">
                            <section class="s_text_block" data-snippet="s_text_block" data-name="Tab">
                                <div class="container s_allow_columns">
                                    <img src="/web/image/website.s_tabs_images_default_image_4" class="img img-fluid rounded" alt="" style="width: 100% !important;"/>
                                </div>
                            </section>
                        </div>
              …

- kind=other id=743 key=website.s_text_block name=Text active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Text" t-name="website.s_text_block">
    <section class="s_text_block pt40 pb40">
        <div class="container s_allow_columns">
            <p>Great stories have a <b>personality</b>. Consider telling a great story that provides personality. Writing a story with personality for potential clients will assist with making a relationship connection. This shows up in small quirks like word choices or phrases. Write from your point of view, not from someone else's experience.</p>
            <p>Great stories are <b>for everyone</b> even when only written <b>for just one person</b>. If you try to write with a wide, general audience in mind, your story will sound fake and lack emotion. No one will be interested. Write for one person. If it’s genuine for the one, it’s genuine for the rest.</p>
        </div>
    </section>
</t>

- kind=other id=907 key=website.s_text_block_2nd name=s_text_block_2nd active=True website=null inherit={"id": 743, "name": "Text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="data-snippet">s_text_block</attribute>
        <attribute name="class" add="o_colored_level" separator=" "/>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_text_block_2nd</attribute></xpath></data>

- kind=other id=914 key=website.s_text_block_h1 name=s_text_block_h1 active=True website=null inherit={"id": 743, "name": "Text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="data-snippet">s_text_block</attribute>
        <attribute name="class" add="pb0" remove="pb40" separator=" "/>
    </xpath>
    <xpath expr="//div[hasclass('container')]|//div[hasclass('o_container_small')]" position="replace">
        <div class="container s_allow_columns">
            <h1 style="text-align: center;">Title</h1>
        </div>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_text_block_h1</attribute></xpath></data>

- kind=other id=927 key=website.s_text_block_h2 name=s_text_block_h2 active=True website=null inherit={"id": 743, "name": "Text"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="data-snippet">s_text_block</attribute>
        <attribute name="class" add="pb0" remove="pb40" separator=" "/>
    </xpath>
    <xpath expr="//div[hasclass('container')]|//div[hasclass('o_container_small')]" position="replace">
        <div class="container s_allow_columns">
            <h2 style="text-align: center;">Title</h2>
        </div>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_text_block_h2</attribute></xpath></data>

- kind=other id=942 key=website.s_text_block_h2_contact name=s_text_block_h2_contact active=True website=null inherit={"id": 927, "name": "s_text_block_h2"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="class" add="pb40" remove="pb0" separator=" "/>
    </xpath>
    <xpath expr="//h2" position="attributes">
        <attribute name="style">text-align: left;</attribute>
    </xpath>
    <xpath expr="//h2" position="replace" mode="inner">Contact Us</xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_text_block_h2_contact</attribute></xpath></data>

- kind=other id=732 key=website.s_text_cover name=Text Cover active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Text Cover" t-name="website.s_text_cover">
    <section class="s_text_cover o_colored_level o_cc o_cc5">
        <div class="container-fluid">
            <div class="row o_grid_mode" data-row-count="11">
                <div class="o_grid_item g-height-9 g-col-lg-5 col-lg-5 o_cc o_cc1" style="z-index: 1; grid-area: 2 / 3 / 11 / 8; --grid-item-padding-x: 24px; --grid-item-padding-y: 24px;">
                    <h1 class="display-3">Sell Online. <br/>Easily.</h1>
                    <p class="lead"><br/>Sell online easily with a user-friendly platform that streamlines all the steps, including setup, inventory management, and payment processing.<br/></p>
                    <a t-att-href="cta_btn_href" class="btn btn-lg btn-primary"><t t-out="cta_btn_text">Contact us</t></a>
                </div>
                <div class="o_grid_item g-height-11 g-col-lg-6 col-lg-6 o_cc o_cc1 oe_img_bg o_not_editable d-none d-lg-block o_snippet_mobile_invisible" style="grid-area: 1 / 7 / 12 / 13; --grid-item-padding-x: 0px; --grid-item-padding-y: 0px; background-image: url('/web/image/website.s_text_cover_default_image');"/>
            </div>
        </div>
    </section>
</t>

- kind=other id=847 key=website.s_text_highlight name=Text Highlight active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Text Highlight" t-name="website.s_text_highlight">
    <div class="s_text_highlight o_colored_level o_cc o_cc3 my-3 text-center w-100">
        <div class="container">
            <h2 class="h3-fs">Text Highlight</h2>
            <p>Put the focus on what you have to say!</p>
        </div>
    </div>
</t>

- kind=other id=735 key=website.s_text_image name=Text - Image active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Text - Image" t-name="website.s_text_image">
    <section class="s_text_image pt80 pb80">
        <div class="container">
            <div class="row align-items-center">
                <div class="col-lg-5 pt16 pb16">
                    <h2 class="h3-fs">Enhance Your <strong>Experience</strong></h2>
                    <p>Write one or two paragraphs describing your product or services. To be successful your content needs to be useful to your readers.</p>
                    <p>Start with the customer – find out what they want and give it to them.</p>
                    <p><a href="#" class="btn btn-secondary o_translate_inline">Learn more</a></p>
                </div>
                <div class="col-lg-6 offset-lg-1 pt16 pb16">
                    <img src="/web/image/website.s_text_image_default_image" class="img img-fluid mx-auto rounded" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=746 key=website.s_three_columns name=Columns active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Columns" t-name="website.s_three_columns">
    <section class="s_three_columns o_cc o_cc2 pt32 pb32 o_colored_level" data-vxml="001" data-vcss="001">
        <div class="container">
            <div class="row d-flex align-items-stretch">
                <div data-name="Card" class="col-lg-4 pt16 pb16">
                    <div class="s_card o_card_img_top card h-100 o_cc o_cc1 my-0" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-16x9 mb-0">
                            <img class="o_card_img card-img-top" src="/web/image/website.s_three_columns_default_image_1" alt=""/>
                        </figure>
                        <div class="card-body">
                            <h2 class="card-title h5-fs">Feature One</h2>
                            <p class="card-text">Adapt these three columns to fit your design need. To duplicate, delete or move columns, select the column and use the top icons to perform your action.</p>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-4 pt16 pb16">
                    <div class="s_card o_card_img_top card h-100 o_cc o_cc1 my-0" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-16x9 mb-0">
                            <img class="o_card_img card-img-top" src="/web/image/website.s_three_columns_default_image_2" alt=""/>
                        </figure>
                        <div class="card-body">
                            <h2 class="card-title h5-fs">Feature Two</h2>
                            <p class="card-text">To add a fourth column, reduce the size of these three columns using the right icon of each block. Then, duplicate one of the columns to create a new one as a copy.</p>
                        </div>
                    </div>
                </div>
                <div data-name="Card" class="col-lg-4 pt16 pb16">
                    <div class="s_card o_card_img_top card h-100 o_cc o_cc1 my-0" data-vxml="001" data-snippet="s_card" data-name="Card">
                        <figure class="o_card_img_wrapper ratio ratio-16x9 mb-0">
                            <img class="o_card_img card-img-top" src="/web/image/website.s_three_columns_default_image_3" alt=""/>
                        </figure>
                        <div class="card-body">
                            <h2 class="card-title h5-fs">Feature Three</h2>
                            <p class="card-text">Delete the above image or replace it with a picture that illustrates your message. Click on the picture to change its <em>rounded corner</em> style.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=1005 key=website.s_three_columns_2nd name=s_three_columns_2nd active=True website=null inherit={"id": 746, "name": "Columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="data-snippet">s_three_columns</attribute>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_three_columns_2nd</attribute></xpath></data>

- kind=other id=1006 key=website.s_three_columns_menu name=s_three_columns_menu active=True website=null inherit={"id": 746, "name": "Columns"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//section" position="attributes">
        <attribute name="data-snippet">s_three_columns</attribute>
    </xpath>
    <xpath expr="//h2|//h3|//h4|//h5" position="replace">
        <h2 class="card-title h5-fs">Menu One</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[2]" position="replace">
        <h2 class="card-title h5-fs">Menu Two</h2>
    </xpath>
    <xpath expr="(//h2|//h3|//h4|//h5)[3]" position="replace">
        <h2 class="card-title h5-fs">All You Can Eat</h2>
    </xpath>
    <xpath expr="//p" position="replace">
        <p class="card-text">Vegetable Salad, Beef Burger and Mango Ice Cream</p>
    </xpath>
    <xpath expr="(//p)[2]" position="replace">
        <p class="card-text">Beef Carpaccio, Filet Mignon 8oz and Cheesecake</p>
    </xpath>
    <xpath expr="(//p)[3]" position="replace">
        <p class="card-text">Mediterranean buffet of starters, main dishes and desserts</p>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.s_three_columns_menu</attribute></xpath></data>

- kind=other id=821 key=website.s_timeline name=Timeline active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Timeline" t-name="website.s_timeline">
    <section class="s_timeline pt48 pb48" data-vcss="002">
        <div class="o_container_small">
            <h2 style="text-align: center;" class="h3-fs">Latest news</h2>
            <p style="text-align: center;" class="lead">Highlight your history, showcase growth and key milestones.</p>
            <p><br/></p>
            <div class="position-relative pt-3">
                <div class="s_timeline_row position-relative d-flex gap-md-5 flex-column flex-md-row pb-4" data-name="Milestone">
                    <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                    <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                    <div class="s_timeline_content w-100 ps-4 ps-md-0">
                        <div class="s_timeline_card s_card card my-0 ms-auto text-md-end" style="border-width: 0px !important;" data-vxml="001" data-snippet="s_card" data-name="Milestone Event">
                            <div class="card-body">
                                <small class="text-muted">13/06/2019</small>
                                <h3 class="h4-fs card-title">First Feature</h3>
                                <p class="card-text">A timeline is a graphical representation on which important events are marked.</p>
                            </div>
                        </div>
                    </div>
                    <div class="s_timeline_content w-0 w-md-100 h-0"/>
                </div>
                <div class="s_timeline_row position-relative d-flex gap-md-5 flex-column flex-md-row pb-4" data-name="Milestone">
                    <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                    <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                    <div class="s_timeline_content w-100 ps-4 ps-md-0">
                        <div class="s_timeline_card s_card card my-0 me-auto text-md-end" style="border-width: 0px !important;" data-vxml="001" data-snippet="s_card" data-name="Milestone Event">
                            <div class="card-body">
                                <small class="text-muted">21/03/2021</small>
                                <h3 class="h4-fs card-title">Second Feature</h3>
                                <p class="card-text">A timeline is a graphical representation on which important events are marked.</p>
                            </div>
                        </div>
                    </div>
                    <div class="s_timeline_content w-100 ps-4 ps-md-0">
                        <div class="s_timeline_card s_card card my-0 me-auto" style="border-width: 0px !important;" data-vxml="001" data-snippet="s_card" data-name="Milestone Event">
                            <div class="card-body">
                                <small class="text-muted">21/03/2021</small>
                                <h3 class="h4-fs card-title">Third Feature</h3>
                                <p class="card-text">A timeline is a visual display that highlights significant events in chronological order.</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="s_timeline_row position-relative d-flex flex-column flex-md-row gap-md-5 pb-4" data-name="Milestone">
                    <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                    <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                    <div class="s_timeline_content w-0 w-md-100 h-0"/>
                    <div class="s_timeline_content w-100 ps-4 ps-md-0">
                        <div class="s_timeline_card s_card card my-0 ms-auto" style="border-width: 0px !important;" data-vxml="001" data-snippet="s_card" data-name="Milestone Event">
                            <div class="card-body">
                                <small class="text-muted">25/12/2024</small>
                                <h3 class="h4-fs card-title">Latest Feature</h3>
                                <p class="card-text">A timeline is a graphical representation on which important events are marked.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=822 key=website.s_timeline_images name=Timeline Images active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Timeline Images" t-name="website.s_timeline_images">
    <section class="s_timeline_images o_colored_level pt48 pb48">
        <div class="container">
            <h2 class="h3-fs" style="text-align: center;">Evolving together</h2>
            <p class="lead" style="text-align: center;">Highlight your history, showcase growth and key milestones.</p>
            <div class="position-relative pt-3">
                <div class="s_timeline_images_row position-relative d-flex flex-column" data-name="Milestone">
                    <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                    <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                    <div class="s_timeline_images_content w-100 ps-4">
                        <div class="row">
                            <div class="col-12 col-lg-4 pb16">
                                <small class="text-muted">13/06/2023</small>
                                <h3 class="h4-fs">First Milestone</h3>
                            </div>
                            <div class="col-12 col-lg-8 pb16">
                                <p>
                                    <img src="/web/image/website.s_timeline_images_default_image_1" class="img img-fluid rounded" alt="" style="width: 100% !important;"/>
                                </p>
                                <p>A timeline is a graphical representation on which important events are marked.</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="s_timeline_images_row position-relative d-flex flex-column" data-name="Milestone">
                    <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                    <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                    <div class="s_timeline_images_content w-100 ps-4">
                        <div class="row">
                            <div class="col-12 col-lg-4 pb16">
                                <small class="text-muted">13/06/2023</small>
                                <h3 class="h4-fs">Second Milestone</h3>
                            </div>
                            <div class="col-12 col-lg-8 pb16">
                                <p>
                                    <img src="/web/image/website.s_timeline_images_default_image_2" class="img img-fluid rounded" alt="" style="width: 100% !important;"/>
                                </p>
                                <p>A timeline is a graphical representation on which important events are marked.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=823 key=website.s_timeline_list name=Timeline List active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Timeline List" t-name="website.s_timeline_list">
    <section class="s_timeline_list pt32 pb88">
        <div class="o_container_small">
            <h2 style="text-align: center;" class="h3-fs">What's new</h2>
            <p style="text-align: center;" class="lead">Highlight your history, showcase growth and key milestones.</p>
            <p><br/></p>
            <div class="s_timeline_list_wrapper d-flex justify-content-center pt-3">
                <div>
                    <div class="s_timeline_list_row position-relative pb-4" data-name="Milestone">
                        <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                        <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                        <small class="text-muted">Feb 11, 2024</small>
                        <strong>Enhanced User Interface for Better Navigation</strong>
                    </div>
                    <div class="s_timeline_list_row position-relative pb-4" data-name="Milestone">
                        <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                        <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                        <small class="text-muted">Apr 03, 2024</small>
                        <strong>New Dashboard Features for Custom Reports</strong>
                    </div>
                    <div class="s_timeline_list_row position-relative pb-4" data-name="Milestone">
                        <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                        <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                        <small class="text-muted">Jun 15, 2024</small>
                        <strong>Integrated Multi-Language Support Added</strong>
                    </div>
                    <div class="s_timeline_list_row position-relative pb-4" data-name="Milestone">
                        <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                        <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                        <small class="text-muted">Aug 27, 2024</small>
                        <strong>Improved Security Protocols Implemented</strong>
                    </div>
                    <div class="s_timeline_list_row position-relative pb-4" data-name="Milestone">
                        <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                        <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                        <small class="text-muted">Oct 09, 2024</small>
                        <strong>Mobile App Compatibility Expanded</strong>
                    </div>
                    <div class="s_timeline_list_row position-relative pb-4" data-name="Milestone">
                        <div class="o_dot_line position-absolute top-0 bottom-0 w-0 mb-1 border-start pe-none"/>
                        <span class="o_dot o_not_editable position-absolute translate-middle-x rounded-circle pe-none" contenteditable="false"/>
                        <small class="text-muted">Dec 22, 2024</small>
                        <strong>Advanced Analytics Tools Introduced</strong>
                    </div>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=730 key=website.s_title name=Title active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Title" t-name="website.s_title">
    <section class="s_title pt40 pb40" data-vcss="001">
        <div class="container s_allow_columns">
            <h2 class="display-3-fs" style="text-align: center;">Your section title</h2>
        </div>
    </section>
</t>

- kind=other id=880 key=website.s_title_form name=Title - Form active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Title - Form" t-name="website.s_title_form">
    <section class="s_title_form o_cc o_cc2 pt64 pb48">
        <div class="o_container_small">
            <h2 class="text-center">Let's Connect</h2>
            <p class="text-center lead">Get in touch with your customers to provide them with better service. You can modify the form fields to gather more precise information.</p>
            <t t-snippet-call="website.s_website_form" string="Form"/>
        </div>
    </section>
</t>

- kind=other id=892 key=website.s_unveil name=Unveil active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Unveil" t-name="website.s_unveil">
    <section class="s_unveil pt64 pb64">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="13">
                <div class="o_grid_item g-height-3 g-col-lg-12 col-lg-12" style="grid-area: 1 / 1 / 4 / 13; z-index: 1;">
                    <h2 style="text-align: center;">Unveiling our newest products</h2>
                    <p class="lead" style="text-align: center;">Illustrate your services or your product’s main features.</p>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-4 g-height-5 col-lg-4 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 2; grid-area: 6 / 1 / 11 / 5;">
                    <img class="img img-fluid mx-auto rounded" src="/web/image/website.s_carousel_default_image_3" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-4 g-height-5 col-lg-4 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 3; grid-area: 4 / 3 / 9 / 7;">
                    <img class="img img-fluid mx-auto rounded" src="/web/image/website.s_masonry_block_default_image_1" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-4 g-height-6 col-lg-4" style="z-index: 4; grid-area: 7 / 4 / 13 / 8;">
                    <img class="img img-fluid mx-auto rounded" src="/web/image/website.s_picture_default_image" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-4 g-height-7 col-lg-4 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 5; grid-area: 5 / 8 / 12 / 12;">
                    <img class="img img-fluid mx-auto rounded" src="/web/image/website.s_carousel_default_image_2" alt=""/>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-4 g-height-5 col-lg-4 d-lg-block d-none o_snippet_mobile_invisible" style="z-index: 6; grid-area: 9 / 9 / 14 / 13;">
                    <img class="img img-fluid mx-auto rounded" src="/web/image/website.s_carousel_default_image_1" alt=""/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=889 key=website.s_video name=Video active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Video" t-name="website.s_video">
    <div class="media_iframe_video o_snippet_drop_in_only" data-oe-expression="//www.youtube.com/embed/G8b4UZIcTfg?rel=0&amp;autoplay=0">
        <div class="css_editable_mode_display"/>
        <div class="media_iframe_video_size"/>
        <iframe src="//www.youtube.com/embed/G8b4UZIcTfg?rel=0&amp;autoplay=0" frameborder="0" allowfullscreen="allowfullscreen" aria-label="Video"/>
    </div>
</t>

- kind=other id=842 key=website.s_wavy_grid name=Wavy Grid active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Wavy Grid" t-name="website.s_wavy_grid">
    <section class="s_wavy_grid pt32 pb32" data-oe-shape-data="{'shape':'html_builder/Angular/07', 'colors':{'c5':'o-color-3'},'flip':[],'showOnMobile':false,'shapeAnimationSpeed':'0'}" style="position: relative;">
        <div class="o_we_shape o_html_builder_Angular_07" style="background-image: url('/html_editor/shape/html_builder/Angular/07.svg?c5=o-color-3');"/>
        <div class="container">
            <div class="row o_grid_mode" data-row-count="30">
                <div class="o_grid_item g-col-lg-4 g-height-3 col-lg-4" style="grid-area: 14 / 5 / 17 / 9; z-index: 1;">
                    <h2 style="text-align: center;">What we offer to our customers</h2>
                </div>
                <div class="o_grid_item o_grid_item_image g-height-10 g-col-lg-7 col-lg-7" style="--grid-item-padding-y: 0px; grid-area: 1 / 1 / 11 / 8; z-index: 2;">
                    <img src="/web/image/website.s_wavy_grid_default_image_1" alt="" class="img img-fluid rounded o_we_custom_image"/>
                </div>
                <div class="o_grid_item g-col-lg-7 g-height-3 col-lg-7" style="--grid-item-padding-y: 16px; grid-area: 11 / 1 / 14 / 8; z-index: 3;">
                    <h3 class="h5-fs">Tailored Solutions</h3>
                    <p>We provide personalized solutions to meet your unique needs. Our team works with you to ensure optimal results from start to finish.</p>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-3 g-height-9 col-lg-3" style="--grid-item-padding-y: 0px; grid-area: 4 / 10 / 13 / 13; z-index: 4;">
                    <img src="/web/image/website.s_wavy_grid_default_image_2" alt="" class="img img-fluid rounded o_we_custom_image"/>
                </div>
                <div class="o_grid_item g-col-lg-3 g-height-3 col-lg-3" style="--grid-item-padding-y: 16px; grid-area: 13 / 10 / 16 / 13; z-index: 5;">
                    <h3 class="h5-fs">Eco-Friendly Solutions</h3>
                    <p>Customer satisfaction is our priority. Our support team is always ready to assist, ensuring you have a smooth and successful experience.</p>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-3 g-height-9 col-lg-3" style="--grid-item-padding-y: 0px; grid-area: 14 / 1 / 23 / 4; z-index: 6;">
                    <img src="/web/image/website.s_wavy_grid_default_image_3" alt="" class="img img-fluid rounded o_we_custom_image"/>
                </div>
                <div class="o_grid_item g-col-lg-3 g-height-3 col-lg-3" style="--grid-item-padding-y: 16px; grid-area: 23 / 1 / 26 / 4; z-index: 7;">
                    <h3 class="h5-fs">Quality and Excellence</h3>
                    <p>With extensive experience and deep industry knowledge, we provide insights and solutions that keep you ahead of the curve.</p>
                </div>
                <div class="o_grid_item o_grid_item_image g-col-lg-7 g-height-10 col-lg-7" style="--grid-item-padding-y: 0px; grid-area: 18 / 6 / 28 / 13; z-index: 8;">
                    <img src="/web/image/website.s_wavy_grid_default_image_4" alt="" class="img img-fluid rounded o_we_custom_image"/>
                </div>
                <div class="o_grid_item g-col-lg-7 g-height-3 col-lg-7" style="--grid-item-padding-y: 16px; grid-area: 28 / 6 / 31 / 13; z-index: 9;">
                    <h3 class="h5-fs">Expertise and Knowledge</h3>
                    <p>We offer cutting-edge products and services to tackle modern challenges. Leveraging the latest technology, we help you achieve your goals.</p>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=878 key=website.s_website_form name=Form active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=1 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Form" t-name="website.s_website_form">
    <section class="s_website_form pt16 pb16" data-vcss="001" data-snippet="s_website_form">
        <div class="container-fluid">
            <form action="/website/form/" method="post" enctype="multipart/form-data" class="o_mark_required" data-mark="*" data-pre-fill="true" data-model_name="mail.mail" data-success-mode="redirect" data-success-page="/contactus-thank-you">
                <div class="s_website_form_rows row s_col_no_bgcolor">
                    <div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_dnone">
                        <div class="row s_col_no_resize s_col_no_bgcolor">
                            <label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px">
                                <span class="s_website_form_label_content"/>
                            </label>
                            <div class="col-sm">
                                <input type="hidden" class="form-control s_website_form_input" name="email_to" value="info@yourcompany.example.com"/>
                            </div>
                        </div>
                    </div>
                    <div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_custom s_website_form_required" data-type="char">
                        <div class="row s_col_no_resize s_col_no_bgcolor">
                            <label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="obij2aulqyau">
                                <span class="s_website_form_label_content">Your Name</span>
                                <span class="s_website_form_mark"> *</span>
                            </label>
                            <div class="col-sm">
                                <input class="form-control s_website_form_input" type="text" name="name" required="1" data-fill-with="name" id="obij2aulqyau"/>
                            </div>
                        </div>
                    </div>
                    <div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_custom" data-type="tel">
                        <div class="row s_col_no_resize s_col_no_bgcolor">
                            <label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="ozp7022vqhe">
                                <span class="s_website_form_label_content">Phone Number</span>
                            </label>
                            <div class="col-sm">
                                <input class="form-control s_website_form_input" type="tel" name="phone" data-fill-with="phone" id="ozp7022vqhe"/>
                            </div>
                        </div>
                    </div>
                    <div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_model_required" data-type="email">
                        <div class="row s_col_no_resize s_col_no_bgcolor">
                            <label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="oub62hlfgjwf">
                                <span class="s_website_form_label_content">Your Email</span>
                                <span class="s_website_form_mark"> *</span>
                            </label>
                            <div class="col-sm">
                                <input class="form-control s_website_form_input" type="email" name="email_from" required="" data-fill-with="email" id="oub62hlfgjwf"/>
                            </div>
                        </div>
                    </div>
                    <div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_custom" data-type="char">
                        <div class="row s_col_no_resize s_col_no_bgcolor">
                            <label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="o291di1too2s">
                                <span class="s_website_form_label_content">Your Company</span>
                            </label>
                            <div class="col-sm">
                                <input class="form-control s_website_form_input" type="text" name="company" data-fill-with="parent_name" id="o291di1too2s"/>
                            </div>
                        </div>
                    </div>
                    <div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_model_required" data-type="char">
                        <div class="row s_col_no_resize s_col_no_bgcolor">
                            <label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="oqsf4m51acj">
                                <span class="s_website_form_label_content">Subject</span>
                                <span class="s_website_form_mark"> *</span>
                            </label>
                            <div class="col-sm">
                                <input class="form-control s_website_form_input" type="text" name="subject" required="" id="oqsf4m51acj"/>
                            </div>
                        </div>
                    </div>
                    <div data-name="Field" class="s_website_form_field mb-3 col-12 s_website_form_custom s_website_form_required" data-type="text">
                        <div class="row s_col_no_resize s_col_no_bgcolor">
                            <label class="col-form-label col-sm-auto s_website_form_label" style="width: 200px" for="oyeqnysxh10b">
                                <span class="s_website_form_label_content">Your Question</span>
                                <span class="s_website_form_mark"> *</span>
                            </label>
                            <div class="col-sm">
                                <textarea class="form-control s_website_form_input" name="description" required="1" id="oyeqnysxh10b" rows="3"…

- kind=other id=901 key=website.s_website_form_cover name=Form Cover active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Form Cover" t-name="website.s_website_form_cover">
    <section class="s_website_form_cover" data-snippet="s_website_form_cover">
        <div class="container-fluid">
            <div class="row s_nb_column_fixed">
                <div class="col-lg-6 oe_img_bg o_bg_img_center o_not_editable pt128 pb128" data-name="Image" style="background-image: url('/web/image/website.s_website_form_cover_default_image');"/>
                <div class="col-lg-6 pt48 pb48 px-4">
                    <h2>Send us a message</h2>
                    <p class="lead">Get in touch with your customers to provide them with better service. You can modify the form fields to gather more precise information.</p>
                    <t t-snippet-call="website.s_website_form"/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=826 key=website.s_website_form_info name=Form Info active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Form Info" t-name="website.s_website_form_info">
    <section class="s_website_form_info pb24 pt24 o_cc o_cc2">
        <div class="container">
            <div class="row o_grid_mode" data-row-count="12">
                <div class="o_grid_item o_grid_item_image g-col-lg-5 g-height-4 col-lg-5 col-12" style="--grid-item-padding-x: 0px; --grid-item-padding-y: 16px; grid-area: 1 / 1 / 5 / 6; z-index: 1;">
                    <img class="img img-fluid" src="/web/image/website.s_website_form_info_default_image" alt=""/>
                </div>
                <div class="o_grid_item g-col-lg-5 g-height-4 col-lg-5 col-12" style="--grid-item-padding-x: 0px; --grid-item-padding-y: 0px; grid-area: 5 / 1 / 9 / 6; z-index: 2;">
                    <h2 style="text-align: left;">Contact Us</h2>
                    <p style="text-align: left;">We'd love to hear from you! Whether you have questions, feedback, or need support, our team is here to help. Simply fill out the form below, and we aim to respond to all inquiries within 24 hours. Thank you for getting in touch!</p>
                </div>
                <div class="o_grid_item g-col-lg-5 g-height-3 col-lg-5 col-12" style="--grid-item-padding-x: 0px; --grid-item-padding-y: 8px; grid-area: 10 / 1 / 13 / 6; z-index: 3;">
                    <i class="fa fa-fw fa-envelope o_not-animable" role="img"/>
                      yourcompany@example.com
                    <br/>
                    <br/>
                    <i class="fa fa-fw fa-phone o_not-animable" role="img"/>
                       +32(0)499 123 456
                    <br/>
                    <br/>
                    <i class="fa fa-fw fa-map-marker o_not-animable" role="img"/>
                      Brussels, Belgium
                </div>
                <div class="o_grid_item g-col-lg-6 g-height-12 col-lg-6 col-12" style="--grid-item-padding-x: 0px; grid-area: 1 / 7 / 13 / 13; z-index: 4;">
                    <t t-snippet-call="website.s_website_form"/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=879 key=website.s_website_form_overlay name=Form Overlay active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Form Overlay" t-name="website.s_website_form_overlay">
    <section class="s_website_form_overlay pt64 pb64 oe_img_bg o_bg_img_center o_colored_level" style="background-image: url('/web/image/website.s_website_form_overlay_default_image');">
        <div class="o_we_bg_filter bg-black-50"/>
        <div class="container">
            <div class="row">
                <div class="o_cc o_cc1 col-lg-6 offset-lg-6 rounded px-3 px-lg-4 pt40 pb16">
                    <h2>Send us a message</h2>
                    <p class="lead">Get in touch with your customers to provide them with better service. You can modify the form fields to gather more precise information.</p>
                    <t t-snippet-call="website.s_website_form"/>
                </div>
            </div>
        </div>
    </section>
</t>

- kind=other id=712 key=website.search_tags_highlight name=Website Searchbar: Tag Highlight active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Website Searchbar: Tag Highlight" t-name="website.search_tags_highlight">
    <div class="d-flex gap-1 flex-wrap">
        <span t-foreach="tags" t-as="tag" class="badge o_color_0">
            <span t-foreach="enumerate(tag['parts'])" t-as="part" t-att-class="'fw-bold text-primary-emphasis' if part[0] % 2 else None" t-out="part[1]"/>
        </span>
    </div>
</t>

- kind=other id=711 key=website.search_text_with_highlight name=Website Searchbox item highlight active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Website Searchbox item highlight" t-name="website.search_text_with_highlight">
    <span t-foreach="enumerate(parts)" t-as="part" t-att-class="'text-primary-emphasis' if part[0] % 2 else None" t-out="part[1]"/>
</t>

- kind=other id=651 key=website.shared_blocks name=Shared blocks active=True website=null inherit={"id": 586, "name": "Main layout"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Shared blocks">
    <xpath expr="//main" position="inside">
        <div id="o_shared_blocks" class="oe_unremovable"/>
    </xpath>
</data>

- kind=other id=694 key=website.show_website_info name=Show Odoo Information active=True website=null inherit={"id": 693, "name": "Odoo Information"}
  signals: hrefs_total=3 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data name="Show Odoo Information">
    <xpath expr="//div[@id='wrap']" position="inside">
        <div class="oe_structure">
            <section class="container">
                <h1><t t-out="res_company.name"/>
                    <small groups="base.group_no_one">Odoo Version <t t-out="version.get('server_version')"/></small>
                </h1>
                <p>
                    Information about the <t t-out="res_company.name"/> instance of Odoo, the <a class="o_translate_inline" target="_blank" href="https://www.odoo.com">Open Source ERP</a>.
                </p>

                <div class="alert alert-warning alert-dismissable mt16" groups="website.group_website_restricted_editor" role="status">
                   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"/>
                   <p>
                     Note: To hide this page, uncheck it from the Customize tab in edit mode.
                   </p>
                </div>
                <h2>Installed Applications</h2>
                <dl class="dl-horizontal" t-foreach="apps" t-as="app">
                    <dt>
                        <a t-att-href="app.website" t-if="app.website">
                            <t t-out="app.shortdesc"/>
                        </a>
                        <span t-out="app.shortdesc" t-if="not app.website"/>
                    </dt>
                    <dd>
                        <span t-out="app.summary"/>
                    </dd><dd class="text-muted" groups="base.group_no_one">
                        Technical name: <span t-field="app.name"/>, author: <span t-field="app.author"/>
                    </dd>
                </dl>

                <div t-if="l10n">
                    <h2 class="mt32">Installed Localizations / Account Charts</h2>
                    <dl class="dl-horizontal" t-foreach="l10n" t-as="app">
                        <dt>
                            <a t-att-href="app.website or 'https://www.odoo.com/app/accounting/' + app.name">
                                <t t-out="app.shortdesc"/>
                            </a>
                        </dt>
                        <dd>
                            <span t-out="app.summary"/>
                        </dd><dd class="text-muted" groups="base.group_no_one">
                            Technical name: <span t-field="app.name"/>, author: <span t-field="app.author"/>
                        </dd>
                    </dl>
                </div>
            </section>
        </div>
    </xpath>
</data>

- kind=other id=709 key=website.sitemap_index_xml name=sitemap_index_xml active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.sitemap_index_xml"><t t-translation="off">&lt;?xml version="1.0" encoding="UTF-8"?&gt;
<sitemapindex t-attf-xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap t-translation="off" t-foreach="pages" t-as="page">
    <loc><t t-out="url_root"/>sitemap-<t t-out="page"/>.xml</loc>
  </sitemap>
</sitemapindex>
</t>
</t>

- kind=other id=707 key=website.sitemap_locs name=sitemap_locs active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.sitemap_locs">
    <url t-foreach="locs" t-as="page">
        <loc><t t-out="url_root"/><t t-out="page['loc']"/></loc><t t-if="page.get('lastmod', False)">
        <lastmod t-out="page['lastmod']"/></t><t t-if="page.get('priority', False)">
        <priority t-out="page['priority']"/></t><t t-if="page.get('changefreq', False)">
        <changefreq t-out="page['changefreq']"/></t>
    </url>
</t>

- kind=other id=708 key=website.sitemap_xml name=sitemap_xml active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.sitemap_xml"><t t-translation="off">&lt;?xml version="1.0" encoding="UTF-8"?&gt;</t>
<urlset t-attf-xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <t t-out="content"/>
</urlset>
</t>

- kind=other id=726 key=website.snippets name=snippets active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t t-name="website.snippets">
    <t id="default_snippets">
        <t t-set="cta_btn_text" t-value="False"/>
        <t t-set="cta_btn_href">/contactus</t>
        <t t-set="shop_btn_href">#</t>

        <!-- Snippet groups -->
        <snippets id="snippet_groups" string="Categories">
            <t snippet-group="custom" t-snippet="website.s_snippet_group" string="Custom" t-thumbnail="/website/static/src/img/snippets_thumbs/s_media_list.svg"/>
            <t snippet-group="intro" t-snippet="website.s_snippet_group" string="Intro" t-thumbnail="/website/static/src/img/snippets_thumbs/s_cover.svg"/>
            <t snippet-group="columns" t-snippet="website.s_snippet_group" string="Columns" t-thumbnail="/website/static/src/img/snippets_thumbs/s_three_columns.svg"/>
            <t snippet-group="content" t-snippet="website.s_snippet_group" string="Content" t-thumbnail="/website/static/src/img/snippets_thumbs/s_text_image.svg"/>
            <t snippet-group="images" t-snippet="website.s_snippet_group" string="Images" t-thumbnail="/website/static/src/img/snippets_thumbs/s_picture.svg"/>
            <t snippet-group="people" t-snippet="website.s_snippet_group" string="People" t-thumbnail="/website/static/src/img/snippets_thumbs/s_company_team.svg"/>
            <t snippet-group="text" t-snippet="website.s_snippet_group" string="Text" t-thumbnail="/website/static/src/img/snippets_thumbs/s_text_block.svg"/>
            <t snippet-group="contact_and_forms" t-snippet="website.s_snippet_group" string="Contact &amp; Forms" t-thumbnail="/website/static/src/img/snippets_thumbs/s_website_form.svg"/>
            <t snippet-group="social" t-snippet="website.s_snippet_group" string="Social" t-thumbnail="/website/static/src/img/snippets_thumbs/s_instagram_page.svg"/>
            <t t-if="debug" snippet-group="debug" t-snippet="website.s_snippet_group" string="Debug" t-thumbnail="/website/static/src/img/snippets_thumbs/s_debug_group.png"/>
            <t snippet-group="catalog" t-snippet="website.s_snippet_group" string="Catalog" t-thumbnail="/website/static/src/img/snippets_thumbs/s_catalog.svg"/>
            <t id="installed_snippets_hook"/>
            <t snippet-group="blogs" string="Blogs" t-install="website_blog" t-thumbnail="/website/static/src/img/snippets_thumbs/s_blog_posts.svg"/>
            <t snippet-group="events" string="Events" t-install="website_event" t-thumbnail="/website/static/src/img/snippets_thumbs/s_event_upcoming_snippet.svg"/>
        </snippets>

        <snippets id="snippet_structure" string="Structure">

            <!-- Intro group -->
            <t t-snippet="website.s_banner" string="Banner" group="intro">
                <keywords>hero, jumbotron, headline, header, branding, intro, home, showcase, spotlight, lead, welcome, announcement, splash, top, main</keywords>
            </t>
            <t t-snippet="website.s_cover" string="Cover" group="intro" label="Parallax">
                <keywords>hero, jumbotron, headline, header, branding, intro, home, showcase, spotlight, main, landing, presentation, top, splash, parallax</keywords>
            </t>
            <t t-snippet="website.s_text_cover" string="Text Cover" group="intro">
                <keywords>hero, jumbotron, headline, header, intro, home, content, description, primary, highlight, lead</keywords>
            </t>
            <t t-snippet="website.s_carousel" string="Carousel" group="intro" label="Carousel">
                <keywords>gallery, carousel, slider, slideshow, picture, photo, image-slider, rotating, swipe, transition, media-carousel, movement</keywords>
            </t>
            <t t-snippet="website.s_carousel_intro" string="Carousel Intro" group="intro" label="Carousel">
                <keywords>gallery, carousel, slider, slideshow, picture, photo, image-slider, rotating, swipe, transition, media-carousel, movement</keywords>
            </t>
            <t t-snippet="website.s_adventure" string="Adventure" group="intro">
                <keywords>journey, exploration, travel, outdoor, excitement, quest, start, onboarding, discovery, thrill</keywords>
            </t>
            <t t-snippet="website.s_striped_center_top" string="Striped Center Top" group="intro">
                <keywords>hero, jumbotron, headline, header, introduction, home, content, picture, photo, illustration, media, visual, article, combination, trendy, pattern, design, centered</keywords>
            </t>
            <t t-snippet="website.s_motto" string="Motto" group="intro">
                <keywords>cite, slogan, tagline, mantra, catchphrase, statements, sayings, comments, mission, citations, maxim, quotes, principle, ethos, values</keywords>
            </t>
            <t t-snippet="website.s_banner_connected" string="Banner connected" group="intro" label="Parallax">
                <keywords>content, picture, photo, connection, cover, shape, background, image, headings, hero, light, experience, parallax</keywords>
            </t>
            <t t-snippet="website.s_kickoff" string="Kickoff" group="intro" label="Parallax">
                <keywords>picture, photo, illustration, media, visual, start, launch, commencement, initiation, opening, kick-off, kickoff, beginning, events, parallax</keywords>
            </t>
            <t t-snippet="website.s_closer_look" string="Closer Look" group="intro">
                <keywords>content, picture, photo, illustration, media, visual, focus, in-depth, analysis, more, contact, detailed, mockup, explore, insight</keywords>
            </t>
            <t t-snippet="website.s_striped_top" string="Striped Top" group="intro">
                <keywords>content, picture, photo, illustration, media, visual, article, story, combination, trendy, pattern, design</keywords>
            </t>
            <t t-snippet="website.s_sidegrid" string="Side grid" group="intro">
                <keywords>grid, gallery, pictures, photos, media, text, content, album, showcase, visuals, portfo…

- kind=other id=717 key=website.step_wizard name=Step Checkout active=True website=null inherit=null
  signals: hrefs_total=1 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Step Checkout" t-name="website.step_wizard">
    <!-- wizard_step: A recordset of all published website.checkout.steps-->
    <div class="o_wizard d-flex flex-wrap row-gap-2 my-3 small">
        <t t-foreach="wizard_step" t-as="step">
            <t t-set="is_current_step" t-value="step.step_href == current_website_checkout_step_href"/>
            <t t-if="is_current_step" t-set="not_completed_step" t-value="'True'"/>
            <span t-if="not_completed_step" t-attf-class="#{not is_current_step and 'o_disabled'} d-flex no-decoration">
                <div name="step_name" t-attf-class="d-flex align-items-center {{'fw-bold' if is_current_step else 'text-muted'}}">
                    <p class="text-center mb-0">
                        <span t-field="step.name"/>
                    </p>
                    <span t-if="not step_last" class="fa fa-angle-right d-inline-block align-middle mx-3 text-muted fs-5"/>
                </div>
            </span>
            <a t-else="" class="d-flex no-decoration" t-att-href="step.step_href" t-att-title="step.name">
                <div class="d-flex align-items-center">
                    <p class="text-center mb-0">
                        <span t-field="step.name"/>
                    </p>
                    <span t-if="not step_last" class="fa fa-angle-right d-inline-block align-middle mx-3 text-muted fs-5"/>
                </div>
            </a>
        </t>
    </div>
</t>

- kind=other id=585 key=website.submenu name=Submenu active=True website=null inherit=null
  signals: hrefs_total=3 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Submenu" t-name="website.submenu">
    <t t-set="show_dropdown" t-value="(submenu.is_mega_menu and submenu.is_visible) or submenu.child_id.filtered(lambda menu: menu.is_visible)"/>
    <t t-set="is_accordion_nav" t-value="is_vertical_nav and not submenu.is_mega_menu"/>

    <li t-if="submenu.is_visible and not (submenu.child_id or submenu.is_mega_menu)" t-attf-class="#{item_class or ''} #{is_vertical_nav and 'px-0'}" role="presentation">
        <a t-att-href="submenu._clean_url()" t-attf-class="#{link_class or ''} #{submenu._is_active() and 'active'}" role="menuitem" t-ignore="true" t-att-target="'_blank' if submenu.new_window else None">
            <span t-field="submenu.name"/>
        </a>
    </li>
    <li t-elif="show_dropdown" t-attf-class="#{item_class or ''} #{submenu.is_mega_menu and 'position-static'} #{offcanvas_is_leftside and 'o_mega_menu_left'} #{is_accordion_nav and 'accordion accordion-flush' or 'dropdown'}" role="presentation">
        <a t-if="not is_accordion_nav" href="#" t-attf-class="dropdown-toggle #{link_class or ''} #{submenu.is_mega_menu and 'o_mega_menu_toggle'} #{submenu._is_active() and 'active'} #{dropdown_toggler_classes}" data-bs-toggle="dropdown" t-att-data-bs-display="'static' if submenu.is_mega_menu else None" data-bs-auto-close="outside" role="menuitem">
            <span t-field="submenu.name"/>
        </a>
        <!-- Avoid rendering the mega menu element twice (Desktop + Mobile) -->
        <div t-if="submenu.is_mega_menu and not is_mobile" t-attf-class="o_mega_menu dropdown-menu #{submenu.mega_menu_classes} #{_extra_megamenu_classes or 'border-top-0'}" data-name="Mega Menu" t-field="submenu.mega_menu_content" role="menuitem"/>
        <!-- Renders the back arrow if it's a mega menu in Mobile / Sidebar / Hamburger -->
        <div t-if="submenu.is_mega_menu and is_vertical_nav" t-attf-class="o_mega_nav o_cc1 position-fixed top-0 #{offcanvas_is_leftside and 'start-0' or 'end-0'} invisible d-flex align-items-center w-100">
            <button class="btn nav-link oi oi-chevron-left ms-n2 px-2"/>
        </div>
        <!-- Is a dropdown in desktop -> becomes accordion in Mobile / Sidebar / Hamburger -->
        <div t-elif="is_accordion_nav" class="accordion-item">
            <a href="#" t-attf-class="#{link_class or ''} accordion-button collapsed" data-bs-toggle="collapse" t-attf-data-bs-target=".o_accordion_target_#{submenu.id}" aria-expanded="false" t-attf-aria-controls="o_accordion_target_#{submenu.id}">
                <span t-field="submenu.name"/>
            </a>
            <div t-attf-class="o_accordion_target_#{submenu.id} accordion-collapse collapse" t-attf-aria-labelledby="o_accordion_target_#{submenu.id}" t-attf-data-bs-parent="#{is_mobile and '#top_menu_collapse_mobile' or '#top_menu'}">
                <ul class="show list-group list-unstyled py-0" role="menu">
                    <t t-foreach="submenu.child_id" t-as="submenu">
                        <t t-call="website.submenu" submenu_recursion="true" item_class="None" link_class.f="nav-link list-group-item list-group-item-action border-0 rounded-0 px-4 text-wrap"/>
                    </t>
                </ul>
            </div>
        </div>
        <ul t-else="" t-attf-class="dropdown-menu #{dropdown_menu_classes}" role="menu">
            <t t-foreach="submenu.child_id" t-as="submenu">
                <t t-call="website.submenu" item_class="None" link_class.f="dropdown-item"/>
            </t>
        </ul>
    </li>
</t>

- kind=other id=589 key=website.user_dropdown name=user_dropdown active=True website=null inherit={"id": 505, "name": "Portal User Dropdown"}
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//t[@t-set='is_connected']" position="replace">
        <t t-set="is_connected" t-value="False"/>
        <t t-if="website">
            <t t-set="is_connected" t-value="website.user_id != user_id"/>
        </t>
        <t t-else="">$0</t>
    </xpath>
</data>

- kind=other id=693 key=website.website_info name=Odoo Information active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Odoo Information" t-name="website.website_info">
    <t t-call="website.layout">
        <t t-set="head">
            <meta name="robots" content="noindex, nofollow"/>
        </t>
        <div id="wrap" class="o_website_info"/>
    </t>
</t>

- kind=other id=710 key=website.website_search_box name=Website Searchbox active=True website=null inherit=null
  signals: hrefs_total=0 forms_total=0 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <t name="Website Searchbox" t-name="website.website_search_box">
    <div t-attf-class="input-group #{_classes}" role="search">
        <t t-set="search_placeholder">Search...</t>
        <input type="search" name="search" t-att-class="'search-query form-control oe_search_box %s %s' % (_input_classes or '', '' if default_style else 'border-0 bg-light')" t-att-placeholder="placeholder if placeholder else search_placeholder" t-att-value="search"/>
        <button type="submit" t-att-class="'btn oe_search_button %s' % (_submit_classes or ('btn-primary' if default_style else 'btn-light'))" aria-label="Search" title="Search">
            <i class="oi oi-search"/>
            <span t-if="search" class="oe_search_found">
                <small>(<t t-out="search_count or 0"/> found)</small>
            </span>
        </button>
    </div>
</t>

- kind=other id=716 key=website.website_search_box_input name=website_search_box_input active=True website=null inherit={"id": 710, "name": "Website Searchbox"}
  signals: hrefs_total=0 forms_total=1 onclicks_total=0 interesting_hrefs=0 interesting_forms=0 interesting_onclicks=0
  arch_snip: <data>
    <xpath expr="//input[@name='search']" position="attributes">
        <attribute name="t-att-data-search-type">search_type</attribute>
        <attribute name="t-att-data-limit">limit or '5'</attribute>
        <attribute name="t-att-data-display-image">display_image or 'true'</attribute>
        <attribute name="t-att-data-display-description">display_description or 'true'</attribute>
        <attribute name="t-att-data-display-extra-link">display_extra_link or 'true'</attribute>
        <attribute name="t-att-data-display-detail">display_detail or 'true'</attribute>
        <attribute name="t-att-data-order-by">order_by or 'name asc'</attribute>
    </xpath>
    <xpath expr="//div[@role='search']" position="attributes">
        <attribute name="t-attf-class" remove="s_searchbar_input" separator=" "/>
    </xpath>
    <xpath expr="//div[@role='search']" position="replace">
        <form t-attf-class="o_searchbar_form s_searchbar_input #{_form_classes}" t-att-action="action" method="get" t-attf-data-snippet="s_searchbar_input">
            <t>$0</t>
            <input name="order" type="hidden" class="o_search_order_by oe_unremovable" t-att-value="order_by if order_by else 'name asc'"/>
            <t t-out="0"/>
        </form>
    </xpath>
<xpath expr="." position="attributes"><attribute name="t-name">website.website_search_box_input</attribute></xpath></data>

## Next (TOTEM contract)
- From this report: pick EXACT header CTA(s) and map them to /web/login or /web/signup.
- Then implement STEP 2B: post-signup server-to-server -> Core /system/onboarding/identity.
- Then implement STEP 3: post-login read-only state check -> redirect by core_state.
