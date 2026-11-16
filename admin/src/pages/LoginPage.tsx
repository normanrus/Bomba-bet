import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function LoginPage() {
  const { login } = useAuth();
  const { push } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      push('Добро пожаловать в админ-панель');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: '0 0 18px' }}>
          <div className="brand-mark">💥</div>
          <div>
            <div className="brand-text">БОМБА БЕТ</div>
            <div className="brand-sub">Админ-панель</div>
          </div>
        </div>

        {error ? <div className="alert alert-err">{error}</div> : null}

        <div className="field">
          <label htmlFor="u">Никнейм администратора</label>
          <input
            id="u"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="p">Пароль</label>
          <input
            id="p"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Вход…' : 'Войти'}
        </button>

        <p className="sub" style={{ marginTop: 16, textAlign: 'center' }}>
          Доступ только для владельца проекта.
        </p>
      </form>
    </div>
  );
}
