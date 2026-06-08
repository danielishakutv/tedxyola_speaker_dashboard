import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Search, Edit2, Trash2, ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import { formatNaira, formatDate } from '../utils/finance';
import './Transactions.css';

const txnIcon = (type) => {
  if (type === 'INCOME')   return <span className="txn-ic income"><ArrowDownLeft size={14} /></span>;
  if (type === 'EXPENSE')  return <span className="txn-ic expense"><ArrowUpRight size={14} /></span>;
  return <span className="txn-ic transfer"><ArrowLeftRight size={14} /></span>;
};

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter]     = useState('ALL');
  const [accountFilter, setAccountFilter] = useState('ALL');

  const load = async () => {
    try {
      setLoading(true);
      const [txnRes, accRes] = await Promise.all([
        authFetch('/api/transactions'),
        authFetch('/api/accounts'),
      ]);
      if (!txnRes.ok) throw new Error('Failed to fetch transactions');
      setTransactions(await txnRes.json());
      setAccounts(accRes.ok ? await accRes.json() : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    try {
      const res = await authFetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (res.ok) setTransactions(prev => prev.filter(t => t.id !== id));
    } catch { alert('Error deleting transaction'); }
  };

  const filtered = transactions.filter(t => {
    if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
    if (accountFilter !== 'ALL' && t.accountId !== accountFilter && t.toAccountId !== accountFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${t.category || ''} ${t.note || ''} ${t.account?.name || ''} ${t.toAccount?.name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Running totals for the filtered view
  const totals = filtered.reduce((acc, t) => {
    if (t.type === 'INCOME')  acc.income  += t.amount;
    if (t.type === 'EXPENSE') acc.expense += t.amount;
    return acc;
  }, { income: 0, expense: 0 });

  const counts = {
    ALL:      transactions.length,
    INCOME:   transactions.filter(t => t.type === 'INCOME').length,
    EXPENSE:  transactions.filter(t => t.type === 'EXPENSE').length,
    TRANSFER: transactions.filter(t => t.type === 'TRANSFER').length,
  };

  return (
    <div className="txn-page">
      <div className="page-header">
        <div>
          <h2>Transactions</h2>
          <p className="page-subtitle">
            {filtered.length} shown · <span style={{ color: 'var(--success)' }}>+{formatNaira(totals.income)}</span>
            {' '}· <span style={{ color: 'var(--danger)' }}>−{formatNaira(totals.expense)}</span>
          </p>
          {error && <small className="error-hint">Backend offline — data may be stale</small>}
        </div>
        <Link to="/transactions/new" className="btn primary"><Plus size={15} /> Record Transaction</Link>
      </div>

      {/* Controls */}
      <div className="controls-bar card">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input type="text" placeholder="Search category, note or account…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="divider" />
        <div className="filter-tabs">
          {['ALL', 'INCOME', 'EXPENSE', 'TRANSFER'].map(t => (
            <button key={t} className={`filter-tab ${typeFilter === t ? 'active' : ''}`}
              onClick={() => setTypeFilter(t)}>
              {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
              <span className="tab-count">{counts[t]}</span>
            </button>
          ))}
        </div>
        {accounts.length > 0 && (
          <select className="account-filter" value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
            <option value="ALL">All accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="card txn-table-wrap">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="txn-sk-row">
              <div className="txn-sk-block" style={{ width: 28, height: 28, borderRadius: '50%' }} />
              <div style={{ flex: 1 }}>
                <div className="txn-sk-block" style={{ width: '50%', height: 12, marginBottom: 6 }} />
                <div className="txn-sk-block" style={{ width: '30%', height: 10 }} />
              </div>
              <div className="txn-sk-block" style={{ width: 80, height: 14 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon"><ArrowLeftRight size={22} /></div>
          <h3>{transactions.length ? 'No matching transactions' : 'No transactions yet'}</h3>
          <p>{transactions.length
            ? 'Try changing the filters or search term.'
            : 'Record your first income or expense to start tracking.'}</p>
          {!transactions.length && (
            <Link to="/transactions/new" className="btn primary" style={{ marginTop: '0.5rem' }}>
              <Plus size={14} /> Record Transaction
            </Link>
          )}
        </div>
      ) : (
        <div className="card txn-table-wrap">
          <table className="txn-table">
            <thead>
              <tr>
                <th></th>
                <th>Details</th>
                <th>Account</th>
                <th>Category</th>
                <th>Date</th>
                <th className="ta-right">Amount</th>
                <th className="ta-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}>
                  <td className="txn-td-ic">{txnIcon(t.type)}</td>
                  <td>
                    <div className="txn-detail-title">
                      {t.type === 'TRANSFER' ? 'Transfer' : (t.category || (t.type === 'INCOME' ? 'Income' : 'Expense'))}
                    </div>
                    {t.note && <div className="txn-detail-note">{t.note}</div>}
                  </td>
                  <td className="txn-td-muted">
                    {t.type === 'TRANSFER'
                      ? <span>{t.account?.name} <span className="txn-arrow">→</span> {t.toAccount?.name}</span>
                      : t.account?.name}
                  </td>
                  <td className="txn-td-muted">{t.type === 'TRANSFER' ? '—' : (t.category || '—')}</td>
                  <td className="txn-td-muted">{formatDate(t.date)}</td>
                  <td className={`txn-td-amount ${t.type.toLowerCase()}`}>
                    {t.type === 'INCOME' ? '+' : t.type === 'EXPENSE' ? '−' : ''}{formatNaira(t.amount)}
                  </td>
                  <td className="txn-td-actions">
                    <Link to={`/transactions/edit/${t.id}`} className="icon-btn" title="Edit"><Edit2 size={13} /></Link>
                    <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(t.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Transactions;
