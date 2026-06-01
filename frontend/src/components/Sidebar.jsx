import { NavLink, useNavigate } from 'react-router-dom';
import { Users, LogOut, Settings, LayoutDashboard, Code, X, ImageIcon, Link2 } from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ isOpen = false, onClose = () => {}, isAdmin = false }) => {
  const navigate = useNavigate();

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
          {isAdmin && (
            <li>
              <NavLink to="/api-docs" className="nav-item" onClick={onClose}>
                <Code size={18} />
                <span>API Docs</span>
              </NavLink>
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
