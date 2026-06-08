import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './layout/DashboardLayout';
import Overview from './pages/Overview';
import SpeakersList from './pages/SpeakersList';
import SpeakerForm from './pages/SpeakerForm';
import SponsorsList from './pages/SponsorsList';
import SponsorForm from './pages/SponsorForm';
import BlogsList from './pages/BlogsList';
import BlogForm from './pages/BlogForm';
import PopupsList from './pages/PopupsList';
import PopupForm from './pages/PopupForm';
import Settings from './pages/Settings';
import ApiDocs from './pages/ApiDocs';
import CommitLogs from './pages/CommitLogs';
import Media from './pages/Media';
import Links from './pages/Links';
import Accounts from './pages/Accounts';
import AccountForm from './pages/AccountForm';
import Transactions from './pages/Transactions';
import TransactionForm from './pages/TransactionForm';
import Forum from './pages/Forum';
import Users from './pages/Users';
import ChangePassword from './pages/ChangePassword';
import './App.css';

const decodeToken = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

// Guards dashboard routes: needs a token, and if an admin reset the password the
// user is forced to /change-password before they can reach anything else.
const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('tedx_token');
  if (!token) return <Navigate to="/login" replace />;
  const payload = decodeToken(token);
  if (payload?.mustChangePassword) return <Navigate to="/change-password" replace />;
  return children;
};

// Lighter guard for the change-password page itself: only requires a token
// (must stay reachable while mustChangePassword is true).
const AuthedRoute = ({ children }) => {
  const token = localStorage.getItem('tedx_token');
  return token ? children : <Navigate to="/login" replace />;
};

const getRoleFromToken = (token) => decodeToken(token)?.role || null;

const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('tedx_token');
  if (!token) return <Navigate to="/login" replace />;
  const role = getRoleFromToken(token);
  return role === 'admin' ? children : <Navigate to="/dashboard" replace />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<AuthedRoute><ChangePassword /></AuthedRoute>} />

        {/* <Route path="/" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}> */}
        <Route path="/" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Overview />} />
          <Route path="speakers" element={<SpeakersList />} />
          <Route path="speakers/new" element={<SpeakerForm />} />
          <Route path="speakers/edit/:id" element={<SpeakerForm />} />
          <Route path="sponsors" element={<SponsorsList />} />
          <Route path="sponsors/new" element={<SponsorForm />} />
          <Route path="sponsors/edit/:id" element={<SponsorForm />} />
          <Route path="blogs" element={<BlogsList />} />
          <Route path="blogs/new" element={<BlogForm />} />
          <Route path="blogs/edit/:id" element={<BlogForm />} />
          <Route path="popups" element={<PopupsList />} />
          <Route path="popups/new" element={<PopupForm />} />
          <Route path="popups/edit/:id" element={<PopupForm />} />
          <Route path="media" element={<Media />} />
          <Route path="links" element={<Links />} />
          <Route path="accounts" element={<AdminRoute><Accounts /></AdminRoute>} />
          <Route path="accounts/new" element={<AdminRoute><AccountForm /></AdminRoute>} />
          <Route path="accounts/edit/:id" element={<AdminRoute><AccountForm /></AdminRoute>} />
          <Route path="transactions" element={<AdminRoute><Transactions /></AdminRoute>} />
          <Route path="transactions/new" element={<AdminRoute><TransactionForm /></AdminRoute>} />
          <Route path="transactions/edit/:id" element={<AdminRoute><TransactionForm /></AdminRoute>} />
          <Route path="forum" element={<PrivateRoute><Forum /></PrivateRoute>} />
          <Route path="api-docs" element={<AdminRoute><ApiDocs /></AdminRoute>} />
          <Route path="commit-logs" element={<AdminRoute><CommitLogs /></AdminRoute>} />
          <Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
          <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
