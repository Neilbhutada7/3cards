import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API } from '../context/SocketContext';

export default function Login() {
  const { login } = useAuth();
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let endpoint = '/api/auth/login';
      let body = { username, password };
      if (tab === 'register') endpoint = '/api/auth/register';
      if (tab === 'guest') { endpoint = '/api/auth/guest'; body = { username }; }

      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      login(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="card login-card page-enter">
        <div className="login-logo">🃏</div>
        <h1 className="login-title">Teen Patti</h1>
        <p className="login-subtitle">Chips Manager</p>

        <div className="login-tabs">
          {['login', 'register', 'guest'].map(t => (
            <button key={t} className={`login-tab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); setError(''); }}>
              {t === 'guest' ? '👤 Guest' : t === 'register' ? '✨ Register' : '🔑 Login'}
            </button>
          ))}
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <input id="username-input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" />
          {tab !== 'guest' && (
            <input id="password-input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete={tab === 'register' ? 'new-password' : 'current-password'} />
          )}
          {error && <p style={{ color: 'var(--red)', fontSize: '0.85rem' }}>{error}</p>}
          <button id="auth-submit" className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? '...' : tab === 'guest' ? 'Play as Guest' : tab === 'register' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {tab === 'guest' && (
          <>
            <div className="login-divider">or</div>
            <p className="text-sm text-muted text-center">Guest accounts expire after 24 hours</p>
          </>
        )}
      </div>
    </div>
  );
}
