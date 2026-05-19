function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function buildTemplate(title_ru, body_ru, action_type) {
  return {
    title_ru,
    body_ru,
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
    (context = {}) => `Выплата ${context.amount} KGS создана.`,
    "money"
  ),
  submitted: buildTemplate(
    "Выплата отправлена в обработку",
    (context = {}) => `Выплата ${context.amount} KGS отправлена в обработку.`,
    "money"
  ),
  completed: buildTemplate(
    "Выплата завершена",
    (context = {}) => `Выплата ${context.amount} KGS завершена.`,
    "money"
  ),
  failed: buildTemplate(
    "Выплата не прошла",
    (context = {}) =>
      `Выплата ${context.amount} KGS не прошла. Проверьте причину в финансовом разделе.`,
    "money"
  ),
};

function resolveTemplate(template, context = {}) {
  if (!template) {
    return null;
  }

  const bodyRu =
    typeof template.body_ru === "function" ? template.body_ru(context) : template.body_ru;

  return {
    title_ru: template.title_ru,
    body_ru: bodyRu,
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
  return resolveTemplate(ADMIN_MESSAGE_TEMPLATE, context);
}

export function buildWithdrawRequestLockedNotificationTemplate(context = {}) {
  return resolveTemplate(
    {
      title_ru: WITHDRAW_REQUEST_LOCKED_TEMPLATE.title_ru,
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
