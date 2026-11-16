import type { ReactNode } from 'react';

export function Badge({ status }: { status: string }) {
  const cls = `badge badge-${status}`;
  const labels: Record<string, string> = {
    pending: 'Ожидает',
    approved: 'Одобрен',
    issued: 'Выдан',
    rejected: 'Отклонён',
    cancelled: 'Отменён',
    won: 'Выиграл',
    lost: 'Проиграл',
    void: 'Возврат',
    upcoming: 'Предстоящий',
    live: 'В игре',
    finished: 'Завершён',
    active: 'Активен',
    blocked: 'Заблокирован',
  };
  return <span className={cls}>{labels[status] ?? status}</span>;
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn btn-sm" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

export const fmt = {
  num: (n: number) => new Intl.NumberFormat('ru-RU').format(n),
  dt: (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—',
  date: (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('ru-RU') : '—',
};

export function Avatar({ seed, url, size = 34 }: { seed: string; url: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: '50%', objectFit: 'cover' }}
      />
    );
  }
  // Deterministic colour from the seed, so each user looks consistent.
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 45) % 360} 75% 40%))`,
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: size * 0.4,
        flex: '0 0 auto',
      }}
    >
      {seed.slice(0, 1).toUpperCase()}
    </div>
  );
}
