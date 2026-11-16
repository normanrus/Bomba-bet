import { createApp } from './app';
import { config } from './config';
import { pool } from './db';
import { runMigrations } from './db/migrate';
import { seedAdmin } from './db/seed';
import { ensureDefaultSettings } from './services/settings';
import { logger } from './utils/logger';

const READY_ATTEMPTS = Number(process.env.DB_READY_ATTEMPTS ?? 30);
const READY_DELAY_MS = Number(process.env.DB_READY_DELAY_MS ?? 2000);

/**
 * Managed databases (Render, Railway, Fly) can take a few seconds to accept
 * connections right after a deploy. Retrying here keeps the web service from
 * crash-looping while the database comes up.
 *
 * Migrations, default settings and the bootstrap admin are all idempotent, so
 * it is safe to run them on every boot and to repeat them on retry.
 */
async function prepareDatabase(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await runMigrations();
      await ensureDefaultSettings();
      await seedAdmin();
      return;
    } catch (err) {
      if (attempt >= READY_ATTEMPTS) throw err;
      logger.warn(
        { err, attempt, attempts: READY_ATTEMPTS },
        'database not ready, retrying in a moment',
      );
      await new Promise((resolve) => setTimeout(resolve, READY_DELAY_MS));
    }
  }
}

async function main() {
  await prepareDatabase();

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info(
      { port: config.port, host: config.host, env: config.env },
      `БОМБА БЕТ API слушает http://${config.host}:${config.port}`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await pool.end().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start server');
  process.exit(1);
});
