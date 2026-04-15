type SupabaseClient = any;

export const OPERATIONAL_SETTING_KEYS = {
  inventoryCadence: "inventory_cadence_config",
  incidentNotifications: "incident_notification_config",
  smsOtpProvider: "sms_otp_provider_config",
  transactionalEmailProvider: "transactional_email_provider_config",
} as const;

export type NotificationChannel = "sms_otp" | "transactional_email";

export type NotificationProviderName =
  | "stytch"
  | "twilio_verify"
  | "twilio_sms"
  | "resend"
  | "sendgrid";

export interface ProviderMetadata {
  channel: NotificationChannel;
  preferredProvider: NotificationProviderName | null;
  fallbackProvider: NotificationProviderName | null;
  providerLabel: string;
  providerFamily: "identity" | "email";
  configured: boolean;
}

const SMS_PROVIDER_LABELS: Record<Exclude<NotificationProviderName, "resend" | "sendgrid">, string> = {
  stytch: "Stytch",
  twilio_verify: "Twilio Verify",
  twilio_sms: "Twilio SMS",
};

const EMAIL_PROVIDER_LABELS: Record<Extract<NotificationProviderName, "resend" | "sendgrid">, string> = {
  resend: "Resend",
  sendgrid: "SendGrid",
};

function getProviderLabel(
  channel: NotificationChannel,
  provider: NotificationProviderName | null,
) {
  if (!provider) return "Unconfigured";
  if (channel === "sms_otp") {
    return SMS_PROVIDER_LABELS[provider as Exclude<NotificationProviderName, "resend" | "sendgrid">] || provider;
  }
  return EMAIL_PROVIDER_LABELS[provider as Extract<NotificationProviderName, "resend" | "sendgrid">] || provider;
}

function normalizeProviderName(value: unknown): NotificationProviderName | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (
    normalized === "stytch"
    || normalized === "twilio_verify"
    || normalized === "twilio_sms"
    || normalized === "resend"
    || normalized === "sendgrid"
  ) {
    return normalized as NotificationProviderName;
  }

  return null;
}

export function buildProviderMetadata(
  channel: NotificationChannel,
  rawValue: unknown,
): ProviderMetadata {
  const value = (rawValue && typeof rawValue === "object") ? rawValue as Record<string, unknown> : {};
  const preferredProvider = normalizeProviderName(
    value.preferredProvider ?? value.preferred ?? value.provider ?? value.name,
  );
  const fallbackProvider = normalizeProviderName(
    value.fallbackProvider ?? value.fallback ?? value.backupProvider,
  );

  return {
    channel,
    preferredProvider,
    fallbackProvider,
    providerLabel: getProviderLabel(channel, preferredProvider),
    providerFamily: channel === "sms_otp" ? "identity" : "email",
    configured: !!preferredProvider,
  };
}

export async function getLiteSettingValue(
  supabase: SupabaseClient,
  locationId: string,
  settingKey: string,
  defaultValue: unknown = null,
) {
  const { data, error } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", settingKey)
    .maybeSingle();

  if (error) throw error;

  return data?.setting_value ?? defaultValue;
}

export async function getOperationalSettingsBundle(
  supabase: SupabaseClient,
  locationId: string,
) {
  const [
    inventoryCadenceConfig,
    incidentNotificationConfig,
    smsOtpProviderConfig,
    transactionalEmailProviderConfig,
  ] = await Promise.all([
    getLiteSettingValue(supabase, locationId, OPERATIONAL_SETTING_KEYS.inventoryCadence, {
      enabled: false,
      cadence: "weekly",
      day_of_week: null,
      time_of_day: null,
    }),
    getLiteSettingValue(supabase, locationId, OPERATIONAL_SETTING_KEYS.incidentNotifications, {
      recipient_user_ids: [],
      recipient_roles: [],
      include_inactive: false,
    }),
    getLiteSettingValue(supabase, locationId, OPERATIONAL_SETTING_KEYS.smsOtpProvider, {
      preferred: "twilio_verify",
      fallback: "twilio_sms",
    }),
    getLiteSettingValue(supabase, locationId, OPERATIONAL_SETTING_KEYS.transactionalEmailProvider, {
      preferred: "resend",
    }),
  ]);

  return {
    inventoryCadenceConfig,
    incidentNotificationConfig,
    smsOtpProvider: buildProviderMetadata("sms_otp", smsOtpProviderConfig),
    transactionalEmailProvider: buildProviderMetadata("transactional_email", transactionalEmailProviderConfig),
  };
}
