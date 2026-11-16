import 'dotenv/config';

const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

/**
 * In production a missing value must fail loudly at boot rather than silently
 * fall back to a localhost database or a known development secret.
 */
function requiredInProd(name: string, devFallback: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;
  if (isProd) {
    throw new Error(`${name} must be set in production (NODE_ENV=production)`);
  }
  return devFallback;
}

export const config = {
  isProd,
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  // Bind to all interfaces by default so container/PaaS hosts (Render, Docker)
  // can reach the server. Override with HOST if you need a narrower bind.
  host: process.env.HOST ?? '0.0.0.0',
  corsOrigins: (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl: requiredInProd(
    'DATABASE_URL',
    'postgres://bombabet:bombabet_dev_pass@localhost:5432/bombabet',
  ),
  jwtSecret: requiredInProd('JWT_SECRET', 'dev_only_change_me_please_32_chars_min'),
  accessTtlSec: Number(process.env.JWT_ACCESS_TTL ?? 900),
  refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
  signupBonus: Number(process.env.SIGNUP_BONUS ?? 500),
  adminUsername: process.env.ADMIN_USERNAME ?? 'owner',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
} as const;

if (config.isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
