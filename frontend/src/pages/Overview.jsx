import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Radio, FileText, Plus, ArrowRight,
  TrendingUp, Mic, Settings, ChevronRight,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './Overview.css';

/* Decode role + username from the stored JWT */
const getUserFromToken = () => {
  try {
    const token = localStorage.getItem('tedx_token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { username: payload.username || 'User', role: payload.role || 'editor' };
  } catch {
    return null;
  }
};

/* ── Skeleton shimmer blocks ─────────────────────────────── */
const Skeleton = ({ w = '100%', h = '14px', radius = '5px', style = {} }) => (
  <div className="ov-skeleton" style={{ width: w, height: h, borderRadius: radius, ...style }} />
);

const StatCardSkeleton = () => (
  <div className="stat-card card">
    <Skeleton w="36px" h="36px" radius="8px" />
    <div style={{ flex: 1 }}>
      <Skeleton w="48px" h="28px" style={{ marginBottom: '6px' }} />
      <Skeleton w="90px" h="12px" />
    </div>
  </div>
);

/* ── Helpers ─────────────────────────────────────────────── */
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const fmt = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/* ── Component ───────────────────────────────────────────── */
const Overview = () => {
  const [speakers, setSpeakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = getUserFromToken();
  const isAdmin = user?.role === 'admin';
  const displayName = user?.username || 'there';

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/speakers');
        if (res.ok) setSpeakers(await res.json());
      } catch (err) {
        console.error('Failed to fetch speakers', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total   = speakers.length;
  const live    = speakers.filter(s => s.status === 'LIVE').length;
  const drafts  = speakers.filter(s => s.status === 'DRAFT').length;
  const recent  = [...speakers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const liveRatio = total > 0 ? Math.round((live / total) * 100) : 0;

  const stats = [
    {
      label: 'Total Speakers',
      value: total,
      icon: Users,
      accent: 'var(--text-secondary)',
      bg: 'rgba(255,255,255,0.04)',
      note: 'in your lineup',
    },
    {
      label: 'Published Live',
      value: live,
      icon: Radio,
      accent: 'var(--success)',
      bg: 'rgba(34,197,94,0.08)',
      note: `${liveRatio}% of total`,
    },
    {
      label: 'Saved as Draft',
      value: drafts,
      icon: FileText,
      accent: 'var(--warning)',
      bg: 'rgba(245,158,11,0.08)',
      note: 'pending review',
    },
  ];

  const quickActions = [
    { label: 'Add New Speaker', desc: 'Add to your lineup', icon: Mic, to: '/speakers/new', primary: true },
    { label: 'View All Speakers', desc: 'Browse & manage', icon: Users, to: '/speakers' },
    ...(isAdmin ? [{ label: 'Settings', desc: 'Configure your event', icon: Settings, to: '/settings' }] : []),
  ];

  return (
    <div className="overview-page">

      {/* ── Greeting Banner ─────────────────────────────── */}
      <div className="ov-greeting">
        <div className="ov-greeting-text">
          <h2>{getGreeting()}, {displayName}</h2>
          <p>Here's what's happening with your TEDx event today.</p>
        </div>
        <Link to="/speakers/new" className="btn primary ov-cta">
          <Plus size={16} />
          Add Speaker
        </Link>
      </div>

      {/* ── Main Body: stats + table | quick actions ────── */}
      <div className="ov-body">

        {/* Left column */}
        <div className="ov-left">

          {/* Stat Cards */}
          <div className="stats-grid">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
              : stats.map((s, i) => (
                <div key={i} className="stat-card card" style={{ '--accent': s.accent }}>
                  <div className="stat-icon-wrap" style={{ background: s.bg, color: s.accent }}>
                    <s.icon size={20} />
                  </div>
                  <div className="stat-info">
                    <span className="stat-value">{s.value}</span>
                    <span className="stat-label">{s.label}</span>
                  </div>
                  <span className="stat-note">{s.note}</span>
                </div>
              ))}
          </div>

          {/* Live ratio bar */}
          {!loading && total > 0 && (
            <div className="ov-ratio card">
              <div className="ov-ratio-header">
                <span className="ov-ratio-title">
                  <TrendingUp size={14} />
                  Publication Progress
                </span>
                <span className="ov-ratio-pct">{liveRatio}% live</span>
              </div>
              <div className="ov-ratio-track">
                <div className="ov-ratio-fill" style={{ width: `${liveRatio}%` }} />
              </div>
              <div className="ov-ratio-legend">
                <span className="legend-dot live" /><span>{live} Live</span>
                <span className="legend-dot draft" /><span>{drafts} Draft</span>
              </div>
            </div>
          )}

          {/* Recent Speakers Table */}
          <div className="ov-section">
            <div className="ov-section-header">
              <h3>Recently Added</h3>
              <Link to="/speakers" className="ov-view-all">
                View all <ArrowRight size={14} />
              </Link>
            </div>

            {loading ? (
              <div className="card ov-table-wrap">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="ov-table-skeleton-row">
                    <Skeleton w="32px" h="32px" radius="50%" />
                    <div style={{ flex: 1 }}>
                      <Skeleton w="120px" h="12px" style={{ marginBottom: '5px' }} />
                      <Skeleton w="80px" h="10px" />
                    </div>
                    <Skeleton w="140px" h="12px" />
                    <Skeleton w="52px" h="22px" radius="4px" />
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="ov-empty card">
                <div className="ov-empty-icon">
                  <Users size={24} />
                </div>
                <h4>No speakers yet</h4>
                <p>Start building your TEDx lineup by adding your first speaker.</p>
                <Link to="/speakers/new" className="btn primary" style={{ marginTop: '0.25rem' }}>
                  <Plus size={15} /> Add First Speaker
                </Link>
              </div>
            ) : (
              <div className="card ov-table-wrap">
                <table className="ov-table">
                  <thead>
                    <tr>
                      <th>Speaker</th>
                      <th>Talk</th>
                      <th>Company</th>
                      <th>Status</th>
                      <th>Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(sp => (
                      <tr key={sp.id}>
                        <td>
                          <Link to={`/speakers/edit/${sp.id}`} className="ov-speaker-cell">
                            <div className="ov-avatar">
                              {sp.imageUrl
                                ? <img src={sp.imageUrl} alt={sp.name} />
                                : <span>{sp.name.charAt(0)}</span>}
                            </div>
                            <div>
                              <div className="ov-name">{sp.name}</div>
                              {sp.jobTitle && <div className="ov-role">{sp.jobTitle}</div>}
                            </div>
                          </Link>
                        </td>
                        <td className="ov-td-talk">{sp.talkTitle}</td>
                        <td className="ov-td-muted">{sp.company || '—'}</td>
                        <td>
                          <span className={`status-pill ${sp.status.toLowerCase()}`}>
                            {sp.status}
                          </span>
                        </td>
                        <td className="ov-td-muted">{fmt(sp.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column — Quick Actions */}
        <div className="ov-right">
          <div className="ov-section-header" style={{ marginBottom: '0.75rem' }}>
            <h3>Quick Actions</h3>
          </div>
          <div className="ov-actions card">
            {quickActions.map((a, i) => (
              <Link key={i} to={a.to} className={`ov-action-item ${a.primary ? 'primary-action' : ''}`}>
                <div className="ov-action-icon" style={a.primary ? { background: 'rgba(230,43,30,0.12)', color: 'var(--ted-red)' } : {}}>
                  <a.icon size={18} />
                </div>
                <div className="ov-action-text">
                  <span className="ov-action-label">{a.label}</span>
                  <span className="ov-action-desc">{a.desc}</span>
                </div>
                <ChevronRight size={15} className="ov-action-arrow" />
              </Link>
            ))}
          </div>

          {/* Event snapshot */}
          {!loading && (
            <div className="ov-snapshot card">
              <p className="ov-snapshot-title">Event Snapshot</p>
              <div className="ov-snapshot-rows">
                <div className="ov-snapshot-row">
                  <span>Total Speakers</span>
                  <strong>{total}</strong>
                </div>
                <div className="ov-snapshot-row">
                  <span>Live</span>
                  <strong style={{ color: 'var(--success)' }}>{live}</strong>
                </div>
                <div className="ov-snapshot-row">
                  <span>Drafts</span>
                  <strong style={{ color: 'var(--warning)' }}>{drafts}</strong>
                </div>
                <div className="ov-snapshot-row">
                  <span>Completion</span>
                  <strong>{liveRatio}%</strong>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Overview;
