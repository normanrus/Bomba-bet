import { createApp } from './app';
import { config } from './config';
import { pool } from './db';
import { runMigrations } from './db/migrate';
import { ensureDefaultSettings } from './services/settings';
import { logger } from './utils/logger';

async function main() {
  await runMigrations();
  await ensureDefaultSettings();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.env },
      `БОМБА БЕТ API слушает http://0.0.0.0:${config.port}`,
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
