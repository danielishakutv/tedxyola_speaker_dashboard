import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, AlertCircle, Calendar } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import './BlogForm.css';

const REQUIRED_FIELDS  = ['title', 'content', 'category', 'author'];
const FIELD_LABELS = {
  title: 'Blog Title',
  content: 'Blog Content',
  category: 'Category',
  author: 'Author',
  publishDate: 'Publish Date'
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
      const payload = {
        ...formData,
        status: targetStatus,
      };
      const res = await authFetch(
        isEditing ? `/api/blogs/${id}` : '/api/blogs',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
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

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="blog-form-page">

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

        {/* ── Main Content ──────────────────────────────── */}
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
            <label>
              Publish Date <span className="optional">(optional)</span>
            </label>
            <div className="date-input-wrapper">
              <Calendar size={15} className="date-icon" />
              <input
                type="date"
                name="publishDate"
                value={formData.publishDate}
                onChange={handleChange}
                className={errors.publishDate ? 'input-error' : ''}
              />
            </div>
            {errors.publishDate && <span className="field-error"><AlertCircle size={12} />{errors.publishDate}</span>}
          </div>

          <div className="form-group">
            <label>Blog Content <span className="required">*</span></label>
            <textarea
              name="content"
              value={formData.content}
              onChange={handleChange}
              placeholder="Write your blog post content here. Share your insights, stories, and ideas…"
              rows="16"
              className={errors.content ? 'input-error' : ''}
            />
            {errors.content && <span className="field-error"><AlertCircle size={12} />{errors.content}</span>}
            <small className="field-hint">
              {formData.content.length} characters · {Math.ceil(formData.content.split(/\s+/).filter(w => w).length / 200)} min read
            </small>
          </div>
        </div>

      </div>
    </div>
  );
};

export default BlogForm;
