import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/', label: 'Обзор', icon: '📊', end: true },
  { to: '/users', label: 'Пользователи', icon: '👥' },
  { to: '/events', label: 'События', icon: '🏟️' },
  { to: '/prizes', label: 'Призы', icon: '🎁' },
  { to: '/settings', label: 'Настройки', icon: '⚙️' },
  { to: '/audit', label: 'Журнал', icon: '🧾' },
];

export function Layout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">💥</div>
          <div>
            <div className="brand-text">БОМБА БЕТ</div>
            <div className="brand-sub">Админ-панель</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: 26, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div className="sub" style={{ marginBottom: 10 }}>
            {admin?.username}
          </div>
          <button
            className="btn btn-sm"
            style={{ width: '100%' }}
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Выйти
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
