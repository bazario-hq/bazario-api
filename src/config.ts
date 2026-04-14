import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().default('postgres://bazario:change-me@localhost:5432/bazario'),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('bazario'),
  S3_SECRET_KEY: z.string().default('change-me-too'),
  S3_BUCKET: z.string().default('bazario-images'),
  S3_FORCE_PATH_STYLE: bool,

  JWT_ACCESS_SECRET: z.string().default('dev-access-secret'),
  JWT_REFRESH_SECRET: z.string().default('dev-refresh-secret'),
  // Access tokens are short lived (1 hour); the web app refreshes them silently.
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  BCRYPT_ROUNDS: z.coerce.number().default(12),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(1025),
  MAIL_FROM: z.string().default('Bazario <no-reply@bazario.example>'),

  WEB_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().optional(),

  PAYMENT_LATENCY_MS: z.coerce.number().default(250),
  PLATFORM_FEE_PERCENT: z.coerce.number().default(10),
  JOBS_ENABLED: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);

export const isProd = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
