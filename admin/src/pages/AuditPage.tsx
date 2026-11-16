import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import type { AuditEntry } from '../api/types';
import { Empty, Spinner, fmt } from '../components/ui';
import { useToast } from '../context/ToastContext';

export function AuditPage() {
  const { push } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = action ? `&action=${encodeURIComponent(action)}` : '';
      const res = await apiGet<{ entries: AuditEntry[] }>(`/admin/audit?limit=300${qs}`);
      setEntries(res.entries);
    } catch (e) {
      push((e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [action, push]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Журнал действий</h1>
          <div className="sub">Все административные операции фиксируются безвозвратно</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Фильтр по действию, например admin.user"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <button className="btn btn-sm" onClick={() => void load()}>
          Обновить
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <Empty text="Записей нет" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Администратор</th>
                <th>Действие</th>
                <th>Объект</th>
                <th>IP</th>
                <th>Детали</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <Fragment key={e.id}>
                  <tr>
                    <td className="mono">{fmt.dt(e.createdAt)}</td>
                    <td>{e.actorUsername ?? '—'}</td>
                    <td>
                      <span className="badge badge-muted">{e.action}</span>
                    </td>
                    <td className="mono">
                      {e.targetType ?? ''} {e.targetId ? `${e.targetId.slice(0, 8)}…` : ''}
                    </td>
                    <td className="mono">{e.ip ?? '—'}</td>
                    <td>
                      <button
                        className="btn btn-sm"
                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      >
                        {expanded === e.id ? 'Скрыть' : 'Показать'}
                      </button>
                    </td>
                  </tr>
                  {expanded === e.id ? (
                    <tr>
                      <td colSpan={6}>
                        <pre
                          className="mono"
                          style={{
                            whiteSpace: 'pre-wrap',
                            margin: 0,
                            background: '#0e0e12',
                            padding: 12,
                            borderRadius: 10,
                            border: '1px solid var(--border)',
                          }}
                        >
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
