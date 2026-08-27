import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute() {
  const { ready, loading, session } = useAuth();
  const location = useLocation();
  const mustAuth = import.meta.env.PROD || ready;

  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-food-bg">
        <Spin size="large" />
      </div>
    );
  }

  if (mustAuth && !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function GuestRoute() {
  const { ready, loading, session } = useAuth();

  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-food-bg">
        <Spin size="large" />
      </div>
    );
  }

  if (ready && session) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
