import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import type { Prize } from '../api/types';
import { Badge, Empty, Modal, Spinner, fmt } from '../components/ui';
import { useToast } from '../context/ToastContext';

type Filter = 'all' | 'pending' | 'approved' | 'issued' | 'rejected' | 'cancelled';

export function PrizesPage() {
  const { push } = useToast();
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [fund, setFund] = useState({ used: 0, issued: 0 });
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<{ prize: Prize; kind: 'reject' | 'issue' } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ prizes: Prize[]; fund: { used: number; issued: number } }>(
        `/admin/prizes?status=${filter}&limit=200`,
      );
      setPrizes(res.prizes);
      setFund(res.fund);
    } catch (e) {
      push((e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [filter, push]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(prize: Prize, kind: 'approve' | 'issue', adminNote?: string) {
    try {
      await apiPost(`/admin/prizes/${prize.id}/${kind}`, { adminNote });
      push(kind === 'approve' ? 'Заявка одобрена' : 'Приз отмечен как выданный');
      await load();
    } catch (e) {
      push((e as Error).message, 'err');
    }
  }

  async function reject(prize: Prize, reason: string) {
    try {
      setBusy(true);
      await apiPost(`/admin/prizes/${prize.id}/reject`, { rejectReason: reason });
      push('Заявка отклонена, очки возвращены пользователю');
      setAction(null);
      await load();
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
          <h1>Призы</h1>
          <div className="sub">
            Выдача вручную в Telegram Stars · зарезервировано {fmt.num(fund.used)} · выдано{' '}
            {fmt.num(fund.issued)}
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="chips">
          {(['pending', 'approved', 'issued', 'rejected', 'cancelled', 'all'] as Filter[]).map((s) => (
            <div key={s} className={`chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>
              {{
                pending: 'Ожидают',
                approved: 'Одобрены',
                issued: 'Выданы',
                rejected: 'Отклонены',
                cancelled: 'Отменены',
                all: 'Все',
              }[s]}
            </div>
          ))}
        </div>
        <button className="btn btn-sm" onClick={() => void load()}>
          Обновить
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : prizes.length === 0 ? (
        <Empty text="Заявок нет" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Игрок</th>
                <th>Telegram</th>
                <th>Сумма</th>
                <th>Выигрышей</th>
                <th>Статус</th>
                <th>Комментарий</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prizes.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{fmt.dt(p.requestedAt)}</td>
                  <td>
                    <b>{p.username ?? '—'}</b>
                    <div className="mono">{p.userId?.slice(0, 8)}…</div>
                  </td>
                  <td className="mono">@{p.telegramUsername}</td>
                  <td>
                    <b>{fmt.num(p.amount)}</b>
                  </td>
                  <td className="sub">
                    {p.userWins ?? 0} шт · {fmt.num(p.userTotalWon ?? 0)} очк
                  </td>
                  <td>
                    <Badge status={p.status} />
                  </td>
                  <td className="sub">{p.rejectReason ?? p.adminNote ?? p.userNote ?? '—'}</td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      {p.status === 'pending' ? (
                        <button className="btn btn-sm btn-ok" onClick={() => void act(p, 'approve')}>
                          Одобрить
                        </button>
                      ) : null}
                      {p.status === 'pending' || p.status === 'approved' ? (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => setAction({ prize: p, kind: 'issue' })}>
                            Выдать
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => setAction({ prize: p, kind: 'reject' })}>
                            Отклонить
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {action ? (
        <ActionModal
          prize={action.prize}
          kind={action.kind}
          busy={busy}
          onClose={() => setAction(null)}
          onSubmit={async (text) => {
            if (action.kind === 'reject') await reject(action.prize, text);
            else {
              await act(action.prize, 'issue', text || undefined);
              setAction(null);
            }
          }}
        />
      ) : null}
    </>
  );
}

function ActionModal({
  prize,
  kind,
  busy,
  onClose,
  onSubmit,
}: {
  prize: Prize;
  kind: 'reject' | 'issue';
  busy: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  return (
    <Modal
      title={kind === 'reject' ? 'Отклонить заявку' : 'Подтвердить выдачу приза'}
      onClose={onClose}
    >
      <dl className="kv" style={{ marginBottom: 16 }}>
        <dt>Игрок</dt>
        <dd>
          <b>{prize.username}</b>
        </dd>
        <dt>ID</dt>
        <dd className="mono">{prize.userId}</dd>
        <dt>Сумма</dt>
        <dd>
          <b>{fmt.num(prize.amount)}</b> очков
        </dd>
        <dt>Telegram</dt>
        <dd className="mono">@{prize.telegramUsername}</dd>
      </dl>

      {kind === 'reject' ? (
        <div className="alert alert-info">
          Очки будут возвращены на баланс игрока. Причина обязательна и будет видна пользователю.
        </div>
      ) : (
        <div className="alert alert-info">
          Подтверждайте только после фактической отправки Stars в Telegram. Заявка получит статус
          «Выдан».
        </div>
      )}

      {error ? <div className="alert alert-err">{error}</div> : null}

      <div className="field">
        <label>{kind === 'reject' ? 'Причина отклонения' : 'Комментарий (необязательно)'}</label>
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'reject' ? 'Например: недостаточно подтверждений' : 'Например: отправлено 100 Stars'}
        />
      </div>

      <div className="row row-end">
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
        <button
          className={`btn ${kind === 'reject' ? 'btn-danger' : 'btn-primary'}`}
          disabled={busy}
          onClick={() => {
            if (kind === 'reject' && text.trim().length < 3) {
              setError('Укажите причину (минимум 3 символа)');
              return;
            }
            onSubmit(text.trim());
          }}
        >
          {kind === 'reject' ? 'Отклонить и вернуть очки' : 'Подтвердить выдачу'}
        </button>
      </div>
    </Modal>
  );
}
