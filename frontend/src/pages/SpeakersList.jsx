import { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Plus, Edit2, Trash2, Search, Mail, Briefcase, Users, ExternalLink } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './SpeakersList.css';

/* ── Skeleton Card ───────────────────────────────────────── */
const SkeletonCard = () => (
  <div className="speaker-card card sk-card">
    <div className="sk-identity">
      <div className="sk-block sk-avatar" />
      <div className="sk-lines">
        <div className="sk-block sk-name" />
        <div className="sk-block sk-role" />
      </div>
    </div>
    <div className="sk-talk-block">
      <div className="sk-block sk-tag" />
      <div className="sk-block sk-talk-line" />
    </div>
    <div className="sk-footer">
      <div className="sk-block sk-foot-line" />
    </div>
  </div>
);

/* ── Main Component ──────────────────────────────────────── */
const SpeakersList = () => {
  const { isStaff } = useOutletContext();
  const [searchTerm, setSearchTerm]   = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [speakers, setSpeakers]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  const fetchSpeakers = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/speakers');
      if (!res.ok) throw new Error('Failed to fetch speakers');
      setSpeakers(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSpeakers(); }, []);

  const filteredSpeakers = speakers.filter(s => {
    const q = searchTerm.toLowerCase();
    const matchSearch = s.name.toLowerCase().includes(q) || s.talkTitle.toLowerCase().includes(q);
    const matchFilter = filterStatus === 'ALL' || s.status === filterStatus;
    return matchSearch && matchFilter;
  });

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this speaker?')) return;
    try {
      const res = await authFetch(`/api/speakers/${id}`, { method: 'DELETE' });
      if (res.ok) setSpeakers(prev => prev.filter(s => s.id !== id));
    } catch {
      alert('Error deleting speaker');
    }
  };

  const parseSocials = (raw) => {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  };

  const counts = {
    ALL:   speakers.length,
    LIVE:  speakers.filter(s => s.status === 'LIVE').length,
    DRAFT: speakers.filter(s => s.status === 'DRAFT').length,
  };

  return (
    <div className="speakers-page">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h2>Speakers Directory</h2>
          <p className="page-subtitle">
            {counts.ALL} speaker{counts.ALL !== 1 ? 's' : ''} · {counts.LIVE} live · {counts.DRAFT} draft
          </p>
          {error && <small className="error-hint">Backend offline — data may be stale</small>}
        </div>

        {isStaff && (
          <Link to="/speakers/new" className="add-speaker-btn">
            <span className="add-speaker-icon"><Plus size={15} strokeWidth={2.5} /></span>
            Add Speaker
          </Link>
        )}
      </div>

      {/* ── Controls ───────────────────────────────────── */}
      <div className="controls-bar card">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name or talk title…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="search-clear" onClick={() => setSearchTerm('')}>✕</button>
          )}
        </div>
        <div className="divider" />
        <div className="filter-tabs">
          {['ALL', 'LIVE', 'DRAFT'].map(s => (
            <button
              key={s}
              className={`filter-tab ${filterStatus === s ? 'active' : ''}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === 'ALL' ? 'All' : s === 'LIVE' ? 'Live' : 'Drafts'}
              <span className="tab-count">{counts[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────── */}
      {loading ? (
        <div className="speakers-grid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filteredSpeakers.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon"><Users size={22} /></div>
          <h3>{searchTerm ? 'No results found' : 'No speakers yet'}</h3>
          <p>
            {searchTerm
              ? `Nothing matches "${searchTerm}". Try a different search.`
              : 'Start building your lineup by adding the first speaker.'}
          </p>
          {!searchTerm && isStaff && (
            <Link to="/speakers/new" className="btn primary" style={{ marginTop: '0.5rem' }}>
              <Plus size={14} /> Add Speaker
            </Link>
          )}
        </div>
      ) : (
        <div className="speakers-grid">
          {filteredSpeakers.map(speaker => {
            const socials = parseSocials(speaker.socialLinks);
            return (
              <div key={speaker.id} className="speaker-card card">

                {/* ── Identity strip ─────────────────── */}
                <div className="card-identity">
                  <div className="card-avatar">
                    {speaker.imageUrl
                      ? <img src={speaker.imageUrl} alt={speaker.name} />
                      : <span className="avatar-initial">{speaker.name.charAt(0)}</span>}
                  </div>
                  <div className="card-identity-text">
                    <h3 className="card-name">{speaker.name}</h3>
                    {speaker.jobTitle && (
                      <p className="card-role">
                        <Briefcase size={11} />
                        {speaker.jobTitle}{speaker.company ? ` · ${speaker.company}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="card-header-right">
                    <span className={`status-pill ${speaker.status.toLowerCase()}`}>
                      {speaker.status}
                    </span>
                    {isStaff && (
                      <div className="card-actions">
                        <Link to={`/speakers/edit/${speaker.id}`} className="icon-btn" title="Edit">
                          <Edit2 size={13} />
                        </Link>
                        <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(speaker.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Talk block ─────────────────────── */}
                <div className="card-talk">
                  <span className="talk-eyebrow">Talk</span>
                  <p className="talk-title">{speaker.talkTitle}</p>
                </div>

                {/* ── Bio ────────────────────────────── */}
                {speaker.bio && (
                  <p className="card-bio">{speaker.bio}</p>
                )}

                {/* ── Footer ─────────────────────────── */}
                <div className="card-footer">
                  {speaker.email && (
                    <span className="footer-email">
                      <Mail size={11} />
                      {speaker.email}
                    </span>
                  )}
                  {socials.length > 0 && (
                    <div className="social-tags">
                      {socials.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="social-tag"
                          title={link.url}
                        >
                          {link.platform}
                          <ExternalLink size={9} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SpeakersList;
