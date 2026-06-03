import { useState, useEffect } from 'react';
import {
  Link2, QrCode, Plus, Trash2, Copy, Check, RefreshCw,
  AlertTriangle, ExternalLink, Download, X,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './Links.css';

/* Public base for short links + QR images (no API key needed). */
const PUBLIC_BASE = 'https://tedxyola.com';
const QR_SIZES = [256, 512, 1024];

const shortUrlFor  = (link) => link.short_url || link.shortUrl || `${PUBLIC_BASE}/s/${link.slug}`;
const targetUrlFor = (link) => link.target_url || link.url || '';
const qrUrlFor     = (slug, size = 512) => `${PUBLIC_BASE}/api/qr/${slug}.png?size=${size}`;

/* ── Copy button ─────────────────────────────────────────── */
const CopyBtn = ({ text, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button className="btn secondary links-copy-btn" onClick={copy} title={`${label}: ${text}`}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : label}
    </button>
  );
};

/* ── Delete confirm modal ────────────────────────────────── */
const DeleteModal = ({ slug, onConfirm, onCancel }) => (
  <div className="links-modal-overlay" onClick={onCancel}>
    <div className="links-delete-modal" onClick={e => e.stopPropagation()}>
      <div className="ldm-icon"><AlertTriangle size={22} /></div>
      <h3>Delete this link?</h3>
      <p>
        <strong>/{slug}</strong> will stop redirecting immediately and its QR code
        will no longer resolve. This cannot be undone.
      </p>
      <div className="ldm-actions">
        <button className="btn secondary" onClick={onCancel}>Cancel</button>
        <button className="btn danger" onClick={onConfirm}>Delete</button>
      </div>
    </div>
  </div>
);

/* ── QR modal ────────────────────────────────────────────── */
const QrModal = ({ slug, onClose }) => {
  const [size, setSize] = useState(512);
  const qrUrl = qrUrlFor(slug, size);

  return (
    <div className="links-modal-overlay" onClick={onClose}>
      <div className="links-qr-modal" onClick={e => e.stopPropagation()}>
        <button className="links-qr-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <h3><QrCode size={18} /> QR Code — /{slug}</h3>
        <div className="links-qr-preview">
          <img src={qrUrl} alt={`QR code for ${slug}`} />
        </div>
        <div className="links-qr-sizes">
          {QR_SIZES.map(s => (
            <button
              key={s}
              className={`btn ${size === s ? 'primary' : 'secondary'}`}
              onClick={() => setSize(s)}
            >
              {s}px
            </button>
          ))}
        </div>
        <div className="links-qr-actions">
          <a className="btn primary" href={qrUrl} download={`${slug}-qr.png`} target="_blank" rel="noreferrer">
            <Download size={14} /> Download PNG
          </a>
          <a className="btn secondary" href={qrUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Open
          </a>
        </div>
      </div>
    </div>
  );
};

/* ── Main component ──────────────────────────────────────── */
const Links = () => {
  const [links,     setLinks]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [url,       setUrl]       = useState('');
  const [slug,      setSlug]      = useState('');
  const [toast,     setToast]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [qrTarget,  setQrTarget]  = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const res  = await authFetch('/api/links');
      const data = await res.json().catch(() => null);
      if (res.ok) {
        // Tolerate either a bare array or { links: [...] }
        const list = Array.isArray(data) ? data : (data?.links || []);
        setLinks(list);
      } else {
        showToast(data?.error || 'Failed to load links', 'error');
      }
    } catch {
      showToast('Failed to load links', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLinks(); }, []);

  /* ── Create ──────────────────────────────────────────── */
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!url.trim()) { showToast('Enter a target URL', 'error'); return; }

    setCreating(true);
    try {
      const body = { url: url.trim() };
      if (slug.trim()) body.slug = slug.trim();
      const res  = await authFetch('/api/links', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('Short link created');
        setUrl(''); setSlug('');
        fetchLinks();
      } else {
        showToast(data?.error || 'Failed to create link', 'error');
      }
    } catch {
      showToast('Failed to create link', 'error');
    } finally {
      setCreating(false);
    }
  };

  /* ── Delete ──────────────────────────────────────────── */
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const slugToDelete = deleteTarget;
    try {
      const res = await authFetch(`/api/links/${encodeURIComponent(slugToDelete)}`, { method: 'DELETE' });
      if (res.ok) {
        setLinks(prev => prev.filter(l => l.slug !== slugToDelete));
        showToast('Link deleted');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data?.error || 'Failed to delete link', 'error');
      }
    } catch {
      showToast('Failed to delete link', 'error');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="links-page">

      {/* Toast */}
      {toast && (
        <div className={`links-toast ${toast.type}`}>
          {toast.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {deleteTarget && (
        <DeleteModal slug={deleteTarget} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}
      {qrTarget && (
        <QrModal slug={qrTarget} onClose={() => setQrTarget(null)} />
      )}

      {/* Header */}
      <div className="links-header">
        <div>
          <h2>Link Shortener &amp; QR Codes</h2>
          <p className="links-subtitle">
            {loading ? 'Loading…' : `${links.length} link${links.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button className="btn secondary" onClick={fetchLinks} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spinning' : ''} /> Refresh
        </button>
      </div>

      {/* Create form */}
      <form className="links-create card" onSubmit={handleCreate}>
        <div className="links-create-fields">
          <div className="links-field links-field-url">
            <label>Target URL</label>
            <input
              type="url"
              placeholder="https://example.com/long/destination"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
            />
          </div>
          <div className="links-field links-field-slug">
            <label>Custom slug <span>(optional)</span></label>
            <input
              type="text"
              placeholder="promo"
              value={slug}
              onChange={e => setSlug(e.target.value.replace(/\s+/g, '-'))}
            />
          </div>
          <button type="submit" className="btn primary links-create-btn" disabled={creating}>
            <Plus size={14} /> {creating ? 'Creating…' : 'Shorten'}
          </button>
        </div>
        {slug.trim() && (
          <p className="links-preview-hint">
            Will be available at <code>{PUBLIC_BASE}/s/{slug.trim()}</code>
          </p>
        )}
      </form>

      {/* List */}
      {loading ? (
        <div className="loading-state">Loading links…</div>
      ) : links.length === 0 ? (
        <div className="links-empty">
          <Link2 size={36} />
          <h3>No short links yet</h3>
          <p>Create your first short link using the form above.</p>
        </div>
      ) : (
        <div className="links-list">
          {links.map(link => {
            const short  = shortUrlFor(link);
            const target = targetUrlFor(link);
            return (
              <div key={link.slug} className="links-card card">
                <button
                  className="links-qr-thumb"
                  onClick={() => setQrTarget(link.slug)}
                  title="View QR code"
                >
                  <img src={qrUrlFor(link.slug, 256)} alt={`QR for ${link.slug}`} loading="lazy" />
                </button>

                <div className="links-card-body">
                  <a className="links-short" href={short} target="_blank" rel="noreferrer">
                    <Link2 size={14} /> /{link.slug}
                  </a>
                  <a className="links-target" href={target} target="_blank" rel="noreferrer" title={target}>
                    {target}
                  </a>
                  {typeof link.clicks === 'number' && (
                    <span className="links-clicks">{link.clicks} click{link.clicks !== 1 ? 's' : ''}</span>
                  )}
                </div>

                <div className="links-card-actions">
                  <CopyBtn text={short} label="Copy" />
                  <button className="btn secondary" onClick={() => setQrTarget(link.slug)}>
                    <QrCode size={14} /> QR
                  </button>
                  <button className="btn danger icon-only" onClick={() => setDeleteTarget(link.slug)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Links;
