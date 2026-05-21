import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import './DashboardLayout.css';

const PAGE_TITLES = {
  '/dashboard': 'Overview',
  '/speakers': 'Speakers',
  '/speakers/new': 'Add Speaker',
  '/api-docs': 'API Documentation',
  '/settings': 'Settings',
};

const DashboardLayout = () => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  return (
    <div className="dashboard-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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
              <div className="avatar">A</div>
              <span className="user-name">Admin</span>
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
