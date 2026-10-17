import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { NoAccess } from './components/NoAccess'
import { canOpen } from './lib/access'
import { homePathForRole } from './layout/nav'
import { AppShell } from './layout/AppShell'
import { AuthBoot } from './layout/AuthScreen'
import { Bandeja } from './pages/Bandeja'
import { ChoferesEnRuta } from './pages/ChoferesEnRuta'
import { DatosMaestros } from './pages/DatosMaestros'
import { Despacho } from './pages/Despacho'
import { Login } from './pages/Login'
import { NuevoPedido } from './pages/NuevoPedido'
import { PlanificadorRutas } from './pages/PlanificadorRutas'
import { MisEntregas } from './pages/MisEntregas'
import { MisViajes } from './pages/MisViajes'
import { MiPreparacion } from './pages/MiPreparacion'
import { PanelOperativo } from './pages/PanelOperativo'
import { PedidoDetalle } from './pages/PedidoDetalle'
import { PedidosPreparacion } from './pages/PedidosPreparacion'
import { PendientesEntregas } from './pages/PendientesEntregas'
import { PostVenta } from './pages/PostVenta'
import { Registro } from './pages/Registro'
import { Reportes } from './pages/Reportes'
import { Retiros } from './pages/Retiros'
import { Seguimiento } from './pages/Seguimiento'
import { TarifasViaje } from './pages/TarifasViaje'
import { Usuarios } from './pages/Usuarios'
import { useAuth } from './state/AuthContext'

function PublicOnly({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth()
  if (!ready) return <AuthBoot />
  if (user) return <Navigate to="/" replace />
  return children
}

function Gate({ path, children }: { path: string; children: ReactNode }) {
  const { user } = useAuth()
  if (!user || !canOpen(user.role, path)) return <NoAccess />
  return children
}

function Home() {
  const { user } = useAuth()
  if (user?.role === 'chofer') return <Navigate to="/mis-entregas" replace />
  if (user?.role === 'gerencia') return <Navigate to="/reportes" replace />
  if (user?.role === 'tecnico') return <Navigate to="/post-venta" replace />
  return <PanelOperativo />
}

function MisEntregasRoute() {
  const { user } = useAuth()
  if (!user || user.role !== 'chofer') {
    return <Navigate to={user ? homePathForRole(user.role) : '/'} replace />
  }
  return <MisEntregas />
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
        <Route path="/" element={<Home />} />
        <Route
          path="/mis-entregas"
          element={<MisEntregasRoute />}
        />
        <Route
          path="/mis-viajes"
          element={
            <Gate path="/mis-viajes">
              <MisViajes />
            </Gate>
          }
        />
        <Route
          path="/nuevo-pedido"
          element={
            <Gate path="/nuevo-pedido">
              <NuevoPedido />
            </Gate>
          }
        />
        <Route path="/pedidos/:id" element={<PedidoDetalle />} />
        <Route
          path="/preparacion"
          element={
            <Gate path="/preparacion">
              <MiPreparacion />
            </Gate>
          }
        />
        <Route
          path="/pedidos"
          element={
            <Gate path="/pedidos">
              <PedidosPreparacion />
            </Gate>
          }
        />
        <Route
          path="/despacho"
          element={
            <Gate path="/despacho">
              <Despacho />
            </Gate>
          }
        />
        <Route
          path="/retiros"
          element={
            <Gate path="/retiros">
              <Retiros />
            </Gate>
          }
        />
        <Route
          path="/seguimiento"
          element={
            <Gate path="/seguimiento">
              <Seguimiento />
            </Gate>
          }
        />
        <Route
          path="/choferes"
          element={
            <Gate path="/choferes">
              <ChoferesEnRuta />
            </Gate>
          }
        />
        <Route
          path="/rutas"
          element={
            <Gate path="/rutas">
              <PlanificadorRutas />
            </Gate>
          }
        />
        <Route
          path="/pendientes"
          element={
            <Gate path="/pendientes">
              <PendientesEntregas />
            </Gate>
          }
        />
        <Route
          path="/post-venta"
          element={
            <Gate path="/post-venta">
              <PostVenta />
            </Gate>
          }
        />
        <Route
          path="/tarifas"
          element={
            <Gate path="/tarifas">
              <TarifasViaje />
            </Gate>
          }
        />
        <Route
          path="/datos-maestros"
          element={
            <Gate path="/datos-maestros">
              <DatosMaestros />
            </Gate>
          }
        />
        <Route
          path="/bandeja"
          element={
            <Gate path="/bandeja">
              <Bandeja />
            </Gate>
          }
        />
        <Route
          path="/usuarios"
          element={
            <Gate path="/usuarios">
              <Usuarios />
            </Gate>
          }
        />
        <Route
          path="/reportes"
          element={
            <Gate path="/reportes">
              <Reportes />
            </Gate>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
