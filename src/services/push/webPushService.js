export function getWebPushPublicConfig() {
  const vapidPublicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const vapidPrivateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const vapidSubject = String(process.env.VAPID_SUBJECT || "").trim();

  const pushEnabled = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);

  return {
    ok: true,
    push_enabled: pushEnabled,
    vapid_public_key: pushEnabled ? vapidPublicKey : null
  };
}

export default {
  getWebPushPublicConfig
};
