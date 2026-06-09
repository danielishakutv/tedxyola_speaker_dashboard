import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, RefreshCw, LogOut, CheckCircle, AlertTriangle,
  Activity, LogIn, Plus, Edit2, Trash2, Clock, User, Shield,
  ChevronDown, ChevronUp, Filter, Calendar,
  UserCog, KeyRound, UserPlus, UserCheck, UserX
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './Settings.css';

const Toast = ({ msg, type = 'success' }) => (
  <div className={`st-toast ${type}`}>
    {type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
    {msg}
  </div>
);

/* ── Action config map ─────────────────────────────────────── */
const ACTION_CONFIG = {
  LOGIN:          { label: 'Logged in',       color: 'blue',   icon: LogIn  },
  CREATE_SPEAKER: { label: 'Added speaker',   color: 'green',  icon: Plus   },
  UPDATE_SPEAKER: { label: 'Updated speaker', color: 'yellow', icon: Edit2  },
  DELETE_SPEAKER: { label: 'Deleted speaker', color: 'red',    icon: Trash2 },
  UPLOAD_MEDIA:   { label: 'Uploaded image',  color: 'green',  icon: Plus   },
  DELETE_MEDIA:   { label: 'Deleted image',   color: 'red',    icon: Trash2 },
  REGISTER:        { label: 'Registered',      color: 'blue',   icon: UserPlus  },
  CREATE_USER:     { label: 'Created user',     color: 'green',  icon: UserPlus  },
  APPROVE_USER:    { label: 'Approved user',    color: 'green',  icon: UserCheck },
  REJECT_USER:     { label: 'Blocked user',     color: 'red',    icon: UserX     },
  UPDATE_USER_ROLE:{ label: 'Changed role',     color: 'yellow', icon: Shield    },
  UPDATE_USER:     { label: 'Updated user',     color: 'yellow', icon: Edit2     },
  RESET_PASSWORD:  { label: 'Reset password',   color: 'yellow', icon: KeyRound  },
  CHANGE_PASSWORD: { label: 'Changed password', color: 'blue',   icon: KeyRound  },
};

const getActionConfig = (action) =>
  ACTION_CONFIG[action] ?? { label: action, color: 'gray', icon: Activity };

/* ── Member permission toggles ─────────────────────────────── */
const MEMBER_PERM_CONFIG = [
  { key: 'viewContent', label: 'View content',      desc: 'See speakers, sponsors, and blogs (read-only).' },
  { key: 'manageLinks', label: 'Create Links & QR', desc: 'Generate short links and QR codes.' },
  { key: 'forum',       label: 'Forum access',      desc: 'Participate in the general and team forums.' },
  { key: 'uploadMedia', label: 'Upload media',      desc: 'Add images to the shared media library.' },
];

const Settings = () => {
  const navigate = useNavigate();

  const [apiStatus,         setApiStatus]         = useState('checking');
  const [checking,          setChecking]           = useState(false);
  const [adminUser,         setAdminUser]          = useState(null);
  const [toast,             setToast]              = useState(null);
  const [activities,        setActivities]         = useState([]);
  const [loadingActivities, setLoadingActivities]  = useState(false);
  const [filterAction,      setFilterAction]       = useState('ALL');
  const [filterDate,        setFilterDate]         = useState('ALL');
  const [expandedId,        setExpandedId]         = useState(null);
  const [memberPerms,       setMemberPerms]        = useState(null);
  const [savingPerms,       setSavingPerms]        = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const togglePerm = async (key) => {
    if (!memberPerms || savingPerms) return;
    const prev = memberPerms;
    const next = { ...memberPerms, [key]: !memberPerms[key] };
    setMemberPerms(next);          // optimistic
    setSavingPerms(true);
    try {
      const res = await authFetch('/api/settings/member-permissions', {
        method: 'PUT', body: JSON.stringify(next),
      });
      if (!res.ok) { setMemberPerms(prev); showToast('Failed to save permissions', 'error'); return; }
      setMemberPerms(await res.json());
      showToast('Member permissions updated');
    } catch {
      setMemberPerms(prev);
      showToast('Failed to save permissions', 'error');
    } finally {
      setSavingPerms(false);
    }
  };

  const checkApi = () => {
    setChecking(true);
    setApiStatus('checking');
    authFetch('/api/speakers')
      .then(r => setApiStatus(r.ok ? 'online' : 'error'))
      .catch(() => setApiStatus('offline'))
      .finally(() => setChecking(false));
  };

  const fetchActivities = () => {
    setLoadingActivities(true);
    authFetch('/api/activities?limit=100')
      .then(r => r.ok ? r.json() : [])
      .then(data => setActivities(data))
      .catch(() => setActivities([]))
      .finally(() => setLoadingActivities(false));
  };

  useEffect(() => {
    checkApi();
    fetchActivities();
    authFetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAdminUser(data); })
      .catch(() => {});
    authFetch('/api/settings/member-permissions')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setMemberPerms(data); })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('tedx_token');
    navigate('/login');
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatFullDate = (timestamp) =>
    new Date(timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  const statusLabel = { online: 'Online', offline: 'Offline', error: 'Error', checking: 'Checking…' };
  const statusClass = { online: 'online', offline: 'offline', error: 'offline', checking: 'checking' };

  /* ── Date filter cutoff ─────────────────────────────────── */
  const getDateCutoff = () => {
    const now = new Date();
    if (filterDate === 'TODAY') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    if (filterDate === '7D') return new Date(now - 7 * 24 * 60 * 60 * 1000);
    if (filterDate === '30D') return new Date(now - 30 * 24 * 60 * 60 * 1000);
    return null; // ALL
  };

  /* ── Filtered activities ─────────────────────────────────── */
  const cutoff = getDateCutoff();
  const filtered = activities
    .filter(a => filterAction === 'ALL' || a.action === filterAction)
    .filter(a => !cutoff || new Date(a.timestamp) >= cutoff);

  /* ── Stats for the log header ────────────────────────────── */
  const logStats = {
    total:   activities.length,
    logins:  activities.filter(a => a.action === 'LOGIN').length,
    creates: activities.filter(a => a.action === 'CREATE_SPEAKER').length,
    updates: activities.filter(a => a.action === 'UPDATE_SPEAKER').length,
    deletes: activities.filter(a => a.action === 'DELETE_SPEAKER').length,
  };

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
            <div className="st-card-icon"><Shield size={16} /></div>
            <div>
              <h3>Account</h3>
              <p>Current session information</p>
            </div>
          </div>

          <div className="st-info-list">
            <div className="st-info-row">
              <span className="st-info-label">Logged in as</span>
              <div className="st-user-cell">
                <div className="st-user-avatar">{adminUser?.username?.charAt(0).toUpperCase() ?? '?'}</div>
                <code className="st-code">{adminUser?.username ?? '—'}</code>
              </div>
            </div>
            <div className="st-info-row">
              <span className="st-info-label">Role</span>
              <span className={`st-role-badge ${adminUser?.role ?? 'editor'}`}>
                {adminUser?.role === 'admin' ? '⚡ Admin' : '✏️ Editor'}
              </span>
            </div>
            <div className="st-info-row">
              <span className="st-info-label">Session</span>
              <code className="st-code">JWT · localStorage</code>
            </div>
          </div>

          <div className="st-card-action st-account-actions">
            {adminUser?.role === 'admin' && (
              <button className="btn secondary st-account-btn" onClick={() => navigate('/users')}>
                <UserCog size={13} />
                Manage Users
              </button>
            )}
            <button className="btn secondary st-account-btn" onClick={() => navigate('/change-password')}>
              <KeyRound size={13} />
              Change Password
            </button>
            <button className="st-logout-btn" onClick={handleLogout}>
              <LogOut size={13} />
              Sign Out
            </button>
          </div>
        </section>

      </div>

      {/* ══════════════════════════════════════════════════════
          MEMBER PERMISSIONS — what general members are allowed to do
          ══════════════════════════════════════════════════════ */}
      <section className="st-card card st-perms-section">
        <div className="st-card-header">
          <div className="st-card-icon"><UserCog size={16} /></div>
          <div>
            <h3>Member Permissions</h3>
            <p>Control what general members (volunteers) can do. Applies to all members; takes effect immediately.</p>
          </div>
        </div>

        <div className="st-perm-list">
          {memberPerms === null ? (
            <div className="st-logs-loading"><RefreshCw size={16} className="spinning" /> <span>Loading…</span></div>
          ) : (
            MEMBER_PERM_CONFIG.map(({ key, label, desc }) => (
              <div className="st-perm-row" key={key}>
                <div className="st-perm-text">
                  <span className="st-perm-label">{label}</span>
                  <span className="st-perm-desc">{desc}</span>
                </div>
                <button
                  type="button"
                  className={`st-switch ${memberPerms[key] ? 'on' : ''}`}
                  onClick={() => togglePerm(key)}
                  disabled={savingPerms}
                  role="switch"
                  aria-checked={!!memberPerms[key]}
                  aria-label={label}
                >
                  <span className="st-switch-knob" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          AUDIT LOG — full-width, rich UI
          ══════════════════════════════════════════════════════ */}
      <section className="st-card card st-logs-section">

        {/* Header row */}
        <div className="st-logs-header">
          <div className="st-logs-title-group">
            <div className="st-card-icon"><Activity size={16} /></div>
            <div>
              <h3>Audit Log</h3>
              <p>Full history of actions performed in the dashboard</p>
            </div>
          </div>
          <button
            className="st-refresh-logs-btn"
            onClick={fetchActivities}
            disabled={loadingActivities}
            title="Refresh logs"
          >
            <RefreshCw size={14} className={loadingActivities ? 'spinning' : ''} />
            Refresh
          </button>
        </div>

        {/* Stats strip */}
        <div className="st-log-stats">
          <div className="st-log-stat">
            <span className="st-log-stat-value">{logStats.total}</span>
            <span className="st-log-stat-label">Total Events</span>
          </div>
          <div className="st-log-stat blue">
            <span className="st-log-stat-value">{logStats.logins}</span>
            <span className="st-log-stat-label">Logins</span>
          </div>
          <div className="st-log-stat green">
            <span className="st-log-stat-value">{logStats.creates}</span>
            <span className="st-log-stat-label">Created</span>
          </div>
          <div className="st-log-stat yellow">
            <span className="st-log-stat-value">{logStats.updates}</span>
            <span className="st-log-stat-label">Updated</span>
          </div>
          <div className="st-log-stat red">
            <span className="st-log-stat-value">{logStats.deletes}</span>
            <span className="st-log-stat-label">Deleted</span>
          </div>
        </div>

        {/* Action filter bar */}
        <div className="st-log-filters">
          <Filter size={13} className="st-filter-icon" />
          {['ALL', 'LOGIN', 'CREATE_SPEAKER', 'UPDATE_SPEAKER', 'DELETE_SPEAKER', 'UPLOAD_MEDIA', 'DELETE_MEDIA'].map(f => (
            <button
              key={f}
              className={`st-filter-btn ${filterAction === f ? 'active' : ''} ${f !== 'ALL' ? getActionConfig(f).color : ''}`}
              onClick={() => setFilterAction(f)}
            >
              {f === 'ALL' ? 'All Events' : getActionConfig(f).label}
            </button>
          ))}
        </div>

        {/* Date filter bar */}
        <div className="st-log-filters st-date-filters">
          <Calendar size={13} className="st-filter-icon" />
          {[
            { key: 'ALL',   label: 'All time' },
            { key: 'TODAY', label: 'Today' },
            { key: '7D',    label: 'Last 7 days' },
            { key: '30D',   label: 'Last 30 days' },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`st-filter-btn ${filterDate === key ? 'active' : ''}`}
              onClick={() => setFilterDate(key)}
            >
              {label}
            </button>
          ))}
          <span className="st-filter-count">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Log entries */}
        <div className="st-logs-list">
          {loadingActivities ? (
            <div className="st-logs-loading">
              <RefreshCw size={18} className="spinning" />
              <span>Loading activity log…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="st-empty-logs">
              <Activity size={28} />
              <p>No events found</p>
              <span>{filterAction !== 'ALL' ? 'Try a different filter' : 'Actions will appear here as they happen'}</span>
            </div>
          ) : (
            filtered.map((activity) => {
              const details = activity.details ? JSON.parse(activity.details) : {};
              const cfg = getActionConfig(activity.action);
              const Icon = cfg.icon;
              const isExpanded = expandedId === activity.id;

              return (
                <div
                  key={activity.id}
                  className={`st-log-entry ${cfg.color} ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                >
                  {/* Color accent bar */}
                  <div className="st-log-accent" />

                  {/* Icon */}
                  <div className={`st-log-icon-wrap ${cfg.color}`}>
                    <Icon size={15} />
                  </div>

                  {/* Main content */}
                  <div className="st-log-body">
                    <div className="st-log-main-row">
                      <div className="st-log-left">
                        <span className={`st-log-action-badge ${cfg.color}`}>{cfg.label}</span>
                        <div className="st-log-who">
                          <User size={11} />
                          <strong>{activity.user.username}</strong>
                        </div>
                        {details.speakerName && (
                          <span className="st-log-subject">"{details.speakerName}"</span>
                        )}
                      </div>
                      <div className="st-log-right">
                        <div className="st-log-time-wrap">
                          <Clock size={11} />
                          <span className="st-log-time-rel">{formatTime(activity.timestamp)}</span>
                        </div>
                        <span className="st-log-expand-icon">
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </span>
                      </div>
                    </div>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <div className="st-log-detail-panel">
                        <div className="st-log-detail-row">
                          <span>Timestamp</span>
                          <code>{formatFullDate(activity.timestamp)}</code>
                        </div>
                        <div className="st-log-detail-row">
                          <span>Action</span>
                          <code>{activity.action}</code>
                        </div>
                        <div className="st-log-detail-row">
                          <span>User</span>
                          <code>{activity.user.username}</code>
                        </div>
                        {details.speakerId && (
                          <div className="st-log-detail-row">
                            <span>Speaker ID</span>
                            <code>{details.speakerId}</code>
                          </div>
                        )}
                        {details.speakerName && (
                          <div className="st-log-detail-row">
                            <span>Speaker Name</span>
                            <code>{details.speakerName}</code>
                          </div>
                        )}
                        {details.timestamp && (
                          <div className="st-log-detail-row">
                            <span>Event Time</span>
                            <code>{details.timestamp}</code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};

export default Settings;
