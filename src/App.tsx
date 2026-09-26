import { Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { NuevoPedido } from './pages/NuevoPedido'
import { PanelOperativo } from './pages/PanelOperativo'
import { Proximamente } from './pages/Proximamente'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<PanelOperativo />} />
        <Route path="/nuevo-pedido" element={<NuevoPedido />} />
        <Route
          path="/pedidos"
          element={
            <Proximamente
              title="Pedidos y Preparación"
              description="Pedidos de la semana, listos para preparar y editar."
            />
          }
        />
        <Route
          path="/despacho"
          element={
            <Proximamente
              title="Despacho"
              description="Seguimiento de pedidos en viaje y entregados."
            />
          }
        />
        <Route
          path="/rutas"
          element={
            <Proximamente
              title="Planificador de Rutas"
              description="Seleccioná pedidos del día y calculá la ruta."
            />
          }
        />
        <Route
          path="/pendientes"
          element={
            <Proximamente
              title="Pendientes de Entregas"
              description="Lista de pedidos y modo picking."
            />
          }
        />
        <Route
          path="/post-venta"
          element={
            <Proximamente
              title="Post Venta"
              description="Cargá y seguí los reclamos de clientes."
            />
          }
        />
      </Routes>
    </AppShell>
  )
}
