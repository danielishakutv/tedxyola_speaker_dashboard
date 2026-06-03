import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, Save, CheckCircle, AlertCircle, Link2, Image } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import MediaPicker from '../components/MediaPicker';
import './SponsorForm.css';

const REQUIRED_FIELDS  = ['name'];
const FIELD_LABELS = { name: 'Sponsor Name', description: 'Description', website: 'Website' };

const SponsorForm = () => {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState({
    name: '', description: '', website: '',
  });

  const [imageMode,       setImageMode]       = useState('url'); // 'url' | 'upload' | 'media'
  const [imageFile,       setImageFile]       = useState(null);
  const [imageUrlInput,   setImageUrlInput]   = useState('');
  const [imagePreview,    setImagePreview]    = useState(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [fetchLoading,    setFetchLoading]    = useState(isEditing);
  const [errors,          setErrors]          = useState({});

  /* ── Load existing sponsor when editing ─────────────── */
  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const res = await authFetch(`/api/sponsors/${id}`);
        if (res.ok) {
          const data = await res.json();
          setFormData({
            name: data.name || '', description: data.description || '', website: data.website || '',
          });
          if (data.imageUrl) {
            setImagePreview(data.imageUrl);
            setImageUrlInput(data.imageUrl);
            setImageMode('url');
          }
        }
      } catch (e) {
        console.error('Error fetching sponsor:', e);
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

  const handleImageUrlChange = (e) => setImageUrlInput(e.target.value);

  /* ── Validation ──────────────────────────────────────── */
  const validate = () => {
    const errs = {};
    REQUIRED_FIELDS.forEach(field => {
      if (!formData[field].trim()) errs[field] = `${FIELD_LABELS[field]} is required`;
    });
    return errs;
  };

  /* ── Submit ──────────────────────────────────────────── */
  const handleSubmit = async (e, targetStatus) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      document.querySelector('.input-error, .field-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setLoading(true);
    try {
      const body = new FormData();
      Object.entries(formData).forEach(([k, v]) => body.append(k, v));
      body.append('status', targetStatus);
      if (imageMode === 'upload') {
        if (imageFile) body.append('image', imageFile);
      } else {
        body.append('imageUrl', imageUrlInput.trim());
      }
      const res = await authFetch(
        isEditing ? `/api/sponsors/${id}` : '/api/sponsors',
        { method: isEditing ? 'PUT' : 'POST', body }
      );
      if (!res.ok) throw new Error('Failed to save sponsor');
      navigate('/sponsors');
    } catch (err) {
      console.error(err);
      alert('Error saving sponsor. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) return <div className="loading-state">Loading sponsor…</div>;

  const previewSrc = imageMode === 'upload' ? imagePreview : (imageUrlInput.trim() || null);

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="sponsor-form-page">

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
          <Link to="/sponsors" className="back-btn"><ArrowLeft size={17} /></Link>
          <div>
            <h2>{isEditing ? 'Edit Sponsor' : 'Add New Sponsor'}</h2>
            <p className="form-page-subtitle">
              {isEditing
                ? 'Update sponsor details'
                : 'Sponsor name is required — everything else is optional'}
            </p>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={e => handleSubmit(e, 'DRAFT')} disabled={loading}>
            <Save size={15} />{loading ? 'Saving…' : 'Save as Draft'}
          </button>
          <button type="button" className="btn primary" onClick={e => handleSubmit(e, 'LIVE')} disabled={loading}>
            <CheckCircle size={15} />Publish Live
          </button>
        </div>
      </div>

      <div className="form-layout">

        {/* ── Left: Sponsor Info ──────────────────────── */}
        <div className="form-section card">
          <h3 className="section-heading">Sponsor Information</h3>

          <div className="form-group">
            <label>Sponsor Name <span className="required">*</span></label>
            <input type="text" name="name" value={formData.name} onChange={handleChange}
              placeholder="e.g. Acme Corporation" className={errors.name ? 'input-error' : ''} />
            {errors.name && <span className="field-error"><AlertCircle size={12} />{errors.name}</span>}
          </div>

          <div className="form-group">
            <label>Website <span className="optional">(optional)</span></label>
            <input type="url" name="website" value={formData.website} onChange={handleChange}
              placeholder="https://example.com" className={errors.website ? 'input-error' : ''} />
            {errors.website && <span className="field-error"><AlertCircle size={12} />{errors.website}</span>}
          </div>

          <div className="form-group">
            <label>Description <span className="optional">(optional)</span></label>
            <textarea name="description" value={formData.description} onChange={handleChange}
              placeholder="A brief description about the sponsor…"
              rows="4" className={errors.description ? 'input-error' : ''} />
            {errors.description && <span className="field-error"><AlertCircle size={12} />{errors.description}</span>}
          </div>
        </div>

        {/* ── Right: Logo ────────────────────── */}
        <div className="form-right">
          <div className="form-section card">
            <h3 className="section-heading">
              Sponsor Logo <span className="optional">(optional)</span>
            </h3>

            {/* Three-way tab */}
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

            {/* URL tab */}
            {imageMode === 'url' && (
              <>
                <input type="url" value={imageUrlInput} onChange={handleImageUrlChange}
                  placeholder="https://example.com/logo.jpg" />
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

            {/* Media tab */}
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

            {/* Upload tab */}
            {imageMode === 'upload' && (
              <div className="image-upload-zone">
                {previewSrc ? (
                  <div className="image-preview">
                    <img src={previewSrc} alt="Preview" />
                    <div className="image-overlay">
                      <button type="button" className="btn secondary"
                        onClick={() => document.getElementById('image-upload').click()}>
                        Change Logo
                      </button>
                    </div>
                  </div>
                ) : (
                  <label htmlFor="image-upload" className="upload-placeholder">
                    <Upload size={26} />
                    <span>Click to upload logo</span>
                    <small>PNG, JPG — transparent background preferred</small>
                  </label>
                )}
                <input type="file" id="image-upload" accept="image/*"
                  onChange={handleImageChange} style={{ display: 'none' }} />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SponsorForm;
