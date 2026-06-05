import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, Search, MessageSquare, Calendar, Eye, MousePointerClick, Repeat } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './PopupsList.css';

/* Strip HTML tags so the card preview shows plain text, not markup. */
const stripHtml = (html) => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
};

/* Derive the real lifecycle state of a popup from its status + schedule window.
   DRAFT stays DRAFT; a PUBLISHED popup is SCHEDULED before its window, EXPIRED
   after it, and ACTIVE inside it. This is exactly what the public API computes. */
const lifecycleOf = (p, now = Date.now()) => {
  if (p.status !== 'PUBLISHED') return 'DRAFT';
  const start = p.startAt ? new Date(p.startAt).getTime() : null;
  const end   = p.endAt   ? new Date(p.endAt).getTime()   : null;
  if (start && now < start) return 'SCHEDULED';
  if (end && now > end)     return 'EXPIRED';
  return 'ACTIVE';
};

const LIFECYCLE_LABEL = {
  ACTIVE:    'Active',
  SCHEDULED: 'Scheduled',
  EXPIRED:   'Expired',
  DRAFT:     'Draft',
};

const FREQ_LABEL = {
  EVERY_VISIT:      'Every visit',
  ONCE_PER_SESSION: 'Once / session',
  ONCE_PER_DAY:     'Once / day',
  ONCE_EVER:        'Once ever',
};

/* ── Skeleton Card ───────────────────────────────────────── */
const SkeletonCard = () => (
  <div className="popup-card card sk-card">
    <div className="sk-header">
      <div className="sk-block sk-status" />
      <div className="sk-block sk-status" />
    </div>
    <div className="sk-block sk-title" />
    <div className="sk-block sk-content" />
    <div className="sk-footer"><div className="sk-block sk-foot-line" /></div>
  </div>
);

/* ── Main Component ──────────────────────────────────────── */
const PopupsList = () => {
  const [searchTerm, setSearchTerm]     = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [popups, setPopups]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  const fetchPopups = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/popups');
      if (!res.ok) throw new Error('Failed to fetch popups');
      setPopups(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPopups(); }, []);

  const withLifecycle = popups.map(p => ({ ...p, lifecycle: lifecycleOf(p) }));

  const filtered = withLifecycle.filter(p => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      p.title.toLowerCase().includes(q) ||
      stripHtml(p.body).toLowerCase().includes(q);
    const matchFilter = filterStatus === 'ALL' || p.lifecycle === filterStatus;
    return matchSearch && matchFilter;
  });

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this popup? This cannot be undone.')) return;
    try {
      const res = await authFetch(`/api/popups/${id}`, { method: 'DELETE' });
      if (res.ok) setPopups(prev => prev.filter(p => p.id !== id));
    } catch {
      alert('Error deleting popup');
    }
  };

  const counts = {
    ALL:       withLifecycle.length,
    ACTIVE:    withLifecycle.filter(p => p.lifecycle === 'ACTIVE').length,
    SCHEDULED: withLifecycle.filter(p => p.lifecycle === 'SCHEDULED').length,
    EXPIRED:   withLifecycle.filter(p => p.lifecycle === 'EXPIRED').length,
    DRAFT:     withLifecycle.filter(p => p.lifecycle === 'DRAFT').length,
  };

  const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const windowLabel = (p) => {
    if (!p.startAt && !p.endAt) return 'Always (no schedule)';
    const from = p.startAt ? formatDate(p.startAt) : 'Now';
    const to   = p.endAt   ? formatDate(p.endAt)   : 'No expiry';
    return `${from} → ${to}`;
  };

  const ctr = (p) => (p.views > 0 ? `${((p.clicks / p.views) * 100).toFixed(1)}%` : '—');

  const TABS = [
    ['ALL', 'All'],
    ['ACTIVE', 'Active'],
    ['SCHEDULED', 'Scheduled'],
    ['EXPIRED', 'Expired'],
    ['DRAFT', 'Drafts'],
  ];

  return (
    <div className="popups-page">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h2>Popups</h2>
          <p className="page-subtitle">
            {counts.ALL} popup{counts.ALL !== 1 ? 's' : ''} · {counts.ACTIVE} active · {counts.SCHEDULED} scheduled · {counts.DRAFT} draft
          </p>
          {error && <small className="error-hint">Backend offline — data may be stale</small>}
        </div>

        <Link to="/popups/new" className="add-popup-btn">
          <span className="add-popup-icon"><Plus size={15} strokeWidth={2.5} /></span>
          New Popup
        </Link>
      </div>

      {/* ── Controls ───────────────────────────────────── */}
      <div className="controls-bar card">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search by title or message…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && <button className="search-clear" onClick={() => setSearchTerm('')}>✕</button>}
        </div>
        <div className="divider" />
        <div className="filter-tabs">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={`filter-tab ${filterStatus === key ? 'active' : ''}`}
              onClick={() => setFilterStatus(key)}
            >
              {label}
              <span className="tab-count">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────── */}
      {loading ? (
        <div className="popups-grid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon"><MessageSquare size={22} /></div>
          <h3>{searchTerm ? 'No results found' : 'No popups yet'}</h3>
          <p>
            {searchTerm
              ? `Nothing matches "${searchTerm}". Try a different search.`
              : 'Create a popup to announce news, tickets, or events on the website.'}
          </p>
          {!searchTerm && (
            <Link to="/popups/new" className="btn primary" style={{ marginTop: '0.5rem' }}>
              <Plus size={14} /> New Popup
            </Link>
          )}
        </div>
      ) : (
        <div className="popups-grid">
          {filtered.map(p => (
            <div key={p.id} className="popup-card card">

              {p.imageUrl && (
                <div className="popup-card-image">
                  <img src={p.imageUrl} alt={p.title} loading="lazy"
                    onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
                </div>
              )}

              <div className="card-header">
                <span className={`status-pill ${p.lifecycle.toLowerCase()}`}>
                  {LIFECYCLE_LABEL[p.lifecycle]}
                </span>
                <div className="card-actions">
                  <Link to={`/popups/edit/${p.id}`} className="icon-btn" title="Edit">
                    <Edit2 size={13} />
                  </Link>
                  <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(p.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <h3 className="popup-title">{p.title}</h3>

              <p className="popup-body-preview">
                {(() => {
                  const text = stripHtml(p.body);
                  return text.length > 130 ? `${text.substring(0, 130)}…` : text;
                })()}
              </p>

              {p.buttonLabel && (
                <div className="popup-cta-preview" title={p.buttonUrl || ''}>
                  {p.buttonLabel}
                </div>
              )}

              {/* Stats row — impressions, clicks, CTR */}
              <div className="popup-stats">
                <span className="stat" title="Impressions"><Eye size={12} /> {p.views}</span>
                <span className="stat" title="CTA clicks"><MousePointerClick size={12} /> {p.clicks}</span>
                <span className="stat" title="Click-through rate">CTR {ctr(p)}</span>
              </div>

              <div className="card-footer">
                <span className="footer-meta"><Repeat size={11} /> {FREQ_LABEL[p.frequency] || p.frequency}</span>
                <span className="footer-meta"><Calendar size={11} /> {windowLabel(p)}</span>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PopupsList;
