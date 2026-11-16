import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { many, one, withTransaction } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';
import { placePrediction, mapPrediction, PREDICTION_SELECT } from '../services/predictions';
import { getUserStats } from '../services/users';

const router = Router();
router.use(requireAuth);

// Per-user throttle: a shared IP (home wifi) must not throttle everyone together.
const betLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: { error: { code: 'rate_limited', message: 'Слишком много прогнозов подряд' } },
});

const placeSchema = z.object({
  eventId: z.string().uuid('Некорректный eventId'),
  marketId: z.string().uuid('Некорректный marketId'),
  outcomeId: z.string().uuid('Некорректный outcomeId'),
  stake: z.coerce.number().int().positive('Ставка должна быть положительной'),
  idempotencyKey: z.string().min(8).max(64).optional(),
});

/** POST /api/predictions — place a free prediction (virtual points only). */
router.post(
  '/',
  betLimiter,
  validate(placeSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof placeSchema>;
    const result = await withTransaction((client) =>
      placePrediction(client, { userId: req.user!.id, ...body }),
    );
    const balance = await one<{ balance: string }>('SELECT balance FROM users WHERE id = $1', [
      req.user!.id,
    ]);
    res.status(result.idempotentReplay ? 200 : 201).json({
      prediction: result.prediction,
      balance: Number(balance?.balance ?? 0),
      idempotentReplay: result.idempotentReplay,
    });
  }),
);

const listQuery = z.object({
  status: z.enum(['pending', 'won', 'lost', 'void', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

/** GET /api/predictions/my — the caller's prediction history. */
router.get(
  '/my',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { status, limit, offset } = req.query as unknown as z.infer<typeof listQuery>;
    const params: unknown[] = [req.user!.id];
    let statusClause = '';
    if (status !== 'all') {
      params.push(status);
      statusClause = ` AND p.status = $${params.length}`;
    }
    params.push(limit, offset);
    const rows = await many(
      `${PREDICTION_SELECT}
        WHERE p.user_id = $1 ${statusClause}
        ORDER BY p.placed_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const stats = await getUserStats(req.user!.id);
    res.json({ predictions: rows.map(mapPrediction), stats });
  }),
);

/** GET /api/predictions/my/stats */
router.get(
  '/my/stats',
  asyncHandler(async (req, res) => {
    res.json({ stats: await getUserStats(req.user!.id) });
  }),
);

export default router;
