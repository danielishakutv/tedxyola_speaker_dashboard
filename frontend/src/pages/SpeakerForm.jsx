import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, Save, CheckCircle, Plus, X, AlertCircle, Link2, Image } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import MediaPicker from '../components/MediaPicker';
import './SpeakerForm.css';

const PLATFORM_OPTIONS = ['Twitter', 'LinkedIn', 'Instagram', 'Facebook', 'YouTube', 'Website', 'GitHub', 'TikTok'];
const REQUIRED_FIELDS  = ['name', 'bio', 'company', 'talkTitle'];
const FIELD_LABELS = {
  name: 'Full Name', email: 'Email', phone: 'Phone', jobTitle: 'Job Title',
  company: 'Company / Organization', talkTitle: 'Talk Title', bio: 'Short Bio', description: 'Talk Description',
};

const SpeakerForm = () => {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', jobTitle: '',
    company: '', talkTitle: '', bio: '', description: '',
  });

  const [socialLinks,     setSocialLinks]     = useState([]);
  const [imageMode,       setImageMode]       = useState('url'); // 'url' | 'upload' | 'media'
  const [imageFile,       setImageFile]       = useState(null);
  const [imageUrlInput,   setImageUrlInput]   = useState('');
  const [imagePreview,    setImagePreview]    = useState(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [fetchLoading,    setFetchLoading]    = useState(isEditing);
  const [errors,          setErrors]          = useState({});

  /* ── Load existing speaker when editing ─────────────── */
  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const res = await authFetch(`/api/speakers/${id}`);
        if (res.ok) {
          const data = await res.json();
          setFormData({
            name: data.name || '', email: data.email || '', phone: data.phone || '',
            jobTitle: data.jobTitle || '', company: data.company || '',
            talkTitle: data.talkTitle || '', bio: data.bio || '', description: data.description || '',
          });
          if (data.imageUrl) {
            setImagePreview(data.imageUrl);
            setImageUrlInput(data.imageUrl);
            setImageMode('url');
          }
          if (data.socialLinks) {
            try { setSocialLinks(JSON.parse(data.socialLinks)); } catch { setSocialLinks([]); }
          }
        }
      } catch (e) {
        console.error('Error fetching speaker:', e);
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

  const addSocialLink    = () => setSocialLinks(prev => [...prev, { platform: 'Twitter', url: '' }]);
  const removeSocialLink = (i) => setSocialLinks(prev => prev.filter((_, idx) => idx !== i));
  const updateSocialLink = (i, field, value) =>
    setSocialLinks(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  /* ── Validation ──────────────────────────────────────── */
  const validate = () => {
    const errs = {};
    REQUIRED_FIELDS.forEach(field => {
      if (!formData[field].trim()) errs[field] = `${FIELD_LABELS[field]} is required`;
    });
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      errs.email = 'Enter a valid email address';
    socialLinks.forEach((link, i) => {
      if (!link.url.trim()) errs[`social_${i}`] = 'URL is required';
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
      body.append('socialLinks', JSON.stringify(socialLinks));
      body.append('status', targetStatus);
      if (imageMode === 'upload') {
        if (imageFile) body.append('image', imageFile);
      } else {
        body.append('imageUrl', imageUrlInput.trim());
      }
      const res = await authFetch(
        isEditing ? `/api/speakers/${id}` : '/api/speakers',
        { method: isEditing ? 'PUT' : 'POST', body }
      );
      if (!res.ok) throw new Error('Failed to save speaker');
      navigate('/speakers');
    } catch (err) {
      console.error(err);
      alert('Error saving speaker. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) return <div className="loading-state">Loading speaker…</div>;

  const previewSrc = imageMode === 'upload' ? imagePreview : (imageUrlInput.trim() || null);

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="speaker-form-page">

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
          <Link to="/speakers" className="back-btn"><ArrowLeft size={17} /></Link>
          <div>
            <h2>{isEditing ? 'Edit Speaker' : 'Add New Speaker'}</h2>
            <p className="form-page-subtitle">
              {isEditing
                ? 'Update speaker profile details'
                : 'Name, short bio, company and talk title are required — everything else is optional'}
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

        {/* ── Left: Personal Info ──────────────────────── */}
        <div className="form-section card">
          <h3 className="section-heading">Personal Information</h3>

          <div className="field-row two-col">
            <div className="form-group">
              <label>Full Name <span className="required">*</span></label>
              <input type="text" name="name" value={formData.name} onChange={handleChange}
                placeholder="Jane Doe" className={errors.name ? 'input-error' : ''} />
              {errors.name && <span className="field-error"><AlertCircle size={12} />{errors.name}</span>}
            </div>
            <div className="form-group">
              <label>Email <span className="optional">(optional)</span></label>
              <input type="email" name="email" value={formData.email} onChange={handleChange}
                placeholder="jane@example.com" className={errors.email ? 'input-error' : ''} />
              {errors.email && <span className="field-error"><AlertCircle size={12} />{errors.email}</span>}
            </div>
          </div>

          <div className="field-row two-col">
            <div className="form-group">
              <label>Job Title <span className="optional">(optional)</span></label>
              <input type="text" name="jobTitle" value={formData.jobTitle} onChange={handleChange}
                placeholder="e.g. CEO, Researcher, Activist" className={errors.jobTitle ? 'input-error' : ''} />
              {errors.jobTitle && <span className="field-error"><AlertCircle size={12} />{errors.jobTitle}</span>}
            </div>
            <div className="form-group">
              <label>Company / Organization <span className="required">*</span></label>
              <input type="text" name="company" value={formData.company} onChange={handleChange}
                placeholder="e.g. Google, MIT, UNICEF" className={errors.company ? 'input-error' : ''} />
              {errors.company && <span className="field-error"><AlertCircle size={12} />{errors.company}</span>}
            </div>
          </div>

          <div className="form-group">
            <label>Phone <span className="optional">(optional)</span></label>
            <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
              placeholder="+1 (555) 000-0000" className={errors.phone ? 'input-error' : ''} />
            {errors.phone && <span className="field-error"><AlertCircle size={12} />{errors.phone}</span>}
          </div>

          <div className="form-group">
            <label>Short Bio <span className="required">*</span></label>
            <textarea name="bio" value={formData.bio} onChange={handleChange}
              placeholder="A brief introduction about the speaker (shown on speaker cards)…"
              rows="3" className={errors.bio ? 'input-error' : ''} />
            {errors.bio && <span className="field-error"><AlertCircle size={12} />{errors.bio}</span>}
          </div>
        </div>

        {/* ── Right: Photo + Social ────────────────────── */}
        <div className="form-right">

          {/* Photo */}
          <div className="form-section card">
            <h3 className="section-heading">
              Speaker Photo <span className="optional">(optional)</span>
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
                  placeholder="https://example.com/photo.jpg" />
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
                        Change Photo
                      </button>
                    </div>
                  </div>
                ) : (
                  <label htmlFor="image-upload" className="upload-placeholder">
                    <Upload size={26} />
                    <span>Click to upload photo</span>
                    <small>PNG, JPG — high resolution preferred</small>
                  </label>
                )}
                <input type="file" id="image-upload" accept="image/*"
                  onChange={handleImageChange} style={{ display: 'none' }} />
              </div>
            )}
          </div>

          {/* Social Links */}
          <div className="form-section card">
            <div className="section-heading-row">
              <h3 className="section-heading">Social Media Links</h3>
              <button type="button" className="btn secondary small-btn" onClick={addSocialLink}>
                <Plus size={13} /> Add Link
              </button>
            </div>
            {socialLinks.length === 0 && <p className="empty-hint">No social links added yet.</p>}
            <div className="social-links-list">
              {socialLinks.map((link, i) => (
                <div key={i} className="social-link-row">
                  <select value={link.platform} onChange={e => updateSocialLink(i, 'platform', e.target.value)}>
                    {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <div style={{ flex: 1 }}>
                    <input type="url" value={link.url}
                      onChange={e => updateSocialLink(i, 'url', e.target.value)}
                      placeholder="https://…"
                      className={errors[`social_${i}`] ? 'input-error' : ''} />
                    {errors[`social_${i}`] && (
                      <span className="field-error" style={{ marginTop: '4px' }}>
                        <AlertCircle size={12} />{errors[`social_${i}`]}
                      </span>
                    )}
                  </div>
                  <button type="button" className="remove-link-btn" onClick={() => removeSocialLink(i)}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Full Width: Talk Details ─────────────────── */}
        <div className="form-section card full-width">
          <h3 className="section-heading">Talk Details</h3>
          <div className="form-group">
            <label>Talk Title <span className="required">*</span></label>
            <input type="text" name="talkTitle" value={formData.talkTitle} onChange={handleChange}
              placeholder="e.g. The Future of Sustainable Innovation"
              className={errors.talkTitle ? 'input-error' : ''} />
            {errors.talkTitle && <span className="field-error"><AlertCircle size={12} />{errors.talkTitle}</span>}
          </div>
          <div className="form-group">
            <label>Talk Description <span className="optional">(optional)</span></label>
            <textarea name="description" value={formData.description} onChange={handleChange}
              placeholder="Describe what this talk will cover, key themes, and what the audience will learn…"
              rows="6" className={errors.description ? 'input-error' : ''} />
            {errors.description && <span className="field-error"><AlertCircle size={12} />{errors.description}</span>}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SpeakerForm;
