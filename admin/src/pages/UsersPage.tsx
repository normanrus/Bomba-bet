import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import type { AdminUser, UserDetail } from '../api/types';
import { Avatar, Badge, Empty, Modal, Spinner, fmt } from '../components/ui';
import { useToast } from '../context/ToastContext';

export function UsersPage() {
  const { push } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'blocked'>('all');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ users: AdminUser[]; total: number }>(
        `/admin/users?q=${encodeURIComponent(q)}&status=${status}&limit=100`,
      );
      setUsers(res.users);
      setTotal(res.total);
    } catch (e) {
      push((e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [q, status, push]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    try {
      setDetail(await apiGet<UserDetail>(`/admin/users/${id}`));
    } catch (e) {
      push((e as Error).message, 'err');
    }
  }

  async function toggleBlock(u: AdminUser) {
    const next = u.status === 'active' ? 'blocked' : 'active';
    const reason =
      next === 'blocked' ? window.prompt('Причина блокировки (необязательно):') ?? '' : '';
    try {
      await apiPost(`/admin/users/${u.id}/status`, { status: next, reason: reason || undefined });
      push(next === 'blocked' ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
      await load();
      if (detail?.user.id === u.id) await openDetail(u.id);
    } catch (e) {
      push((e as Error).message, 'err');
    }
  }

  async function adjustBalance(u: AdminUser) {
    const rawDelta = window.prompt(`Корректировка баланса для ${u.username}\nВведите сумму (+ или -):`);
    if (!rawDelta) return;
    const delta = Number(rawDelta);
    if (!Number.isInteger(delta) || delta === 0) return push('Нужно целое число, отличное от нуля', 'err');
    const reason = window.prompt('Причина корректировки (обязательно):');
    if (!reason || reason.trim().length < 3) return push('Укажите причину (минимум 3 символа)', 'err');
    // A credit can be made cashable; debits always drain free points first.
    const withdrawable =
      delta > 0
        ? window.confirm(
            'Сделать начисление выводимым (можно будет обменять на приз)?\nOK — выводимые, Отмена — обычные бонусные.',
          )
        : false;
    try {
      setBusy(true);
      const res = await apiPost<{ balanceBefore: number; balanceAfter: number }>(
        `/admin/users/${u.id}/balance`,
        { delta, reason: reason.trim(), withdrawable },
      );
      push(
        `Баланс: ${fmt.num(res.balanceBefore)} → ${fmt.num(res.balanceAfter)}` +
          (delta > 0 ? (withdrawable ? ' (выводимые)' : ' (бонусные)') : ''),
      );
      await load();
      if (detail?.user.id === u.id) await openDetail(u.id);
    } catch (e) {
      push((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Пользователи</h1>
          <div className="sub">Найдено: {total}</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Поиск по никнейму…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips">
          {(['all', 'active', 'blocked'] as const).map((s) => (
            <div key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
              {s === 'all' ? 'Все' : s === 'active' ? 'Активные' : 'Заблокированные'}
            </div>
          ))}
        </div>
        <button className="btn btn-sm" onClick={() => void load()}>
          Обновить
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : users.length === 0 ? (
        <Empty text="Пользователи не найдены" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Игрок</th>
                <th>ID</th>
                <th>Баланс</th>
                <th>W / L</th>
                <th>Статус</th>
                <th>Telegram</th>
                <th>Регистрация</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="row" style={{ gap: 9, flexWrap: 'nowrap' }}>
                      <Avatar seed={u.avatarSeed || u.username} url={u.avatarUrl} />
                      <b>{u.username}</b>
                    </div>
                  </td>
                  <td className="mono">{u.id.slice(0, 8)}…</td>
                  <td>
                    <b>{fmt.num(u.balance)}</b>
                    <div className="sub">выводимо: {fmt.num(u.withdrawableBalance)}</div>
                  </td>
                  <td>
                    <span style={{ color: 'var(--ok)' }}>{u.wins}</span> /{' '}
                    <span style={{ color: 'var(--danger)' }}>{u.losses}</span>
                  </td>
                  <td>
                    <Badge status={u.status} />
                  </td>
                  <td className="mono">{u.telegramUsername ? `@${u.telegramUsername}` : '—'}</td>
                  <td className="mono">{fmt.date(u.createdAt)}</td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button className="btn btn-sm" onClick={() => void openDetail(u.id)}>
                        Профиль
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => void adjustBalance(u)}
                        title="Корректировать баланс"
                      >
                        ±
                      </button>
                      <button
                        className={`btn btn-sm ${u.status === 'active' ? 'btn-danger' : 'btn-ok'}`}
                        onClick={() => void toggleBlock(u)}
                      >
                        {u.status === 'active' ? 'Блок' : 'Разблок'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail ? (
        <Modal wide title={`Профиль: ${detail.user.username}`} onClose={() => setDetail(null)}>
          <dl className="kv" style={{ marginBottom: 18 }}>
            <dt>ID</dt>
            <dd className="mono">{detail.user.id}</dd>
            <dt>Баланс</dt>
            <dd>
              <b>{fmt.num(detail.user.balance)}</b> очков
            </dd>
            <dt>Выводимые</dt>
            <dd>
              <b>{fmt.num(detail.user.withdrawableBalance)}</b> очков{' '}
              <span className="sub">(можно обменять на приз)</span>
            </dd>
            <dt>Статус</dt>
            <dd>
              <Badge status={detail.user.status} />
            </dd>
            <dt>Telegram</dt>
            <dd>{detail.user.telegramUsername ? `@${detail.user.telegramUsername}` : 'не указан'}</dd>
            <dt>Прогнозы</dt>
            <dd>
              всего {detail.user.stats.total}, выиграно {detail.user.stats.won}, проиграно{' '}
              {detail.user.stats.lost}, в ожидании {detail.user.stats.pending}
            </dd>
            <dt>Винрейт</dt>
            <dd>{detail.user.stats.winRate}%</dd>
            <dt>Оборот</dt>
            <dd>
              поставлено {fmt.num(detail.user.stats.staked)} → возвращено{' '}
              {fmt.num(detail.user.stats.returned)} (итог {fmt.num(detail.user.stats.net)})
            </dd>
          </dl>

          <h2>История прогнозов</h2>
          {detail.predictions.length === 0 ? (
            <Empty text="Прогнозов нет" />
          ) : (
            <div className="table-wrap" style={{ marginBottom: 18 }}>
              <table>
                <thead>
                  <tr>
                    <th>Матч</th>
                    <th>Прогноз</th>
                    <th>Ставка</th>
                    <th>Кэф</th>
                    <th>Выплата</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.predictions.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.event.teamHome} — {p.event.teamAway}
                        <div className="mono">{fmt.dt(p.event.startsAt)}</div>
                      </td>
                      <td>{p.outcomeLabel}</td>
                      <td>{fmt.num(p.stake)}</td>
                      <td>{p.odds}</td>
                      <td>{fmt.num(p.payout)}</td>
                      <td>
                        <Badge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>История баланса</h2>
          {detail.ledger.length === 0 ? (
            <Empty text="Операций нет" />
          ) : (
            <div className="table-wrap" style={{ marginBottom: 18 }}>
              <table>
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Операция</th>
                    <th>Изменение</th>
                    <th>Баланс</th>
                    <th>Выводимо</th>
                    <th>Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="mono">{fmt.dt(l.createdAt)}</td>
                      <td className="mono">{l.reason}</td>
                      <td style={{ color: l.delta >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                        {l.delta >= 0 ? '+' : ''}
                        {fmt.num(l.delta)}
                      </td>
                      <td>{fmt.num(l.balanceAfter)}</td>
                      <td>{fmt.num(l.withdrawableAfter)}</td>
                      <td className="sub">{l.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>Заявки на призы</h2>
          {detail.prizes.length === 0 ? (
            <Empty text="Заявок нет" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Приз</th>
                    <th>Telegram</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.prizes.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{fmt.dt(p.requestedAt)}</td>
                      <td>
                        <b>{fmt.num(p.stars)} ⭐</b>
                        <div className="sub">{fmt.num(p.amount)} очк</div>
                      </td>
                      <td className="mono">@{p.telegramUsername}</td>
                      <td>
                        <Badge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}
