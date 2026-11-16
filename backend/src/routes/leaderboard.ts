import { Router } from 'express';
import { z } from 'zod';
import { many } from '../db';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';

const router = Router();

const q = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(['balance', 'wins', 'winrate']).default('balance'),
});

/** GET /api/leaderboard — public ranking. */
router.get(
  '/',
  validate(q, 'query'),
  asyncHandler(async (req, res) => {
    const { limit, sort } = req.query as unknown as z.infer<typeof q>;
    const orderBy =
      sort === 'wins'
        ? 'wins DESC, u.balance DESC'
        : sort === 'winrate'
          ? 'win_rate DESC, wins DESC, u.balance DESC'
          : 'u.balance DESC';

    const rows = await many(
      `SELECT u.id, u.username, u.avatar_seed, u.avatar_url, u.balance,
              count(p.id) FILTER (WHERE p.status = 'won')  AS wins,
              count(p.id) FILTER (WHERE p.status = 'lost') AS losses,
              CASE WHEN count(p.id) FILTER (WHERE p.status IN ('won','lost')) > 0
                   THEN round(100.0 * count(p.id) FILTER (WHERE p.status = 'won')
                        / count(p.id) FILTER (WHERE p.status IN ('won','lost')), 1)
                   ELSE 0 END AS win_rate
         FROM users u
         LEFT JOIN predictions p ON p.user_id = u.id
        WHERE u.status = 'active'
        GROUP BY u.id
        ORDER BY ${orderBy}
        LIMIT $1`,
      [limit],
    );

    res.json({
      leaderboard: rows.map((r, i) => ({
        rank: i + 1,
        id: r.id,
        username: r.username,
        avatarSeed: r.avatar_seed,
        avatarUrl: r.avatar_url,
        balance: Number(r.balance),
        wins: Number(r.wins),
        losses: Number(r.losses),
        winRate: Number(r.win_rate),
      })),
    });
  }),
);

export default router;
