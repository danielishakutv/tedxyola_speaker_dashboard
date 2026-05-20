import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, RefreshCw, LogOut, CheckCircle, AlertTriangle } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './Settings.css';

const Toast = ({ msg, type = 'success' }) => (
  <div className={`st-toast ${type}`}>
    {type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
    {msg}
  </div>
);

const Settings = () => {
  const navigate = useNavigate();

  const [apiStatus, setApiStatus] = useState('checking');
  const [checking,  setChecking]  = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [toast,     setToast]     = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const checkApi = () => {
    setChecking(true);
    setApiStatus('checking');
    authFetch('/api/speakers')
      .then(r => setApiStatus(r.ok ? 'online' : 'error'))
      .catch(() => setApiStatus('offline'))
      .finally(() => setChecking(false));
  };

  useEffect(() => {
    checkApi();
    // Fetch current admin info from token
    authFetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAdminUser(data); })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('tedx_token');
    navigate('/login');
  };

  const statusLabel = { online: 'Online', offline: 'Offline', error: 'Error', checking: 'Checking…' };
  const statusClass = { online: 'online', offline: 'offline', error: 'offline', checking: 'checking' };

  return (
    <div className="settings-page">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div className="st-header">
        <h2>Settings</h2>
        <p className="st-subtitle">System status and account information</p>
      </div>

      <div className="st-layout">

        {/* ── System Status ────────────────────────────── */}
        <section className="st-card card">
          <div className="st-card-header">
            <div className="st-card-icon"><Server size={16} /></div>
            <div>
              <h3>System</h3>
              <p>Backend and infrastructure status</p>
            </div>
          </div>

          <div className="st-info-list">
            <div className="st-info-row">
              <span className="st-info-label">API Status</span>
              <span className={`st-status-badge ${statusClass[apiStatus]}`}>
                <span className="st-dot" />
                {statusLabel[apiStatus]}
              </span>
            </div>
            <div className="st-info-row">
              <span className="st-info-label">API Endpoint</span>
              <code className="st-code">localhost:5000</code>
            </div>
            <div className="st-info-row">
              <span className="st-info-label">Authentication</span>
              <code className="st-code">JWT · 7d expiry</code>
            </div>
            <div className="st-info-row">
              <span className="st-info-label">Database</span>
              <code className="st-code">SQLite · Prisma</code>
            </div>
            <div className="st-info-row">
              <span className="st-info-label">Image Storage</span>
              <code className="st-code">Cloudinary</code>
            </div>
            <div className="st-info-row">
              <span className="st-info-label">Frontend</span>
              <code className="st-code">React · Vite</code>
            </div>
          </div>

          <div className="st-card-action">
            <button
              className="btn secondary st-refresh-btn"
              onClick={checkApi}
              disabled={checking}
            >
              <RefreshCw size={13} className={checking ? 'spinning' : ''} />
              {checking ? 'Checking…' : 'Re-check Connection'}
            </button>
          </div>
        </section>

        {/* ── Account ──────────────────────────────────── */}
        <section className="st-card card">
          <div className="st-card-header">
            <div className="st-card-icon"><LogOut size={16} /></div>
            <div>
              <h3>Account</h3>
              <p>Current session information</p>
            </div>
          </div>

          <div className="st-info-list">
            <div className="st-info-row">
              <span className="st-info-label">Logged in as</span>
              <code className="st-code">{adminUser?.username ?? '—'}</code>
            </div>
            <div className="st-info-row">
              <span className="st-info-label">Role</span>
              <code className="st-code">{adminUser?.role ?? '—'}</code>
            </div>
            <div className="st-info-row">
              <span className="st-info-label">Session</span>
              <code className="st-code">JWT · localStorage</code>
            </div>
          </div>

          <div className="st-card-action">
            <button className="st-logout-btn" onClick={handleLogout}>
              <LogOut size={13} />
              Sign Out
            </button>
          </div>
        </section>

      </div>
    </div>
  );
};

export default Settings;
