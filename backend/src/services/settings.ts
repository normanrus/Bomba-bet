import { PoolClient } from 'pg';
import { many, one } from '../db';

export interface AppSettings {
  'app.name': string;
  'app.logoUrl': string;
  'app.tagline': string;
  'predictions.enabled': boolean;
  'predictions.minStake': number;
  'predictions.maxStake': number;
  'predictions.maxOpenPerUser': number;
  'bonuses.enabled': boolean;
  'bonuses.signupAmount': number;
  'bonuses.dailyChance': number;
  'bonuses.dailyMin': number;
  'bonuses.dailyMax': number;
  'bonuses.rulesText': string;
  'prizes.enabled': boolean;
  'prizes.maxStars': number;
  'prizes.minStars': number;
  'prizes.pointsPerStar': number;
  'prizes.rulesText': string;
  'maintenance.enabled': boolean;
  'maintenance.message': string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  'app.name': 'БОМБА БЕТ',
  'app.logoUrl': '',
  'app.tagline': 'Дружеские спортивные прогнозы',
  'predictions.enabled': true,
  'predictions.minStake': 10,
  'predictions.maxStake': 50000,
  'predictions.maxOpenPerUser': 100,
  'bonuses.enabled': true,
  'bonuses.signupAmount': 500,
  'bonuses.dailyChance': 0.25,
  'bonuses.dailyMin': 25,
  'bonuses.dailyMax': 150,
  'bonuses.rulesText':
    'Приветственный бонус начисляется один раз при регистрации. ' +
    'Случайный бонус может начисляться не чаще одного раза в сутки: ' +
    'шанс 25%, сумма от 25 до 150 очков. Вероятности фиксированы и одинаковы для всех. ' +
    'Бонусные очки нельзя вывести — приз формируют только очки, выигранные в прогнозах.',
  'prizes.enabled': true,
  'prizes.maxStars': 125,
  'prizes.minStars': 5,
  'prizes.pointsPerStar': 100,
  'prizes.rulesText':
    'Призы выдаются вручную администратором в Telegram Stars. ' +
    'К призу принимаются только выводимые очки — выигранные в прогнозах. ' +
    'Бесплатные (бонусные) очки вывести нельзя. Укажите свой Telegram @username, ' +
    'администратор свяжется с вами после одобрения заявки.',
  'maintenance.enabled': false,
  'maintenance.message': 'Идут технические работы. Скоро вернёмся!',
};

export type SettingsMap = Record<string, unknown>;

/** All settings merged over defaults. */
export async function getSettings(): Promise<AppSettings> {
  const rows = await many<{ key: string; value: unknown }>('SELECT key, value FROM settings');
  const merged: SettingsMap = { ...DEFAULT_SETTINGS };
  for (const r of rows) merged[r.key] = r.value;
  return merged as unknown as AppSettings;
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const row = await one<{ value: AppSettings[K] }>('SELECT value FROM settings WHERE key = $1', [
    key,
  ]);
  return (row ? row.value : DEFAULT_SETTINGS[key]) as AppSettings[K];
}

export async function setSettings(
  patch: Partial<SettingsMap>,
  updatedBy: string | null,
  client?: PoolClient,
): Promise<void> {
  const runner = client ?? (await import('../db')).pool;
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    await runner.query(
      `INSERT INTO settings (key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
         updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [key, JSON.stringify(value), updatedBy],
    );
  }
}

export async function ensureDefaultSettings(client?: PoolClient): Promise<void> {
  const runner = client ?? (await import('../db')).pool;
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await runner.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value)],
    );
  }
}
