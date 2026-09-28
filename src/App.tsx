import { Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { DatosMaestros } from './pages/DatosMaestros'
import { Despacho } from './pages/Despacho'
import { NuevoPedido } from './pages/NuevoPedido'
import { PlanificadorRutas } from './pages/PlanificadorRutas'
import { PanelOperativo } from './pages/PanelOperativo'
import { PedidosPreparacion } from './pages/PedidosPreparacion'
import { PendientesEntregas } from './pages/PendientesEntregas'
import { PostVenta } from './pages/PostVenta'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<PanelOperativo />} />
        <Route path="/nuevo-pedido" element={<NuevoPedido />} />
        <Route path="/pedidos" element={<PedidosPreparacion />} />
        <Route path="/despacho" element={<Despacho />} />
        <Route path="/rutas" element={<PlanificadorRutas />} />
        <Route path="/pendientes" element={<PendientesEntregas />} />
        <Route path="/post-venta" element={<PostVenta />} />
        <Route path="/datos-maestros" element={<DatosMaestros />} />
      </Routes>
    </AppShell>
  )
}
