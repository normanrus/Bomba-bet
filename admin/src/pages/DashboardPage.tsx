import { useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import type { Stats } from '../api/types';
import { Empty, Spinner, Stat, fmt } from '../components/ui';

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<Stats>('/admin/stats')
      .then(setStats)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <div className="alert alert-err">{error}</div>;
  if (!stats) return <Spinner />;

  const winRate = stats.predictions > 0 ? Math.round((stats.won / stats.predictions) * 100) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Обзор проекта</h1>
          <div className="sub">Ключевые показатели БОМБА БЕТ в реальном времени</div>
        </div>
      </div>

      <div className="grid grid-stats" style={{ marginBottom: 22 }}>
        <Stat label="Пользователей" value={fmt.num(stats.users)} hint={`Заблокировано: ${stats.blockedUsers}`} />
        <Stat label="Активны 24ч" value={fmt.num(stats.active24h)} hint={`За 7 дней: ${stats.active7d}`} />
        <Stat label="Общий баланс" value={fmt.num(stats.totalBalance)} hint="виртуальных очков" />
        <Stat label="Прогнозов" value={fmt.num(stats.predictions)} hint={`В ожидании: ${stats.pending}`} />
        <Stat label="Выигрышных" value={fmt.num(stats.won)} hint={`${winRate}% от всех`} />
        <Stat label="Проигранных" value={fmt.num(stats.lost)} hint={`Всего матчей: ${stats.events}`} />
        <Stat
          label="Заявки на призы"
          value={fmt.num(stats.prizesPending)}
          hint={`Выдано: ${stats.prizesIssued}`}
        />
        <Stat
          label="Призовой фонд"
          value={`${fmt.num(stats.prizeFund.used)} / ${fmt.num(stats.prizeFund.limit)}`}
          hint={`Выдано: ${fmt.num(stats.prizeFund.issued)}`}
        />
      </div>

      <div className="card">
        <h2>Последние действия</h2>
        {stats.recentAudit.length === 0 ? (
          <Empty text="Пока нет записей" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Администратор</th>
                  <th>Действие</th>
                  <th>Объект</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentAudit.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{fmt.dt(a.createdAt)}</td>
                    <td>{a.actorUsername ?? '—'}</td>
                    <td>
                      <span className="badge badge-muted">{a.action}</span>
                    </td>
                    <td className="mono">
                      {a.targetType ?? ''} {a.targetId ? a.targetId.slice(0, 8) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
