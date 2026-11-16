import { config } from '../config';
import { pool, query } from '../db';
import { runMigrations } from '../db/migrate';
import { ensureDefaultSettings } from '../services/settings';
import { generateStrongPassword, hashPassword } from '../utils/crypto';
import { logger } from '../utils/logger';

/**
 * Idempotently creates the bootstrap administrator.
 *
 * Security notes:
 *  - The password comes from ADMIN_PASSWORD, or is generated randomly when unset.
 *  - A generated password is printed ONCE to stdout; it is never stored in plain text.
 *  - The account is flagged `must_change_password`, so the first login forces a reset.
 *  - Re-running the seed never overwrites an existing admin's password.
 */
async function seedAdmin(): Promise<void> {
  const username = config.adminUsername;
  const existing = await query<{ id: string }>(
    'SELECT id FROM users WHERE username_lower = $1 AND role = $2',
    [username.toLowerCase(), 'admin'],
  );

  if (existing.rowCount) {
    logger.info({ username }, 'admin already exists — leaving credentials untouched');
    return;
  }

  let password = config.adminPassword;
  let generated = false;
  if (!password) {
    password = generateStrongPassword();
    generated = true;
  } else if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  }

  const hash = await hashPassword(password);
  await query(
    `INSERT INTO users (username, username_lower, password_hash, role, status, avatar_seed, must_change_password)
     VALUES ($1, $2, $3, 'admin', 'active', 'adm', true)`,
    [username, username.toLowerCase(), hash],
  );

  if (generated) {
    // Intentionally printed once to the operator's console.
    process.stdout.write(
      `\n================================================================\n` +
        `  BOMBA BET :: начальный администратор создан\n` +
        `  Логин:  ${username}\n` +
        `  Пароль: ${password}\n` +
        `  Смените пароль при первом входе — он показан только один раз.\n` +
        `================================================================\n\n`,
    );
  } else {
    logger.info({ username }, 'admin created from ADMIN_PASSWORD');
  }
}

async function main() {
  await runMigrations();
  await ensureDefaultSettings();
  await seedAdmin();

  if (process.argv.includes('--demo')) {
    const { seedDemoData } = await import('./demo');
    await seedDemoData();
  }
}

main()
  .then(() => pool.end())
  .then(() => {
    logger.info('seed complete');
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exit(1);
  });
