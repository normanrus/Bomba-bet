import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../api/client';
import type { Settings } from '../api/types';
import { Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';

export function SettingsPage() {
  const { push } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<{ settings: Settings }>('/admin/settings')
      .then((r) => setSettings(r.settings))
      .catch((e) => push((e as Error).message, 'err'));
  }, [push]);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      const res = await apiPut<{ settings: Settings }>('/admin/settings', settings);
      setSettings(res.settings);
      push('Настройки сохранены');
    } catch (e) {
      push((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Настройки</h1>
          <div className="sub">Название, экономика, бонусы и режим обслуживания</div>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Сохранение…' : 'Сохранить всё'}
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))' }}>
        <div className="card">
          <h2>Брендинг</h2>
          <div className="field">
            <label>Название приложения</label>
            <input
              className="input"
              value={settings['app.name']}
              onChange={(e) => set('app.name', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Слоган</label>
            <input
              className="input"
              value={settings['app.tagline']}
              onChange={(e) => set('app.tagline', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Ссылка на логотип (URL)</label>
            <input
              className="input"
              value={settings['app.logoUrl']}
              onChange={(e) => set('app.logoUrl', e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="card">
          <h2>Прогнозы</h2>
          <label className="switch" style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={settings['predictions.enabled']}
              onChange={(e) => set('predictions.enabled', e.target.checked)}
            />
            Приём прогнозов включён
          </label>
          <div className="field">
            <label>Минимальная ставка (очков)</label>
            <input
              className="input"
              type="number"
              value={settings['predictions.minStake']}
              onChange={(e) => set('predictions.minStake', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Максимальная ставка (очков)</label>
            <input
              className="input"
              type="number"
              value={settings['predictions.maxStake']}
              onChange={(e) => set('predictions.maxStake', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Лимит открытых прогнозов на игрока</label>
            <input
              className="input"
              type="number"
              value={settings['predictions.maxOpenPerUser']}
              onChange={(e) => set('predictions.maxOpenPerUser', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="card">
          <h2>Бонусы (открытые правила)</h2>
          <label className="switch" style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={settings['bonuses.enabled']}
              onChange={(e) => set('bonuses.enabled', e.target.checked)}
            />
            Случайные бонусы включены
          </label>
          <div className="field">
            <label>Приветственный бонус при регистрации</label>
            <input
              className="input"
              type="number"
              value={settings['bonuses.signupAmount']}
              onChange={(e) => set('bonuses.signupAmount', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Шанс ежедневного бонуса (0–1)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={settings['bonuses.dailyChance']}
              onChange={(e) => set('bonuses.dailyChance', Number(e.target.value))}
            />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>Мин. сумма бонуса</label>
              <input
                className="input"
                type="number"
                value={settings['bonuses.dailyMin']}
                onChange={(e) => set('bonuses.dailyMin', Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Макс. сумма бонуса</label>
              <input
                className="input"
                type="number"
                value={settings['bonuses.dailyMax']}
                onChange={(e) => set('bonuses.dailyMax', Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field">
            <label>Текст правил для пользователей</label>
            <textarea
              className="textarea"
              value={settings['bonuses.rulesText']}
              onChange={(e) => set('bonuses.rulesText', e.target.value)}
            />
          </div>
        </div>

        <div className="card">
          <h2>Призы</h2>
          <label className="switch" style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={settings['prizes.enabled']}
              onChange={(e) => set('prizes.enabled', e.target.checked)}
            />
            Приём заявок на призы включён
          </label>
          <div className="field">
            <label>Общий лимит призового фонда, звёзд</label>
            <input
              className="input"
              type="number"
              value={settings['prizes.maxStars']}
              onChange={(e) => set('prizes.maxStars', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Минимальный приз, звёзд</label>
            <input
              className="input"
              type="number"
              value={settings['prizes.minStars']}
              onChange={(e) => set('prizes.minStars', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Курс: сколько очков стоит 1 звезда</label>
            <input
              className="input"
              type="number"
              value={settings['prizes.pointsPerStar']}
              onChange={(e) => set('prizes.pointsPerStar', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Текст правил выдачи</label>
            <textarea
              className="textarea"
              value={settings['prizes.rulesText']}
              onChange={(e) => set('prizes.rulesText', e.target.value)}
            />
          </div>
        </div>

        <div className="card">
          <h2>Обслуживание</h2>
          <label className="switch" style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={settings['maintenance.enabled']}
              onChange={(e) => set('maintenance.enabled', e.target.checked)}
            />
            Режим обслуживания (блокирует новые прогнозы)
          </label>
          <div className="field">
            <label>Сообщение пользователям</label>
            <textarea
              className="textarea"
              value={settings['maintenance.message']}
              onChange={(e) => set('maintenance.message', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="row row-end" style={{ marginTop: 20 }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Сохранение…' : 'Сохранить всё'}
        </button>
      </div>
    </>
  );
}
