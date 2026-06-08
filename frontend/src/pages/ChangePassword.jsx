import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import './Login.css';

const API = import.meta.env.VITE_API_URL ?? '';

/* Decode the JWT to know whether this is a forced change (post-reset). */
const decodeToken = () => {
  try {
    const token = localStorage.getItem('tedx_token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
};

const ChangePassword = () => {
  const navigate = useNavigate();
  const payload = decodeToken();
  const forced = payload?.mustChangePassword === true;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirm, setConfirm]                 = useState('');
  const [error, setError]                     = useState('');
  const [loading, setLoading]                 = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('tedx_token')}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (res.status === 401 && !data.error?.includes('Current password')) {
        // Token genuinely invalid/expired → back to login.
        localStorage.removeItem('tedx_token');
        navigate('/login');
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Failed to change password');
        return;
      }

      // Swap in the fresh token (mustChangePassword now false) and continue.
      if (data.token) localStorage.setItem('tedx_token', data.token);
      navigate('/dashboard');
    } catch {
      setError('Cannot reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-logo">TEDx<span>Dashboard</span></h1>
        <p className="login-subtitle">
          {forced ? 'Set a new password to continue' : 'Update your password'}
        </p>

        {forced && (
          <div className="cp-banner">
            <ShieldAlert size={16} />
            <span>Your password was reset by an administrator. Please choose a new password before continuing.</span>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="currentPassword">{forced ? 'Temporary Password' : 'Current Password'}</label>
            <input
              type="password"
              id="currentPassword"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirm">Confirm New Password</label>
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

          <button type="submit" className="primary login-btn" disabled={loading}>
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>

        {!forced && (
          <div className="login-switch">
            <button type="button" className="login-link cp-back" onClick={() => navigate(-1)}>
              <ArrowLeft size={13} /> Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangePassword;
