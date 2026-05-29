import { useState, useEffect } from 'react';
import { X, Search, Check, Image, HardDrive, Calendar } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './MediaPicker.css';

const fmtSize = (bytes) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MediaPicker = ({ onSelect, onClose }) => {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    authFetch('/api/media')
      .then(r => r.ok ? r.json() : [])
      .then(data => setItems(data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(i =>
    i.originalName.toLowerCase().includes(search.toLowerCase())
  );

  const handleConfirm = () => {
    if (selected) onSelect(selected);
  };

  return (
    <div className="mp-overlay" onClick={onClose}>
      <div className="mp-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="mp-header">
          <div>
            <h3>Media Library</h3>
            <p>{items.length} image{items.length !== 1 ? 's' : ''} available</p>
          </div>
          <button className="mp-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Search */}
        <div className="mp-search-wrap">
          <Search size={14} className="mp-search-icon" />
          <input
            type="text"
            placeholder="Search by filename…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mp-search"
            autoFocus
          />
        </div>

        {/* Grid */}
        <div className="mp-body">
          {loading ? (
            <div className="mp-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="mp-item skeleton" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mp-empty">
              <Image size={28} />
              <p>{search ? 'No images match your search' : 'No images in the media library yet'}</p>
            </div>
          ) : (
            <div className="mp-grid">
              {filtered.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`mp-item ${selected?.id === item.id ? 'selected' : ''}`}
                  onClick={() => setSelected(item)}
                >
                  <div className="mp-thumb">
                    <img src={item.url} alt={item.originalName} loading="lazy" />
                    {selected?.id === item.id && (
                      <div className="mp-selected-badge"><Check size={14} /></div>
                    )}
                  </div>
                  <div className="mp-item-info">
                    <span className="mp-item-name" title={item.originalName}>
                      {item.originalName}
                    </span>
                    <span className="mp-item-meta">
                      <HardDrive size={10} />{fmtSize(item.size)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mp-footer">
          {selected ? (
            <div className="mp-selected-info">
              <img src={selected.url} alt="" className="mp-selected-thumb" />
              <div>
                <p className="mp-selected-name">{selected.originalName}</p>
                <p className="mp-selected-size">{fmtSize(selected.size)}</p>
              </div>
            </div>
          ) : (
            <p className="mp-hint">Click an image to select it</p>
          )}
          <div className="mp-footer-actions">
            <button className="btn secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn primary"
              onClick={handleConfirm}
              disabled={!selected}
            >
              Use this image
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default MediaPicker;
