import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { OrdersProvider } from './state/OrdersContext.tsx'
import { PickingProvider } from './state/PickingContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <OrdersProvider>
        <PickingProvider>
          <App />
        </PickingProvider>
      </OrdersProvider>
    </BrowserRouter>
  </StrictMode>,
)
