import { useState, useEffect } from 'react';
import {
  Users as UsersIcon, UserPlus, Check, X, KeyRound, Shield, Pencil,
  Clock, Search, Copy, CheckCircle, AlertTriangle, RefreshCw, Ban, RotateCcw,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './Users.css';

const Toast = ({ msg, type = 'success' }) => (
  <div className={`um-toast ${type}`}>
    {type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
    {msg}
  </div>
);

const STATUS_META = {
  PENDING:  { label: 'Pending',  cls: 'pending'  },
  APPROVED: { label: 'Active',   cls: 'approved' },
  REJECTED: { label: 'Blocked',  cls: 'rejected' },
};

const FILTERS = [
  { key: 'ALL',      label: 'All' },
  { key: 'PENDING',  label: 'Pending' },
  { key: 'APPROVED', label: 'Active' },
  { key: 'REJECTED', label: 'Blocked' },
];

const Users = () => {
  const [users, setUsers]       = useState([]);
  const [me, setMe]             = useState(null);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState(null);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('ALL');
  const [busyId, setBusyId]     = useState(null);

  const [showAdd, setShowAdd]   = useState(false);
  const [resetResult, setResetResult] = useState(null); // { username, tempPassword }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    authFetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then(setUsers)
      .catch(() => showToast('Failed to load users', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    authFetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => d && setMe(d)).catch(() => {});
  }, []);

  /* ── Actions ─────────────────────────────────────────────── */
  const patchUser = async (id, body, successMsg) => {
    setBusyId(id);
    try {
      const res = await authFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Update failed', 'error'); return; }
      setUsers(prev => prev.map(u => (u.id === id ? data : u)));
      if (successMsg) showToast(successMsg);
    } catch {
      showToast('Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const approve = (u) => patchUser(u.id, { status: 'APPROVED' }, `${u.username} approved`);
  const reject  = (u) => {
    if (!window.confirm(`Block ${u.username}? They will not be able to sign in.`)) return;
    patchUser(u.id, { status: 'REJECTED' }, `${u.username} blocked`);
  };
  const setRole = (u, role) => patchUser(u.id, { role }, `${u.username} is now ${role}`);

  const resetPassword = async (u) => {
    if (!window.confirm(`Reset ${u.username}'s password? They will be required to set a new one on next login.`)) return;
    setBusyId(u.id);
    try {
      const res = await authFetch(`/api/users/${u.id}/reset-password`, { method: 'POST', body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Reset failed', 'error'); return; }
      setResetResult({ username: u.username, tempPassword: data.tempPassword });
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, mustChangePassword: true } : x)));
    } catch {
      showToast('Reset failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  /* ── Derived lists ───────────────────────────────────────── */
  const term = search.trim().toLowerCase();
  const visible = users.filter(u => {
    if (filter !== 'ALL' && u.status !== filter) return false;
    if (!term) return true;
    return u.username.toLowerCase().includes(term) || (u.name || '').toLowerCase().includes(term);
  });

  const pendingCount = users.filter(u => u.status === 'PENDING').length;
  const counts = {
    total:    users.length,
    pending:  pendingCount,
    approved: users.filter(u => u.status === 'APPROVED').length,
    rejected: users.filter(u => u.status === 'REJECTED').length,
  };

  return (
    <div className="um-page">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div className="um-header">
        <div>
          <h2>User Management</h2>
          <p className="um-subtitle">Approve new accounts, manage roles, and reset passwords</p>
        </div>
        <button className="btn primary um-add-btn" onClick={() => setShowAdd(true)}>
          <UserPlus size={15} /> Add User
        </button>
      </div>

      {/* Stats */}
      <div className="um-stats">
        <div className="um-stat"><span className="um-stat-value">{counts.total}</span><span className="um-stat-label">Total</span></div>
        <div className="um-stat pending"><span className="um-stat-value">{counts.pending}</span><span className="um-stat-label">Pending</span></div>
        <div className="um-stat approved"><span className="um-stat-value">{counts.approved}</span><span className="um-stat-label">Active</span></div>
        <div className="um-stat rejected"><span className="um-stat-value">{counts.rejected}</span><span className="um-stat-label">Blocked</span></div>
      </div>

      {/* Pending banner */}
      {pendingCount > 0 && filter !== 'PENDING' && (
        <button className="um-pending-banner" onClick={() => setFilter('PENDING')}>
          <Clock size={15} />
          {pendingCount} account{pendingCount !== 1 ? 's' : ''} awaiting approval — tap to review
        </button>
      )}

      {/* Controls */}
      <div className="um-controls">
        <div className="um-search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search by username or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="um-filters">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`um-filter ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button className="um-refresh" onClick={load} disabled={loading} title="Refresh">
          <RefreshCw size={15} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="um-loading"><RefreshCw size={18} className="spinning" /> Loading users…</div>
      ) : visible.length === 0 ? (
        <div className="um-empty">
          <UsersIcon size={30} />
          <p>No users found</p>
          <span>{term || filter !== 'ALL' ? 'Try a different search or filter' : 'Users will appear here'}</span>
        </div>
      ) : (
        <div className="um-list">
          {visible.map(u => {
            const meta = STATUS_META[u.status] || STATUS_META.APPROVED;
            const isSelf = me && me.userId === u.id;
            const busy = busyId === u.id;
            return (
              <div key={u.id} className={`um-card ${u.status === 'PENDING' ? 'is-pending' : ''}`}>
                <div className="um-card-main">
                  <div className={`um-avatar ${meta.cls}`}>{u.username.charAt(0).toUpperCase()}</div>
                  <div className="um-card-info">
                    <div className="um-card-name">
                      <strong>{u.username}</strong>
                      {isSelf && <span className="um-you">You</span>}
                    </div>
                    {u.name && <span className="um-realname">{u.name}</span>}
                    <div className="um-badges">
                      <span className={`um-status ${meta.cls}`}>{meta.label}</span>
                      <span className={`um-role ${u.role}`}>{u.role === 'admin' ? '⚡ Admin' : '✏️ Editor'}</span>
                      {u.mustChangePassword && <span className="um-flag"><KeyRound size={11} /> Reset pending</span>}
                    </div>
                  </div>
                </div>

                <div className="um-card-actions">
                  {u.status === 'PENDING' && (
                    <>
                      <button className="um-act approve" disabled={busy} onClick={() => approve(u)}>
                        <Check size={14} /> Approve
                      </button>
                      <button className="um-act reject" disabled={busy} onClick={() => reject(u)}>
                        <X size={14} /> Reject
                      </button>
                    </>
                  )}

                  {u.status === 'APPROVED' && !isSelf && (
                    <>
                      <select
                        className="um-role-select"
                        value={u.role}
                        disabled={busy}
                        onChange={e => setRole(u, e.target.value)}
                        aria-label="Change role"
                      >
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="um-act subtle" disabled={busy} onClick={() => resetPassword(u)}>
                        <KeyRound size={14} /> Reset
                      </button>
                      <button className="um-act reject" disabled={busy} onClick={() => reject(u)}>
                        <Ban size={14} /> Block
                      </button>
                    </>
                  )}

                  {u.status === 'APPROVED' && isSelf && (
                    <span className="um-self-note"><Shield size={13} /> Your account</span>
                  )}

                  {u.status === 'REJECTED' && (
                    <button className="um-act approve" disabled={busy} onClick={() => approve(u)}>
                      <RotateCcw size={14} /> Reactivate
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={(u) => { setUsers(prev => [u, ...prev]); setShowAdd(false); showToast(`${u.username} created`); }}
          onError={(m) => showToast(m, 'error')}
        />
      )}

      {resetResult && (
        <ResetResultModal data={resetResult} onClose={() => setResetResult(null)} onCopied={() => showToast('Copied to clipboard')} />
      )}
    </div>
  );
};

/* ── Add-user modal ────────────────────────────────────────── */
const AddUserModal = ({ onClose, onCreated, onError }) => {
  const [username, setUsername] = useState('');
  const [name, setName]         = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState('editor');
  const [requireChange, setRequireChange] = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (username.trim().length < 3) { setError('Username must be at least 3 characters'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, name, password, role, requirePasswordChange: requireChange }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create user'); return; }
      onCreated(data);
    } catch {
      setError('Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="um-modal-overlay" onClick={onClose}>
      <div className="um-modal" onClick={e => e.stopPropagation()}>
        <div className="um-modal-header">
          <h3><UserPlus size={16} /> Add User</h3>
          <button className="um-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form className="um-modal-body" onSubmit={submit}>
          {error && <div className="um-modal-error">{error}</div>}
          <div className="um-field">
            <label>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="username" required autoComplete="off" />
          </div>
          <div className="um-field">
            <label>Full Name <span className="um-opt">(optional)</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" autoComplete="off" />
          </div>
          <div className="um-field">
            <label>Temporary Password</label>
            <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required autoComplete="off" />
          </div>
          <div className="um-field">
            <label>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <label className="um-checkbox">
            <input type="checkbox" checked={requireChange} onChange={e => setRequireChange(e.target.checked)} />
            <span>Require password change on first login</span>
          </label>
          <div className="um-modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Creating…' : 'Create User'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ── Reset-result modal (shows the one-time temp password) ──── */
const ResetResultModal = ({ data, onClose, onCopied }) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.tempPassword);
      onCopied();
    } catch { /* clipboard may be unavailable */ }
  };
  return (
    <div className="um-modal-overlay" onClick={onClose}>
      <div className="um-modal" onClick={e => e.stopPropagation()}>
        <div className="um-modal-header">
          <h3><KeyRound size={16} /> Password Reset</h3>
          <button className="um-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="um-modal-body">
          <p className="um-reset-text">
            Share this temporary password with <strong>{data.username}</strong>. They will be required to
            set a new password the next time they sign in.
          </p>
          <div className="um-temp-pass">
            <code>{data.tempPassword}</code>
            <button className="um-copy" onClick={copy} title="Copy"><Copy size={15} /></button>
          </div>
          <p className="um-reset-hint">This password is shown only once — copy it now.</p>
          <div className="um-modal-actions">
            <button className="btn primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Users;
