import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, AlertCircle, ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import {
  CURRENCY_SYMBOL, INCOME_CATEGORIES, EXPENSE_CATEGORIES, todayInput, accountTypeLabel, formatNaira,
} from '../utils/finance';
import './AccountForm.css';
import './TransactionForm.css';

const TYPES = [
  { value: 'INCOME',   label: 'Income',   icon: ArrowDownLeft,  hint: 'Money received' },
  { value: 'EXPENSE',  label: 'Expense',  icon: ArrowUpRight,   hint: 'Money spent' },
  { value: 'TRANSFER', label: 'Transfer', icon: ArrowLeftRight, hint: 'Between accounts' },
];

const TransactionForm = () => {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const isEditing = Boolean(id);

  const [accounts, setAccounts] = useState([]);
  const [formData, setFormData] = useState({
    type: 'EXPENSE', amount: '', accountId: '', toAccountId: '',
    category: '', note: '', date: todayInput(),
  });
  const [loading,      setLoading]      = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [errors,       setErrors]       = useState({});
  // top-level server error (e.g. insufficient funds returned by API)
  const [submitError,  setSubmitError]  = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const accRes = await authFetch('/api/accounts');
        const accData = accRes.ok ? await accRes.json() : [];
        setAccounts(accData);

        if (isEditing) {
          const res = await authFetch(`/api/transactions/${id}`);
          if (res.ok) {
            const t = await res.json();
            setFormData({
              type:        t.type,
              amount:      t.amount ?? '',
              accountId:   t.accountId || '',
              toAccountId: t.toAccountId || '',
              category:    t.category || '',
              note:        t.note || '',
              date:        t.date ? new Date(t.date).toISOString().slice(0, 10) : todayInput(),
            });
          }
        } else if (accData.length) {
          const first = accData.find(a => !a.archived) || accData[0];
          setFormData(prev => ({ ...prev, accountId: first.id }));
        }
      } catch (e) {
        console.error('Error loading transaction form:', e);
      } finally {
        setFetchLoading(false);
      }
    })();
  }, [id, isEditing]);

  const setType = (type) => {
    setFormData(prev => ({
      ...prev,
      type,
      category:    type === 'TRANSFER' ? '' : prev.category,
      toAccountId: type === 'TRANSFER' ? prev.toAccountId : '',
    }));
    setErrors({});
    setSubmitError(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
    if (submitError)  setSubmitError(null);
  };

  // Derive the current balance for any account from the accounts list
  // (the GET /api/accounts endpoint already computes and returns balance)
  const balanceOf = (accountId) => {
    const acc = accounts.find(a => a.id === accountId);
    return acc?.balance ?? null;
  };

  // Client-side check: amount > balance for EXPENSE / TRANSFER
  const validate = () => {
    const errs = {};
    const amt = parseFloat(formData.amount);
    if (!formData.amount || isNaN(amt) || amt <= 0) errs.amount = 'Enter an amount greater than 0';
    if (!formData.accountId) errs.accountId = 'Select an account';

    if (formData.type === 'TRANSFER') {
      if (!formData.toAccountId) errs.toAccountId = 'Select a destination account';
      else if (formData.toAccountId === formData.accountId) errs.toAccountId = 'Must differ from the source account';
    }

    // Warn before even hitting the server
    if ((formData.type === 'EXPENSE' || formData.type === 'TRANSFER') && formData.accountId && !isNaN(amt) && amt > 0) {
      const bal = balanceOf(formData.accountId);
      if (bal !== null && amt > bal) {
        errs.amount = `Insufficient funds — available balance is ${formatNaira(bal)}`;
      }
    }

    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const validationErrors = validate();
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        type:        formData.type,
        amount:      parseFloat(formData.amount),
        accountId:   formData.accountId,
        toAccountId: formData.type === 'TRANSFER' ? formData.toAccountId : null,
        category:    formData.type === 'TRANSFER' ? null : formData.category.trim(),
        note:        formData.note.trim(),
        date:        formData.date,
      };
      const res = await authFetch(
        isEditing ? `/api/transactions/${id}` : '/api/transactions',
        { method: isEditing ? 'PUT' : 'POST', body: JSON.stringify(payload) }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Surface insufficient-funds (and other API errors) inline instead of alert
        setSubmitError(data.error || 'Failed to save transaction');
        return;
      }
      navigate('/transactions');
    } catch (err) {
      setSubmitError(err.message || 'Error saving transaction. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) return <div className="loading-state">Loading…</div>;

  const { type } = formData;
  const presets = type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const accountLabel =
    type === 'INCOME'  ? 'Deposit into' :
    type === 'EXPENSE' ? 'Pay from'     : 'From account';

  const accountOption = (a) => `${a.name}${a.archived ? ' (archived)' : ''} · ${accountTypeLabel(a.type)}`;

  // Balance hint shown under the account selector for EXPENSE / TRANSFER
  const sourceBalance = (type === 'EXPENSE' || type === 'TRANSFER') && formData.accountId
    ? balanceOf(formData.accountId)
    : null;

  const enteredAmt = parseFloat(formData.amount);
  const balanceInsufficient = sourceBalance !== null && !isNaN(enteredAmt) && enteredAmt > sourceBalance;

  if (!accounts.length) {
    return (
      <div className="transaction-form-page">
        <div className="form-page-header">
          <div className="header-left">
            <Link to="/accounts" className="back-btn"><ArrowLeft size={17} /></Link>
            <div><h2>Record Transaction</h2></div>
          </div>
        </div>
        <div className="card form-section" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            You need at least one account before recording a transaction.
          </p>
          <Link to="/accounts/new" className="btn primary">Create your first account</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="transaction-form-page">
      <div className="form-page-header">
        <div className="header-left">
          <Link to="/transactions" className="back-btn"><ArrowLeft size={17} /></Link>
          <div>
            <h2>{isEditing ? 'Edit Transaction' : 'Record Transaction'}</h2>
            <p className="form-page-subtitle">
              {isEditing ? 'Update this entry' : 'Log income, an expense, or a transfer between accounts'}
            </p>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn primary" onClick={handleSubmit} disabled={loading}>
            <Save size={15} /> {loading ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Transaction'}
          </button>
        </div>
      </div>

      <form className="form-section card" onSubmit={handleSubmit}>

        {/* Top-level API error banner */}
        {submitError && (
          <div className="form-error-banner">
            <AlertCircle size={15} />
            <span>{submitError}</span>
          </div>
        )}

        {/* Type toggle */}
        <div className="txn-type-toggle">
          {TYPES.map(t => (
            <button key={t.value} type="button"
              className={`txn-type-btn ${t.value.toLowerCase()} ${type === t.value ? 'active' : ''}`}
              onClick={() => setType(t.value)}>
              <t.icon size={16} />
              <span className="txn-type-label">{t.label}</span>
              <span className="txn-type-hint">{t.hint}</span>
            </button>
          ))}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Amount <span className="required">*</span></label>
            <div className="input-with-prefix">
              <span className="input-prefix">{CURRENCY_SYMBOL}</span>
              <input type="number" name="amount" value={formData.amount} onChange={handleChange}
                placeholder="0" step="0.01" min="0"
                className={errors.amount || balanceInsufficient ? 'input-error' : ''} />
            </div>
            {errors.amount
              ? <span className="field-error"><AlertCircle size={12} />{errors.amount}</span>
              : sourceBalance !== null && (
                  <span className={`field-hint ${balanceInsufficient ? 'field-hint-danger' : ''}`}>
                    Available: {formatNaira(sourceBalance)}
                  </span>
                )
            }
          </div>

          <div className="form-group">
            <label>Date</label>
            <input type="date" name="date" value={formData.date} onChange={handleChange} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{accountLabel} <span className="required">*</span></label>
            <select name="accountId" value={formData.accountId} onChange={handleChange}
              className={errors.accountId ? 'input-error' : ''}>
              <option value="">Select an account…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{accountOption(a)}</option>)}
            </select>
            {errors.accountId && <span className="field-error"><AlertCircle size={12} />{errors.accountId}</span>}
          </div>

          {type === 'TRANSFER' ? (
            <div className="form-group">
              <label>To account <span className="required">*</span></label>
              <select name="toAccountId" value={formData.toAccountId} onChange={handleChange}
                className={errors.toAccountId ? 'input-error' : ''}>
                <option value="">Select destination…</option>
                {accounts.filter(a => a.id !== formData.accountId).map(a => (
                  <option key={a.id} value={a.id}>{accountOption(a)}</option>
                ))}
              </select>
              {errors.toAccountId && <span className="field-error"><AlertCircle size={12} />{errors.toAccountId}</span>}
            </div>
          ) : (
            <div className="form-group">
              <label>Category <span className="optional">(optional)</span></label>
              <input list="txn-categories" name="category" value={formData.category} onChange={handleChange}
                placeholder="Choose or type a category…" />
              <datalist id="txn-categories">
                {presets.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Note <span className="optional">(optional)</span></label>
          <textarea name="note" value={formData.note} onChange={handleChange}
            placeholder="What was this for?" rows="3" />
        </div>
      </form>
    </div>
  );
};

export default TransactionForm;
