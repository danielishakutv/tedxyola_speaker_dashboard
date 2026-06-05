import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Users, LogOut, Settings, LayoutDashboard, Code, X, ImageIcon, Building, FileText, Link2, MessageSquare, Terminal, GitCommit, ChevronDown } from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ isOpen = false, onClose = () => {}, isAdmin = false }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-open the Developer dropdown when on a developer sub-page
  const isDevPage = location.pathname === '/api-docs' || location.pathname === '/commit-logs';
  const [devOpen, setDevOpen] = useState(isDevPage);

  const handleLogout = () => {
    localStorage.removeItem('tedx_token');
    navigate('/login');
  };

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
          <li>
            <NavLink to="/dashboard" className="nav-item" onClick={onClose}>
              <LayoutDashboard size={18} />
              <span>Overview</span>
            </NavLink>
          </li>
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
          <li>
            <NavLink to="/popups" className="nav-item" onClick={onClose}>
              <MessageSquare size={18} />
              <span>Popups</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/media" className="nav-item" onClick={onClose}>
              <ImageIcon size={18} />
              <span>Media</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/links" className="nav-item" onClick={onClose}>
              <Link2 size={18} />
              <span>Links &amp; QR</span>
            </NavLink>
          </li>

          {/* ── Developer dropdown ─────────────────────── */}
          {isAdmin && (
            <li className="nav-group">
              <button
                className={`nav-item nav-group-trigger ${isDevPage ? 'active' : ''}`}
                onClick={() => setDevOpen(o => !o)}
                aria-expanded={devOpen}
              >
                <Terminal size={18} />
                <span>Developer</span>
                <ChevronDown
                  size={14}
                  className={`nav-chevron ${devOpen ? 'open' : ''}`}
                />
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
          )}

          {isAdmin && (
            <li>
              <NavLink to="/settings" className="nav-item" onClick={onClose}>
                <Settings size={18} />
                <span>Settings</span>
              </NavLink>
            </li>
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
