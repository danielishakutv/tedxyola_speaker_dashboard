import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, AlertCircle, Calendar, Upload, Link2, Image } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import MediaPicker from '../components/MediaPicker';
import RichTextEditor from '../components/RichTextEditor';
import './BlogForm.css';

const FIELD_LABELS = {
  title: 'Blog Title',
  category: 'Category',
  author: 'Author',
};

const CATEGORIES = [
  'Technology',
  'Innovation',
  'Science',
  'Design',
  'Business',
  'Social Impact',
  'Arts & Culture',
  'Education',
  'Health',
  'Environment',
  'Other'
];

/* Strip tags to count real words / validate non-empty rich text. */
const htmlToText = (html) => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return (tmp.textContent || '').replace(/ /g, ' ').trim();
};

const BlogForm = () => {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'Technology',
    author: '',
    publishDate: new Date().toISOString().split('T')[0],
  });

  const [imageMode,       setImageMode]       = useState('url'); // 'url' | 'upload' | 'media'
  const [imageFile,       setImageFile]       = useState(null);
  const [imageUrlInput,   setImageUrlInput]   = useState('');
  const [imagePreview,    setImagePreview]    = useState(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  const [loading,      setLoading]      = useState(false);
  const [fetchLoading, setFetchLoading] = useState(isEditing);
  const [errors,       setErrors]       = useState({});

  /* ── Load existing blog when editing ─────────────────── */
  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const res = await authFetch(`/api/blogs/${id}`);
        if (res.ok) {
          const data = await res.json();
          setFormData({
            title: data.title || '',
            content: data.content || '',
            category: data.category || 'Technology',
            author: data.author || '',
            publishDate: data.publishDate
              ? new Date(data.publishDate).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0],
          });
          if (data.imageUrl) {
            setImageUrlInput(data.imageUrl);
            setImagePreview(data.imageUrl);
            setImageMode('url');
          }
        }
      } catch (e) {
        console.error('Error fetching blog:', e);
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

  const handleContentChange = (html) => {
    setFormData(prev => ({ ...prev, content: html }));
    if (errors.content) setErrors(prev => ({ ...prev, content: null }));
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
    ['title', 'category', 'author'].forEach(field => {
      if (!formData[field].trim()) errs[field] = `${FIELD_LABELS[field]} is required`;
    });
    if (!htmlToText(formData.content)) errs.content = 'Blog Content is required';
    return errs;
  };

  /* ── Submit ──────────────────────────────────────────── */
  const handleSubmit = async (e, targetStatus) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      document.querySelector('.input-error, .field-error, .rte-error')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setLoading(true);
    try {
      const body = new FormData();
      body.append('title', formData.title);
      body.append('content', formData.content);
      body.append('category', formData.category);
      body.append('author', formData.author);
      body.append('publishDate', formData.publishDate);
      body.append('status', targetStatus);
      if (imageMode === 'upload') {
        if (imageFile) body.append('image', imageFile);
      } else {
        body.append('imageUrl', imageUrlInput.trim());
      }

      const res = await authFetch(
        isEditing ? `/api/blogs/${id}` : '/api/blogs',
        { method: isEditing ? 'PUT' : 'POST', body }
      );
      if (!res.ok) throw new Error('Failed to save blog');
      navigate('/blogs');
    } catch (err) {
      console.error(err);
      alert('Error saving blog. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) return <div className="loading-state">Loading blog…</div>;

  const previewSrc = imageMode === 'upload' ? imagePreview : (imageUrlInput.trim() || null);
  const wordCount  = htmlToText(formData.content).split(/\s+/).filter(Boolean).length;

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="blog-form-page">

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
          <Link to="/blogs" className="back-btn"><ArrowLeft size={17} /></Link>
          <div>
            <h2>{isEditing ? 'Edit Blog Post' : 'Create New Blog Post'}</h2>
            <p className="form-page-subtitle">
              {isEditing
                ? 'Update blog post details'
                : 'Title, content, category and author are required'}
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

      <div className="form-layout-blog">

        {/* ── Blog Details ──────────────────────────────── */}
        <div className="form-section card">
          <h3 className="section-heading">Blog Details</h3>

          <div className="form-group">
            <label>Blog Title <span className="required">*</span></label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g. The Future of Sustainable Innovation"
              className={errors.title ? 'input-error' : ''}
            />
            {errors.title && <span className="field-error"><AlertCircle size={12} />{errors.title}</span>}
          </div>

          <div className="field-row two-col">
            <div className="form-group">
              <label>Category <span className="required">*</span></label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className={errors.category ? 'input-error' : ''}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {errors.category && <span className="field-error"><AlertCircle size={12} />{errors.category}</span>}
            </div>

            <div className="form-group">
              <label>Author <span className="required">*</span></label>
              <input
                type="text"
                name="author"
                value={formData.author}
                onChange={handleChange}
                placeholder="e.g. John Doe"
                className={errors.author ? 'input-error' : ''}
              />
              {errors.author && <span className="field-error"><AlertCircle size={12} />{errors.author}</span>}
            </div>
          </div>

          <div className="form-group">
            <label>Publish Date <span className="optional">(optional)</span></label>
            <div className="date-input-wrapper">
              <Calendar size={15} className="date-icon" />
              <input
                type="date"
                name="publishDate"
                value={formData.publishDate}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        {/* ── Featured Image ────────────────────────────── */}
        <div className="form-section card">
          <h3 className="section-heading">Featured Image <span className="optional">(optional)</span></h3>

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
              <input type="url" value={imageUrlInput}
                onChange={e => setImageUrlInput(e.target.value)}
                placeholder="https://example.com/featured.jpg" />
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
                      onClick={() => document.getElementById('blog-image-upload').click()}>
                      Change Image
                    </button>
                  </div>
                </div>
              ) : (
                <label htmlFor="blog-image-upload" className="upload-placeholder">
                  <Upload size={26} />
                  <span>Click to upload featured image</span>
                  <small>PNG, JPG — wide/landscape preferred</small>
                </label>
              )}
              <input type="file" id="blog-image-upload" accept="image/*"
                onChange={handleImageChange} style={{ display: 'none' }} />
            </div>
          )}
        </div>

        {/* ── Content (rich text) ───────────────────────── */}
        <div className="form-section card">
          <div className="section-heading-row">
            <h3 className="section-heading">Blog Content <span className="required">*</span></h3>
            <span className="field-hint" style={{ marginTop: 0 }}>
              {wordCount} word{wordCount !== 1 ? 's' : ''} · {Math.max(1, Math.ceil(wordCount / 200))} min read
            </span>
          </div>
          <RichTextEditor
            value={formData.content}
            onChange={handleContentChange}
            placeholder="Write your blog post here. Use the toolbar for headings, lists, quotes, and links…"
            error={Boolean(errors.content)}
          />
          {errors.content && <span className="field-error" style={{ marginTop: '0.5rem' }}><AlertCircle size={12} />{errors.content}</span>}
        </div>

      </div>
    </div>
  );
};

export default BlogForm;
