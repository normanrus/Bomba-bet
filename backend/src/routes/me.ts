import { Router } from 'express';
import { z } from 'zod';
import { many, one, withTransaction } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';
import { tryDailyBonus } from '../services/bonuses';
import { getSettings } from '../services/settings';
import { getUserStats, mapUser } from '../services/users';
import { notFound } from '../utils/errors';

const router = Router();
router.use(requireAuth);

/** GET /api/me — full profile with stats. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const row = await one(
      `SELECT id, username, avatar_seed, avatar_url, balance, withdrawable_balance, role, status,
              telegram_username, created_at, must_change_password
         FROM users WHERE id = $1`,
      [req.user!.id],
    );
    if (!row) throw notFound('Пользователь не найден');
    const stats = await getUserStats(req.user!.id);
    res.json({
      user: { ...mapUser(row), stats },
      mustChangePassword: Boolean((row as { must_change_password: boolean }).must_change_password),
    });
  }),
);

/** GET /api/me/ledger — the caller's balance history. */
router.get(
  '/ledger',
  validate(
    z.object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };
    const rows = await many(
      `SELECT id, delta, balance_after, reason, note, ref_type, ref_id, created_at
         FROM ledger WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [req.user!.id, limit, offset],
    );
    res.json({
      entries: rows.map((r) => ({
        id: Number(r.id),
        delta: Number(r.delta),
        balanceAfter: Number(r.balance_after),
        reason: r.reason,
        note: r.note,
        refType: r.ref_type,
        refId: r.ref_id,
        createdAt: r.created_at,
      })),
    });
  }),
);

const profileSchema = z.object({
  telegramUsername: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ''))
    .refine((v) => v === '' || /^[A-Za-z0-9_]{5,32}$/.test(v), 'Некорректный Telegram username'),
  avatarSeed: z.string().trim().min(1).max(64).optional(),
});

/** PATCH /api/me — update Telegram username / avatar. */
router.patch(
  '/',
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const { telegramUsername, avatarSeed } = req.body;
    const row = await one(
      `UPDATE users SET telegram_username = $2,
              avatar_seed = COALESCE($3, avatar_seed), updated_at = now()
        WHERE id = $1
        RETURNING id, username, avatar_seed, avatar_url, balance, withdrawable_balance, role, status, telegram_username, created_at`,
      [req.user!.id, telegramUsername || null, avatarSeed ?? null],
    );
    res.json({ user: mapUser(row as Record<string, unknown>) });
  }),
);

/** POST /api/me/daily-bonus — transparent random bonus, at most once per 24h. */
router.post(
  '/daily-bonus',
  asyncHandler(async (req, res) => {
    const result = await withTransaction((client) => tryDailyBonus(client, req.user!.id));
    const settings = await getSettings();
    const user = await one<{ balance: string }>('SELECT balance FROM users WHERE id = $1', [
      req.user!.id,
    ]);
    res.json({
      ...result,
      balance: Number(user?.balance ?? 0),
      rules: {
        enabled: settings['bonuses.enabled'],
        chance: settings['bonuses.dailyChance'],
        min: settings['bonuses.dailyMin'],
        max: settings['bonuses.dailyMax'],
        text: settings['bonuses.rulesText'],
      },
    });
  }),
);

/** GET /api/me/bonuses — history of granted bonuses. */
router.get(
  '/bonuses',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT id, amount, kind, details, created_at FROM bonus_grants
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user!.id],
    );
    res.json({
      bonuses: rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        kind: r.kind,
        details: r.details,
        createdAt: r.created_at,
      })),
    });
  }),
);

export default router;
