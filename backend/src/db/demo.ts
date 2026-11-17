import { query, withTransaction } from '../db';
import { applyBalanceChange } from '../services/economy';
import { hashPassword } from '../utils/crypto';
import { logger } from '../utils/logger';

interface DemoEvent {
  sport: string;
  league: string;
  home: string;
  away: string;
  hoursFromNow: number;
  markets: { title: string; kind: string; outcomes: { label: string; odds: number }[] }[];
}

const DEMO_EVENTS: DemoEvent[] = [
  {
    sport: 'football',
    league: 'Английская Премьер-лига',
    home: 'Арсенал',
    away: 'Челси',
    hoursFromNow: 26,
    markets: [
      {
        title: 'Исход матча',
        kind: 'outcome',
        outcomes: [
          { label: 'П1 Арсенал', odds: 1.95 },
          { label: 'X Ничья', odds: 3.4 },
          { label: 'П2 Челси', odds: 3.8 },
        ],
      },
      {
        title: 'Тотал голов',
        kind: 'total',
        outcomes: [
          { label: 'Больше 2.5', odds: 1.85 },
          { label: 'Меньше 2.5', odds: 1.95 },
        ],
      },
    ],
  },
  {
    sport: 'football',
    league: 'Лига Чемпионов',
    home: 'Реал Мадрид',
    away: 'Бавария',
    hoursFromNow: 50,
    markets: [
      {
        title: 'Исход матча',
        kind: 'outcome',
        outcomes: [
          { label: 'П1 Реал', odds: 2.1 },
          { label: 'X Ничья', odds: 3.6 },
          { label: 'П2 Бавария', odds: 3.2 },
        ],
      },
      {
        title: 'Обе забьют',
        kind: 'custom',
        outcomes: [
          { label: 'Да', odds: 1.6 },
          { label: 'Нет', odds: 2.3 },
        ],
      },
    ],
  },
  {
    sport: 'basketball',
    league: 'НБА',
    home: 'Лейкерс',
    away: 'Селтикс',
    hoursFromNow: 20,
    markets: [
      {
        title: 'Победитель',
        kind: 'outcome',
        outcomes: [
          { label: 'Лейкерс', odds: 2.05 },
          { label: 'Селтикс', odds: 1.75 },
        ],
      },
      {
        title: 'Тотал очков',
        kind: 'total',
        outcomes: [
          { label: 'Больше 220.5', odds: 1.9 },
          { label: 'Меньше 220.5', odds: 1.9 },
        ],
      },
    ],
  },
  {
    sport: 'hockey',
    league: 'КХЛ',
    home: 'ЦСКА',
    away: 'СКА',
    hoursFromNow: 32,
    markets: [
      {
        title: 'Исход матча',
        kind: 'outcome',
        outcomes: [
          { label: 'П1 ЦСКА', odds: 2.4 },
          { label: 'X Ничья', odds: 4.1 },
          { label: 'П2 СКА', odds: 2.6 },
        ],
      },
    ],
  },
  {
    sport: 'football',
    league: 'Серия А',
    home: 'Ювентус',
    away: 'Интер',
    hoursFromNow: 74,
    markets: [
      {
        title: 'Исход матча',
        kind: 'outcome',
        outcomes: [
          { label: 'П1 Ювентус', odds: 2.75 },
          { label: 'X Ничья', odds: 3.1 },
          { label: 'П2 Интер', odds: 2.55 },
        ],
      },
    ],
  },
];

const DEMO_USERS = [
  { username: 'БомбаМастер', telegram: 'bomba_master' },
  { username: 'Ставкин', telegram: 'stavkin_pro' },
  { username: 'Прогнозёр', telegram: 'prognozer' },
  { username: 'ТочныйУдар', telegram: 'tochny_udar' },
  { username: 'Аналитик', telegram: 'analitik_bb' },
];

/**
 * Seeds demo users, upcoming events and settled history so the UI has content.
 * Safe to re-run: it exits early if demo data is already present.
 */
export async function seedDemoData(): Promise<void> {
  const existing = await query<{ c: string }>('SELECT count(*)::text AS c FROM events');
  if (Number(existing.rows[0].c) > 0) {
    logger.info('demo events already present — skipping demo seed');
    return;
  }

  const passwordHash = await hashPassword('BombaDemo12345');

  // --- users
  const userIds: string[] = [];
  for (const u of DEMO_USERS) {
    const row = await query<{ id: string }>(
      `INSERT INTO users (username, username_lower, password_hash, telegram_username, avatar_seed, balance)
       VALUES ($1, $2, $3, $4, $5, 0)
       ON CONFLICT (username_lower) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [u.username, u.username.toLowerCase(), passwordHash, u.telegram, u.username.slice(0, 2).toLowerCase()],
    );
    userIds.push(row.rows[0].id);
    await withTransaction((client) =>
      applyBalanceChange(client, {
        userId: row.rows[0].id,
        delta: 500,
        reason: 'signup_bonus',
        note: 'Демо-баланс',
      }),
    );
  }
  logger.info({ users: userIds.length }, 'demo users created');

  // --- upcoming events
  for (const e of DEMO_EVENTS) {
    await withTransaction(async (client) => {
      const ev = await client.query<{ id: string }>(
        `INSERT INTO events (sport, league, team_home, team_away, starts_at)
         VALUES ($1, $2, $3, $4, now() + ($5 || ' hours')::interval) RETURNING id`,
        [e.sport, e.league, e.home, e.away, String(e.hoursFromNow)],
      );
      for (const m of e.markets) {
        const mk = await client.query<{ id: string }>(
          `INSERT INTO markets (event_id, title, kind) VALUES ($1, $2, $3) RETURNING id`,
          [ev.rows[0].id, m.title, m.kind],
        );
        let i = 0;
        for (const o of m.outcomes) {
          await client.query(
            `INSERT INTO outcomes (market_id, label, odds, sort_order) VALUES ($1, $2, $3, $4)`,
            [mk.rows[0].id, o.label, o.odds, i++],
          );
        }
      }
    });
  }
  logger.info({ events: DEMO_EVENTS.length }, 'demo events created');

  // --- one finished event with settled predictions to populate the leaderboard
  await withTransaction(async (client) => {
    const ev = await client.query<{ id: string }>(
      `INSERT INTO events (sport, league, team_home, team_away, starts_at, status, home_score, away_score, settled_at)
       VALUES ('football', 'Товарищеский матч', 'Динамо', 'Спартак',
               now() - interval '2 days', 'finished', 2, 1, now() - interval '2 days')
       RETURNING id`,
    );
    const mk = await client.query<{ id: string }>(
      `INSERT INTO markets (event_id, title, kind) VALUES ($1, 'Исход матча', 'outcome') RETURNING id`,
      [ev.rows[0].id],
    );
    const winOutcome = await client.query<{ id: string }>(
      `INSERT INTO outcomes (market_id, label, odds, is_winner, sort_order)
       VALUES ($1, 'П1 Динамо', 2.2, true, 0) RETURNING id`,
      [mk.rows[0].id],
    );
    await client.query(
      `INSERT INTO outcomes (market_id, label, odds, is_winner, sort_order)
       VALUES ($1, 'П2 Спартак', 3.1, false, 1)`,
      [mk.rows[0].id],
    );

    // Winners and losers across demo users. Stakes must stay within the 500
    // demo bonus above, otherwise applyBalanceChange rejects the stake.
    for (let i = 0; i < userIds.length; i++) {
      const won = i % 2 === 0;
      const stake = 50 + i * 50;
      await applyBalanceChange(client, {
        userId: userIds[i],
        delta: -stake,
        reason: 'prediction_stake',
        refType: 'event',
        refId: ev.rows[0].id,
        note: 'Демо-прогноз',
      });
      if (won) {
        const payout = Math.round(stake * 2.2);
        await applyBalanceChange(client, {
          userId: userIds[i],
          delta: payout,
          reason: 'prediction_payout',
          refType: 'event',
          refId: ev.rows[0].id,
          note: 'Демо-выигрыш',
        });
      }
      await client.query(
        `INSERT INTO predictions (user_id, event_id, market_id, outcome_id, stake, odds, potential_payout, payout, status, placed_at, settled_at)
         VALUES ($1, $2, $3, $4, $5, 2.2, $6, $7, $8, now() - interval '3 days', now() - interval '2 days')`,
        [
          userIds[i],
          ev.rows[0].id,
          mk.rows[0].id,
          winOutcome.rows[0].id,
          stake,
          Math.round(stake * 2.2),
          won ? Math.round(stake * 2.2) : 0,
          won ? 'won' : 'lost',
        ],
      );
    }
  });
  logger.info('demo settled history created');
}
