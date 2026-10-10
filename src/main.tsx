import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { applyBrand } from './config/applyBrand.ts'
import { CatalogProvider } from './state/CatalogContext.tsx'
import { ClaimsProvider } from './state/ClaimsContext.tsx'
import { OrdersProvider } from './state/OrdersContext.tsx'
import { PickingProvider } from './state/PickingContext.tsx'
import { AuthProvider } from './state/AuthContext.tsx'

applyBrand()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CatalogProvider>
          <OrdersProvider>
            <PickingProvider>
              <ClaimsProvider>
                <App />
              </ClaimsProvider>
            </PickingProvider>
          </OrdersProvider>
        </CatalogProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
