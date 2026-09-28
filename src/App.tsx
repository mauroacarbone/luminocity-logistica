import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { AuthBoot } from './layout/AuthScreen'
import { DatosMaestros } from './pages/DatosMaestros'
import { Despacho } from './pages/Despacho'
import { Login } from './pages/Login'
import { NuevoPedido } from './pages/NuevoPedido'
import { PlanificadorRutas } from './pages/PlanificadorRutas'
import { PanelOperativo } from './pages/PanelOperativo'
import { PedidosPreparacion } from './pages/PedidosPreparacion'
import { PendientesEntregas } from './pages/PendientesEntregas'
import { PostVenta } from './pages/PostVenta'
import { Registro } from './pages/Registro'
import { useAuth } from './state/AuthContext'

function PublicOnly({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth()
  if (!ready) return <AuthBoot />
  if (user) return <Navigate to="/" replace />
  return children
}

function ProtectedShell() {
  const { ready, user } = useAuth()
  if (!ready) return <AuthBoot />
  if (!user) return <Navigate to="/login" replace />
  return <AppShell />
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/registro"
        element={
          <PublicOnly>
            <Registro />
          </PublicOnly>
        }
      />
      <Route element={<ProtectedShell />}>
        <Route path="/" element={<PanelOperativo />} />
        <Route path="/nuevo-pedido" element={<NuevoPedido />} />
        <Route path="/pedidos" element={<PedidosPreparacion />} />
        <Route path="/despacho" element={<Despacho />} />
        <Route path="/rutas" element={<PlanificadorRutas />} />
        <Route path="/pendientes" element={<PendientesEntregas />} />
        <Route path="/post-venta" element={<PostVenta />} />
        <Route path="/datos-maestros" element={<DatosMaestros />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
