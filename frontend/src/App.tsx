import { Navigate, Route, Routes } from "react-router-dom";
import { GuestRoute, ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { SignupPage } from "./pages/cadastro";
import { CatalogPage } from "./pages/cardapio";
import { CategoriesPage } from "./pages/categorias";
import { DashboardPage } from "./pages/dashboard";
import { LoginPage } from "./pages/login";
import { OrdersPage } from "./pages/pedidos";

export function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<SignupPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/pedidos" element={<OrdersPage />} />
          <Route path="/cardapio" element={<CatalogPage />} />
          <Route path="/categorias" element={<CategoriesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
