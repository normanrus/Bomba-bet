import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

export const config = {
  isProd,
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl: req('DATABASE_URL', 'postgres://bombabet:bombabet_dev_pass@localhost:5432/bombabet'),
  jwtSecret: req('JWT_SECRET', 'dev_only_change_me_please_32_chars_min'),
  accessTtlSec: Number(process.env.JWT_ACCESS_TTL ?? 900),
  refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
  signupBonus: Number(process.env.SIGNUP_BONUS ?? 500),
  adminUsername: process.env.ADMIN_USERNAME ?? 'owner',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
} as const;

if (config.isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
