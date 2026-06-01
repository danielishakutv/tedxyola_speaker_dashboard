import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './layout/DashboardLayout';
import Overview from './pages/Overview';
import SpeakersList from './pages/SpeakersList';
import SpeakerForm from './pages/SpeakerForm';
import Settings from './pages/Settings';
import ApiDocs from './pages/ApiDocs';
import Media from './pages/Media';
import Links from './pages/Links';
import './App.css';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('tedx_token');
  return token ? children : <Navigate to="/login" replace />;
};

const getRoleFromToken = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role || null;
  } catch {
    return null;
  }
};

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

        {/* <Route path="/" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}> */}
        <Route path="/" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Overview />} />
          <Route path="speakers" element={<SpeakersList />} />
          <Route path="speakers/new" element={<SpeakerForm />} />
          <Route path="speakers/edit/:id" element={<SpeakerForm />} />
          <Route path="media" element={<Media />} />
          <Route path="links" element={<Links />} />
          <Route path="api-docs" element={<AdminRoute><ApiDocs /></AdminRoute>} />
          <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
