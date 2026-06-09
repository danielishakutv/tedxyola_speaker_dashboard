import { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Plus, Edit2, Trash2, Search, Building, ExternalLink, Users } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './SponsorsList.css';

/* ── Skeleton Card ───────────────────────────────────────── */
const SkeletonCard = () => (
  <div className="sponsor-card card sk-card">
    <div className="sk-identity">
      <div className="sk-block sk-avatar" />
      <div className="sk-lines">
        <div className="sk-block sk-name" />
        <div className="sk-block sk-role" />
      </div>
    </div>
    <div className="sk-talk-block">
      <div className="sk-block sk-talk-line" />
    </div>
    <div className="sk-footer">
      <div className="sk-block sk-foot-line" />
    </div>
  </div>
);

/* ── Main Component ──────────────────────────────────────── */
const SponsorsList = () => {
  const { isStaff } = useOutletContext();
  const [searchTerm, setSearchTerm]   = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [sponsors, setSponsors]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  const fetchSponsors = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/sponsors');
      if (!res.ok) throw new Error('Failed to fetch sponsors');
      setSponsors(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSponsors(); }, []);

  const filteredSponsors = sponsors.filter(s => {
    const q = searchTerm.toLowerCase();
    const matchSearch = s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q);
    const matchFilter = filterStatus === 'ALL' || s.status === filterStatus;
    return matchSearch && matchFilter;
  });

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this sponsor?')) return;
    try {
      const res = await authFetch(`/api/sponsors/${id}`, { method: 'DELETE' });
      if (res.ok) setSponsors(prev => prev.filter(s => s.id !== id));
    } catch {
      alert('Error deleting sponsor');
    }
  };

  const counts = {
    ALL:   sponsors.length,
    LIVE:  sponsors.filter(s => s.status === 'LIVE').length,
    DRAFT: sponsors.filter(s => s.status === 'DRAFT').length,
  };

  return (
    <div className="sponsors-page">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h2>Sponsors Directory</h2>
          <p className="page-subtitle">
            {counts.ALL} sponsor{counts.ALL !== 1 ? 's' : ''} · {counts.LIVE} live · {counts.DRAFT} draft
          </p>
          {error && <small className="error-hint">Backend offline — data may be stale</small>}
        </div>

        {isStaff && (
          <Link to="/sponsors/new" className="add-sponsor-btn">
            <span className="add-sponsor-icon"><Plus size={15} strokeWidth={2.5} /></span>
            Add Sponsor
          </Link>
        )}
      </div>

      {/* ── Controls ───────────────────────────────────── */}
      <div className="controls-bar card">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name or description…"
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
        <div className="sponsors-grid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filteredSponsors.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon"><Building size={22} /></div>
          <h3>{searchTerm ? 'No results found' : 'No sponsors yet'}</h3>
          <p>
            {searchTerm
              ? `Nothing matches "${searchTerm}". Try a different search.`
              : 'Start building your sponsors list by adding the first sponsor.'}
          </p>
          {!searchTerm && isStaff && (
            <Link to="/sponsors/new" className="btn primary" style={{ marginTop: '0.5rem' }}>
              <Plus size={14} /> Add Sponsor
            </Link>
          )}
        </div>
      ) : (
        <div className="sponsors-grid">
          {filteredSponsors.map(sponsor => (
            <div key={sponsor.id} className="sponsor-card card">

              {/* ── Identity strip ─────────────────── */}
              <div className="card-identity">
                <div className="card-avatar">
                  {sponsor.imageUrl
                    ? <img src={sponsor.imageUrl} alt={sponsor.name} />
                    : <span className="avatar-initial"><Building size={20} /></span>}
                </div>
                <div className="card-identity-text">
                  <h3 className="card-name">{sponsor.name}</h3>
                </div>
                <div className="card-header-right">
                  <span className={`status-pill ${sponsor.status.toLowerCase()}`}>
                    {sponsor.status}
                  </span>
                  {isStaff && (
                    <div className="card-actions">
                      <Link to={`/sponsors/edit/${sponsor.id}`} className="icon-btn" title="Edit">
                        <Edit2 size={13} />
                      </Link>
                      <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(sponsor.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Description ────────────────────── */}
              {sponsor.description && (
                <p className="card-description">{sponsor.description}</p>
              )}

              {/* ── Footer ─────────────────────────── */}
              <div className="card-footer">
                {sponsor.website && (
                  <a
                    href={sponsor.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer-link"
                  >
                    Visit website
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SponsorsList;
