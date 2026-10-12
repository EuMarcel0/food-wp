import { SalesByPaymentPage } from "./pages/relatorios/vendas-por-pagamento";
import { GuestRoute, ProtectedRoute } from "./auth/ProtectedRoute";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { canSeeBotAnalytics } from "./lib/access";
import { BotChartsPage } from "./pages/graficos";
import { ConversationsPage } from "./pages/conversas";
import { SettingsPage } from "./pages/configuracoes";
import { CategoriesPage } from "./pages/categorias";
import { DashboardPage } from "./pages/dashboard";
import { AppLayout } from "./layouts/AppLayout";
import { AddonsPage } from "./pages/adicionais";
import { CatalogPage } from "./pages/cardapio";
import { SignupPage } from "./pages/cadastro";
import { OrdersPage } from "./pages/pedidos";
import { LoginPage } from "./pages/login";

function BotChartsRoute() {
  const { user } = useAuth();
  return canSeeBotAnalytics(user?.email) ? <BotChartsPage /> : <Navigate to='/' replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path='/login' element={<LoginPage />} />
        <Route path='/cadastro' element={<SignupPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path='/' element={<DashboardPage />} />
          <Route path='/pedidos' element={<OrdersPage />} />
          <Route path='/conversas' element={<ConversationsPage />} />
          <Route path='/cardapio' element={<CatalogPage />} />
          <Route path='/categorias' element={<CategoriesPage />} />
          <Route path='/adicionais' element={<AddonsPage />} />
          <Route path='/relatorios/vendas-por-pagamento' element={<SalesByPaymentPage />} />
          <Route path='/graficos' element={<BotChartsRoute />} />
          <Route path='/configuracoes' element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  );
}
