import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import { ACCOUNT_TYPES, CURRENCY_SYMBOL } from '../utils/finance';
import './AccountForm.css';

const AccountForm = () => {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState({
    name: '', type: 'BANK', description: '', openingBalance: '',
  });
  const [loading,      setLoading]      = useState(false);
  const [fetchLoading, setFetchLoading] = useState(isEditing);
  const [errors,       setErrors]       = useState({});

  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const res = await authFetch(`/api/accounts/${id}`);
        if (res.ok) {
          const data = await res.json();
          setFormData({
            name:           data.name || '',
            type:           data.type || 'BANK',
            description:    data.description || '',
            openingBalance: data.openingBalance ?? '',
          });
        }
      } catch (e) {
        console.error('Error fetching account:', e);
      } finally {
        setFetchLoading(false);
      }
    })();
  }, [id, isEditing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Account name is required';
    if (formData.openingBalance !== '' && isNaN(parseFloat(formData.openingBalance))) {
      errs.openingBalance = 'Opening balance must be a number';
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name:           formData.name.trim(),
        type:           formData.type,
        description:    formData.description.trim(),
        openingBalance: formData.openingBalance === '' ? 0 : parseFloat(formData.openingBalance),
      };
      const res = await authFetch(
        isEditing ? `/api/accounts/${id}` : '/api/accounts',
        { method: isEditing ? 'PUT' : 'POST', body: JSON.stringify(payload) }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save account');
      }
      navigate('/accounts');
    } catch (err) {
      alert(err.message || 'Error saving account. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) return <div className="loading-state">Loading account…</div>;

  return (
    <div className="account-form-page">
      <div className="form-page-header">
        <div className="header-left">
          <Link to="/accounts" className="back-btn"><ArrowLeft size={17} /></Link>
          <div>
            <h2>{isEditing ? 'Edit Account' : 'Add New Account'}</h2>
            <p className="form-page-subtitle">
              {isEditing ? 'Update this account’s details' : 'A place money lives — cash box, bank or mobile money'}
            </p>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn primary" onClick={handleSubmit} disabled={loading}>
            <Save size={15} /> {loading ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Account'}
          </button>
        </div>
      </div>

      <form className="form-section card" onSubmit={handleSubmit}>
        <h3 className="section-heading">Account Information</h3>

        <div className="form-group">
          <label>Account Name <span className="required">*</span></label>
          <input type="text" name="name" value={formData.name} onChange={handleChange}
            placeholder="e.g. GTBank Main, Cash Box, Opay" className={errors.name ? 'input-error' : ''} />
          {errors.name && <span className="field-error"><AlertCircle size={12} />{errors.name}</span>}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Type</label>
            <select name="type" value={formData.type} onChange={handleChange}>
              {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Opening Balance <span className="optional">(optional)</span></label>
            <div className="input-with-prefix">
              <span className="input-prefix">{CURRENCY_SYMBOL}</span>
              <input type="number" name="openingBalance" value={formData.openingBalance} onChange={handleChange}
                placeholder="0" step="0.01" className={errors.openingBalance ? 'input-error' : ''} />
            </div>
            {errors.openingBalance
              ? <span className="field-error"><AlertCircle size={12} />{errors.openingBalance}</span>
              : <span className="field-hint">Balance already in this account before you start recording.</span>}
          </div>
        </div>

        <div className="form-group">
          <label>Description <span className="optional">(optional)</span></label>
          <textarea name="description" value={formData.description} onChange={handleChange}
            placeholder="A note about this account…" rows="3" />
        </div>
      </form>
    </div>
  );
};

export default AccountForm;
