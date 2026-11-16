import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (config.isProd ? 'info' : 'debug'),
  base: { app: 'bombabet-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'password_hash',
      '*.password_hash',
    ],
    censor: '[redacted]',
  },
});
