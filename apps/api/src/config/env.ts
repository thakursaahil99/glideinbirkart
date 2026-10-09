import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const boolString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS is required (comma separated)'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  WORKERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  COOKIE_SECURE: boolString,
  COOKIE_DOMAIN: optionalString,

  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,
  ORDER_PAYMENT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(240).default(15),

  CLOUDINARY_CLOUD_NAME: optionalString,
  CLOUDINARY_API_KEY: optionalString,
  CLOUDINARY_API_SECRET: optionalString,

  MAIL_FROM: z.string().default('Glideinbir Kart <no-reply@glideinbirkart.in>'),
  RESEND_API_KEY: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(587)),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,

  SENTRY_DSN: optionalString,
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule — throws a readable error listing every bad variable so the app fails fast. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true in production');
    if (env.JWT_ACCESS_SECRET.startsWith('dev-') || env.JWT_ACCESS_SECRET.startsWith('change-me'))
      problems.push('JWT_ACCESS_SECRET must be a real secret in production');
    if (env.SESSION_SECRET.startsWith('dev-') || env.SESSION_SECRET.startsWith('change-me'))
      problems.push('SESSION_SECRET must be a real secret in production');
    if (problems.length)
      throw new Error(`Unsafe production configuration:\n  - ${problems.join('\n  - ')}`);
  }
  return env;
}
