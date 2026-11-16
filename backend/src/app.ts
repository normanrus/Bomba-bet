import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/error';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import configRoutes from './routes/config';
import eventRoutes from './routes/events';
import leaderboardRoutes from './routes/leaderboard';
import meRoutes from './routes/me';
import predictionRoutes from './routes/predictions';
import prizeRoutes from './routes/prizes';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The admin SPA is served separately; keep CSP permissive for the JSON API.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '128kb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  // Global rate limit as a blunt DoS guard; route-specific limiters add stricter caps.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'rate_limited', message: 'Слишком много запросов' } },
    }),
  );

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  app.use('/api/config', configRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/predictions', predictionRoutes);
  app.use('/api/prizes', prizeRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
