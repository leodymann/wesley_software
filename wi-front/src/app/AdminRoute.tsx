import { Navigate, Outlet } from "react-router-dom";
import { getRoleFromToken } from "../services/auth";

export function AdminRoute() {
  const role = getRoleFromToken();
  if (role === "ADMIN") return <Outlet />;
  return <Navigate to="/dashboard" replace />;
}
