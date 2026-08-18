/**
 * Environment access.
 *
 * R8 — env values are BOOTSTRAP DEFAULTS ONLY. Business numbers live in the
 * `app_settings` table and are editable from the admin panel at runtime. Read
 * them through `src/lib/settings.ts`, not from here.
 *
 * This module is safe to import on the server only.
 */

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

function csv(key: string, fallback: string[]): string[] {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function bigints(key: string, fallback: bigint[]): bigint[] {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  try {
    return v
      .split(',')
      .map((s) => BigInt(s.trim()))
      .filter((n) => n > 0n);
  } catch {
    return fallback;
  }
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  isProduction: process.env.NODE_ENV === 'production',
  appUrl: str('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
  appName: str('NEXT_PUBLIC_APP_NAME', 'Get Fresh'),

  databaseUrl: str('DATABASE_URL', ''),

  auth: {
    jwtSecret: str('JWT_SECRET', 'dev-only-access-secret-change-me'),
    jwtRefreshSecret: str('JWT_REFRESH_SECRET', 'dev-only-refresh-secret-change-me'),
    accessTokenTtl: str('ACCESS_TOKEN_TTL', '15m'),
    refreshTokenTtl: str('REFRESH_TOKEN_TTL', '30d'),
    otpTtlSeconds: num('OTP_TTL_SECONDS', 300),
    otpMaxAttempts: num('OTP_MAX_ATTEMPTS', 5),
  },

  providers: {
    ai: str('AI_PROVIDER', 'mock'),
    sms: str('SMS_PROVIDER', 'mock'),
    storage: str('STORAGE_PROVIDER', 'local'),
    payment: str('PAYMENT_PROVIDER', 'mock'),
    push: str('PUSH_PROVIDER', 'mock'),
    queue: str('QUEUE_PROVIDER', 'mock'),
  },

  ai: {
    geminiApiKey: str('GEMINI_API_KEY', ''),
    geminiModel: str('GEMINI_MODEL', 'gemini-2.5-flash'),
    anthropicApiKey: str('ANTHROPIC_API_KEY', ''),
    anthropicModel: str('ANTHROPIC_MODEL', 'claude-sonnet-5'),
    groqApiKey: str('GROQ_API_KEY', ''),
    groqModel: str('GROQ_MODEL', 'llama-3.3-70b-versatile'),
    /** Tried when AI_PROVIDER fails a call. Empty = no fallback (default). */
    fallbackProvider: str('AI_FALLBACK_PROVIDER', ''),
    sttProvider: str('AI_STT_PROVIDER', 'gemini'),
    maxRetries: num('AI_MAX_RETRIES', 1),
    /** R3 — free AI tiers may train on prompt data. Default OFF. */
    allowRealHealthData: bool('AI_ALLOW_REAL_HEALTH_DATA', false),
  },

  sms: {
    msg91AuthKey: str('MSG91_AUTH_KEY', ''),
    msg91SenderId: str('MSG91_SENDER_ID', ''),
    msg91OtpTemplateId: str('MSG91_OTP_TEMPLATE_ID', ''),
    devFixedOtp: str('DEV_FIXED_OTP', '123456'),
  },

  storage: {
    cloudinaryCloudName: str('CLOUDINARY_CLOUD_NAME', ''),
    cloudinaryApiKey: str('CLOUDINARY_API_KEY', ''),
    cloudinaryApiSecret: str('CLOUDINARY_API_SECRET', ''),
    r2AccountId: str('R2_ACCOUNT_ID', ''),
    r2AccessKeyId: str('R2_ACCESS_KEY_ID', ''),
    r2SecretAccessKey: str('R2_SECRET_ACCESS_KEY', ''),
    r2Bucket: str('R2_BUCKET', ''),
    localUploadDir: str('LOCAL_UPLOAD_DIR', 'public/uploads'),
  },

  payment: {
    razorpayKeyId: str('RAZORPAY_KEY_ID', ''),
    razorpayKeySecret: str('RAZORPAY_KEY_SECRET', ''),
    razorpayWebhookSecret: str('RAZORPAY_WEBHOOK_SECRET', ''),
    currency: str('PAYMENT_CURRENCY', 'INR'),
    assumeFeePercent: num('PAYMENT_ASSUME_FEE_PERCENT', 2.4),
    refundDestination: str('REFUND_DESTINATION', 'wallet'),
    pendingReconcileMinutes: num('PAYMENT_PENDING_RECONCILE_MINUTES', 15),
    minTopupPaise: BigInt(num('MIN_WALLET_TOPUP_PAISE', 10000)),
    topupPresetsPaise: bigints('WALLET_TOPUP_PRESETS_PAISE', [20000n, 50000n, 100000n, 200000n]),
  },

  push: {
    fcmProjectId: str('FCM_PROJECT_ID', ''),
    fcmClientEmail: str('FCM_CLIENT_EMAIL', ''),
    fcmPrivateKey: str('FCM_PRIVATE_KEY', ''),
    primaryChannel: str('NOTIFY_PRIMARY_CHANNEL', 'whatsapp'),
    tomorrowPreviewHour: num('NOTIFY_TOMORROW_PREVIEW_HOUR', 20),
  },

  cron: {
    secret: str('CRON_SECRET', 'dev-cron-secret'),
    timezone: str('CRON_TIMEZONE', 'Asia/Kolkata'),
  },

  /** Bootstrap defaults for app_settings. See src/lib/settings.ts. */
  defaults: {
    minOrderValuePaise: num('MIN_ORDER_VALUE_PAISE', 14900),
    deliveryFeePaise: num('DEFAULT_DELIVERY_FEE_PAISE', 2500),
    freeDeliveryThresholdPaise: num('FREE_DELIVERY_THRESHOLD_PAISE', 29900),
    handlingFeePaise: num('HANDLING_FEE_PAISE', 0),
    planFeePaise: num('PLAN_FEE_PAISE', 9900),
    lowWalletThresholdPaise: num('LOW_WALLET_THRESHOLD_PAISE', 20000),
    codMaxOrderPaise: num('COD_MAX_ORDER_PAISE', 150000),
    complaintAutoCreditMaxPaise: num('COMPLAINT_AUTO_CREDIT_MAX_PAISE', 10000),
    complaintAutoCreditMonthlyLimit: num('COMPLAINT_AUTO_CREDIT_MONTHLY_LIMIT', 2),

    mealPlanTrialDays: num('MEAL_PLAN_TRIAL_DAYS', 7),
    mealPlanDefaultDurationDays: num('MEAL_PLAN_DEFAULT_DURATION_DAYS', 30),
    mealPlanDurationOptions: csv('MEAL_PLAN_DURATION_OPTIONS', ['7', '15', '30']).map(Number),
    mealPlanRefreshPromptWeeks: num('MEAL_PLAN_REFRESH_PROMPT_WEEKS', 4),
    servingGramsPerAdult: num('DEFAULT_SERVING_GRAMS_PER_ADULT', 200),
    childServingMultiplier: num('CHILD_SERVING_MULTIPLIER', 0.5),
    quantityRoundingGrams: num('QUANTITY_ROUNDING_GRAMS', 250),
    quantityMinGrams: num('QUANTITY_MIN_GRAMS', 250),
    quantityMaxGrams: num('QUANTITY_MAX_GRAMS', 2000),
    maxSwapsPerPlanPerWeek: num('MAX_SWAPS_PER_PLAN_PER_WEEK', 10),
    walletPrepayBufferPercent: num('WALLET_PREPAY_BUFFER_PERCENT', 15),

    subscriptionSlot: str('SUBSCRIPTION_SLOT', '06:30-09:00'),
    serviceRadiusMeters: num('SERVICE_RADIUS_METERS', 8000),
    skipCutoffHour: num('SKIP_CUTOFF_HOUR', 20),
  },

  locale: {
    default: str('DEFAULT_LOCALE', 'mr'),
    supported: csv('SUPPORTED_LOCALES', ['mr', 'hi', 'en']),
  },

  features: {
    cod: bool('FEATURE_COD', true),
    adminSwapApproval: bool('FEATURE_ADMIN_SWAP_APPROVAL', false),
    autoSubstitute: bool('FEATURE_AUTO_SUBSTITUTE', true),
    smartList: bool('FEATURE_SMART_LIST', true),
    voiceList: bool('FEATURE_VOICE_LIST', true),
    photoList: bool('FEATURE_PHOTO_LIST', true),
  },

  sentryDsn: str('SENTRY_DSN', ''),
} as const;

/**
 * P2 — startup assertion. A production deployment must never run on Razorpay
 * test keys: it would silently take no money at all.
 */
export function assertProductionSafety(): void {
  if (!env.isProduction) return;

  const problems: string[] = [];

  if (env.providers.payment === 'razorpay' && env.payment.razorpayKeyId.startsWith('rzp_test_')) {
    problems.push('RAZORPAY_KEY_ID is a test key (rzp_test_) but NODE_ENV=production.');
  }
  if (env.auth.jwtSecret.startsWith('dev-only-')) {
    problems.push('JWT_SECRET is unset in production.');
  }
  if (env.auth.jwtRefreshSecret.startsWith('dev-only-')) {
    problems.push('JWT_REFRESH_SECRET is unset in production.');
  }
  if (env.cron.secret === 'dev-cron-secret') {
    problems.push('CRON_SECRET is unset in production.');
  }
  if (!env.databaseUrl) {
    problems.push('DATABASE_URL is unset.');
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to boot in production:\n - ${problems.join('\n - ')}`);
  }
}
