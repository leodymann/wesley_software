import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AdminRoute } from "./AdminRoute";
import AppLayout from "../components/AppLayout";

import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Clients from "../pages/Clients";
import Products from "../pages/Products";
import Sales from "../pages/Sales";
import Promissories from "../pages/Promissories";
import Installments from "../pages/Installments";
import Finance from "../pages/Finance";
import Users from "../pages/Users";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  { path: "/login", element: <Login /> },

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/clients", element: <Clients /> },
          { path: "/products", element: <Products /> },
          { path: "/sales", element: <Sales /> },
          { path: "/promissories", element: <Promissories /> },
          { path: "/installments", element: <Installments /> },
          { path: "/users", element: <Users /> },

          {
            element: <AdminRoute />,
            children: [{ path: "/finance", element: <Finance /> }],
          },
        ],
      },
    ],
  },
]);
