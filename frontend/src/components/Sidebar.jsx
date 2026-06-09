import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Users, LogOut, Settings, LayoutDashboard, Code, X, ImageIcon, Building,
  FileText, Link2, MessageSquare, Terminal, GitCommit, ChevronDown, Wallet,
  ArrowLeftRight, Hash, UserCog,
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ isOpen = false, onClose = () => {}, role = 'member', permissions = null }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = role === 'admin';
  const isStaff = role === 'admin' || role === 'editor';

  // Member capabilities. Staff implicitly have all of them; members get whatever
  // the admin enabled (permissions comes from /api/auth/me; null while loading).
  const caps = permissions || {};
  const canViewContent = isStaff || !!caps.viewContent;
  const canLinks       = isStaff || !!caps.manageLinks;
  const canMedia       = isStaff || !!caps.uploadMedia;
  const canForum       = isStaff || !!caps.forum;

  const isDevPage = location.pathname === '/api-docs' || location.pathname === '/commit-logs';
  const [devOpen, setDevOpen] = useState(isDevPage);

  const isFinancePage = location.pathname.startsWith('/accounts') || location.pathname.startsWith('/transactions');
  const [financeOpen, setFinanceOpen] = useState(isFinancePage);

  const handleLogout = () => {
    localStorage.removeItem('tedx_token');
    navigate('/login');
  };

  const showContentSection = canViewContent || isStaff || canMedia || canLinks;

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h2 className="logo">TEDx<span>Admin</span></h2>
        <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
          <X size={20} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">

          {/* ── Main ─────────────────────────────────────── */}
          <li>
            <NavLink to="/dashboard" className="nav-item" onClick={onClose}>
              <LayoutDashboard size={18} />
              <span>Overview</span>
            </NavLink>
          </li>
          {canForum && (
            <li>
              <NavLink to="/forum" className="nav-item" onClick={onClose}>
                <Hash size={18} />
                <span>Forum</span>
              </NavLink>
            </li>
          )}

          {/* ── Content ──────────────────────────────────── */}
          {showContentSection && <li className="nav-section">Content</li>}
          {canViewContent && (
            <>
              <li>
                <NavLink to="/speakers" className="nav-item" onClick={onClose}>
                  <Users size={18} />
                  <span>Speakers</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/sponsors" className="nav-item" onClick={onClose}>
                  <Building size={18} />
                  <span>Sponsors</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/blogs" className="nav-item" onClick={onClose}>
                  <FileText size={18} />
                  <span>Blogs</span>
                </NavLink>
              </li>
            </>
          )}
          {isStaff && (
            <li>
              <NavLink to="/popups" className="nav-item" onClick={onClose}>
                <MessageSquare size={18} />
                <span>Popups</span>
              </NavLink>
            </li>
          )}
          {canMedia && (
            <li>
              <NavLink to="/media" className="nav-item" onClick={onClose}>
                <ImageIcon size={18} />
                <span>Media</span>
              </NavLink>
            </li>
          )}
          {canLinks && (
            <li>
              <NavLink to="/links" className="nav-item" onClick={onClose}>
                <Link2 size={18} />
                <span>Links &amp; QR</span>
              </NavLink>
            </li>
          )}

          {/* ── Finance (admin) ──────────────────────────── */}
          {isAdmin && (
            <>
              <li className="nav-section">Finance</li>
              <li className="nav-group">
                <button
                  className={`nav-item nav-group-trigger ${isFinancePage ? 'active' : ''}`}
                  onClick={() => setFinanceOpen(o => !o)}
                  aria-expanded={financeOpen}
                >
                  <Wallet size={18} />
                  <span>Accounts</span>
                  <ChevronDown size={14} className={`nav-chevron ${financeOpen ? 'open' : ''}`} />
                </button>
                {financeOpen && (
                  <ul className="nav-sub-list">
                    <li>
                      <NavLink to="/accounts" end className="nav-item nav-sub-item" onClick={onClose}>
                        <LayoutDashboard size={15} />
                        <span>Overview</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/transactions" className="nav-item nav-sub-item" onClick={onClose}>
                        <ArrowLeftRight size={15} />
                        <span>Transactions</span>
                      </NavLink>
                    </li>
                  </ul>
                )}
              </li>
            </>
          )}

          {/* ── Administration (admin) ───────────────────── */}
          {isAdmin && (
            <>
              <li className="nav-section">Administration</li>
              <li>
                <NavLink to="/users" className="nav-item" onClick={onClose}>
                  <UserCog size={18} />
                  <span>Users</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/teams" className="nav-item" onClick={onClose}>
                  <Users size={18} />
                  <span>Teams</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/settings" className="nav-item" onClick={onClose}>
                  <Settings size={18} />
                  <span>Settings</span>
                </NavLink>
              </li>
            </>
          )}

          {/* ── Developer (admin) ────────────────────────── */}
          {isAdmin && (
            <>
              <li className="nav-section">Developer</li>
              <li className="nav-group">
                <button
                  className={`nav-item nav-group-trigger ${isDevPage ? 'active' : ''}`}
                  onClick={() => setDevOpen(o => !o)}
                  aria-expanded={devOpen}
                >
                  <Terminal size={18} />
                  <span>Developer</span>
                  <ChevronDown size={14} className={`nav-chevron ${devOpen ? 'open' : ''}`} />
                </button>
                {devOpen && (
                  <ul className="nav-sub-list">
                    <li>
                      <NavLink to="/api-docs" className="nav-item nav-sub-item" onClick={onClose}>
                        <Code size={15} />
                        <span>API Docs</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/commit-logs" className="nav-item nav-sub-item" onClick={onClose}>
                        <GitCommit size={15} />
                        <span>Commit Logs</span>
                      </NavLink>
                    </li>
                  </ul>
                )}
              </li>
            </>
          )}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout}>
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
