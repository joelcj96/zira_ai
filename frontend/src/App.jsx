import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ProfilePage from "./pages/ProfilePage";
import JobsPage from "./pages/JobsPage";
import TrackerPage from "./pages/TrackerPage";
import SmartApplySettingsPage from "./pages/SmartApplySettingsPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import SupportPage from "./pages/SupportPage";
import JobViewPage from "./pages/JobViewPage";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";

const ProtectedRoute = ({ children }) => {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const AdminRoute = ({ children }) => {
  const { token, user } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="jobs" element={<Navigate to="/jobs/all" replace />} />
        <Route path="jobs/all" element={<JobsPage />} />
        <Route path="jobs/best-matches" element={<JobsPage />} />
        <Route path="jobs/not-applied" element={<JobsPage />} />
        <Route path="jobs/applied" element={<JobsPage />} />
        <Route path="jobs/proposal-draft" element={<JobsPage />} />
        <Route path="jobs/view" element={<JobViewPage />} />
        <Route path="tracker" element={<TrackerPage />} />
        <Route path="settings" element={<SmartApplySettingsPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <AdminDashboardPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
