import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import './DashboardLayout.css';

const PAGE_TITLES = {
  '/dashboard': 'Overview',
  '/speakers': 'Speakers',
  '/speakers/new': 'Add Speaker',
  '/sponsors': 'Sponsors',
  '/blogs': 'Blogs',
  '/popups': 'Popups',
  '/media': 'Media Library',
  '/links': 'Links & QR Codes',
  '/api-docs': 'API Documentation',
  '/commit-logs': 'Commit Logs',
  '/settings': 'Settings',
};

/* Decode the JWT stored in localStorage to get user info */
const getUserFromToken = () => {
  try {
    const token = localStorage.getItem('tedx_token');
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { username: payload.username || 'User', role: payload.role || 'editor' };
  } catch {
    return null;
  }
};

const DashboardLayout = () => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user = getUserFromToken();

  // Lock background scroll while the mobile drawer is open
  useEffect(() => {
    document.body.classList.toggle('sidebar-open', sidebarOpen);
    return () => document.body.classList.remove('sidebar-open');
  }, [sidebarOpen]);

  // Determine page title from path
  const pathKey = Object.keys(PAGE_TITLES).find(key => location.pathname.startsWith(key));
  const title = location.pathname.includes('/speakers/edit')
    ? 'Edit Speaker'
    : PAGE_TITLES[pathKey] || 'Dashboard';

  const avatarLetter = user?.username?.charAt(0).toUpperCase() || 'U';
  const isAdmin = user?.role === 'admin';

  return (
    <div className="dashboard-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isAdmin={isAdmin} />

      {/* Backdrop — only visible/active on mobile when the drawer is open */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-content">
            <div className="topbar-left">
              <button
                className="menu-toggle"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
              <h1 className="page-title">{title}</h1>
            </div>
            <div className="user-profile">
              <div className="avatar">{avatarLetter}</div>
              <div className="user-info">
                <span className="user-name">{user?.username || 'User'}</span>
                <span className={`user-role-badge ${isAdmin ? 'admin' : 'editor'}`}>
                  {isAdmin ? 'Admin' : 'Editor'}
                </span>
              </div>
            </div>
          </div>
        </header>
        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
