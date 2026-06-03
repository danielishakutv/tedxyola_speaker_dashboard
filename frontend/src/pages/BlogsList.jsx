import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, Search, FileText, Calendar, User } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './BlogsList.css';

/* ── Skeleton Card ───────────────────────────────────────── */
const SkeletonCard = () => (
  <div className="blog-card card sk-card">
    <div className="sk-header">
      <div className="sk-block sk-category" />
      <div className="sk-block sk-status" />
    </div>
    <div className="sk-block sk-title" />
    <div className="sk-block sk-content" />
    <div className="sk-footer">
      <div className="sk-block sk-foot-line" />
    </div>
  </div>
);

/* ── Main Component ──────────────────────────────────────── */
const BlogsList = () => {
  const [searchTerm, setSearchTerm]   = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [blogs, setBlogs]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/blogs');
      if (!res.ok) throw new Error('Failed to fetch blogs');
      setBlogs(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBlogs(); }, []);

  const filteredBlogs = blogs.filter(b => {
    const q = searchTerm.toLowerCase();
    const matchSearch = 
      b.title.toLowerCase().includes(q) || 
      (b.content || '').toLowerCase().includes(q) ||
      (b.category || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q);
    const matchFilter = filterStatus === 'ALL' || b.status === filterStatus;
    return matchSearch && matchFilter;
  });

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this blog post?')) return;
    try {
      const res = await authFetch(`/api/blogs/${id}`, { method: 'DELETE' });
      if (res.ok) setBlogs(prev => prev.filter(b => b.id !== id));
    } catch {
      alert('Error deleting blog');
    }
  };

  const counts = {
    ALL:   blogs.length,
    LIVE:  blogs.filter(b => b.status === 'LIVE').length,
    DRAFT: blogs.filter(b => b.status === 'DRAFT').length,
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="blogs-page">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h2>Blog Posts</h2>
          <p className="page-subtitle">
            {counts.ALL} post{counts.ALL !== 1 ? 's' : ''} · {counts.LIVE} live · {counts.DRAFT} draft
          </p>
          {error && <small className="error-hint">Backend offline — data may be stale</small>}
        </div>

        <Link to="/blogs/new" className="add-blog-btn">
          <span className="add-blog-icon"><Plus size={15} strokeWidth={2.5} /></span>
          Add Blog Post
        </Link>
      </div>

      {/* ── Controls ───────────────────────────────────── */}
      <div className="controls-bar card">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search by title, content, category or author…"
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
        <div className="blogs-grid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filteredBlogs.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon"><FileText size={22} /></div>
          <h3>{searchTerm ? 'No results found' : 'No blog posts yet'}</h3>
          <p>
            {searchTerm
              ? `Nothing matches "${searchTerm}". Try a different search.`
              : 'Start sharing your thoughts by creating the first blog post.'}
          </p>
          {!searchTerm && (
            <Link to="/blogs/new" className="btn primary" style={{ marginTop: '0.5rem' }}>
              <Plus size={14} /> Add Blog Post
            </Link>
          )}
        </div>
      ) : (
        <div className="blogs-grid">
          {filteredBlogs.map(blog => (
            <div key={blog.id} className="blog-card card">

              {/* ── Header ─────────────────────────────── */}
              <div className="card-header">
                <span className="blog-category">{blog.category}</span>
                <div className="card-header-right">
                  <span className={`status-pill ${blog.status.toLowerCase()}`}>
                    {blog.status}
                  </span>
                  <div className="card-actions">
                    <Link to={`/blogs/edit/${blog.id}`} className="icon-btn" title="Edit">
                      <Edit2 size={13} />
                    </Link>
                    <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(blog.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Title ──────────────────────────────── */}
              <h3 className="blog-title">{blog.title}</h3>

              {/* ── Content Preview ────────────────────── */}
              <p className="blog-content-preview">
                {blog.content.length > 150 
                  ? `${blog.content.substring(0, 150)}…` 
                  : blog.content}
              </p>

              {/* ── Footer ─────────────────────────────── */}
              <div className="card-footer">
                <span className="footer-meta">
                  <User size={11} />
                  {blog.author}
                </span>
                <span className="footer-meta">
                  <Calendar size={11} />
                  {formatDate(blog.publishDate)}
                </span>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BlogsList;
