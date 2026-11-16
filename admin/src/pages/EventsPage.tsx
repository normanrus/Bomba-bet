import { useCallback, useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/client';
import type { Event, Market } from '../api/types';
import { Badge, Empty, Modal, Spinner, fmt } from '../components/ui';
import { useToast } from '../context/ToastContext';

interface DraftOutcome {
  label: string;
  odds: string;
}
interface DraftMarket {
  title: string;
  kind: string;
  outcomes: DraftOutcome[];
}

const emptyMarket = (): DraftMarket => ({
  title: 'Исход матча',
  kind: 'outcome',
  outcomes: [
    { label: 'П1', odds: '2.00' },
    { label: 'X', odds: '3.20' },
    { label: 'П2', odds: '3.50' },
  ],
});

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EventsPage() {
  const { push } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [status, setStatus] = useState<'all' | 'upcoming' | 'live' | 'finished' | 'cancelled'>('all');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [settle, setSettle] = useState<Event | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ events: Event[] }>(`/admin/events?status=${status}&limit=100`);
      setEvents(res.events);
    } catch (e) {
      push((e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [status, push]);

  useEffect(() => {
    void load();
  }, [load]);

  async function voidEvent(ev: Event) {
    const reason = window.prompt('Причина отмены события (необязательно):') ?? '';
    if (!window.confirm(`Отменить «${ev.teamHome} — ${ev.teamAway}»? Все ставки будут возвращены.`)) return;
    try {
      const res = await apiPost<{ result: { refunded: number; processed: number } }>(
        `/admin/events/${ev.id}/void`,
        { reason: reason || undefined },
      );
      push(`Отменено. Возвращено ${fmt.num(res.result.refunded)} очков (${res.result.processed} прогнозов)`);
      await load();
    } catch (e) {
      push((e as Error).message, 'err');
    }
  }

  async function editOdds(o: { id: string; label: string; odds: number }) {
    const raw = window.prompt(`Новый коэффициент для «${o.label}»:`, String(o.odds));
    if (!raw) return;
    const odds = Number(raw);
    if (!(odds >= 1.01)) return push('Коэффициент должен быть ≥ 1.01', 'err');
    try {
      await apiPatch(`/admin/catalog/outcomes/${o.id}`, { odds });
      push('Коэффициент обновлён');
      await load();
    } catch (e) {
      push((e as Error).message, 'err');
    }
  }

  async function toggleOutcome(o: { id: string; isActive: boolean }) {
    try {
      await apiPatch(`/admin/catalog/outcomes/${o.id}`, { isActive: !o.isActive });
      await load();
    } catch (e) {
      push((e as Error).message, 'err');
    }
  }

  async function removeMarket(m: Market) {
    if (!window.confirm(`Удалить рынок «${m.title}»?`)) return;
    try {
      const res = await apiDelete<{ deactivated: boolean }>(`/admin/catalog/markets/${m.id}`);
      push(res.deactivated ? 'Рынок деактивирован (есть активные прогнозы)' : 'Рынок удалён');
      await load();
    } catch (e) {
      push((e as Error).message, 'err');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>События</h1>
          <div className="sub">Создание матчей, коэффициенты и расчёт результатов</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          + Новый матч
        </button>
      </div>

      <div className="toolbar">
        <div className="chips">
          {(['all', 'upcoming', 'live', 'finished', 'cancelled'] as const).map((s) => (
            <div key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
              {{
                all: 'Все',
                upcoming: 'Предстоящие',
                live: 'В игре',
                finished: 'Завершённые',
                cancelled: 'Отменённые',
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
      ) : events.length === 0 ? (
        <Empty text="Событий нет" />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(430px, 1fr))' }}>
          {events.map((ev) => (
            <div className="card" key={ev.id}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <Badge status={ev.status} />
                <span className="mono">{fmt.dt(ev.startsAt)}</span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 3 }}>
                {ev.teamHome} — {ev.teamAway}
              </div>
              <div className="sub" style={{ marginBottom: 12 }}>
                {ev.league ?? ev.sport}
                {ev.status === 'finished' ? ` · счёт ${ev.homeScore}:${ev.awayScore}` : ''}
                {typeof ev.predictionCount === 'number' ? ` · прогнозов: ${ev.predictionCount}` : ''}
              </div>

              {ev.markets.map((m) => (
                <div className="market-box" key={m.id}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                    <b style={{ fontSize: 13 }}>{m.title}</b>
                    <button className="btn btn-sm" onClick={() => void removeMarket(m)}>
                      Удалить
                    </button>
                  </div>
                  {m.outcomes.map((o) => (
                    <div className="outcome-row" key={o.id}>
                      <span style={{ flex: 1, opacity: o.isActive ? 1 : 0.45 }}>
                        {o.label}
                        {o.isWinner ? ' ✅' : ''}
                      </span>
                      <b style={{ minWidth: 48, textAlign: 'right' }}>{o.odds}</b>
                      <button className="btn btn-sm" onClick={() => void editOdds(o)}>
                        Кэф
                      </button>
                      <button className="btn btn-sm" onClick={() => void toggleOutcome(o)}>
                        {o.isActive ? 'Выкл' : 'Вкл'}
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {ev.status !== 'finished' && ev.status !== 'cancelled' ? (
                <div className="row">
                  <button className="btn btn-primary btn-sm" onClick={() => setSettle(ev)}>
                    Расчёт результата
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => void voidEvent(ev)}>
                    Отменить
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {createOpen ? (
        <CreateEventModal
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            await load();
          }}
        />
      ) : null}

      {settle ? (
        <SettleModal
          event={settle}
          busy={busy}
          onClose={() => setSettle(null)}
          onSubmit={async (payload) => {
            setBusy(true);
            try {
              const res = await apiPost<{
                result: { wonCount: number; lostCount: number; voidCount: number; totalPaid: number };
              }>(`/admin/events/${settle.id}/settle`, payload);
              const r = res.result;
              push(
                `Рассчитано: выиграло ${r.wonCount}, проиграло ${r.lostCount}, возврат ${r.voidCount}. Выплачено ${fmt.num(r.totalPaid)} очков`,
              );
              setSettle(null);
              await load();
            } catch (e) {
              push((e as Error).message, 'err');
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function CreateEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { push } = useToast();
  const [sport, setSport] = useState('football');
  const [league, setLeague] = useState('');
  const [teamHome, setTeamHome] = useState('');
  const [teamAway, setTeamAway] = useState('');
  const [startsAt, setStartsAt] = useState(toLocalInput(new Date(Date.now() + 86400000)));
  const [markets, setMarkets] = useState<DraftMarket[]>([emptyMarket()]);
  const [busy, setBusy] = useState(false);

  function updateMarket(i: number, patch: Partial<DraftMarket>) {
    setMarkets((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function updateOutcome(mi: number, oi: number, patch: Partial<DraftOutcome>) {
    setMarkets((prev) =>
      prev.map((m, idx) =>
        idx === mi ? { ...m, outcomes: m.outcomes.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : m,
      ),
    );
  }

  async function submit() {
    if (!teamHome.trim() || !teamAway.trim()) return push('Укажите названия команд', 'err');
    const payload = {
      sport,
      league: league.trim() || undefined,
      teamHome: teamHome.trim(),
      teamAway: teamAway.trim(),
      startsAt: new Date(startsAt).toISOString(),
      markets: markets.map((m) => ({
        title: m.title.trim(),
        kind: m.kind,
        outcomes: m.outcomes
          .filter((o) => o.label.trim())
          .map((o) => ({ label: o.label.trim(), odds: Number(o.odds) })),
      })),
    };
    for (const m of payload.markets) {
      if (m.outcomes.length < 2) return push(`В рынке «${m.title}» нужно минимум 2 варианта`, 'err');
      if (m.outcomes.some((o) => !(o.odds >= 1.01))) return push('Все коэффициенты должны быть ≥ 1.01', 'err');
    }
    setBusy(true);
    try {
      await apiPost('/admin/events', payload);
      push('Матч создан');
      onCreated();
    } catch (e) {
      push((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal wide title="Новый матч" onClose={onClose}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 180px' }}>
          <div className="field">
            <label>Вид спорта</label>
            <select className="select" value={sport} onChange={(e) => setSport(e.target.value)}>
              <option value="football">Футбол</option>
              <option value="basketball">Баскетбол</option>
              <option value="hockey">Хоккей</option>
              <option value="tennis">Теннис</option>
              <option value="esports">Киберспорт</option>
              <option value="other">Другое</option>
            </select>
          </div>
        </div>
        <div style={{ flex: '2 1 260px' }}>
          <div className="field">
            <label>Турнир / лига</label>
            <input className="input" value={league} onChange={(e) => setLeague(e.target.value)} placeholder="АПЛ" />
          </div>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="field">
            <label>Хозяева</label>
            <input className="input" value={teamHome} onChange={(e) => setTeamHome(e.target.value)} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="field">
            <label>Гости</label>
            <input className="input" value={teamAway} onChange={(e) => setTeamAway(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="field">
        <label>Дата и время начала</label>
        <input
          className="input"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </div>

      <h2 style={{ marginTop: 18 }}>Рынки прогнозов</h2>
      {markets.map((m, mi) => (
        <div className="market-box" key={mi}>
          <div className="row" style={{ marginBottom: 8 }}>
            <input
              className="input"
              style={{ flex: 2 }}
              value={m.title}
              onChange={(e) => updateMarket(mi, { title: e.target.value })}
              placeholder="Название рынка"
            />
            <select
              className="select"
              style={{ flex: 1 }}
              value={m.kind}
              onChange={(e) => updateMarket(mi, { kind: e.target.value })}
            >
              <option value="outcome">Исход</option>
              <option value="total">Тотал</option>
              <option value="handicap">Фора</option>
              <option value="custom">Другое</option>
            </select>
            {markets.length > 1 ? (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => setMarkets((p) => p.filter((_, i) => i !== mi))}
              >
                ✕
              </button>
            ) : null}
          </div>

          {m.outcomes.map((o, oi) => (
            <div className="outcome-row" key={oi}>
              <input
                className="input"
                value={o.label}
                onChange={(e) => updateOutcome(mi, oi, { label: e.target.value })}
                placeholder="Вариант"
              />
              <input
                className="input odds"
                value={o.odds}
                onChange={(e) => updateOutcome(mi, oi, { odds: e.target.value })}
                placeholder="Кэф"
              />
              {m.outcomes.length > 2 ? (
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    updateMarket(mi, { outcomes: m.outcomes.filter((_, i) => i !== oi) })
                  }
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
          <button
            className="btn btn-sm"
            onClick={() => updateMarket(mi, { outcomes: [...m.outcomes, { label: '', odds: '2.00' }] })}
          >
            + вариант
          </button>
        </div>
      ))}
      <button className="btn btn-sm" onClick={() => setMarkets((p) => [...p, emptyMarket()])}>
        + рынок
      </button>

      <div className="row row-end" style={{ marginTop: 20 }}>
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Создание…' : 'Создать матч'}
        </button>
      </div>
    </Modal>
  );
}

function SettleModal({
  event,
  busy,
  onClose,
  onSubmit,
}: {
  event: Event;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { homeScore: number; awayScore: number; winningOutcomeIds: string[] }) => void;
}) {
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [winners, setWinners] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setWinners((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal
      wide
      title={`Расчёт: ${event.teamHome} — ${event.teamAway}`}
      onClose={onClose}
    >
      <div className="alert alert-info">
        Отметьте выигрышные варианты. Прогнозы на отмеченные варианты получат выплату по коэффициенту,
        остальные будут отмечены как проигранные. Рынки без выбранного победителя будут возвращены
        участникам. Действие необратимо.
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Голы {event.teamHome}</label>
          <input className="input" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Голы {event.teamAway}</label>
          <input className="input" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} />
        </div>
      </div>

      {event.markets.map((m) => (
        <div className="market-box" key={m.id}>
          <b style={{ fontSize: 13 }}>{m.title}</b>
          <div style={{ marginTop: 8 }}>
            {m.outcomes.map((o) => (
              <label className={`winner-pick ${winners.has(o.id) ? 'on' : ''}`} key={o.id}>
                <input type="checkbox" checked={winners.has(o.id)} onChange={() => toggle(o.id)} />
                <span style={{ flex: 1 }}>{o.label}</span>
                <b>{o.odds}</b>
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="row row-end" style={{ marginTop: 18 }}>
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() =>
            onSubmit({
              homeScore: Number(homeScore) || 0,
              awayScore: Number(awayScore) || 0,
              winningOutcomeIds: [...winners],
            })
          }
        >
          {busy ? 'Расчёт…' : 'Рассчитать и выплатить'}
        </button>
      </div>
    </Modal>
  );
}
