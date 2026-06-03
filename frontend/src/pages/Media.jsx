import { useState, useEffect, useRef } from 'react';
import {
  Upload, Trash2, Image, RefreshCw, Copy, Check,
  AlertTriangle, X, HardDrive, Calendar, User,
  Maximize2, Download, Link2, ExternalLink,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './Media.css';

/* ── Helpers ─────────────────────────────────────────────── */
const fmtSize = (bytes) => {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/* Copy the actual image bitmap to the clipboard.
   Browsers only reliably accept image/png in the clipboard, so non-PNG
   sources are redrawn to a canvas and exported as PNG first. The /uploads
   images are same-origin, so the canvas stays untainted. */
const copyImageToClipboard = async (url) => {
  const res  = await fetch(url);
  const blob = await res.blob();

  let pngBlob = blob;
  if (blob.type !== 'image/png') {
    pngBlob = await new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas  = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png');
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
};

/* ── Copy button ─────────────────────────────────────────── */
const CopyBtn = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e?.stopPropagation();
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button className="media-copy-btn" onClick={copy} title="Copy URL">
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
};

/* ── Lightbox — full-size view with minimalist controls ──── */
const Lightbox = ({ item, onClose, showToast }) => {
  const [copiedImg, setCopiedImg] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyImage = async () => {
    try {
      await copyImageToClipboard(item.url);
      setCopiedImg(true);
      setTimeout(() => setCopiedImg(false), 1500);
      showToast('Image copied to clipboard');
    } catch {
      showToast('Image copy not supported in this browser', 'error');
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1500);
      showToast('URL copied');
    } catch {
      showToast('Failed to copy URL', 'error');
    }
  };

  return (
    <div className="media-lightbox-overlay" onClick={onClose}>
      <div className="media-lightbox" onClick={e => e.stopPropagation()}>
        <div className="media-lightbox-toolbar">
          <button className="lb-btn" onClick={copyImage} title="Copy image to clipboard">
            {copiedImg ? <Check size={15} /> : <Copy size={15} />}
            <span>{copiedImg ? 'Copied' : 'Copy image'}</span>
          </button>
          <button className="lb-btn" onClick={copyUrl} title="Copy image URL">
            {copiedUrl ? <Check size={15} /> : <Link2 size={15} />}
            <span>{copiedUrl ? 'Copied' : 'Copy link'}</span>
          </button>
          <a className="lb-btn" href={item.url} download={item.originalName} title="Download">
            <Download size={15} /><span>Download</span>
          </a>
          <a className="lb-btn" href={item.url} target="_blank" rel="noreferrer" title="Open in new tab">
            <ExternalLink size={15} /><span>Open</span>
          </a>
          <button className="lb-btn lb-close" onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>

        <div className="media-lightbox-stage">
          <img src={item.url} alt={item.originalName} />
        </div>

        <div className="media-lightbox-caption">
          <span className="lb-name" title={item.originalName}>{item.originalName}</span>
          <span className="lb-meta">{fmtSize(item.size)} · {fmtDate(item.createdAt)}</span>
        </div>
      </div>
    </div>
  );
};

/* ── Delete confirm modal ────────────────────────────────── */
const DeleteModal = ({ item, onConfirm, onCancel }) => (
  <div className="media-modal-overlay" onClick={onCancel}>
    <div className="media-delete-modal" onClick={e => e.stopPropagation()}>
      <div className="mdm-icon"><AlertTriangle size={22} /></div>
      <h3>Delete image?</h3>
      <p>
        <strong>{item.originalName}</strong> will be permanently removed from the
        server. Any speaker using this image will lose their photo.
      </p>
      <div className="mdm-actions">
        <button className="btn secondary" onClick={onCancel}>Cancel</button>
        <button className="btn danger" onClick={onConfirm}>Delete</button>
      </div>
    </div>
  </div>
);

/* ── Main component ──────────────────────────────────────── */
const Media = () => {
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewTarget,  setViewTarget]  = useState(null);
  const [toast,       setToast]       = useState(null);
  const [dragOver,    setDragOver]    = useState(false);
  const fileInputRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchMedia = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/media');
      if (res.ok) setItems(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMedia(); }, []);

  /* ── Upload ──────────────────────────────────────────── */
  const handleFiles = async (files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) {
      showToast('Only image files are supported', 'error');
      return;
    }

    setUploading(true);
    let successCount = 0;

    for (const file of imageFiles) {
      try {
        const body = new FormData();
        body.append('file', file);
        const res = await authFetch('/api/media', { method: 'POST', body });
        if (res.ok) successCount++;
        else showToast(`Failed to upload ${file.name}`, 'error');
      } catch {
        showToast(`Failed to upload ${file.name}`, 'error');
      }
    }

    setUploading(false);
    if (successCount > 0) {
      showToast(`${successCount} image${successCount > 1 ? 's' : ''} uploaded`);
      fetchMedia();
    }
  };

  const handleFileInput = (e) => handleFiles(e.target.files);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  /* ── Delete ──────────────────────────────────────────── */
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await authFetch(`/api/media/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
        showToast('Image deleted');
      } else {
        showToast('Failed to delete image', 'error');
      }
    } catch {
      showToast('Failed to delete image', 'error');
    }
    setDeleteTarget(null);
  };

  /* ── Stats ───────────────────────────────────────────── */
  const totalSize = items.reduce((acc, i) => acc + i.size, 0);

  return (
    <div className="media-page">

      {/* Toast */}
      {toast && (
        <div className={`media-toast ${toast.type}`}>
          {toast.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteModal
          item={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Full-size lightbox */}
      {viewTarget && (
        <Lightbox
          item={viewTarget}
          onClose={() => setViewTarget(null)}
          showToast={showToast}
        />
      )}

      {/* Header */}
      <div className="media-header">
        <div>
          <h2>Media Library</h2>
          <p className="media-subtitle">
            {loading ? 'Loading…' : `${items.length} image${items.length !== 1 ? 's' : ''} · ${fmtSize(totalSize)} used`}
          </p>
        </div>
        <div className="media-header-actions">
          <button
            className="btn secondary"
            onClick={fetchMedia}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            Refresh
          </button>
          <button
            className="btn primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={14} />
            {uploading ? 'Uploading…' : 'Upload Images'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`media-dropzone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={20} />
        <span>Drop images here or <strong>click to browse</strong></span>
        <small>PNG, JPG, WEBP, GIF — max 10 MB each</small>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="media-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="media-card skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="media-empty">
          <Image size={36} />
          <h3>No images yet</h3>
          <p>Upload your first image using the button above or by dropping files here.</p>
        </div>
      ) : (
        <div className="media-grid">
          {items.map(item => (
            <div key={item.id} className="media-card">
              <div className="media-thumb" onClick={() => setViewTarget(item)}>
                <img src={item.url} alt={item.originalName} loading="lazy" />
                <div className="media-thumb-overlay">
                  <button
                    className="media-view-btn"
                    onClick={(e) => { e.stopPropagation(); setViewTarget(item); }}
                    title="View full size"
                  >
                    <Maximize2 size={14} />
                  </button>
                  <CopyBtn text={item.url} />
                  <button
                    className="media-delete-btn"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="media-info">
                <p className="media-name" title={item.originalName}>{item.originalName}</p>
                <div className="media-meta">
                  <span><HardDrive size={11} />{fmtSize(item.size)}</span>
                  <span><Calendar size={11} />{fmtDate(item.createdAt)}</span>
                  <span><User size={11} />{item.uploadedBy}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Media;
