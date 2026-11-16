import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/**
 * Shown right after a freshly seeded admin logs in: the bootstrap password must
 * be replaced before the rest of the panel becomes usable.
 */
export function ForcePasswordChange() {
  const { changePassword, admin, logout } = useAuth();
  const { push } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 12) return setError('Пароль должен быть не короче 12 символов');
    if (next !== confirm) return setError('Пароли не совпадают');
    setBusy(true);
    try {
      await changePassword(undefined, next);
      push('Пароль обновлён');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1 style={{ fontSize: 20 }}>Смена пароля</h1>
        <p className="sub" style={{ marginBottom: 18 }}>
          Аккаунт <b>{admin?.username}</b> создан с временным паролем. Задайте новый пароль
          (минимум 12 символов), чтобы продолжить.
        </p>

        {error ? <div className="alert alert-err">{error}</div> : null}

        <div className="field">
          <label htmlFor="np">Новый пароль</label>
          <input
            id="np"
            className="input"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="cp">Повторите пароль</label>
          <input
            id="cp"
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <input type="hidden" value={current} onChange={(e) => setCurrent(e.target.value)} />

        <div className="row">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить пароль'}
          </button>
          <button type="button" className="btn" onClick={logout}>
            Выйти
          </button>
        </div>
      </form>
    </div>
  );
}
