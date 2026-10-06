export const emailLanguage = locale => /^en(?:-|$)/i.test(String(locale || "")) ? "en" : "ru";
export function escapeEmailHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
const copy = {
  ru: { otp: "Код входа TOTEM", reset: "Восстановление пароля TOTEM", code: "Ваш код подтверждения:", ttl: minutes => `Код действует ${minutes} минут.`, account: "Кабинет", resetLink: "Ссылка для сброса пароля:", afterReset: "После смены пароля войдите новым паролем.", hello: name => `Здравствуйте, ${name}.`, opened: type => `TOTEM: доступ ${type === "master" ? "мастера" : "салона"} создан`, access: type => `Доступ ${type === "master" ? "мастера" : "салона"} в TOTEM создан.`, publicPage: "Публичная страница", login: "Как войти", steps: ["Откройте ссылку кабинета.", "Введите email, на который пришло это письмо.", "Получите код входа на email.", "Введите код и откройте кабинет."], fill: "Что заполнить в кабинете", master: "Профиль мастера, услуги, расписание и описание.", salon: "Профиль салона, услуги, мастеров, расписание и описание.", missing: "Если код не пришёл, проверьте Спам/Промоакции или обратитесь в поддержку TOTEM.", support: "Поддержка" },
  en: { otp: "Your TOTEM sign-in code", reset: "Reset your TOTEM password", code: "Your verification code:", ttl: minutes => `This code is valid for ${minutes} minutes.`, account: "Account", resetLink: "Password reset link:", afterReset: "Sign in with your new password after resetting it.", hello: name => `Hello, ${name}.`, opened: type => `TOTEM: your ${type === "master" ? "master" : "salon"} account is ready`, access: type => `Your ${type === "master" ? "master" : "salon"} account on TOTEM is ready.`, publicPage: "Public page", login: "How to sign in", steps: ["Open your account link.", "Enter the email address that received this message.", "Get your sign-in code by email.", "Enter the code to open your account."], fill: "What to add to your account", master: "Your master profile, services, schedule and description.", salon: "Your salon profile, services, masters, schedule and description.", missing: "If the code does not arrive, check Spam/Promotions or contact TOTEM support.", support: "Support" },
};
function email(subject, lines, locale) {
  const language = emailLanguage(locale);
  return { subject, text: lines.join("\n"), html: `<div lang="${language}" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111827"><h2>${escapeEmailHtml(subject)}</h2>${lines.map(line => `<p>${escapeEmailHtml(line)}</p>`).join("")}</div>`, locale: locale || language };
}
export function buildOtpEmail({ code, ttlMinutes = 30, locale } = {}) {
  const c = copy[emailLanguage(locale)];
  const result = email(c.otp, [c.code, String(code ?? ""), c.ttl(ttlMinutes)], locale);
  result.html = result.html.replace(`<p>${escapeEmailHtml(code)}</p>`, `<div style="font-size:32px;font-weight:700;letter-spacing:6px">${escapeEmailHtml(code)}</div>`);
  return result;
}
export function buildPasswordResetEmail({ code, ttlMinutes = 30, role, slug, resetUrl, locale } = {}) {
  const c = copy[emailLanguage(locale)];
  const result = email(c.reset, [`${c.account}: ${role || ""} / ${slug || ""}`, c.code, String(code ?? ""), c.ttl(ttlMinutes), c.resetLink, String(resetUrl || ""), c.afterReset], locale);
  const escaped = escapeEmailHtml(resetUrl);
  if (/^https:\/\//i.test(String(resetUrl || ""))) result.html = result.html.replace(`<p>${escaped}</p>`, `<p><a href="${escaped}">${escaped}</a></p>`);
  return result;
}
export function buildOwnerOpeningEmail({ name, ownerType, cabinetLink, publicLink, locale } = {}) {
  const c = copy[emailLanguage(locale)];
  const lines = [c.hello(name || ""), c.access(ownerType), ...(cabinetLink ? [`${c.account}: ${cabinetLink}`] : []), ...(publicLink ? [`${c.publicPage}: ${publicLink}`] : []), c.login, ...c.steps.map((step, index) => `${index + 1}. ${step}`), c.fill, ownerType === "master" ? c.master : c.salon, c.missing, `${c.support}: kantotemus@gmail.com`];
  const result = email(c.opened(ownerType), lines, locale);
  for (const [label, link] of [[c.account, cabinetLink], [c.publicPage, publicLink]]) {
    if (link && /^https:\/\//i.test(link)) result.html = result.html.replace(`<p>${escapeEmailHtml(label + ": " + link)}</p>`, `<p>${escapeEmailHtml(label)}: <a href="${escapeEmailHtml(link)}">${escapeEmailHtml(link)}</a></p>`);
  }
  return result;
}
export function buildEmailMime({ to, from, subject, html, text = "", locale }) {
  const header = value => {
    const result = String(value ?? "");
    if (/[\r\n]/.test(result)) throw new Error("EMAIL_HEADER_INVALID");
    return result;
  };
  const encode = value => Buffer.from(String(value ?? ""), "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
  const words = []; let chunk = "";
  for (const char of header(subject)) {
    if (Buffer.byteLength(chunk + char, "utf8") > 42 && chunk) { words.push(chunk); chunk = ""; }
    chunk += char;
  }
  if (chunk || !words.length) words.push(chunk);
  const encodedSubject = words.map(word => "=?UTF-8?B?" + Buffer.from(word, "utf8").toString("base64") + "?=").join("\r\n ");
  const boundary = "totem-mail-alternative-v1";
  return ["MIME-Version: 1.0", `From: ${header(from)}`, `To: ${header(to)}`, `Subject: ${encodedSubject}`, `Content-Language: ${header(locale || emailLanguage(locale))}`, `Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", encode(text), `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", encode(html), `--${boundary}--`, ""].join("\r\n");
}
