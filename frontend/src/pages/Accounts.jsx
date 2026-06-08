import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet, TrendingUp, TrendingDown, Scale, Plus, ArrowRight,
  Edit2, Archive, ArchiveRestore, Trash2, Landmark, Banknote, Smartphone, CircleDollarSign,
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
} from 'lucide-react';
import { authFetch } from '../utils/authFetch';
import { formatNaira, formatDate, accountTypeLabel } from '../utils/finance';
import './Accounts.css';

const typeIcon = (type) => {
  switch (type) {
    case 'BANK':   return <Landmark size={18} />;
    case 'CASH':   return <Banknote size={18} />;
    case 'MOBILE': return <Smartphone size={18} />;
    default:       return <CircleDollarSign size={18} />;
  }
};

const txnIcon = (type) => {
  if (type === 'INCOME')   return <span className="txn-ic income"><ArrowDownLeft size={14} /></span>;
  if (type === 'EXPENSE')  return <span className="txn-ic expense"><ArrowUpRight size={14} /></span>;
  return <span className="txn-ic transfer"><ArrowLeftRight size={14} /></span>;
};

const Skeleton = ({ w = '100%', h = '14px', r = '5px', style = {} }) => (
  <div className="fin-skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />
);

const Accounts = () => {
  const [summary, setSummary]   = useState(null);
  const [recent, setRecent]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const [sumRes, txnRes] = await Promise.all([
        authFetch('/api/finance/summary'),
        authFetch('/api/transactions?limit=8'),
      ]);
      if (!sumRes.ok) throw new Error('Failed to load summary');
      setSummary(await sumRes.json());
      setRecent(txnRes.ok ? await txnRes.json() : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleArchive = async (acc) => {
    try {
      const res = await authFetch(`/api/accounts/${acc.id}`, {
        method: 'PUT',
        body: JSON.stringify({ archived: !acc.archived }),
      });
      if (res.ok) load();
    } catch { alert('Could not update the account.'); }
  };

  const deleteAccount = async (acc) => {
    if (!window.confirm(`Delete "${acc.name}"? This only works if it has no transactions.`)) return;
    try {
      const res = await authFetch(`/api/accounts/${acc.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) load();
      else alert(data.error || 'Could not delete the account.');
    } catch { alert('Could not delete the account.'); }
  };

  const stats = summary ? [
    { label: 'Total Balance', value: summary.totalBalance, icon: Scale,        accent: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.05)' },
    { label: 'Total Income',  value: summary.totalIncome,  icon: TrendingUp,   accent: 'var(--success)',        bg: 'rgba(34,197,94,0.08)' },
    { label: 'Total Expenses',value: summary.totalExpense, icon: TrendingDown, accent: 'var(--danger)',         bg: 'rgba(239,68,68,0.08)' },
    { label: 'Net',           value: summary.net,          icon: Wallet,       accent: summary.net >= 0 ? 'var(--success)' : 'var(--danger)', bg: 'rgba(255,255,255,0.05)' },
  ] : [];

  const maxCat = (list) => Math.max(1, ...list.map(c => c.amount));

  return (
    <div className="fin-page">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h2>Accounts &amp; Finance</h2>
          <p className="page-subtitle">
            {summary
              ? `${summary.accountCount} account${summary.accountCount !== 1 ? 's' : ''} · ${summary.transactionCount} transaction${summary.transactionCount !== 1 ? 's' : ''}`
              : 'Track income, expenses and account balances'}
          </p>
          {error && <small className="error-hint">Backend offline — data may be stale</small>}
        </div>
        <div className="header-actions">
          <Link to="/accounts/new" className="btn secondary"><Plus size={15} /> Add Account</Link>
          <Link to="/transactions/new" className="btn primary"><Plus size={15} /> Record Transaction</Link>
        </div>
      </div>

      {/* ── Summary stat cards ─────────────────────────── */}
      <div className="fin-stats-grid">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="fin-stat card">
                <Skeleton w="36px" h="36px" r="8px" />
                <div style={{ flex: 1 }}>
                  <Skeleton w="90px" h="24px" style={{ marginBottom: 6 }} />
                  <Skeleton w="70px" h="11px" />
                </div>
              </div>
            ))
          : stats.map((s, i) => (
              <div key={i} className="fin-stat card">
                <div className="fin-stat-icon" style={{ background: s.bg, color: s.accent }}>
                  <s.icon size={20} />
                </div>
                <div className="fin-stat-info">
                  <span className="fin-stat-value" style={{ color: s.accent }}>{formatNaira(s.value)}</span>
                  <span className="fin-stat-label">{s.label}</span>
                </div>
              </div>
            ))}
      </div>

      <div className="fin-body">

        {/* ── Left column ──────────────────────────────── */}
        <div className="fin-left">

          {/* Accounts */}
          <div className="fin-section-header">
            <h3>Your Accounts</h3>
            <Link to="/accounts/new" className="fin-view-all">Add account <Plus size={13} /></Link>
          </div>

          {loading ? (
            <div className="fin-accounts-grid">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card fin-acc-card"><Skeleton w="60%" h="14px" /><Skeleton w="40%" h="22px" style={{ marginTop: 12 }} /></div>
              ))}
            </div>
          ) : !summary?.accounts.length ? (
            <div className="empty-state card">
              <div className="empty-state-icon"><Wallet size={22} /></div>
              <h3>No accounts yet</h3>
              <p>Add a cash box, bank or mobile-money account to start recording money.</p>
              <Link to="/accounts/new" className="btn primary" style={{ marginTop: '0.5rem' }}><Plus size={14} /> Add Account</Link>
            </div>
          ) : (
            <div className="fin-accounts-grid">
              {summary.accounts.map(acc => (
                <div key={acc.id} className={`card fin-acc-card ${acc.archived ? 'archived' : ''}`}>
                  <div className="fin-acc-top">
                    <span className="fin-acc-type-ic">{typeIcon(acc.type)}</span>
                    <div className="fin-acc-actions">
                      <Link to={`/accounts/edit/${acc.id}`} className="icon-btn" title="Edit"><Edit2 size={13} /></Link>
                      <button className="icon-btn" title={acc.archived ? 'Restore' : 'Archive'} onClick={() => toggleArchive(acc)}>
                        {acc.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                      </button>
                      <button className="icon-btn danger" title="Delete" onClick={() => deleteAccount(acc)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="fin-acc-name">
                    {acc.name}
                    {acc.archived && <span className="fin-acc-archived-tag">Archived</span>}
                  </div>
                  <div className="fin-acc-meta">{accountTypeLabel(acc.type)}</div>
                  <div className={`fin-acc-balance ${acc.balance < 0 ? 'negative' : ''}`}>{formatNaira(acc.balance)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Recent transactions */}
          <div className="fin-section-header" style={{ marginTop: '1.75rem' }}>
            <h3>Recent Transactions</h3>
            <Link to="/transactions" className="fin-view-all">View all <ArrowRight size={14} /></Link>
          </div>

          {loading ? (
            <div className="card fin-table-wrap">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="fin-table-sk-row">
                  <Skeleton w="28px" h="28px" r="50%" />
                  <div style={{ flex: 1 }}><Skeleton w="60%" h="12px" style={{ marginBottom: 5 }} /><Skeleton w="40%" h="10px" /></div>
                  <Skeleton w="80px" h="14px" />
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-state-icon"><ArrowLeftRight size={22} /></div>
              <h3>No transactions yet</h3>
              <p>Record your first income or expense to see it here.</p>
              <Link to="/transactions/new" className="btn primary" style={{ marginTop: '0.5rem' }}><Plus size={14} /> Record Transaction</Link>
            </div>
          ) : (
            <div className="card fin-table-wrap">
              <table className="fin-table">
                <tbody>
                  {recent.map(t => (
                    <tr key={t.id}>
                      <td className="fin-td-ic">{txnIcon(t.type)}</td>
                      <td>
                        <Link to={`/transactions/edit/${t.id}`} className="fin-txn-main">
                          <span className="fin-txn-title">
                            {t.type === 'TRANSFER'
                              ? `Transfer · ${t.account?.name} → ${t.toAccount?.name}`
                              : (t.category || (t.type === 'INCOME' ? 'Income' : 'Expense'))}
                          </span>
                          <span className="fin-txn-sub">
                            {t.type === 'TRANSFER' ? '' : `${t.account?.name} · `}{formatDate(t.date)}
                            {t.note ? ` · ${t.note}` : ''}
                          </span>
                        </Link>
                      </td>
                      <td className={`fin-td-amount ${t.type === 'INCOME' ? 'income' : t.type === 'EXPENSE' ? 'expense' : 'transfer'}`}>
                        {t.type === 'INCOME' ? '+' : t.type === 'EXPENSE' ? '−' : ''}{formatNaira(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Right column: category breakdowns ────────── */}
        <div className="fin-right">
          {!loading && summary && (
            <>
              <div className="card fin-breakdown">
                <h4><TrendingUp size={14} style={{ color: 'var(--success)' }} /> Income by Category</h4>
                {summary.incomeByCategory.length === 0 ? (
                  <p className="fin-breakdown-empty">No income recorded yet.</p>
                ) : (
                  <div className="fin-bars">
                    {summary.incomeByCategory.map(c => (
                      <div key={c.category} className="fin-bar-row">
                        <div className="fin-bar-label"><span>{c.category}</span><strong>{formatNaira(c.amount)}</strong></div>
                        <div className="fin-bar-track"><div className="fin-bar-fill income" style={{ width: `${(c.amount / maxCat(summary.incomeByCategory)) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card fin-breakdown">
                <h4><TrendingDown size={14} style={{ color: 'var(--danger)' }} /> Expenses by Category</h4>
                {summary.expenseByCategory.length === 0 ? (
                  <p className="fin-breakdown-empty">No expenses recorded yet.</p>
                ) : (
                  <div className="fin-bars">
                    {summary.expenseByCategory.map(c => (
                      <div key={c.category} className="fin-bar-row">
                        <div className="fin-bar-label"><span>{c.category}</span><strong>{formatNaira(c.amount)}</strong></div>
                        <div className="fin-bar-track"><div className="fin-bar-fill expense" style={{ width: `${(c.amount / maxCat(summary.expenseByCategory)) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default Accounts;
