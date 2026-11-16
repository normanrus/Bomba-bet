import { PoolClient } from 'pg';
import { badRequest, conflict, notFound } from '../utils/errors';
import { applyBalanceChange } from './economy';
import { getSettings } from './settings';

export interface PlaceInput {
  userId: string;
  eventId: string;
  marketId: string;
  outcomeId: string;
  stake: number;
  idempotencyKey?: string;
}

/** Columns shared by every prediction read path (list, admin history, place). */
export const PREDICTION_SELECT = `
  SELECT p.id, p.stake, p.odds, p.potential_payout, p.payout, p.status,
         p.placed_at, p.settled_at,
         e.id AS event_id, e.team_home, e.team_away, e.starts_at,
         e.status AS event_status, e.home_score, e.away_score, e.league,
         o.label AS outcome_label, m.title AS market_title
    FROM predictions p
    JOIN events e   ON e.id = p.event_id
    JOIN outcomes o ON o.id = p.outcome_id
    JOIN markets m  ON m.id = p.market_id`;

/**
 * Shapes a joined prediction row for the API. Numeric columns arrive as strings
 * from pg, so every number is coerced here — clients always see JSON numbers.
 */
export function mapPrediction(r: Record<string, unknown>) {
  return {
    id: r.id,
    stake: Number(r.stake),
    odds: Number(r.odds),
    potentialPayout: Number(r.potential_payout),
    payout: Number(r.payout),
    status: r.status,
    placedAt: r.placed_at,
    settledAt: r.settled_at,
    outcomeLabel: r.outcome_label,
    marketTitle: r.market_title,
    event: {
      id: r.event_id,
      teamHome: r.team_home,
      teamAway: r.team_away,
      league: r.league,
      startsAt: r.starts_at,
      status: r.event_status,
      homeScore: r.home_score === null ? null : Number(r.home_score),
      awayScore: r.away_score === null ? null : Number(r.away_score),
    },
  };
}

async function fetchPrediction(client: PoolClient, id: string) {
  const row = await client.query(`${PREDICTION_SELECT} WHERE p.id = $1`, [id]);
  return mapPrediction(row.rows[0]);
}

/**
 * Places a free prediction. Virtual points are debited from the balance and the
 * potential payout is fixed at placement time (odds snapshot), so later odds
 * edits by an admin cannot change an already-placed prediction.
 */
export async function placePrediction(client: PoolClient, input: PlaceInput) {
  const settings = await getSettings();

  if (!settings['predictions.enabled']) {
    throw conflict('Приём прогнозов временно приостановлен администратором');
  }
  if (settings['maintenance.enabled']) {
    throw conflict('Приложение на обслуживании. Прогнозы временно недоступны');
  }

  const stake = Math.floor(input.stake);
  if (!Number.isFinite(stake) || stake < settings['predictions.minStake']) {
    throw badRequest(`Минимальная ставка — ${settings['predictions.minStake']} очков`);
  }
  if (stake > settings['predictions.maxStake']) {
    throw badRequest(`Максимальная ставка — ${settings['predictions.maxStake']} очков`);
  }

  // Idempotency: return the previously created prediction on retry.
  if (input.idempotencyKey) {
    const existing = await client.query(
      'SELECT id FROM predictions WHERE user_id = $1 AND idempotency_key = $2',
      [input.userId, input.idempotencyKey],
    );
    if (existing.rowCount) {
      return { prediction: await fetchPrediction(client, existing.rows[0].id), idempotentReplay: true };
    }
  }

  const openCount = await client.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM predictions WHERE user_id = $1 AND status = 'pending'`,
    [input.userId],
  );
  if (Number(openCount.rows[0].c) >= settings['predictions.maxOpenPerUser']) {
    throw conflict(`Достигнут лимит открытых прогнозов (${settings['predictions.maxOpenPerUser']})`);
  }

  // Validate event/market/outcome chain and lock the event so it cannot be settled mid-request.
  const ev = await client.query<{
    id: string;
    status: string;
    starts_at: string;
    team_home: string;
    team_away: string;
  }>('SELECT id, status, starts_at, team_home, team_away FROM events WHERE id = $1 FOR UPDATE', [
    input.eventId,
  ]);
  if (ev.rowCount === 0) throw notFound('Событие не найдено');
  const event = ev.rows[0];
  if (event.status !== 'upcoming') {
    throw conflict('Прогнозы принимаются только на предстоящие матчи');
  }
  if (new Date(event.starts_at).getTime() <= Date.now()) {
    throw conflict('Матч уже начался — прогнозы закрыты');
  }

  const oc = await client.query<{ id: string; odds: string; label: string; market_id: string; is_active: boolean }>(
    `SELECT o.id, o.odds, o.label, o.market_id, o.is_active
       FROM outcomes o
       JOIN markets m ON m.id = o.market_id
      WHERE o.id = $1 AND o.market_id = $2 AND m.event_id = $3 AND m.is_active = true`,
    [input.outcomeId, input.marketId, input.eventId],
  );
  if (oc.rowCount === 0) throw badRequest('Вариант прогноза недоступен');
  const outcome = oc.rows[0];
  if (!outcome.is_active) throw badRequest('Этот вариант прогноза отключён');

  const odds = Number(outcome.odds);
  const potentialPayout = Math.round(stake * odds);

  // Debit the stake (locks the user row, prevents double-spend).
  await applyBalanceChange(client, {
    userId: input.userId,
    delta: -stake,
    reason: 'prediction_stake',
    refType: 'event',
    refId: input.eventId,
    note: `${event.team_home} — ${event.team_away}: ${outcome.label}`,
  });

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO predictions
       (user_id, event_id, market_id, outcome_id, stake, odds, potential_payout, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.userId,
      input.eventId,
      input.marketId,
      input.outcomeId,
      stake,
      odds,
      potentialPayout,
      input.idempotencyKey ?? null,
    ],
  );

  return { prediction: await fetchPrediction(client, inserted.rows[0].id), idempotentReplay: false };
}

/**
 * Settles an event: marks the winning outcome, pays winners exactly once,
 * voids markets left without a winner, and refunds their stakes.
 */
export async function settleEvent(
  client: PoolClient,
  opts: {
    eventId: string;
    homeScore: number;
    awayScore: number;
    winningOutcomeIds: string[];
    actorId: string;
  },
) {
  const ev = await client.query<{ id: string; status: string }>(
    'SELECT id, status FROM events WHERE id = $1 FOR UPDATE',
    [opts.eventId],
  );
  if (ev.rowCount === 0) throw notFound('Событие не найдено');
  if (ev.rows[0].status === 'finished') throw conflict('Событие уже рассчитано');

  const markets = await client.query<{ id: string }>('SELECT id FROM markets WHERE event_id = $1', [
    opts.eventId,
  ]);
  const marketIds = markets.rows.map((m) => m.id);
  const winners = new Set(opts.winningOutcomeIds);

  for (const wid of winners) {
    const ok = await client.query('SELECT 1 FROM outcomes WHERE id = $1 AND market_id = ANY($2::uuid[])', [
      wid,
      marketIds,
    ]);
    if (ok.rowCount === 0) throw badRequest('Победный вариант не относится к этому событию');
  }

  await client.query('UPDATE outcomes SET is_winner = (id = ANY($1::uuid[])) WHERE market_id = ANY($2::uuid[])', [
    opts.winningOutcomeIds,
    marketIds,
  ]);

  // Markets for which the admin declared no winner are voided and refunded.
  const settledMarkets = new Set(
    (
      await client.query<{ market_id: string }>(
        'SELECT DISTINCT market_id FROM outcomes WHERE id = ANY($1::uuid[])',
        [opts.winningOutcomeIds],
      )
    ).rows.map((r) => r.market_id),
  );

  // Lock all pending predictions for the event; status guard makes this idempotent.
  const pending = await client.query<{
    id: string;
    user_id: string;
    stake: string;
    odds: string;
    outcome_id: string;
    market_id: string;
    potential_payout: string;
  }>(
    `SELECT id, user_id, stake, odds, outcome_id, market_id, potential_payout
       FROM predictions
      WHERE event_id = $1 AND status = 'pending'
      FOR UPDATE`,
    [opts.eventId],
  );

  let wonCount = 0;
  let lostCount = 0;
  let voidCount = 0;
  let totalPaid = 0;
  let totalRefunded = 0;

  for (const p of pending.rows) {
    const stake = Number(p.stake);
    if (winners.has(p.outcome_id)) {
      const payout = Math.round(stake * Number(p.odds));
      await applyBalanceChange(client, {
        userId: p.user_id,
        delta: payout,
        reason: 'prediction_payout',
        refType: 'prediction',
        refId: p.id,
        note: 'Выигрыш по прогнозу',
      });
      await client.query(
        `UPDATE predictions SET status = 'won', payout = $2, settled_at = now() WHERE id = $1`,
        [p.id, payout],
      );
      wonCount += 1;
      totalPaid += payout;
    } else if (!settledMarkets.has(p.market_id)) {
      // Admin declared no winner for this market -> void and refund.
      await applyBalanceChange(client, {
        userId: p.user_id,
        delta: stake,
        reason: 'prediction_refund',
        refType: 'prediction',
        refId: p.id,
        note: 'Возврат: событие отменено',
      });
      await client.query(
        `UPDATE predictions SET status = 'void', payout = $2, settled_at = now() WHERE id = $1`,
        [p.id, stake],
      );
      voidCount += 1;
      totalRefunded += stake;
    } else {
      await client.query(
        `UPDATE predictions SET status = 'lost', payout = 0, settled_at = now() WHERE id = $1`,
        [p.id],
      );
      lostCount += 1;
    }
  }

  await client.query(
    `UPDATE events SET status = 'finished', home_score = $2, away_score = $3,
       settled_at = now(), settled_by = $4, updated_at = now()
     WHERE id = $1`,
    [opts.eventId, opts.homeScore, opts.awayScore, opts.actorId],
  );

  return { wonCount, lostCount, voidCount, totalPaid, totalRefunded, processed: pending.rowCount };
}

export async function voidEvent(client: PoolClient, opts: { eventId: string; actorId: string; reason?: string }) {
  const pending = await client.query<{ id: string; user_id: string; stake: string }>(
    `SELECT id, user_id, stake FROM predictions WHERE event_id = $1 AND status = 'pending' FOR UPDATE`,
    [opts.eventId],
  );
  let refunded = 0;
  for (const p of pending.rows) {
    const stake = Number(p.stake);
    await applyBalanceChange(client, {
      userId: p.user_id,
      delta: stake,
      reason: 'prediction_refund',
      refType: 'prediction',
      refId: p.id,
      note: opts.reason ?? 'Событие отменено',
    });
    await client.query(`UPDATE predictions SET status = 'void', payout = $2, settled_at = now() WHERE id = $1`, [
      p.id,
      stake,
    ]);
    refunded += stake;
  }
  await client.query(
    `UPDATE events SET status = 'cancelled', settled_at = now(), settled_by = $2, updated_at = now() WHERE id = $1`,
    [opts.eventId, opts.actorId],
  );
  return { refunded, processed: pending.rowCount };
}
