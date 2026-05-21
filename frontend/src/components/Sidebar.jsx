import { NavLink, useNavigate } from 'react-router-dom';
import { Users, LogOut, Settings, LayoutDashboard, Code } from 'lucide-react';
import './Sidebar.css';

const Sidebar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('tedx_token');
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2 className="logo">TEDx<span>Admin</span></h2>
      </div>
      
      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li>
            <NavLink to="/dashboard" className="nav-item">
              <LayoutDashboard size={18} />
              <span>Overview</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/speakers" className="nav-item">
              <Users size={18} />
              <span>Speakers</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/api-docs" className="nav-item">
              <Code size={18} />
              <span>API Docs</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/settings" className="nav-item">
              <Settings size={18} />
              <span>Settings</span>
            </NavLink>
          </li>
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
