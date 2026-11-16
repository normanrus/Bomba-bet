import { describe, expect, it } from 'vitest';
import { generateStrongPassword, hashPassword, sha256, verifyPassword } from '../utils/crypto';
import { mapPrediction } from '../services/predictions';
import { mapUser } from '../services/users';
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from '../utils/errors';
import { resolveSplit, type BalanceChange } from '../services/economy';

describe('пароли', () => {
  it('хэш не совпадает с открытым паролем и проверяется обратно', async () => {
    const hash = await hashPassword('TestPass12345');
    expect(hash).not.toContain('TestPass12345');
    expect(await verifyPassword('TestPass12345', hash)).toBe(true);
    expect(await verifyPassword('WrongPass12345', hash)).toBe(false);
  });

  it('два хэша одного пароля различаются (соль)', async () => {
    const a = await hashPassword('TestPass12345');
    const b = await hashPassword('TestPass12345');
    expect(a).not.toBe(b);
  });

  it('сгенерированный пароль достаточно длинный и читаемый', () => {
    const pw = generateStrongPassword();
    expect(pw).toMatch(/^Bomba-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    expect(pw.length).toBeGreaterThanOrEqual(12);
  });

  it('sha256 стабилен', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).not.toBe(sha256('abd'));
    expect(sha256('abc')).toHaveLength(64);
  });
});

describe('mapUser', () => {
  it('приводит числовой баланс и строковые поля', () => {
    const u = mapUser({
      id: 'u1',
      username: 'friend',
      avatar_seed: 'fr',
      avatar_url: null,
      balance: '1500',
      role: 'user',
      status: 'active',
      telegram_username: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(u.balance).toBe(1500);
    expect(u.avatarSeed).toBe('fr');
    expect(u.avatarUrl).toBeNull();
    expect(u.role).toBe('user');
    expect(u.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('не падает без аватара и баланса', () => {
    const u = mapUser({
      id: 'u2',
      username: 'x',
      role: 'user',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(u.avatarSeed).toBe('bb');
    expect(u.balance).toBe(0);
  });
});

describe('mapPrediction', () => {
  const row = {
    id: 'p1',
    stake: '100',
    odds: '2.05',
    potential_payout: '205',
    payout: '0',
    status: 'pending',
    placed_at: '2026-01-01T10:00:00.000Z',
    settled_at: null,
    event_id: 'e1',
    team_home: 'Заря',
    team_away: 'Вихрь',
    league: 'Тест-Лига',
    starts_at: '2026-01-01T12:00:00.000Z',
    event_status: 'upcoming',
    home_score: null,
    away_score: null,
    outcome_label: 'Заря',
    market_title: 'Победитель',
  };

  it('все числа — JSON-числа, а не строки из pg', () => {
    const p = mapPrediction(row);
    expect(p.stake).toBe(100);
    expect(p.odds).toBe(2.05);
    expect(p.potentialPayout).toBe(205);
    expect(p.payout).toBe(0);
  });

  it('использует camelCase и вкладывает событие', () => {
    const p = mapPrediction(row);
    expect(p.placedAt).toBe(row.placed_at);
    expect(p.outcomeLabel).toBe('Заря');
    expect(p.event).toEqual({
      id: 'e1',
      teamHome: 'Заря',
      teamAway: 'Вихрь',
      league: 'Тест-Лига',
      startsAt: row.starts_at,
      status: 'upcoming',
      homeScore: null,
      awayScore: null,
    });
  });

  it('рассчитанный матч отдаёт счёт числами', () => {
    const p = mapPrediction({
      ...row,
      status: 'won',
      payout: '205',
      home_score: '3',
      away_score: '1',
    });
    expect(p.event.homeScore).toBe(3);
    expect(p.event.awayScore).toBe(1);
    expect(p.status).toBe('won');
  });
});

describe('разделение баланса: бонусные и выводимые очки', () => {
  const change = (delta: number, extra: Partial<BalanceChange> = {}): BalanceChange => ({
    userId: 'u1',
    delta,
    reason: 'signup_bonus',
    ...extra,
  });

  it('бонус целиком попадает в невыводимый кошелёк', () => {
    const s = resolveSplit(change(1000), 1000, 0);
    expect(s.balanceDelta).toBe(1000);
    expect(s.withdrawableDelta).toBe(0);
  });

  it('выигрыш целиком становится выводимым', () => {
    const s = resolveSplit(change(300, { reason: 'prediction_payout' }), 300, 0);
    expect(s.balanceDelta).toBe(300);
    expect(s.withdrawableDelta).toBe(300);
  });

  it('ставка сначала тратит бонусные очки', () => {
    const s = resolveSplit(change(-100, { reason: 'prediction_stake' }), 1000, 100);
    expect(s.balanceDelta).toBe(-100);
    expect(s.withdrawableDelta).toBe(0);
  });

  it('ставка залезает в выводимые, только когда бонусные кончились', () => {
    // 60 free + 40 cashable; a 100 stake drains free first, then 40 cashable.
    const s = resolveSplit(change(-100, { reason: 'prediction_stake' }), 100, 40);
    expect(s.balanceDelta).toBe(-100);
    expect(s.withdrawableDelta).toBe(-40);
  });

  it('резерв приза списывает только выводимые очки', () => {
    const s = resolveSplit(change(-500, { reason: 'prize_reserve' }), 1300, 800);
    expect(s.balanceDelta).toBe(-500);
    expect(s.withdrawableDelta).toBe(-500);
  });

  it('возврат приза возвращает очки в выводимый кошелёк', () => {
    const s = resolveSplit(change(500, { reason: 'prize_refund' }), 100, 100);
    expect(s.withdrawableDelta).toBe(500);
  });

  it('явный withdrawableDelta перебивает политику по умолчанию', () => {
    const s = resolveSplit(change(200, { withdrawableDelta: 0 }), 200, 0);
    expect(s.balanceDelta).toBe(200);
    expect(s.withdrawableDelta).toBe(0);
  });
});

describe('ошибки API', () => {
  it('несут корректный HTTP-статус и код', () => {
    const cases: [AppError, number, string][] = [
      [badRequest('x'), 400, 'bad_request'],
      [unauthorized(), 401, 'unauthorized'],
      [forbidden(), 403, 'forbidden'],
      [notFound(), 404, 'not_found'],
      [conflict('x'), 409, 'conflict'],
    ];
    for (const [err, status, code] of cases) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(status);
      expect(err.code).toBe(code);
    }
  });
});
