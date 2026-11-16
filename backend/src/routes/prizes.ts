import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { many, one, withTransaction } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';
import { createPrizeRequest, prizeFundUsage, processPrizeRequest } from '../services/prizes';
import { getSettings } from '../services/settings';
import { notFound } from '../utils/errors';

const router = Router();

/** GET /api/prizes/rules — public prize rules and remaining fund. */
router.get(
  '/rules',
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    const usage = await prizeFundUsage();
    res.json({
      enabled: s['prizes.enabled'],
      minRequest: s['prizes.minRequest'],
      maxFund: s['prizes.maxFund'],
      used: usage.used,
      remaining: Math.max(0, s['prizes.maxFund'] - usage.used),
      rulesText: s['prizes.rulesText'],
      note: 'Призы выдаются вручную в Telegram Stars после одобрения администратором.',
    });
  }),
);

// Everything below requires an authenticated user.
router.use(requireAuth);

// Per-user throttle: a shared IP (home wifi) must not throttle everyone together.
const prizeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: { error: { code: 'rate_limited', message: 'Слишком много заявок на призы' } },
});

/** POST /api/prizes — request a prize payout. */
router.post(
  '/',
  prizeLimiter,
  validate(
    z.object({
      amount: z.coerce.number().int().positive('Сумма должна быть положительной'),
      telegramUsername: z.string().trim().min(1, 'Укажите Telegram @username'),
      userNote: z.string().trim().max(500).optional(),
      idempotencyKey: z.string().min(8).max(64).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { amount, telegramUsername, userNote, idempotencyKey } = req.body;

    if (idempotencyKey) {
      const nonce = await one(
        `INSERT INTO request_nonces (scope, user_id, key) VALUES ('prize', $1, $2)
         ON CONFLICT DO NOTHING RETURNING key`,
        [req.user!.id, idempotencyKey],
      );
      if (!nonce) {
        // Duplicate request: return the existing open prize for this user.
        const existing = await one(
          `SELECT * FROM prize_requests WHERE user_id = $1
            ORDER BY requested_at DESC LIMIT 1`,
          [req.user!.id],
        );
        if (existing) return res.json({ prize: mapPrize(existing), idempotentReplay: true });
      }
    }

    const prize = await withTransaction((client) =>
      createPrizeRequest(client, { userId: req.user!.id, amount, telegramUsername, userNote }),
    );
    const balance = await one<{ balance: string }>('SELECT balance FROM users WHERE id = $1', [
      req.user!.id,
    ]);
    res.status(201).json({ prize: mapPrize(prize), balance: Number(balance?.balance ?? 0) });
  }),
);

/** GET /api/prizes/my — the caller's prize requests. */
router.get(
  '/my',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT * FROM prize_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 50`,
      [req.user!.id],
    );
    res.json({ prizes: rows.map(mapPrize) });
  }),
);

/** POST /api/prizes/:id/cancel — cancel an own pending request (refunds points). */
router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const existing = await one<{ user_id: string }>('SELECT user_id FROM prize_requests WHERE id = $1', [
      req.params.id,
    ]);
    if (!existing) throw notFound('Заявка не найдена');
    const prize = await withTransaction((client) =>
      processPrizeRequest(client, {
        prizeId: req.params.id,
        action: 'cancel',
        adminId: req.user!.id,
      }),
    );
    res.json({ prize: mapPrize(prize) });
  }),
);

export function mapPrize(r: Record<string, unknown>) {
  return {
    id: r.id,
    userId: r.user_id,
    amount: Number(r.amount),
    telegramUsername: r.telegram_username,
    status: r.status,
    userNote: r.user_note,
    adminNote: r.admin_note,
    rejectReason: r.reject_reason,
    requestedAt: r.requested_at,
    processedAt: r.processed_at,
    username: r.username ?? undefined,
  };
}

export default router;
