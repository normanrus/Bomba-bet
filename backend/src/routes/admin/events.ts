import { Router } from 'express';
import { z } from 'zod';
import { many, one, withTransaction } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { settleEvent, voidEvent } from '../../services/predictions';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { attachMarkets } from '../events';

const router = Router();

const outcomeSchema = z.object({
  label: z.string().trim().min(1).max(120),
  odds: z.coerce.number().min(1.01).max(1000),
  code: z.string().trim().max(24).optional(),
});

const marketSchema = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(['outcome', 'total', 'handicap', 'custom']).default('outcome'),
  line: z.coerce.number().nullable().optional(),
  sortOrder: z.coerce.number().int().default(0),
  outcomes: z.array(outcomeSchema).min(2, 'Нужно минимум 2 варианта прогноза'),
});

const eventSchema = z.object({
  sport: z.string().trim().min(1).max(32).default('football'),
  league: z.string().trim().max(120).optional(),
  teamHome: z.string().trim().min(1).max(120),
  teamAway: z.string().trim().min(1).max(120),
  startsAt: z.string().min(10),
  markets: z.array(marketSchema).min(1, 'Добавьте хотя бы один рынок'),
});

/** GET /api/admin/events */
router.get(
  '/',
  validate(
    z.object({
      status: z.enum(['all', 'upcoming', 'live', 'finished', 'cancelled']).default('all'),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const { status, limit, offset } = req.query as unknown as {
      status: string;
      limit: number;
      offset: number;
    };
    const params: unknown[] = [];
    let where = '';
    if (status !== 'all') {
      params.push(status);
      where = `WHERE e.status = $${params.length}`;
    }
    params.push(limit, offset);
    const rows = await many(
      `SELECT e.id, e.sport, e.league, e.team_home, e.team_away, e.starts_at, e.status,
              e.home_score, e.away_score, e.settled_at,
              (SELECT count(*) FROM predictions p WHERE p.event_id = e.id) AS prediction_count
         FROM events e ${where}
        ORDER BY e.starts_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const withMarkets = (await attachMarkets(rows as Record<string, unknown>[])) as Record<
      string,
      unknown
    >[];
    const countByEvent = new Map(rows.map((r) => [String(r.id), Number(r.prediction_count)]));
    res.json({
      events: withMarkets.map((e) => ({ ...e, predictionCount: countByEvent.get(String(e.id)) ?? 0 })),
    });
  }),
);

/** POST /api/admin/events — create an event with markets and outcomes. */
router.post(
  '/',
  validate(eventSchema),
  asyncHandler(async (req, res) => {
    const { sport, league, teamHome, teamAway, startsAt, markets } = req.body;
    const starts = new Date(startsAt);
    if (Number.isNaN(starts.getTime())) throw badRequest('Некорректная дата матча');

    const event = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO events (sport, league, team_home, team_away, starts_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [sport, league ?? null, teamHome, teamAway, starts, req.user!.id],
      );
      const ev = ins.rows[0];
      for (const m of markets) {
        const mk = await client.query(
          `INSERT INTO markets (event_id, title, kind, line, sort_order)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [ev.id, m.title, m.kind, m.line ?? null, m.sortOrder ?? 0],
        );
        let i = 0;
        for (const o of m.outcomes) {
          await client.query(
            `INSERT INTO outcomes (market_id, code, label, odds, sort_order) VALUES ($1, $2, $3, $4, $5)`,
            [mk.rows[0].id, o.code ?? null, o.label, o.odds, i++],
          );
        }
      }
      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'admin',
          action: 'admin.event.create',
          targetType: 'event',
          targetId: ev.id,
          details: { teamHome, teamAway, startsAt },
          ip: req.ip ?? null,
        },
        client,
      );
      return ev;
    });

    const full = await one('SELECT * FROM events WHERE id = $1', [event.id]);
    const [mapped] = await attachMarkets([full as Record<string, unknown>]);
    res.status(201).json({ event: mapped });
  }),
);

/** PATCH /api/admin/events/:id */
router.patch(
  '/:id',
  validate(
    z.object({
      sport: z.string().trim().min(1).max(32).optional(),
      league: z.string().trim().max(120).nullable().optional(),
      teamHome: z.string().trim().min(1).max(120).optional(),
      teamAway: z.string().trim().min(1).max(120).optional(),
      startsAt: z.string().min(10).optional(),
      status: z.enum(['upcoming', 'live', 'cancelled']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const existing = await one<{ status: string }>('SELECT status FROM events WHERE id = $1', [
      req.params.id,
    ]);
    if (!existing) throw notFound('Событие не найдено');
    if (existing.status === 'finished') throw conflict('Завершённое событие нельзя редактировать');

    const b = req.body;
    const starts = b.startsAt ? new Date(b.startsAt) : null;
    if (b.startsAt && Number.isNaN(starts!.getTime())) throw badRequest('Некорректная дата матча');

    const updated = await one(
      `UPDATE events SET
         sport      = COALESCE($2, sport),
         league     = CASE WHEN $8::boolean THEN $3 ELSE league END,
         team_home  = COALESCE($4, team_home),
         team_away  = COALESCE($5, team_away),
         starts_at  = COALESCE($6, starts_at),
         status     = COALESCE($7, status),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        b.sport ?? null,
        b.league ?? null,
        b.teamHome ?? null,
        b.teamAway ?? null,
        starts,
        b.status ?? null,
        b.league !== undefined,
      ],
    );
    await audit({
      actorId: req.user!.id,
      actorRole: 'admin',
      action: 'admin.event.update',
      targetType: 'event',
      targetId: req.params.id,
      details: b,
      ip: req.ip ?? null,
    });
    const [mapped] = await attachMarkets([updated as Record<string, unknown>]);
    res.json({ event: mapped });
  }),
);

/** POST /api/admin/events/:id/markets — add a market with outcomes. */
router.post(
  '/:id/markets',
  validate(marketSchema),
  asyncHandler(async (req, res) => {
    const ev = await one('SELECT id FROM events WHERE id = $1', [req.params.id]);
    if (!ev) throw notFound('Событие не найдено');
    const m = req.body;
    const marketId = await withTransaction(async (client) => {
      const mk = await client.query(
        `INSERT INTO markets (event_id, title, kind, line, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.params.id, m.title, m.kind, m.line ?? null, m.sortOrder ?? 0],
      );
      let i = 0;
      for (const o of m.outcomes) {
        await client.query(
          `INSERT INTO outcomes (market_id, code, label, odds, sort_order) VALUES ($1, $2, $3, $4, $5)`,
          [mk.rows[0].id, o.code ?? null, o.label, o.odds, i++],
        );
      }
      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'admin',
          action: 'admin.market.create',
          targetType: 'event',
          targetId: req.params.id,
          details: { title: m.title },
          ip: req.ip ?? null,
        },
        client,
      );
      return mk.rows[0].id as string;
    });
    const full = await one('SELECT * FROM events WHERE id = $1', [req.params.id]);
    const [mapped] = await attachMarkets([full as Record<string, unknown>]);
    res.status(201).json({ event: mapped, marketId });
  }),
);

/** POST /api/admin/events/:id/settle — declare winners, pay out, finish the event. */
router.post(
  '/:id/settle',
  validate(
    z.object({
      homeScore: z.coerce.number().int().min(0).max(1000),
      awayScore: z.coerce.number().int().min(0).max(1000),
      winningOutcomeIds: z.array(z.string().uuid()).default([]),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { homeScore, awayScore, winningOutcomeIds } = req.body;
    const result = await withTransaction((client) =>
      settleEvent(client, {
        eventId: req.params.id,
        homeScore,
        awayScore,
        winningOutcomeIds,
        actorId: req.user!.id,
      }),
    );
    await audit({
      actorId: req.user!.id,
      actorRole: 'admin',
      action: 'admin.event.settle',
      targetType: 'event',
      targetId: req.params.id,
      details: { homeScore, awayScore, winningOutcomeIds, ...result },
      ip: req.ip ?? null,
    });
    res.json({ result });
  }),
);

/** POST /api/admin/events/:id/void — cancel the event and refund all stakes. */
router.post(
  '/:id/void',
  validate(z.object({ reason: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const result = await withTransaction((client) =>
      voidEvent(client, { eventId: req.params.id, actorId: req.user!.id, reason: req.body.reason }),
    );
    await audit({
      actorId: req.user!.id,
      actorRole: 'admin',
      action: 'admin.event.void',
      targetType: 'event',
      targetId: req.params.id,
      details: result,
      ip: req.ip ?? null,
    });
    res.json({ result });
  }),
);

export default router;
