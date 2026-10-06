const ENGLISH = {"Запись создана": "Booking created", "Ваша запись создана и ожидает подтверждения.": "Your booking has been created and is awaiting confirmation.", "Новая запись": "New booking", "К вам создана новая запись.": "You have a new booking.", "Новая запись в салон": "New salon booking", "В салоне создана новая запись.": "A new booking has been created at your salon.", "Запись подтверждена": "Booking confirmed", "Ваша запись подтверждена.": "Your booking has been confirmed.", "Запись подтверждена.": "The booking has been confirmed.", "Запись завершена": "Booking completed", "Ваша запись завершена. Спасибо за визит.": "Your booking is complete. Thank you for your visit.", "Запись отмечена как завершённая.": "The booking has been marked as completed.", "Запись в салоне завершена.": "The salon booking is complete.", "Запись отменена": "Booking cancelled", "Ваша запись была отменена.": "Your booking has been cancelled.", "Запись к вам была отменена.": "Your booking has been cancelled.", "Запись в салоне была отменена.": "The salon booking has been cancelled.", "Оплата наличными подтверждена": "Cash payment confirmed", "Оплата наличными подтверждена.": "The cash payment has been confirmed.", "Сообщение от администратора": "Message from the administrator", "Новое внутреннее сообщение": "New internal message", "Заявка на вывод создана": "Withdrawal request created", "Выплата создана": "Payout created", "Выплата отправлена в обработку": "Payout submitted for processing", "Выплата завершена": "Payout completed", "Выплата не прошла": "Payout failed"};
const FINANCIAL_ENGLISH = {
"Заявка на вывод создана": (context = {}) => `Your withdrawal request for ${context.amount} ${context.currency} has been created and the amount is locked in your balance.`,
"Выплата создана": (context = {}) => `Your payout of ${context.amount} ${context.currency} has been created.`,
"Выплата отправлена в обработку": (context = {}) => `Your payout of ${context.amount} ${context.currency} has been submitted for processing.`,
"Выплата завершена": (context = {}) => `Your payout of ${context.amount} ${context.currency} is complete.`,
"Выплата не прошла": (context = {}) => `Your payout of ${context.amount} ${context.currency} failed. Check the reason in the finance section.`
};
function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function buildTemplate(title_ru, body_ru, action_type) {
  return {
    title_ru,
    body_ru,
    title_en: ENGLISH[title_ru],
    body_en: typeof body_ru === "function" ? FINANCIAL_ENGLISH[title_ru] : ENGLISH[body_ru],
    action_type,
    priority: "normal",
  };
}

const BOOKING_CREATED_TEMPLATES = {
  client: buildTemplate(
    "Запись создана",
    "Ваша запись создана и ожидает подтверждения.",
    "booking"
  ),
  master: buildTemplate("Новая запись", "К вам создана новая запись.", "booking"),
  salon: buildTemplate(
    "Новая запись в салон",
    "В салоне создана новая запись.",
    "booking"
  ),
};

const BOOKING_CONFIRMED_TEMPLATES = {
  client: buildTemplate("Запись подтверждена", "Ваша запись подтверждена.", "booking"),
  master: buildTemplate("Запись подтверждена", "Запись подтверждена.", "booking"),
  salon: buildTemplate("Запись подтверждена", "Запись подтверждена.", "booking"),
};

const BOOKING_LIFECYCLE_TEMPLATES = {
  completed: {
    client: buildTemplate(
      "Запись завершена",
      "Ваша запись завершена. Спасибо за визит.",
      "booking"
    ),
    master: buildTemplate(
      "Запись завершена",
      "Запись отмечена как завершённая.",
      "booking"
    ),
    salon: buildTemplate("Запись завершена", "Запись в салоне завершена.", "booking"),
  },
  cancelled: {
    client: buildTemplate("Запись отменена", "Ваша запись была отменена.", "booking"),
    master: buildTemplate("Запись отменена", "Запись к вам была отменена.", "booking"),
    salon: buildTemplate("Запись отменена", "Запись в салоне была отменена.", "booking"),
  },
};

const CASH_CONFIRM_TEMPLATE = buildTemplate(
  "Оплата наличными подтверждена",
  "Оплата наличными подтверждена.",
  "payment"
);

const ADMIN_MESSAGE_TEMPLATE = buildTemplate(
  "Сообщение от администратора",
  "Новое внутреннее сообщение",
  "message"
);

const WITHDRAW_REQUEST_LOCKED_TEMPLATE = buildTemplate(
  "Заявка на вывод создана",
  (context = {}) => `Заявка на вывод ${context.amount} ${context.currency} создана и заблокирована в балансе.`,
  "money"
);

const PAYOUT_EXECUTION_TEMPLATES = {
  created: buildTemplate(
    "Выплата создана",
    (context = {}) => `Выплата ${context.amount} ${context.currency} создана.`,
    "money"
  ),
  submitted: buildTemplate(
    "Выплата отправлена в обработку",
    (context = {}) => `Выплата ${context.amount} ${context.currency} отправлена в обработку.`,
    "money"
  ),
  completed: buildTemplate(
    "Выплата завершена",
    (context = {}) => `Выплата ${context.amount} ${context.currency} завершена.`,
    "money"
  ),
  failed: buildTemplate(
    "Выплата не прошла",
    (context = {}) =>
      `Выплата ${context.amount} ${context.currency} не прошла. Проверьте причину в финансовом разделе.`,
    "money"
  ),
};

function resolveTemplate(template, context = {}) {
  if (!template) {
    return null;
  }

  context = { ...context, amount: context.amount ?? "—", currency: context.currency ?? context.currency_code ?? "" };
  const bodyRu =
    typeof template.body_ru === "function" ? template.body_ru(context) : template.body_ru;

  return {
    title_ru: template.title_ru,
    body_ru: bodyRu,
    title_en: template.title_en,
    body_en: typeof template.body_en === "function" ? template.body_en(context) : template.body_en,
    action_type: template.action_type,
    priority: template.priority || "normal",
  };
}

export function normalizeNotificationEventKey(eventKey) {
  const normalized = normalizeText(eventKey)?.toLowerCase() || "";

  if (normalized === "withdraw_locked") {
    return "withdraw_request_locked";
  }

  if (normalized === "client_push_booking_created") {
    return "booking_created";
  }

  return normalized;
}

export function buildBookingCreatedNotificationTemplate(recipientType, context = {}) {
  void context;
  return resolveTemplate(BOOKING_CREATED_TEMPLATES[normalizeText(recipientType)], context);
}

export function buildBookingConfirmedNotificationTemplate(recipientType, context = {}) {
  void context;
  return resolveTemplate(BOOKING_CONFIRMED_TEMPLATES[normalizeText(recipientType)], context);
}

export function buildBookingLifecycleNotificationTemplate(action, recipientType, context = {}) {
  void context;
  const normalizedAction = normalizeText(action)?.toLowerCase() || "";
  const normalizedRecipientType = normalizeText(recipientType);
  const templates =
    normalizedAction === "cancel" || normalizedAction === "cancelled"
      ? BOOKING_LIFECYCLE_TEMPLATES.cancelled
      : normalizedAction === "completed"
        ? BOOKING_LIFECYCLE_TEMPLATES.completed
        : null;

  return resolveTemplate(templates?.[normalizedRecipientType], context);
}

export function buildCashConfirmNotificationTemplate(recipientType, context = {}) {
  void recipientType;
  void context;
  return resolveTemplate(CASH_CONFIRM_TEMPLATE, context);
}

export function buildAdminMessageNotificationTemplate(recipientType, context = {}) {
  void recipientType;
  void context;
  return { ...resolveTemplate(ADMIN_MESSAGE_TEMPLATE, context), notification_template_key: "admin_message" };
}

export function buildWithdrawRequestLockedNotificationTemplate(context = {}) {
  return resolveTemplate(
    {
      title_ru: WITHDRAW_REQUEST_LOCKED_TEMPLATE.title_ru,
      title_en: WITHDRAW_REQUEST_LOCKED_TEMPLATE.title_en,
      body_en: WITHDRAW_REQUEST_LOCKED_TEMPLATE.body_en,
      body_ru: WITHDRAW_REQUEST_LOCKED_TEMPLATE.body_ru,
      action_type: WITHDRAW_REQUEST_LOCKED_TEMPLATE.action_type,
      priority: WITHDRAW_REQUEST_LOCKED_TEMPLATE.priority,
    },
    context
  );
}

export function buildPayoutExecutionNotificationTemplate(eventKey, context = {}) {
  const normalizedKey = normalizeNotificationEventKey(eventKey);
  const payoutKey = normalizedKey === "payout_execution_created" ? "created" : normalizedKey === "payout_execution_submitted" ? "submitted" : normalizedKey === "payout_execution_completed" ? "completed" : normalizedKey === "payout_execution_failed" ? "failed" : null;
  return resolveTemplate(
    payoutKey ? PAYOUT_EXECUTION_TEMPLATES[payoutKey] : null,
    context
  );
}

// Add translations only for exact known system copy; authored messages stay intact.
export function enrichSystemNotification(input = {}) {
  if (input.notification_template_key === "admin_message") {
    const base = resolveTemplate(ADMIN_MESSAGE_TEMPLATE);
    input = { ...input };
    if (input.title_ru !== base.title_ru && input.title_en === base.title_en) input.title_en = null;
    if (input.body_ru !== base.body_ru && input.body_en === base.body_en) input.body_en = null;
  }
  if (input.title_en && input.body_en) return input;
  const payload = input.payload_json && typeof input.payload_json === "object" ? input.payload_json : {};
  const context = { ...payload, currency: payload.currency ?? payload.currency_code ?? "" };
  const type = input.target_type === "salon_admin" ? "salon" : input.target_type;
  const candidates = [buildBookingCreatedNotificationTemplate(type), buildBookingConfirmedNotificationTemplate(type), buildBookingLifecycleNotificationTemplate("completed", type), buildBookingLifecycleNotificationTemplate("cancelled", type), buildCashConfirmNotificationTemplate(type), buildAdminMessageNotificationTemplate(type)].filter(Boolean);
  const event = normalizeNotificationEventKey(payload.event_type);
  if (event === "withdraw_request_locked" || event.startsWith("payout_execution_")) {
    const builder = c => event === "withdraw_request_locked" ? buildWithdrawRequestLockedNotificationTemplate(c) : buildPayoutExecutionNotificationTemplate(event, c);
    const current = builder(context);
    for (const currency of [context.currency, "", "undefined"]) {
      const legacy = builder({ ...context, currency });
      if (current && legacy && input.title_ru === legacy.title_ru && input.body_ru === legacy.body_ru) {
        return { ...input, body_ru: current.body_ru, title_en: input.title_en || current.title_en, body_en: input.body_en || current.body_en };
      }
    }
  }
  const match = candidates.find(template => template.title_ru === input.title_ru && template.body_ru === input.body_ru);
  if (match) return { ...input, title_en: input.title_en || match.title_en, body_en: input.body_en || match.body_en };
  if (event === "withdraw_request_admin_created" && input.title_ru === "Новая заявка на вывод") {
    const owner = payload.owner_slug || (payload.owner_type === "salon" ? "Salon" : "Master") + " #" + (payload.owner_id ?? "—");
    return { ...input, title_en: input.title_en || "New withdrawal request", body_en: input.body_en || `${owner} requested a withdrawal of ${context.amount ?? "—"} ${context.currency}.` };
  }
  return input;
}
