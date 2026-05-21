import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './layout/DashboardLayout';
import Overview from './pages/Overview';
import SpeakersList from './pages/SpeakersList';
import SpeakerForm from './pages/SpeakerForm';
import Settings from './pages/Settings';
import ApiDocs from './pages/ApiDocs';
import './App.css';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('tedx_token');
  return token ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Overview />} />
          <Route path="speakers" element={<SpeakersList />} />
          <Route path="speakers/new" element={<SpeakerForm />} />
          <Route path="speakers/edit/:id" element={<SpeakerForm />} />
          <Route path="api-docs" element={<ApiDocs />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
