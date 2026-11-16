import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Маршрут не найден' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Некорректные данные',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  const e = err as Error & { code?: string };
  // Postgres unique violation
  if (e?.code === '23505') {
    return res.status(409).json({ error: { code: 'conflict', message: 'Запись уже существует' } });
  }
  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  return res.status(500).json({
    error: { code: 'internal_error', message: 'Внутренняя ошибка сервера' },
  });
}

/** Wraps async handlers so rejections reach the error middleware. */
export const asyncHandler =
  <T extends Request = Request>(
    fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
  ) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req as T, res, next)).catch(next);
