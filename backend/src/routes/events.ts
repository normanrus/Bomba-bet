import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../db';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';
import { notFound } from '../utils/errors';

const router = Router();

const listQuery = z.object({
  status: z.enum(['upcoming', 'live', 'finished', 'cancelled', 'all']).default('upcoming'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sport: z.string().max(32).optional(),
});

/** GET /api/events — public list with nested markets/outcomes. */
router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { status, limit, offset, sport } = req.query as unknown as z.infer<typeof listQuery>;

    const where: string[] = [];
    const params: unknown[] = [];
    if (status !== 'all') {
      params.push(status);
      where.push(`e.status = $${params.length}`);
    }
    if (sport) {
      params.push(sport);
      where.push(`e.sport = $${params.length}`);
    }
    params.push(limit, offset);

    const events = await many(
      `SELECT e.id, e.sport, e.league, e.team_home, e.team_away, e.starts_at, e.status,
              e.home_score, e.away_score, e.settled_at
         FROM events e
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY e.starts_at ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const withMarkets = await attachMarkets(events as Record<string, unknown>[]);
    res.json({ events: withMarkets });
  }),
);

/** GET /api/events/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const event = await one<Record<string, unknown>>(
      `SELECT id, sport, league, team_home, team_away, starts_at, status,
              home_score, away_score, settled_at
         FROM events WHERE id = $1`,
      [req.params.id],
    );
    if (!event) throw notFound('Событие не найдено');
    const [withMarkets] = await attachMarkets([event]);
    res.json({ event: withMarkets });
  }),
);

/** Attaches markets and outcomes to a list of events in two extra queries. */
export async function attachMarkets(events: Record<string, unknown>[]) {
  if (events.length === 0) return events;
  const ids = events.map((e) => String(e.id));

  const markets = await many<Record<string, unknown>>(
    `SELECT id, event_id, title, kind, line, is_active, sort_order
       FROM markets WHERE event_id = ANY($1::uuid[])
      ORDER BY sort_order ASC, created_at ASC`,
    [ids],
  );
  const marketIds = markets.map((m) => String(m.id));
  const outcomes = marketIds.length
    ? await many<Record<string, unknown>>(
        `SELECT id, market_id, code, label, odds, is_winner, is_active, sort_order
           FROM outcomes WHERE market_id = ANY($1::uuid[])
          ORDER BY sort_order ASC`,
        [marketIds],
      )
    : [];

  const outcomesByMarket = new Map<string, Record<string, unknown>[]>();
  for (const o of outcomes) {
    const key = String(o.market_id);
    if (!outcomesByMarket.has(key)) outcomesByMarket.set(key, []);
    outcomesByMarket.get(key)!.push(mapOutcome(o));
  }
  const marketsByEvent = new Map<string, unknown[]>();
  for (const m of markets) {
    const key = String(m.event_id);
    if (!marketsByEvent.has(key)) marketsByEvent.set(key, []);
    marketsByEvent.get(key)!.push({
      id: m.id,
      title: m.title,
      kind: m.kind,
      line: m.line === null ? null : Number(m.line),
      isActive: m.is_active,
      sortOrder: m.sort_order,
      outcomes: outcomesByMarket.get(String(m.id)) ?? [],
    });
  }

  return events.map((e) => ({
    id: e.id,
    sport: e.sport,
    league: e.league,
    teamHome: e.team_home,
    teamAway: e.team_away,
    startsAt: e.starts_at,
    status: e.status,
    homeScore: e.home_score === null ? null : Number(e.home_score),
    awayScore: e.away_score === null ? null : Number(e.away_score),
    settledAt: e.settled_at,
    markets: marketsByEvent.get(String(e.id)) ?? [],
  }));
}

export function mapOutcome(o: Record<string, unknown>) {
  return {
    id: o.id,
    code: o.code,
    label: o.label,
    odds: Number(o.odds),
    isWinner: o.is_winner === null ? null : o.is_winner,
    isActive: o.is_active,
    sortOrder: o.sort_order,
  };
}

export default router;
