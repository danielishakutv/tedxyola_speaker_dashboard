import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

const API = import.meta.env.VITE_API_URL ?? '';

const Login = () => {
  const [mode, setMode]         = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [name, setName]         = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [teamId, setTeamId]     = useState('');
  const [teams, setTeams]       = useState([]);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  // Load the public team list so registrants can pick a team.
  useEffect(() => {
    fetch(`${API}/api/public/teams`)
      .then(r => (r.ok ? r.json() : []))
      .then(data => Array.isArray(data) && setTeams(data))
      .catch(() => {});
  }, []);

  const resetMessages = () => { setError(''); setNotice(''); };

  const switchMode = (next) => {
    resetMessages();
    setPassword('');
    setConfirm('');
    setMode(next);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid credentials');
        return;
      }

      localStorage.setItem('tedx_token', data.token);
      // Admin reset this password → force a change before anything else.
      navigate(data.mustChangePassword ? '/change-password' : '/dashboard');
    } catch {
      setError('Cannot reach the server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    resetMessages();

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, password, teamId: teamId || null }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      // Success — bounce back to the sign-in view with a pending-approval notice.
      setMode('login');
      setPassword('');
      setConfirm('');
      setNotice(data.message || 'Account created. An administrator must approve it before you can sign in.');
    } catch {
      setError('Cannot reach the server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const isRegister = mode === 'register';

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-logo">TEDx<span>Dashboard</span></h1>
        <p className="login-subtitle">
          {isRegister ? 'Request access to the platform' : 'Sign in to manage your speakers'}
        </p>

        {/* Mode toggle */}
        <div className="login-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`login-tab ${!isRegister ? 'active' : ''}`}
            onClick={() => switchMode('login')}
            aria-selected={!isRegister}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            className={`login-tab ${isRegister ? 'active' : ''}`}
            onClick={() => switchMode('register')}
            aria-selected={isRegister}
          >
            Create Account
          </button>
        </div>

        <form className="login-form" onSubmit={isRegister ? handleRegister : handleLogin}>
          {error  && <div className="error-message">{error}</div>}
          {notice && <div className="notice-message">{notice}</div>}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="yourname"
              required
              autoComplete="username"
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label htmlFor="name">Full Name <span className="optional">(optional)</span></label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>
          )}

          {isRegister && teams.length > 0 && (
            <div className="form-group">
              <label htmlFor="team">Team <span className="optional">(optional)</span></label>
              <select id="team" value={teamId} onChange={e => setTeamId(e.target.value)}>
                <option value="">Select a team (or decide later)</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label htmlFor="confirm">Confirm Password</label>
              <input
                type="password"
                id="confirm"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
          )}

          <button type="submit" className="primary login-btn" disabled={loading}>
            {loading
              ? (isRegister ? 'Creating account…' : 'Signing in…')
              : (isRegister ? 'Create Account' : 'Access Dashboard')}
          </button>
        </form>

        <div className="login-switch">
          {isRegister ? (
            <>Already have an account?{' '}
              <button type="button" className="login-link" onClick={() => switchMode('login')}>Sign in</button>
            </>
          ) : (
            <>Don't have an account?{' '}
              <button type="button" className="login-link" onClick={() => switchMode('register')}>Create one</button>
            </>
          )}
        </div>

        <div className="login-footer">
          TEDx Speaker Management System
        </div>
      </div>
    </div>
  );
};

export default Login;
