import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { authFetch } from '../utils/authFetch';
import { decodeToken } from '../utils/auth';
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
  '/forum': 'Forum',
  '/accounts/new': 'Add Account',
  '/accounts': 'Accounts & Finance',
  '/transactions/new': 'Record Transaction',
  '/transactions': 'Transactions',
  '/api-docs': 'API Documentation',
  '/commit-logs': 'Commit Logs',
  '/users': 'User Management',
  '/teams': 'Teams',
  '/settings': 'Settings',
};

const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', member: 'Member' };

const DashboardLayout = () => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [permissions, setPermissions] = useState(null);

  const payload = decodeToken();
  const user = payload ? { username: payload.username || 'User', role: payload.role || 'member' } : null;
  const role = user?.role || 'member';
  const isAdmin = role === 'admin';
  const isStaff = role === 'admin' || role === 'editor';

  // Fetch fresh effective permissions (drives sidebar visibility for members and
  // read-only flags on content pages). Staff get all-true; members get the toggles.
  useEffect(() => {
    authFetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.permissions) setPermissions(data.permissions); })
      .catch(() => {});
  }, []);

  // Lock background scroll while the mobile drawer is open
  useEffect(() => {
    document.body.classList.toggle('sidebar-open', sidebarOpen);
    return () => document.body.classList.remove('sidebar-open');
  }, [sidebarOpen]);

  const pathKey = Object.keys(PAGE_TITLES).find(key => location.pathname.startsWith(key));
  const title = location.pathname.includes('/speakers/edit')
    ? 'Edit Speaker'
    : location.pathname.includes('/accounts/edit')
    ? 'Edit Account'
    : location.pathname.includes('/transactions/edit')
    ? 'Edit Transaction'
    : PAGE_TITLES[pathKey] || 'Dashboard';

  const isForumPage = location.pathname.startsWith('/forum');

  const avatarLetter = user?.username?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="dashboard-layout">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        role={role}
        permissions={permissions}
      />

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
                <span className={`user-role-badge ${role}`}>
                  {ROLE_LABEL[role] || 'Member'}
                </span>
              </div>
            </div>
          </div>
        </header>
        <div className={`content-area${isForumPage ? ' content-area--flush' : ''}`}>
          <Outlet context={{ role, isAdmin, isStaff, permissions }} />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
