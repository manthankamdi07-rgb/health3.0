import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Register from './pages/Register';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import Landing from './pages/Landing';

/**
 * Dynamic Dashboard Router — sends DOCTOR users to DoctorDashboard
 * and PATIENT users to Dashboard.
 */
const DynamicDashboard: React.FC = () => {
  const userStr = localStorage.getItem('health_user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.role === 'DOCTOR') {
        return <DoctorDashboard />;
      }
    } catch {
      // Fallback to patient dashboard
    }
  }
  return <Dashboard />;
};

/**
 * Protected Route wrapper — redirects to /login if unauthenticated.
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('health_token');
  const user = localStorage.getItem('health_user');

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

/**
 * Public Route wrapper — redirects to /dashboard if already authenticated.
 */
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('health_token');
  const user = localStorage.getItem('health_user');

  if (token && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DynamicDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctor"
            element={
              <ProtectedRoute>
                <DoctorDashboard />
              </ProtectedRoute>
            }
          />
          {/* Landing page (public) */}
          <Route
            path="/"
            element={
              <PublicRoute>
                <Landing />
              </PublicRoute>
            }
          />

          {/* Default routes */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
