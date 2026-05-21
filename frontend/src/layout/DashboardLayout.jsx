import { Outlet, useLocation } from 'react-router-dom';
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
  
  // Determine page title from path
  const pathKey = Object.keys(PAGE_TITLES).find(key => location.pathname.startsWith(key));
  const title = location.pathname.includes('/speakers/edit')
    ? 'Edit Speaker' 
    : PAGE_TITLES[pathKey] || 'Dashboard';

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-content">
            <h1 className="page-title">{title}</h1>
            <div className="user-profile">
              <div className="avatar">A</div>
              <span>Admin</span>
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
