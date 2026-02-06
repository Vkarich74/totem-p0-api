# TOTEM — ONBOARDING v1 (FREEZE)

Этот документ описывает, как подключается салон и мастер
к публичному виджету бронирования TOTEM.

Backend считается ЗАМОРОЖЕННЫМ.
Изменения возможны только в v2.

---

## 1) Термины

### salon_id
- строковый идентификатор салона
- используется во всех публичных запросах
- пример: `s1`, `salon_abc123`

### master_slug
- публичный slug мастера
- используется в URL и виджете
- пример: `test-master`, `anna-smith`

### service_id
- идентификатор услуги
- в v1 фиксированный (выбирается на стороне салона)

---

## 2) Как салон подключается (v1)

### Шаги:
1. Салону создаётся `salon_id`
2. Для каждого мастера создаётся `master_slug`
3. Эти значения передаются салону

⚠️ В v1:
- процесс может быть ручным
- автоматизация планируется в v2

---

## 3) Что получает салон

### Embed snippet (пример)

```html
<div id="totem-booking"></div>

<script type="module">
  import "https://YOUR_DOMAIN/widget/totem-widget.js";

  TotemWidget.mount("#totem-booking", {
    baseUrl: "https://totem-p0-api-production.up.railway.app",
    salon_id: "s1",
    master_slug: "test-master",
    service_id: "srv1"
  });
</script>
