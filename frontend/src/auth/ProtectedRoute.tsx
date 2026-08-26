import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute() {
  const { ready, loading, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-fill">
        <Spin size="large" />
      </div>
    );
  }

  if (ready && !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function GuestRoute() {
  const { ready, loading, session } = useAuth();

  if (loading) {
    return (
      <div className="page-fill">
        <Spin size="large" />
      </div>
    );
  }

  if (ready && session) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
