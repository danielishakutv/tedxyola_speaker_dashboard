import { useState, useEffect, useCallback } from 'react';
import {
  GitCommit, GitBranch, ChevronDown, ChevronUp,
  Calendar, User, Hash, ExternalLink,
  Filter, Search, RefreshCw, AlertCircle, Package,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './CommitLogs.css';

/* ══════════════════════════════════════════════════════════
   Version grouping
   Each version is defined by the commit SHA that *starts* it
   (i.e. the oldest commit in that version). Any commit not
   covered by a rule falls into the most-recent open version.
   ══════════════════════════════════════════════════════════ */
const VERSION_RULES = [
  // sha (7-char) that is the FIRST (oldest) commit of the version
  { version: 'v1.0', startSha: '19fe3a0', label: 'Initial Release',      color: '#e62b1e', desc: 'Full-stack TEDx dashboard with JWT auth & speakers API' },
  { version: 'v1.1', startSha: '269c547', label: 'Production Ready',      color: '#f59e0b', desc: 'Production deployment support, Vite proxy & relative URLs' },
  { version: 'v1.2', startSha: 'bf75e84', label: 'Media & Settings',      color: '#a855f7', desc: 'Media library, improved settings, security fixes & more' },
  { version: 'v1.3', startSha: '69179c7', label: 'Links & QR',            color: '#06b6d4', desc: 'Link shortener and QR Code generator' },
  { version: 'v1.4', startSha: '6f0cfa9', label: 'Sponsors & Blogs',      color: '#22c55e', desc: 'Sponsors and blog management with rich-text editor' },
  { version: 'v1.5', startSha: 'de94e16', label: 'Public APIs',           color: '#3b82f6', desc: 'No-auth public endpoints for sponsors, blogs & popups' },
  { version: 'v1.6', startSha: '6ce1738', label: 'Popups & Announcements',color: '#ec4899', desc: 'Popup/announcement system with scheduling and tracking' },
];

/* Assign a version to each commit based on ordered rules */
const assignVersions = (commits) => {
  // Build a lookup: sha → version index (0 = oldest version)
  const shaToVersion = {};
  VERSION_RULES.forEach((r, idx) => { shaToVersion[r.startSha] = idx; });

  // Walk commits oldest-first to assign
  const reversed = [...commits].reverse();
  let currentVersion = 0;

  reversed.forEach(c => {
    const idx = shaToVersion[c.short];
    if (idx !== undefined) currentVersion = idx;
    c._version = VERSION_RULES[currentVersion]?.version || 'v1.0';
  });

  return commits; // back to newest-first
};

/* ── Tag detection from commit subject ──────────────────── */
const detectTag = (subject) => {
  const s = subject.toLowerCase();
  if (s.startsWith('fix') || s.includes('bug') || s.includes('fix'))     return 'fix';
  if (s.startsWith('add') || s.includes('add') || s.includes('new'))     return 'feature';
  if (s.includes('api') || s.includes('endpoint') || s.includes('route'))return 'api';
  if (s.includes('style') || s.includes('ui') || s.includes('css') || s.includes('responsive')) return 'ui';
  if (s.includes('deploy') || s.includes('build') || s.includes('production') || s.includes('vite')) return 'infra';
  if (s.includes('doc') || s.includes('readme') || s.includes('updating')) return 'docs';
  return 'feature';
};

const TAG_CONFIG = {
  feature: { label: 'Feature', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  fix:     { label: 'Fix',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  api:     { label: 'API',     color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
  ui:      { label: 'UI',      color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  infra:   { label: 'Infra',   color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'  },
  docs:    { label: 'Docs',    color: '#6b7280', bg: 'rgba(107,114,128,0.12)'},
};

/* ── Helpers ─────────────────────────────────────────────── */
const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const formatTime = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const AVATAR_COLORS = ['#e62b1e', '#3b82f6', '#a855f7', '#22c55e', '#f59e0b'];
const avatarColor  = (name = '') => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
const getInitials  = (name = '') => name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);

/* ── Single commit card ──────────────────────────────────── */
const CommitCard = ({ commit, isLast }) => {
  const [expanded, setExpanded] = useState(false);
  const tag = TAG_CONFIG[detectTag(commit.subject)];
  const hasBody = !!commit.body;

  return (
    <div className="cl-entry">
      <div className="cl-timeline">
        <div className="cl-dot"><GitCommit size={12} /></div>
        {!isLast && <div className="cl-line" />}
      </div>

      <div className="cl-card card">
        {/* Top row */}
        <div className="cl-card-top">
          <div className="cl-card-left">
            <span className="cl-tag" style={{ color: tag.color, background: tag.bg, border: `1px solid ${tag.color}33` }}>
              {tag.label}
            </span>
            <p className="cl-subject">{commit.subject}</p>
          </div>
          <span className="cl-date">
            <Calendar size={12} />
            {formatDate(commit.author.date)} · {formatTime(commit.author.date)}
          </span>
        </div>

        {/* Meta row */}
        <div className="cl-meta">
          {commit.author.avatar
            ? <img src={commit.author.avatar} alt={commit.author.name} className="cl-avatar cl-avatar-img" />
            : <div className="cl-avatar" style={{ background: avatarColor(commit.author.name) }}>{getInitials(commit.author.name)}</div>
          }
          <span className="cl-author"><User size={11} />{commit.author.name}</span>
          <span className="cl-hash">
            <Hash size={11} />
            <code>{commit.short}</code>
          </span>

          <div className="cl-meta-right">
            {commit.url && (
              <a href={commit.url} target="_blank" rel="noopener noreferrer" className="cl-gh-link">
                <ExternalLink size={12} /> GitHub
              </a>
            )}
            {hasBody && (
              <button className="cl-expand-btn" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
                {expanded ? <><ChevronUp size={13} /> Less</> : <><ChevronDown size={13} /> Details</>}
              </button>
            )}
          </div>
        </div>

        {/* Expanded body */}
        {expanded && hasBody && (
          <div className="cl-expanded">
            <p className="cl-body-label">Full message</p>
            <pre className="cl-body-text">{commit.body}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Version group ───────────────────────────────────────── */
const VersionGroup = ({ versionKey, commits, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const rule = VERSION_RULES.find(r => r.version === versionKey);
  const color = rule?.color || '#6b7280';

  return (
    <div className="cl-version-group">
      <button className="cl-version-header" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <div className="cl-version-left">
          <span className="cl-version-badge" style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}>
            <Package size={12} />
            {versionKey}
          </span>
          <div className="cl-version-info">
            <span className="cl-version-label">{rule?.label || 'Updates'}</span>
            {rule?.desc && <span className="cl-version-desc">{rule.desc}</span>}
          </div>
        </div>
        <div className="cl-version-right">
          <span className="cl-version-count">{commits.length} commit{commits.length !== 1 ? 's' : ''}</span>
          <ChevronDown size={15} className={`cl-version-chevron ${open ? 'open' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="cl-version-body">
          {commits.map((c, i) => (
            <CommitCard key={c.sha} commit={c} isLast={i === commits.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Main page ───────────────────────────────────────────── */
const CommitLogs = () => {
  const [commits, setCommits]   = useState([]);
  const [status, setStatus]     = useState('idle'); // idle | loading | ok | error
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [activeTag, setActiveTag] = useState('all');
  const [activeVer, setActiveVer] = useState('all');
  const [lastFetched, setLastFetched] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const res = await authFetch('/api/commits?per_page=100');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      assignVersions(data);
      setCommits(data);
      setStatus('ok');
      setLastFetched(new Date());
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Filtering ─────────────────────────────────────────── */
  const filtered = commits.filter(c => {
    if (activeVer !== 'all' && c._version !== activeVer) return false;
    if (activeTag !== 'all' && detectTag(c.subject) !== activeTag) return false;
    const q = search.toLowerCase();
    if (q && !c.subject.toLowerCase().includes(q) &&
             !c.author.name.toLowerCase().includes(q) &&
             !c.short.includes(q)) return false;
    return true;
  });

  /* ── Group filtered commits by version (newest version first) ── */
  const groups = {};
  filtered.forEach(c => {
    const v = c._version || 'v1.0';
    if (!groups[v]) groups[v] = [];
    groups[v].push(c);
  });
  // Sort groups newest version first
  const sortedGroups = Object.entries(groups).sort((a, b) => {
    const ai = VERSION_RULES.findIndex(r => r.version === a[0]);
    const bi = VERSION_RULES.findIndex(r => r.version === b[0]);
    return bi - ai;
  });

  const versions = [...new Set(commits.map(c => c._version))].sort((a, b) => {
    const ai = VERSION_RULES.findIndex(r => r.version === a);
    const bi = VERSION_RULES.findIndex(r => r.version === b);
    return bi - ai;
  });

  const tags = ['all', ...Object.keys(TAG_CONFIG)];
  const authors = [...new Set(commits.map(c => c.author.name))];

  return (
    <div className="cl-page">
      {/* Header */}
      <div className="cl-header">
        <div className="cl-header-left">
          <div className="cl-header-icon"><GitBranch size={18} /></div>
          <div>
            <h2>Commit Logs</h2>
            <p className="cl-subtitle">
              Live history of how this app evolved — pulled directly from GitHub.
              {lastFetched && (
                <span className="cl-last-fetched"> Last fetched {formatTime(lastFetched.toISOString())}</span>
              )}
            </p>
          </div>
        </div>
        <button
          className={`cl-refresh-btn ${status === 'loading' ? 'spinning' : ''}`}
          onClick={load}
          disabled={status === 'loading'}
          title="Refresh from GitHub"
        >
          <RefreshCw size={14} />
          {status === 'loading' ? 'Fetching…' : 'Refresh'}
        </button>
      </div>

      {/* Summary strip */}
      {status === 'ok' && (
        <div className="cl-summary">
          <div className="cl-stat-card card">
            <span className="cl-stat-label">Commits</span>
            <span className="cl-stat-val">{commits.length}</span>
          </div>
          <div className="cl-stat-card card">
            <span className="cl-stat-label">Versions</span>
            <span className="cl-stat-val">{versions.length}</span>
          </div>
          <div className="cl-stat-card card">
            <span className="cl-stat-label">Contributors</span>
            <div className="cl-contributors">
              {authors.map(a => (
                <div key={a} className="cl-avatar cl-avatar-sm" style={{ background: avatarColor(a) }} title={a}>
                  {getInitials(a)}
                </div>
              ))}
            </div>
          </div>
          <div className="cl-stat-card card">
            <span className="cl-stat-label">Branch</span>
            <span className="cl-stat-val cl-branch">main</span>
          </div>
        </div>
      )}

      {/* Filters */}
      {status === 'ok' && (
        <div className="cl-filters">
          <div className="cl-search-wrap">
            <Search size={14} className="cl-search-icon" />
            <input
              className="cl-search"
              type="text"
              placeholder="Search commits or authors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="cl-filter-group">
            <Filter size={12} />
            <span className="cl-filter-label">Version</span>
            {['all', ...versions].map(v => {
              const rule = VERSION_RULES.find(r => r.version === v);
              const active = activeVer === v;
              return (
                <button
                  key={v}
                  className={`cl-tag-btn ${active ? 'active' : ''}`}
                  onClick={() => setActiveVer(v)}
                  style={active && rule ? { color: rule.color, background: rule.color + '18', borderColor: rule.color + '44' } : {}}
                >
                  {v === 'all' ? 'All versions' : v}
                </button>
              );
            })}
          </div>

          <div className="cl-filter-group">
            <span className="cl-filter-label">Type</span>
            {tags.map(t => {
              const cfg = TAG_CONFIG[t];
              const active = activeTag === t;
              return (
                <button
                  key={t}
                  className={`cl-tag-btn ${active ? 'active' : ''}`}
                  onClick={() => setActiveTag(t)}
                  style={active && cfg ? { color: cfg.color, background: cfg.bg, borderColor: `${cfg.color}44` } : {}}
                >
                  {t === 'all' ? 'All types' : cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* States */}
      {status === 'loading' && (
        <div className="cl-state-box card">
          <div className="cl-spinner" />
          <p>Fetching commits from GitHub…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="cl-state-box cl-error card">
          <AlertCircle size={28} />
          <p>Could not load commits</p>
          <span className="cl-error-detail">{error}</span>
          <button className="cl-retry-btn" onClick={load}>Try again</button>
        </div>
      )}

      {/* Results */}
      {status === 'ok' && (
        <>
          <p className="cl-count">
            {filtered.length === commits.length
              ? `${commits.length} commits across ${sortedGroups.length} version${sortedGroups.length !== 1 ? 's' : ''}`
              : `Showing ${filtered.length} of ${commits.length} commits`
            }
          </p>

          {sortedGroups.length === 0 ? (
            <div className="cl-empty card">
              <GitCommit size={32} />
              <p>No commits match your filters.</p>
            </div>
          ) : (
            <div className="cl-groups">
              {sortedGroups.map(([ver, grpCommits], i) => (
                <VersionGroup
                  key={ver}
                  versionKey={ver}
                  commits={grpCommits}
                  defaultOpen={i === 0}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CommitLogs;
