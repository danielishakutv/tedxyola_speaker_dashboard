import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, AlertCircle, Calendar, Upload, Link2, Image, X } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import MediaPicker from '../components/MediaPicker';
import './PopupForm.css';

const FREQUENCIES = [
  ['EVERY_VISIT',      'Every visit',     'Shows on every page load'],
  ['ONCE_PER_SESSION', 'Once per session','Shows once until the browser tab is closed'],
  ['ONCE_PER_DAY',     'Once per day',    'Shows at most once every 24 hours'],
  ['ONCE_EVER',        'Once ever',       'Shows a single time, then never again'],
];

/* Convert a stored ISO timestamp into the value a datetime-local input wants
   (YYYY-MM-DDTHH:mm in the user's local time). */
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const PopupForm = () => {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState({
    title: '',
    body: '',
    buttonLabel: '',
    buttonUrl: '',
    frequency: 'ONCE_PER_SESSION',
    priority: 0,
    startAt: '',
    endAt: '',
  });

  const [imageMode,       setImageMode]       = useState('url'); // 'url' | 'upload' | 'media'
  const [imageFile,       setImageFile]       = useState(null);
  const [imageUrlInput,   setImageUrlInput]   = useState('');
  const [imagePreview,    setImagePreview]    = useState(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  const [loading,      setLoading]      = useState(false);
  const [fetchLoading, setFetchLoading] = useState(isEditing);
  const [errors,       setErrors]       = useState({});

  /* ── Load existing popup when editing ────────────────── */
  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const res = await authFetch(`/api/popups/${id}`);
        if (res.ok) {
          const data = await res.json();
          setFormData({
            title:       data.title || '',
            body:        data.body || '',
            buttonLabel: data.buttonLabel || '',
            buttonUrl:   data.buttonUrl || '',
            frequency:   data.frequency || 'ONCE_PER_SESSION',
            priority:    data.priority ?? 0,
            startAt:     toLocalInput(data.startAt),
            endAt:       toLocalInput(data.endAt),
          });
          if (data.imageUrl) {
            setImageUrlInput(data.imageUrl);
            setImagePreview(data.imageUrl);
            setImageMode('url');
          }
        }
      } catch (e) {
        console.error('Error fetching popup:', e);
      } finally {
        setFetchLoading(false);
      }
    })();
  }, [id, isEditing]);

  /* ── Handlers ────────────────────────────────────────── */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  /* ── Validation ──────────────────────────────────────── */
  const validate = () => {
    const errs = {};
    if (!formData.title.trim()) errs.title = 'Message title is required';
    if (!formData.body.trim())  errs.body  = 'Message body is required';
    if (formData.buttonLabel.trim() && !formData.buttonUrl.trim())
      errs.buttonUrl = 'Add a link for the button, or clear the button label';
    if (formData.startAt && formData.endAt && new Date(formData.endAt) <= new Date(formData.startAt))
      errs.endAt = 'Expiry must be after the start date';
    return errs;
  };

  /* ── Submit ──────────────────────────────────────────── */
  const handleSubmit = async (e, targetStatus) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      document.querySelector('.input-error, .field-error')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setLoading(true);
    try {
      const body = new FormData();
      body.append('title', formData.title);
      body.append('body', formData.body);
      body.append('buttonLabel', formData.buttonLabel);
      body.append('buttonUrl', formData.buttonUrl);
      body.append('frequency', formData.frequency);
      body.append('priority', String(formData.priority || 0));
      body.append('startAt', formData.startAt);
      body.append('endAt', formData.endAt);
      body.append('status', targetStatus);
      if (imageMode === 'upload') {
        if (imageFile) body.append('image', imageFile);
      } else {
        body.append('imageUrl', imageUrlInput.trim());
      }

      const res = await authFetch(
        isEditing ? `/api/popups/${id}` : '/api/popups',
        { method: isEditing ? 'PUT' : 'POST', body }
      );
      if (!res.ok) throw new Error('Failed to save popup');
      navigate('/popups');
    } catch (err) {
      console.error(err);
      alert('Error saving popup. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) return <div className="loading-state">Loading popup…</div>;

  const previewSrc = imageMode === 'upload' ? imagePreview : (imageUrlInput.trim() || null);

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="popup-form-page">

      {/* Media Picker Modal */}
      {showMediaPicker && (
        <MediaPicker
          onSelect={(item) => {
            setImageUrlInput(item.url);
            setImagePreview(item.url);
            setImageMode('media');
            setShowMediaPicker(false);
          }}
          onClose={() => setShowMediaPicker(false)}
        />
      )}

      {/* Header */}
      <div className="form-page-header">
        <div className="header-left">
          <Link to="/popups" className="back-btn"><ArrowLeft size={17} /></Link>
          <div>
            <h2>{isEditing ? 'Edit Popup' : 'Create New Popup'}</h2>
            <p className="form-page-subtitle">
              {isEditing ? 'Update popup details' : 'Title and message are required'}
            </p>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={e => handleSubmit(e, 'DRAFT')} disabled={loading}>
            <Save size={15} />{loading ? 'Saving…' : 'Save as Draft'}
          </button>
          <button type="button" className="btn primary" onClick={e => handleSubmit(e, 'PUBLISHED')} disabled={loading}>
            <CheckCircle size={15} />Publish
          </button>
        </div>
      </div>

      <div className="popup-form-layout">

        {/* ── Left: form ─────────────────────────────────── */}
        <div className="popup-form-main">

          {/* Message */}
          <div className="form-section card">
            <h3 className="section-heading">Message</h3>

            <div className="form-group">
              <label>Message Title <span className="required">*</span></label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g. Early-bird tickets are live!"
                className={errors.title ? 'input-error' : ''}
              />
              {errors.title && <span className="field-error"><AlertCircle size={12} />{errors.title}</span>}
            </div>

            <div className="form-group">
              <label>Message Body <span className="required">*</span></label>
              <textarea
                name="body"
                value={formData.body}
                onChange={handleChange}
                rows={4}
                placeholder="Tell visitors what's happening and why it matters…"
                className={errors.body ? 'input-error' : ''}
              />
              {errors.body && <span className="field-error"><AlertCircle size={12} />{errors.body}</span>}
            </div>

            <div className="field-row two-col">
              <div className="form-group">
                <label>Button Label <span className="optional">(optional)</span></label>
                <input
                  type="text"
                  name="buttonLabel"
                  value={formData.buttonLabel}
                  onChange={handleChange}
                  placeholder="e.g. Get Tickets"
                />
              </div>
              <div className="form-group">
                <label>Button Link <span className="optional">(optional)</span></label>
                <input
                  type="url"
                  name="buttonUrl"
                  value={formData.buttonUrl}
                  onChange={handleChange}
                  placeholder="https://tedxyola.com/tickets"
                  className={errors.buttonUrl ? 'input-error' : ''}
                />
                {errors.buttonUrl && <span className="field-error"><AlertCircle size={12} />{errors.buttonUrl}</span>}
              </div>
            </div>
          </div>

          {/* Image */}
          <div className="form-section card">
            <h3 className="section-heading">Image <span className="optional">(optional)</span></h3>

            <div className="image-mode-tabs">
              <button type="button"
                className={`image-mode-tab ${imageMode === 'url' ? 'active' : ''}`}
                onClick={() => setImageMode('url')}>
                <Link2 size={13} /> Image URL
              </button>
              <button type="button"
                className={`image-mode-tab ${imageMode === 'upload' ? 'active' : ''}`}
                onClick={() => setImageMode('upload')}>
                <Upload size={13} /> Upload
              </button>
              <button type="button"
                className={`image-mode-tab ${imageMode === 'media' ? 'active' : ''}`}
                onClick={() => setShowMediaPicker(true)}>
                <Image size={13} /> Media
              </button>
            </div>

            {imageMode === 'url' && (
              <>
                <input type="url" value={imageUrlInput}
                  onChange={e => setImageUrlInput(e.target.value)}
                  placeholder="https://example.com/popup.jpg" />
                {previewSrc && (
                  <div className="image-preview url-preview">
                    <img src={previewSrc} alt="Preview"
                      onError={e => e.currentTarget.parentElement.classList.add('broken')}
                      onLoad={e => e.currentTarget.parentElement.classList.remove('broken')} />
                    <span className="broken-hint">Image URL can't be loaded</span>
                  </div>
                )}
              </>
            )}

            {imageMode === 'media' && (
              <>
                <div className="media-selected-row">
                  <span className="media-selected-label">
                    {imageUrlInput ? 'Selected from Media Library' : 'No image selected yet'}
                  </span>
                  <button type="button" className="btn secondary small-btn"
                    onClick={() => setShowMediaPicker(true)}>
                    {imageUrlInput ? 'Change' : 'Browse Media'}
                  </button>
                </div>
                {previewSrc && (
                  <div className="image-preview url-preview" style={{ marginTop: '0.75rem' }}>
                    <img src={previewSrc} alt="Preview"
                      onError={e => e.currentTarget.parentElement.classList.add('broken')}
                      onLoad={e => e.currentTarget.parentElement.classList.remove('broken')} />
                    <span className="broken-hint">Image can't be loaded</span>
                  </div>
                )}
              </>
            )}

            {imageMode === 'upload' && (
              <div className="image-upload-zone">
                {previewSrc ? (
                  <div className="image-preview">
                    <img src={previewSrc} alt="Preview" />
                    <div className="image-overlay">
                      <button type="button" className="btn secondary"
                        onClick={() => document.getElementById('popup-image-upload').click()}>
                        Change Image
                      </button>
                    </div>
                  </div>
                ) : (
                  <label htmlFor="popup-image-upload" className="upload-placeholder">
                    <Upload size={26} />
                    <span>Click to upload an image</span>
                    <small>PNG, JPG — wide/landscape preferred</small>
                  </label>
                )}
                <input type="file" id="popup-image-upload" accept="image/*"
                  onChange={handleImageChange} style={{ display: 'none' }} />
              </div>
            )}
          </div>

          {/* Schedule & display */}
          <div className="form-section card">
            <h3 className="section-heading">Schedule &amp; Display</h3>

            <div className="field-row two-col">
              <div className="form-group">
                <label>Start <span className="optional">(optional)</span></label>
                <div className="date-input-wrapper">
                  <Calendar size={15} className="date-icon" />
                  <input type="datetime-local" name="startAt" value={formData.startAt} onChange={handleChange} />
                </div>
                <small className="field-hint">Leave empty to show as soon as it's published.</small>
              </div>
              <div className="form-group">
                <label>Expires <span className="optional">(optional)</span></label>
                <div className="date-input-wrapper">
                  <Calendar size={15} className="date-icon" />
                  <input type="datetime-local" name="endAt" value={formData.endAt} onChange={handleChange}
                    className={errors.endAt ? 'input-error' : ''} />
                </div>
                {errors.endAt
                  ? <span className="field-error"><AlertCircle size={12} />{errors.endAt}</span>
                  : <small className="field-hint">After this moment the popup stops showing automatically.</small>}
              </div>
            </div>

            <div className="field-row two-col">
              <div className="form-group">
                <label>Show Frequency</label>
                <select name="frequency" value={formData.frequency} onChange={handleChange}>
                  {FREQUENCIES.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <small className="field-hint">
                  {FREQUENCIES.find(f => f[0] === formData.frequency)?.[2]}
                </small>
              </div>
              <div className="form-group">
                <label>Priority</label>
                <input type="number" name="priority" value={formData.priority} onChange={handleChange} min="0" />
                <small className="field-hint">Higher numbers show first when several are active.</small>
              </div>
            </div>
          </div>

        </div>

        {/* ── Right: live preview ────────────────────────── */}
        <div className="popup-form-side">
          <div className="form-section card preview-card">
            <h3 className="section-heading">Live Preview</h3>
            <div className="popup-preview-stage">
              <div className="popup-preview">
                <button type="button" className="pp-close" aria-label="Close preview"><X size={15} /></button>
                {previewSrc && (
                  <div className="pp-image">
                    <img src={previewSrc} alt="" onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
                  </div>
                )}
                <div className="pp-content">
                  <h4 className="pp-title">{formData.title || 'Message title'}</h4>
                  <p className="pp-body">{formData.body || 'Your message body will appear here.'}</p>
                  {formData.buttonLabel && (
                    <span className="pp-cta">{formData.buttonLabel}</span>
                  )}
                </div>
              </div>
            </div>
            <p className="preview-note">This is roughly how the popup appears on the website.</p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PopupForm;
