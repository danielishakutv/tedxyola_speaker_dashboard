import { useState, useEffect } from 'react';
import {
  Users as UsersIcon, Plus, Pencil, Trash2, X, Hash, ChevronDown, ChevronUp,
  RefreshCw, CheckCircle, AlertTriangle, MessageSquare,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './Teams.css';

const Toast = ({ msg, type = 'success' }) => (
  <div className={`tm-toast ${type}`}>
    {type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
    {msg}
  </div>
);

const Teams = () => {
  const [teams, setTeams]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);     // team being edited, or null
  const [expandedId, setExpandedId] = useState(null);
  const [members, setMembers] = useState({});         // teamId -> member array

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    authFetch('/api/teams')
      .then(r => (r.ok ? r.json() : []))
      .then(setTeams)
      .catch(() => showToast('Failed to load teams', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleMembers = async (team) => {
    if (expandedId === team.id) { setExpandedId(null); return; }
    setExpandedId(team.id);
    if (!members[team.id]) {
      try {
        const res = await authFetch(`/api/teams/${team.id}/members`);
        const data = res.ok ? await res.json() : [];
        setMembers(prev => ({ ...prev, [team.id]: data }));
      } catch {
        setMembers(prev => ({ ...prev, [team.id]: [] }));
      }
    }
  };

  const handleDelete = async (team) => {
    if (!window.confirm(`Delete team "${team.name}"? Members will be unassigned. The team's forum room is kept if it has messages.`)) return;
    try {
      const res = await authFetch(`/api/teams/${team.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); showToast(d.error || 'Delete failed', 'error'); return; }
      setTeams(prev => prev.filter(t => t.id !== team.id));
      showToast(`Team "${team.name}" deleted`);
    } catch {
      showToast('Delete failed', 'error');
    }
  };

  const onSaved = (team, isEdit) => {
    if (isEdit) setTeams(prev => prev.map(t => (t.id === team.id ? { ...t, ...team } : t)));
    else        setTeams(prev => [...prev, { ...team, memberCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
    setShowForm(false);
    setEditing(null);
    showToast(isEdit ? 'Team updated' : `Team "${team.name}" created`);
  };

  const totalMembers = teams.reduce((sum, t) => sum + (t.memberCount || 0), 0);

  return (
    <div className="tm-page">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div className="tm-header">
        <div>
          <h2>Teams</h2>
          <p className="tm-subtitle">Organise volunteers into teams. Each team gets its own forum room.</p>
        </div>
        <button className="btn primary tm-add-btn" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus size={15} /> New Team
        </button>
      </div>

      <div className="tm-stats">
        <div className="tm-stat"><span className="tm-stat-value">{teams.length}</span><span className="tm-stat-label">Teams</span></div>
        <div className="tm-stat"><span className="tm-stat-value">{totalMembers}</span><span className="tm-stat-label">Assigned members</span></div>
      </div>

      {loading ? (
        <div className="tm-loading"><RefreshCw size={18} className="spinning" /> Loading teams…</div>
      ) : teams.length === 0 ? (
        <div className="tm-empty">
          <UsersIcon size={30} />
          <p>No teams yet</p>
          <span>Create your first team to group volunteers and give them a forum.</span>
          <button className="btn primary" style={{ marginTop: '0.75rem' }} onClick={() => setShowForm(true)}>
            <Plus size={14} /> New Team
          </button>
        </div>
      ) : (
        <div className="tm-list">
          {teams.map(team => {
            const expanded = expandedId === team.id;
            const mem = members[team.id];
            return (
              <div key={team.id} className="tm-card">
                <div className="tm-card-main">
                  <div className="tm-card-info">
                    <div className="tm-card-title">
                      <Hash size={16} />
                      <strong>{team.name}</strong>
                    </div>
                    {team.description && <p className="tm-card-desc">{team.description}</p>}
                    <div className="tm-card-meta">
                      <button className="tm-meta-pill" onClick={() => toggleMembers(team)}>
                        <UsersIcon size={12} />
                        {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {team.roomId && <span className="tm-meta-pill static"><MessageSquare size={12} /> Forum room</span>}
                    </div>
                  </div>
                  <div className="tm-card-actions">
                    <button className="tm-icon" title="Edit" onClick={() => { setEditing(team); setShowForm(true); }}>
                      <Pencil size={14} />
                    </button>
                    <button className="tm-icon danger" title="Delete" onClick={() => handleDelete(team)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="tm-members">
                    {mem === undefined ? (
                      <div className="tm-members-loading"><RefreshCw size={13} className="spinning" /> Loading…</div>
                    ) : mem.length === 0 ? (
                      <p className="tm-members-empty">No members assigned yet.</p>
                    ) : (
                      <ul className="tm-member-list">
                        {mem.map(u => (
                          <li key={u.id}>
                            <span className="tm-member-avatar">{u.username.charAt(0).toUpperCase()}</span>
                            <span className="tm-member-name">{u.name || u.username}</span>
                            <span className={`tm-member-role ${u.role}`}>{u.role}</span>
                            {u.status !== 'APPROVED' && <span className="tm-member-status">{u.status.toLowerCase()}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <TeamFormModal
          team={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={onSaved}
          onError={(m) => showToast(m, 'error')}
        />
      )}
    </div>
  );
};

/* ── Create / edit team modal ──────────────────────────────── */
const TeamFormModal = ({ team, onClose, onSaved, onError }) => {
  const isEdit = !!team;
  const [name, setName]         = useState(team?.name || '');
  const [description, setDesc]  = useState(team?.description || '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Team name is required'); return; }
    setSaving(true);
    try {
      const res = await authFetch(isEdit ? `/api/teams/${team.id}` : '/api/teams', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Save failed'); return; }
      onSaved(data, isEdit);
    } catch {
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal" onClick={e => e.stopPropagation()}>
        <div className="tm-modal-header">
          <h3>{isEdit ? 'Edit Team' : 'New Team'}</h3>
          <button className="tm-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form className="tm-modal-body" onSubmit={submit}>
          {error && <div className="tm-modal-error">{error}</div>}
          <div className="tm-field">
            <label>Team Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Logistics" required autoFocus />
          </div>
          <div className="tm-field">
            <label>Description <span className="tm-opt">(optional)</span></label>
            <textarea value={description} onChange={e => setDesc(e.target.value)} placeholder="What this team does…" rows={3} />
          </div>
          {!isEdit && (
            <p className="tm-form-hint">A forum room for this team is created automatically, and members are added to it when approved.</p>
          )}
          <div className="tm-modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Save' : 'Create Team')}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Teams;
