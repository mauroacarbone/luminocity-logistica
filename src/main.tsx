import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { CatalogProvider } from './state/CatalogContext.tsx'
import { ClaimsProvider } from './state/ClaimsContext.tsx'
import { OrdersProvider } from './state/OrdersContext.tsx'
import { PickingProvider } from './state/PickingContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CatalogProvider>
        <OrdersProvider>
          <PickingProvider>
            <ClaimsProvider>
              <App />
            </ClaimsProvider>
          </PickingProvider>
        </OrdersProvider>
      </CatalogProvider>
    </BrowserRouter>
  </StrictMode>,
)
